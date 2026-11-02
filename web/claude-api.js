// Claude Messages adapter. No credentials, storage, external scripts or model defaults.
export const CLAUDE_ENDPOINT='https://api.anthropic.com/v1/messages';
export const CLAUDE_VERSION='2026-10-21';
export function claudeRequestBody(body){
 const blocks=[];
 if(typeof body.input==='string')blocks.push({type:'text',text:body.input});
 else for(const message of body.input||[]){
  if(message.role!=='user')throw Error('Ongeldige Claude invoer.');
  for(const part of message.content||[]){
   if(part.type==='input_text'){blocks.push({type:'text',text:part.text});continue;}
   if(part.type!=='input_file')throw Error('Onbekend Claude documenttype.');
   const match=/^data:([^;,]+);base64,([A-Za-z0-9+/]*={0,2})$/.exec(part.file_data||'');
   if(!match)throw Error('Ongeldige bestandsinhoud voor Claude.');
   const [,mime,data]=match;
   if(mime==='application/pdf'){blocks.push({type:'document',title:part.filename,source:{type:'base64',media_type:'application/pdf',data}});continue;}
   if(['text/plain','text/markdown'].includes(mime)){
    let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(data),c=>c.charCodeAt(0)));}catch{throw Error('Sla tekstbestanden op als UTF-8 voor Claude.');}
    blocks.push({type:'document',title:part.filename,source:{type:'text',media_type:'text/plain',data:text}});continue;
   }
   throw Error('Claude leest in deze koppeling PDF, TXT en MD. Zet DOCX om naar PDF en voeg dat bestand toe.');
  }
 }
 if(!blocks.length||typeof body.instructions!=='string'||!body.text?.format?.schema)throw Error('Ongeldige Claude aanvraag.');
 return {model:body.model,max_tokens:body.max_output_tokens,system:body.instructions,messages:[{role:'user',content:blocks}],output_config:{format:{type:'json_schema',schema:body.text.format.schema}}};
}
export function claudeReply(value){
 if(!value||value.type!=='message'||!Array.isArray(value.content))throw Error('Claude gaf geen geldig API antwoord.');
 if(value.stop_reason==='refusal')throw Error('Claude heeft geen analyseantwoord gegeven. Formuleer de opdracht anders.');
 if(value.stop_reason!=='end_turn')throw Error('Het Claude antwoord is niet afgerond. Verdeel het dossier in kleinere werkpakketten of controleer het gekozen model.');
 const output=value.content.filter(p=>p?.type==='text').map(p=>p.text||'').join('');
 try{return JSON.parse(output);}catch{throw Error('Claude gaf geen bruikbaar gestructureerd antwoord. Er is niets in het dossier aangepast.');}
}
export function claudeError(status){
 if(status===401)return 'Claude accepteert deze API sleutel niet. Controleer jouw Anthropic API sleutel.';
 if(status===403)return 'Deze API sleutel heeft geen toegang tot de gevraagde Claude functie.';
 if(status===404)return 'Dit Claude model is niet beschikbaar voor jouw API account. Controleer de exacte model-ID.';
 if(status===429)return 'De Claude gebruikslimiet is bereikt. Controleer jouw API limieten en probeer later opnieuw.';
 if(status===400)return 'Claude accepteert deze aanvraag niet. Controleer API tegoed, de model-ID, Structured Outputs en de bestandsondersteuning.';
 if(status===413)return 'De Claude aanvraag is te groot. Verdeel het dossier in kleinere werkpakketten.';
 return 'De Claude API is tijdelijk niet beschikbaar. Probeer later opnieuw.';
}
