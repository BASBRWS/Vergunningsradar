"""Fixed-endpoint AI transport. Keys stay server-side; response data cannot approve quotes."""
import base64
import binascii
import json
import os
import re
import urllib.error
import urllib.request

CLAUDE_VERSION='2026-10-21'

class AIResponseError(ValueError):
    def __init__(self,code,message,stop_reason=''):
        super().__init__(message);self.code=code;self.stop_reason=stop_reason

def provider():
    value=os.environ.get('AI_PROVIDER','openai').strip().lower()
    if value=='claude':value='anthropic'
    if value not in ('openai','anthropic'):raise ValueError('AI_PROVIDER moet openai of anthropic zijn.')
    return value

def model():return os.environ.get('ANTHROPIC_MODEL' if provider()=='anthropic' else 'OPENAI_MODEL','')

def configured():
    try:return bool(model() and os.environ.get('ANTHROPIC_API_KEY' if provider()=='anthropic' else 'OPENAI_API_KEY'))
    except ValueError:return False

def claude_body(body):
    blocks=[]
    if isinstance(body.get('input'),str):blocks.append({'type':'text','text':body['input']})
    else:
        for message in body.get('input',[]):
            if message.get('role')!='user':raise ValueError('Ongeldige Claude invoer.')
            for part in message.get('content',[]):
                if part.get('type')=='input_text':blocks.append({'type':'text','text':part['text']});continue
                if part.get('type')!='input_file':raise ValueError('Onbekend Claude documenttype.')
                try:
                    prefix,encoded=part['file_data'].split(',',1)
                    mime=prefix.removeprefix('data:').removesuffix(';base64')
                    decoded=base64.b64decode(encoded,validate=True)
                except (KeyError,ValueError,binascii.Error) as exc:raise ValueError('Ongeldige bestandsinhoud voor Claude.') from exc
                if mime=='application/pdf':source={'type':'base64','media_type':mime,'data':encoded}
                elif mime in ('text/plain','text/markdown'):
                    try:text=decoded.decode('utf-8')
                    except UnicodeDecodeError as exc:raise ValueError('Sla tekstbestanden op als UTF-8 voor Claude.') from exc
                    source={'type':'text','media_type':'text/plain','data':text}
                else:raise ValueError('Claude leest in deze koppeling PDF, TXT en MD. Zet DOCX om naar PDF en voeg dat bestand toe.')
                blocks.append({'type':'document','title':part['filename'],'source':source})
    if not blocks:raise ValueError('Lege Claude aanvraag.')
    effort={'effort':'low' if body['text']['format'].get('name')=='tender_source_block' else 'medium'} if re.match(r'^claude-opus-5-5($|-)',body['model']) else {}
    reuse=body['text']['format'].get('name')=='tender_specialist' and all(b['type']=='text' for b in blocks)
    system=[{'type':'text','text':body['instructions'],'cache_control':{'type':'ephemeral'}}] if reuse else body['instructions']
    return {'model':body['model'],'max_tokens':body['max_output_tokens'],'system':system,
        'messages':[{'role':'user','content':blocks}],
        'output_config':{**effort,'format':{'type':'json_schema','schema':body['text']['format']['schema']}}}

def parse_claude(value):
    if not isinstance(value,dict) or value.get('type')!='message' or not isinstance(value.get('content'),list):raise ValueError('Claude gaf geen geldig API antwoord.')
    if value.get('stop_reason')=='refusal':raise ValueError('Claude heeft geen analyseantwoord gegeven. Formuleer de opdracht anders.')
    if value.get('stop_reason')=='max_tokens':raise AIResponseError('AI_OUTPUT_LIMIT','Claude bereikte de antwoordlimiet van dit blok, inclusief denkwerk. Het onvolledige antwoord is niet overgenomen.','max_tokens')
    if value.get('stop_reason')=='model_context_window_exceeded':raise AIResponseError('AI_CONTEXT_LIMIT','Dit analyseblok past niet in het contextvenster van Claude.','model_context_window_exceeded')
    if value.get('stop_reason')!='end_turn':raise ValueError('Het Claude antwoord is niet afgerond. Verdeel het dossier in kleinere werkpakketten.')
    try:return json.loads(''.join(p.get('text','') for p in value['content'] if isinstance(p,dict) and p.get('type')=='text'))
    except (ValueError,TypeError) as exc:raise ValueError('Claude gaf geen bruikbaar gestructureerd antwoord.') from exc

def complete(body,timeout=90,limit=600000):
    if not configured():raise ValueError('Stel de API sleutel en het model voor de gekozen AI aanbieder in op de server.')
    claude=provider()=='anthropic'
    endpoint='https://api.anthropic.com/v1/messages' if claude else 'https://api.openai.com/v1/responses'
    headers={'Content-Type':'application/json'}
    if claude:headers.update({'x-api-key':os.environ['ANTHROPIC_API_KEY'],'anthropic-version':CLAUDE_VERSION})
    else:headers['Authorization']='Bearer '+os.environ['OPENAI_API_KEY']
    request=urllib.request.Request(endpoint,data=json.dumps(claude_body(body) if claude else body).encode(),headers=headers,method='POST')
    try:
        with urllib.request.urlopen(request,timeout=timeout) as response:raw=response.read(limit+1)
        if len(raw)>limit:raise ValueError('Het AI antwoord is te groot.')
        value=json.loads(raw)
    except (urllib.error.URLError,TimeoutError,OSError) as exc:
        if isinstance(exc,TimeoutError) or isinstance(getattr(exc,'reason',None),TimeoutError):raise AIResponseError('AI_TIMEOUT','De AI aanvraag duurde te lang. Afgeronde blokken blijven bewaard.') from exc
        raise ValueError('De AI dienst antwoordt niet. Controleer serverconfiguratie, modeltoegang en API tegoed.') from exc
    if claude:return parse_claude(value)
    if not isinstance(value,dict) or value.get('status')!='completed':raise ValueError('Het AI antwoord is niet afgerond. Probeer een korter bericht of een kleiner werkpakket.')
    try:
        output=''.join(part.get('text','') for item in value.get('output',[]) if item.get('type')=='message' for part in item.get('content',[]) if part.get('type')=='output_text')
        return json.loads(output)
    except (ValueError,TypeError,AttributeError) as exc:raise ValueError('De AI gaf geen bruikbaar antwoord. Er is niets in het dossier aangepast.') from exc
