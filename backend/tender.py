"""Bounded, authenticated specialist analysis. Documents are forwarded, never stored here."""
import base64
import binascii
import json
import math
import os
from pathlib import Path
from . import ai_provider

CONTRACT_PATH = Path(__file__).with_name('tender-contract.json')
if not CONTRACT_PATH.exists():
    CONTRACT_PATH = Path(__file__).parent.parent / 'web' / 'tender-contract.json'
CONTRACT = json.loads(CONTRACT_PATH.read_text())
BLOCK_CONTRACT = json.loads(CONTRACT_PATH.with_name('tender-block-contract.json').read_text())
ROLES = {r['id']: r for r in CONTRACT['roles']}
TYPES = {'pdf':'application/pdf','docx':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','txt':'text/plain','md':'text/markdown'}
MAX_FILE = 6 * 1024 * 1024
MAX_TOTAL = 12 * 1024 * 1024

def text(value, limit):
    return isinstance(value, str) and len(value) <= limit

def schema_check(value, schema):
    kind = schema['type']
    if isinstance(kind,list):
        if value is None and 'null' in kind:return
        kind = next(k for k in kind if k!='null')
    if kind=='object':
        if not isinstance(value,dict) or set(value)!=set(schema['required']):raise ValueError('Ongeldige analysevelden.')
        for k,v in value.items():schema_check(v,schema['properties'][k])
    elif kind=='array':
        if not isinstance(value,list) or len(value)>30:raise ValueError('Ongeldige analyselijst.')
        for v in value:schema_check(v,schema['items'])
    elif kind=='string':
        if not text(value,20000):raise ValueError('Ongeldige analysetekst.')
    elif kind=='boolean':
        if not isinstance(value,bool):raise ValueError('Ongeldige analysestatus.')
    elif kind=='number':
        if isinstance(value,bool) or not isinstance(value,(int,float)) or not math.isfinite(value):raise ValueError('Ongeldig aantal.')
    if 'enum' in schema and value not in schema['enum']:raise ValueError('Onbekende analysewaarde.')

def validate_result(value, documents, role):
    schema_check(value,CONTRACT['schema'])
    if value['role']!=role or len(value['summary'])>5000 or len(value['findings'])>20 or len(value['work_items'])>15:raise ValueError('Ongeldig specialistantwoord.')
    ids={d['id'] for d in documents}
    def sources(items):
        if len(items)>4:raise ValueError('Te veel bronverwijzingen.')
        for s in items:
            if s['document_id'] not in ids or not text(s['location'],300) or not text(s['quote'],240):raise ValueError('Een bronverwijzing klopt niet met het documentregister.')
    for f in value['findings']:
        if not f['title'].strip() or len(f['title'])>200 or len(f['detail'])>3000:raise ValueError('Ongeldige bevinding.')
        sources(f['sources'])
    for w in value['work_items']:
        n=w['quantity']
        if not w['description'].strip() or len(w['description'])>300 or not w['unit'].strip() or len(w['unit'])>30 or n is not None and not 0<n<=1000000 or w['category']=='labor' and w['unit']!='uur':raise ValueError('Ongeldig werkpostvoorstel.')
        sources(w['sources'])
        if w['basis']=='document' and not w['sources']:raise ValueError('Documenthoeveelheid zonder bron.')
    return value

def request_body(data, model):
    if data.get('stage'):return block_request_body(data,model)
    if data.get('role') not in ROLES or not isinstance(data.get('documents'),list) or not 1<=len(data['documents'])<=10 or not text(data.get('prompt',''),6000):raise ValueError('Ongeldige specialistaanvraag.')
    meta=data.get('meta')
    if not isinstance(meta,dict) or any(not text(meta.get(k),3000) for k in ('title','client','reference','url','deadline','location')):raise ValueError('Ongeldige opdrachtgegevens.')
    meta={k:meta[k] for k in ('title','client','reference','url','deadline','location')}
    prior=data.get('prior',[])
    if not isinstance(prior,list) or len(prior)>6 or len(json.dumps(prior,ensure_ascii=False))>180000:raise ValueError('Te veel eerdere analyses. Verdeel het dossier in werkpakketten.')
    files=[];register=[];total=0;ids=set()
    for d in data['documents']:
        if not isinstance(d,dict) or not text(d.get('name'),200) or not text(d.get('id'),100) or not d['id'] or d['id'] in ids:raise ValueError('Ongeldig documentregister.')
        mime=TYPES.get(d['name'].rsplit('.',1)[-1].lower());size=d.get('size');encoded=d.get('file_data')
        if not mime or isinstance(size,bool) or not isinstance(size,int) or not 0<size<=MAX_FILE or not isinstance(encoded,str) or len(encoded)>MAX_FILE*4//3+200 or not encoded.startswith('data:'+mime+';base64,'):raise ValueError('Ongeldig of te groot bronbestand.')
        try:decoded=base64.b64decode(encoded.split(',',1)[1],validate=True)
        except (ValueError,binascii.Error) as exc:raise ValueError('Ongeldige bestandsinhoud.') from exc
        if len(decoded)!=size:raise ValueError('De bestandsinhoud en bestandsgrootte komen niet overeen.')
        if mime=='application/pdf' and not decoded.startswith(b'%PDF-'):raise ValueError('Dit bestand is geen PDF.')
        if 'wordprocessingml' in mime and not decoded.startswith(b'PK'):raise ValueError('Dit bestand is geen DOCX.')
        total+=size;ids.add(d['id'])
        files.append({'type':'input_file','filename':d['name'],'file_data':encoded})
        register.append({'id':d['id'],'name':d['name'],'version':str(d.get('version','1'))[:100]})
    if total>MAX_TOTAL:raise ValueError('De bronbestanden zijn samen te groot.')
    for result in prior:
        if not isinstance(result,dict) or result.get('role') not in ROLES:raise ValueError('Ongeldige eerdere analyse.')
        validate_result(result,data['documents'],result['role'])
    role=ROLES[data['role']]
    context={'role':data['role'],'metadata':meta,'document_register':register,'previous_analyses':prior}
    if len(json.dumps(context,ensure_ascii=False))>200000:raise ValueError('De analysecontext is te groot.')
    return {'model':model,'store':False,'max_output_tokens':12000,
        'instructions':CONTRACT['instructions']+'\n'+CONTRACT.get('base_prompt','')+'\nSpecialistrol, '+role['name']+'\n'+role['prompt']+'\nAanvullende opdracht van de gebruiker, '+data.get('prompt','')+'\n'+CONTRACT.get('output_adapter',''),
        'input':[{'role':'user','content':[{'type':'input_text','text':json.dumps(context,ensure_ascii=False)},*files]}],
        'text':{'format':{'type':'json_schema','name':'tender_specialist','strict':True,'schema':CONTRACT['schema']}}}

def analyze(data):
    if not ai_provider.configured():raise ValueError('Stel de API sleutel en het model voor de gekozen AI aanbieder in op de server.')
    body=request_body(data,ai_provider.model())
    value=ai_provider.complete(body,timeout=90)
    return validate_evidence(value,data['documents']) if data.get('stage')=='extract' else validate_result(value,data['documents'],data['role'])

def validate_passages(passages,documents,maximum=40):
    if not isinstance(passages,list) or len(passages)>maximum:raise ValueError('Ongeldige of te grote bronindex.')
    ids={d['id'] for d in documents}
    keys={'document_id','location','quote','detail','roles','critical'}
    for p in passages:
        if not isinstance(p,dict) or set(p)!=keys or p['document_id'] not in ids or not text(p['location'],300) or not p['location'].strip() or not text(p['quote'],240) or not text(p['detail'],900) or not isinstance(p['critical'],bool) or not isinstance(p['roles'],list) or not 1<=len(p['roles'])<=5 or any(r not in ROLES or r=='synthesis' for r in p['roles']):raise ValueError('Een bronpassage is ongeldig.')
    return passages

def validate_evidence(value,documents):
    schema_check(value,BLOCK_CONTRACT['schema'])
    if not text(value['summary'],500):raise ValueError('De bronindex is ongeldig.')
    validate_passages(value['passages'],documents,24)
    return value

def block_request_body(data,model):
    docs=data.get('documents');stage=data.get('stage');role=data.get('role')
    if stage not in ('extract','review') or role not in ROLES or not isinstance(docs,list) or not 1<=len(docs)<=10 or not text(data.get('source_range',''),300) or not text(data.get('prompt',''),6000):raise ValueError('Ongeldige blokaanvraag.')
    if stage=='extract':
        if len(docs)!=1 or not data.get('source_range','').strip():raise ValueError('Een bronblok moet één documentdeel bevatten.')
        body=request_body({**data,'stage':None,'prior':[],'prompt':''},model)
        body['instructions']=BLOCK_CONTRACT['instructions'];body['max_output_tokens']=BLOCK_CONTRACT['output_limits']['extract']
        context=json.loads(body['input'][0]['content'][0]['text']);context['source_range']=data['source_range']
        body['input'][0]['content'][0]['text']=json.dumps(context,ensure_ascii=False)
        body['text']['format']={'type':'json_schema','name':'tender_source_block','strict':True,'schema':BLOCK_CONTRACT['schema']}
        return body
    meta=data.get('meta')
    if not isinstance(meta,dict) or any(not text(meta.get(k),3000) for k in ('title','client','reference','url','deadline','location')):raise ValueError('Ongeldige opdrachtgegevens.')
    meta={k:meta[k] for k in ('title','client','reference','url','deadline','location')}
    register=[];ids=set();total=0
    for d in docs:
        if not isinstance(d,dict) or not text(d.get('id'),100) or not d['id'] or d['id'] in ids or not text(d.get('name'),200) or d['name'].rsplit('.',1)[-1].lower() not in TYPES or isinstance(d.get('size'),bool) or not isinstance(d.get('size'),int) or not 0<d['size']<=MAX_FILE:raise ValueError('Ongeldig documentregister.')
        ids.add(d['id']);total+=d['size'];register.append({'id':d['id'],'name':d['name'],'version':str(d.get('version','1'))[:100]})
    if total>MAX_TOTAL:raise ValueError('De bronbestanden zijn samen te groot.')
    evidence=validate_passages(data.get('evidence'),docs);notes=data.get('notes')
    if not isinstance(notes,list) or len(notes)>6 or any(not isinstance(n,dict) or set(n)!={'role','text'} or n['role'] not in ROLES or not text(n['text'],2400) for n in notes):raise ValueError('Ongeldige samenvattingen van specialisten.')
    if len(json.dumps({'evidence':evidence,'notes':notes},ensure_ascii=False,separators=(',',':')))>26000:raise ValueError('Dit blok bevat te veel context.')
    instructions=BLOCK_CONTRACT['synthesis_instructions' if role=='synthesis' else 'review_instructions']
    context={'role':role,'metadata':meta,'document_register':register,'source_range':data.get('source_range',''),'evidence':evidence,'previous_analyses':notes}
    return {'model':model,'store':False,'max_output_tokens':BLOCK_CONTRACT['output_limits']['synthesis' if role=='synthesis' else 'review'],
        'instructions':CONTRACT['instructions']+'\n'+CONTRACT.get('base_prompt','')+'\n'+ROLES[role]['prompt']+'\n'+instructions+'\nAanvullende specialistprompt, '+data.get('prompt','')+'\n'+CONTRACT.get('output_adapter',''),
        'input':[{'role':'user','content':[{'type':'input_text','text':json.dumps(context,ensure_ascii=False)}]}],
        'text':{'format':{'type':'json_schema','name':'tender_specialist','strict':True,'schema':CONTRACT['schema']}}}
