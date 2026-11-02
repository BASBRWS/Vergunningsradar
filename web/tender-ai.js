import {TENDER_ROLES,FILE_TYPES,MAX_DOCUMENT_BYTES,MAX_TOTAL_BYTES} from './tender-core.js?v=20261102-blocks';
import {EVIDENCE_SCHEMA,SOURCE_INSTRUCTIONS,OUTPUT_LIMITS,validateBlockContext,blockInstructions} from './tender-block-contract.js?v=20261102-blocks';
let promise;
export function loadTenderContract(){return promise ||= fetch('./tender-contract.json',{cache:'no-cache'}).then(r=>{if(!r.ok)throw Error('De specialistprompts konden niet worden geladen.');return r.json();}).catch(err=>{promise=null;throw err;});}
const obj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const exact=(v,keys)=>obj(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const str=(v,max)=>typeof v==='string'&&v.length<=max;
export function validateTenderResult(value,documents,role,{aggregate=false}={}){
 const ids=new Set(documents.map(d=>d.id));
 const sources=list=>{if(!Array.isArray(list)||list.length>4)throw Error('Te veel of ongeldige bronverwijzingen.');for(const s of list)if(!exact(s,['document_id','location','quote'])||!ids.has(s.document_id)||!str(s.location,300)||!str(s.quote,240))throw Error('Een AI bronverwijzing verwijst niet naar een aangeleverd document.');};
 if(!Object.hasOwn(TENDER_ROLES,role)||!exact(value,['role','summary','findings','work_items','design','plan','offer'])||value.role!==role||!str(value.summary,5000)||!Array.isArray(value.findings)||value.findings.length>(aggregate?2000:20)||!Array.isArray(value.work_items)||value.work_items.length>(aggregate?1500:15)||!['design','plan','offer'].every(k=>str(value[k],aggregate?30000:20000)))throw Error('De specialist gaf geen bruikbaar analyseantwoord.');
 for(const f of value.findings){if(!exact(f,['type','title','detail','critical','sources'])||!['requirement','risk','question','assumption','exclusion','scope'].includes(f.type)||!str(f.title,200)||!f.title.trim()||!str(f.detail,3000)||typeof f.critical!=='boolean')throw Error('Ongeldige specialistbevinding.');sources(f.sources);}
 for(const w of value.work_items){if(!exact(w,['description','category','quantity','unit','basis','sources'])||!str(w.description,300)||!w.description.trim()||!['labor','product','material','subcontract','equipment','project'].includes(w.category)||!(w.quantity===null||typeof w.quantity==='number'&&Number.isFinite(w.quantity)&&w.quantity>0&&w.quantity<=1e6)||!str(w.unit,30)||!w.unit.trim()||w.category==='labor'&&w.unit!=='uur'||!['document','estimate','assumption'].includes(w.basis))throw Error('Ongeldig werkpostvoorstel.');sources(w.sources);if(w.basis==='document'&&!w.sources.length)throw Error('Een documenthoeveelheid heeft geen bronverwijzing.');}
 return value;
}
export function tenderRequestBody(data,model,contract){
 if(data?.stage)return blockRequestBody(data,model,contract);
 if(!obj(data)||!Object.hasOwn(TENDER_ROLES,data.role)||!Array.isArray(data.documents)||!data.documents.length||data.documents.length>10||!str(data.prompt||'',6000)||!Array.isArray(data.prior)||data.prior.length>6||JSON.stringify(data.prior).length>180000)throw Error('Ongeldige of te grote specialistaanvraag.');
 const ids=new Set();let total=0;
 const files=data.documents.map(d=>{const ext=d.name?.split('.').pop().toLowerCase(),type=FILE_TYPES[ext];if(!type||typeof d.id!=='string'||ids.has(d.id)||!str(d.name,200)||!Number.isFinite(d.size)||d.size<=0||d.size>MAX_DOCUMENT_BYTES||typeof d.file_data!=='string'||!d.file_data.startsWith('data:'+type+';base64,')||d.file_data.length>MAX_DOCUMENT_BYTES*4/3+200)throw Error('Ongeldig bronbestand voor AI analyse.');ids.add(d.id);total+=d.size;return {type:'input_file',filename:d.name,file_data:d.file_data};});
 if(total>MAX_TOTAL_BYTES)throw Error('De bronbestanden zijn samen te groot.');
 for(const result of data.prior)validateTenderResult(result,data.documents,result?.role);
 const selected=contract.roles.find(r=>r.id===data.role);if(!selected)throw Error('Onbekende specialist.');
 if(!/^[-a-zA-Z0-9_.:]{1,100}$/.test(model))throw Error('Vul een geldige modelnaam in.');
 const meta={};for(const k of ['title','client','reference','url','deadline','location']){if(!str(data.meta?.[k],3000))throw Error('Ongeldige opdrachtgegevens.');meta[k]=data.meta[k];}
 const context={role:data.role,metadata:meta,document_register:data.documents.map(d=>({id:d.id,name:d.name,version:d.version||'1'})),previous_analyses:data.prior};
 if(JSON.stringify(context).length>200000)throw Error('De analysecontext is te groot. Verdeel het dossier in kleinere werkpakketten.');
 return {model,store:false,max_output_tokens:12000,instructions:contract.instructions+'\nSpecialistrol, '+selected.name+'\n'+selected.prompt+'\nAanvullende opdracht van de gebruiker, '+(data.prompt||''),input:[{role:'user',content:[{type:'input_text',text:JSON.stringify(context)},...files]}],text:{format:{type:'json_schema',name:'tender_specialist',strict:true,schema:contract.schema}}};
}

function blockRequestBody(data,model,contract){
 if(!Array.isArray(data.documents)||!data.documents.length||data.documents.length>10||!Object.hasOwn(TENDER_ROLES,data.role)||!str(data.prompt||'',6000)||!/^[-a-zA-Z0-9_.:]{1,100}$/.test(model))throw Error('Ongeldige blokaanvraag.');
 validateBlockContext(data);
 if(data.stage==='extract'){
  const body=tenderRequestBody({...data,stage:undefined,prior:[],prompt:''},model,contract);
  body.instructions=SOURCE_INSTRUCTIONS;body.max_output_tokens=OUTPUT_LIMITS.extract;
  const context=JSON.parse(body.input[0].content[0].text);context.source_range=data.source_range;
  body.input[0].content[0].text=JSON.stringify(context);
  body.text.format={type:'json_schema',name:'tender_source_block',strict:true,schema:EVIDENCE_SCHEMA};return body;
 }
 const ids=new Set();let total=0;
 const register=data.documents.map(d=>{if(!str(d.id,100)||!d.id||ids.has(d.id)||!str(d.name,200)||!FILE_TYPES[d.name.split('.').pop().toLowerCase()]||!Number.isFinite(d.size)||d.size<=0||d.size>MAX_DOCUMENT_BYTES)throw Error('Ongeldig documentregister.');ids.add(d.id);total+=d.size;return {id:d.id,name:d.name,version:String(d.version||'1').slice(0,100)};});
 if(total>MAX_TOTAL_BYTES)throw Error('De bronbestanden zijn samen te groot.');
 const meta={};for(const k of ['title','client','reference','url','deadline','location']){if(!str(data.meta?.[k],3000))throw Error('Ongeldige opdrachtgegevens.');meta[k]=data.meta[k];}
 const role=contract.roles.find(r=>r.id===data.role);if(!role)throw Error('Onbekende specialist.');
 return {model,store:false,max_output_tokens:OUTPUT_LIMITS[data.role==='synthesis'?'synthesis':'review'],instructions:contract.instructions+'\n'+role.prompt+'\n'+blockInstructions(data)+'\nAanvullende specialistprompt, '+(data.prompt||''),input:[{role:'user',content:[{type:'input_text',text:JSON.stringify({role:data.role,metadata:meta,document_register:register,source_range:data.source_range,evidence:data.evidence,previous_analyses:data.notes})}]}],text:{format:{type:'json_schema',name:'tender_specialist',strict:true,schema:contract.schema}}};
}
