"""Bounded, authenticated specialist analysis. Documents are forwarded, never stored here."""
import base64
import binascii
import json
import math
import os
from pathlib import Path
import urllib.error
import urllib.request

CONTRACT_PATH = Path(__file__).with_name('tender-contract.json')
if not CONTRACT_PATH.exists():
    CONTRACT_PATH = Path(__file__).parent.parent / 'web' / 'tender-contract.json'
CONTRACT = json.loads(CONTRACT_PATH.read_text())
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
        'instructions':CONTRACT['instructions']+'\nSpecialistrol, '+role['name']+'\n'+role['prompt']+'\nAanvullende opdracht van de gebruiker, '+data.get('prompt',''),
        'input':[{'role':'user','content':[{'type':'input_text','text':json.dumps(context,ensure_ascii=False)},*files]}],
        'text':{'format':{'type':'json_schema','name':'tender_specialist','strict':True,'schema':CONTRACT['schema']}}}

def analyze(data):
    if not os.environ.get('OPENAI_API_KEY') or not os.environ.get('OPENAI_MODEL'):raise ValueError('Stel OPENAI_API_KEY en OPENAI_MODEL in op de server.')
    body=request_body(data,os.environ['OPENAI_MODEL'])
    request=urllib.request.Request('https://api.openai.com/v1/responses',data=json.dumps(body).encode(),headers={'Authorization':'Bearer '+os.environ['OPENAI_API_KEY'],'Content-Type':'application/json'},method='POST')
    try:
        with urllib.request.urlopen(request,timeout=90) as response:raw=response.read(600001)
        if len(raw)>600000:raise ValueError('Het specialistantwoord is te groot.')
        envelope=json.loads(raw)
    except (urllib.error.URLError,TimeoutError,OSError) as exc:
        raise ValueError('De AI dienst antwoordt niet. Controleer modeltoegang, PDF ondersteuning en API tegoed.') from exc
    if not isinstance(envelope,dict) or envelope.get('status')!='completed':raise ValueError('De specialistanalyse is niet afgerond. Verdeel het dossier in kleinere werkpakketten.')
    try:
        output=''.join(part.get('text','') for item in envelope.get('output',[]) if item.get('type')=='message' for part in item.get('content',[]) if part.get('type')=='output_text')
        result=json.loads(output)
    except (ValueError,TypeError,AttributeError) as exc:raise ValueError('De specialist gaf geen bruikbaar analyseantwoord.') from exc
    return validate_result(result,data['documents'],data['role'])
