import {TENDER_ROLES,currentRun,signature,uid} from './tender-core.js?v=20261102-rolprompts';
import {validateTenderResult,tenderRequestBody,loadTenderContract} from './tender-ai.js?v=20261102-rolprompts';
import {BLOCK_VERSION,validateEvidence} from './tender-block-contract.js?v=20261102-rolprompts';
import {digest} from './tender-source-blocks.js?v=20261102-rolprompts';
import {readBlock,writeBlock} from './tender-files.js?v=20261102-rolprompts';

export function processing(t){
 if(t.processing?.version!==BLOCK_VERSION)t.processing={version:BLOCK_VERSION,budget:60000,pages:2,batch:3,spent:0,actualInput:0,actualOutput:0,cached:0,requests:0,epoch:0,sourceDone:0,sourceTotal:0,last:''};
 return t.processing;
}
export function evidenceGroups(passages,maxChars=10000){
 const groups=[];let group=[],size=0;
 for(const passage of passages){const chars=JSON.stringify(passage).length;if(group.length&&(size+chars>maxChars||group.length>=12)){groups.push(group);group=[];size=0;}group.push(passage);size+=chars;}
 if(group.length)groups.push(group);return groups.length?groups:[[]];
}
const unique=items=>[...new Map(items.map(item=>[JSON.stringify(item),item])).values()];
export function mergeBlockResults(role,results,documents){
 const merged={role,summary:results.map((r,i)=>`Deel ${i+1}. ${r.summary}`).join('\n').slice(0,5000),findings:unique(results.flatMap(r=>r.findings)),work_items:unique(results.flatMap(r=>r.work_items)),design:'',plan:'',offer:''};
 for(const k of ['design','plan','offer']){merged[k]=results.map(r=>r[k]).filter(Boolean).join('\n\n');if(merged[k].length>30000)throw Error('De gezamenlijke tekst is te groot. Verdeel het dossier in werkpakketten. De afgeronde blokken zijn bewaard.');}
 return validateTenderResult(merged,documents,role,{aggregate:true});
}
function roleNotes(t,roles){return roles.map(role=>{const r=currentRun(t,role)?.result;if(!r)return null;const text=[r.summary.slice(0,650),...r.findings.filter(f=>f.critical||f.type==='question').map(f=>f.title),...r.work_items.map(w=>`${w.description}, ${w.quantity??'onbekend'} ${w.unit}, ${w.basis}`)].join('\n').slice(0,2400);return {role,text};}).filter(Boolean);}
function synthesisPassages(t){
 const passages=[];
 for(const role of t.roles){const r=currentRun(t,role)?.result;if(!r)continue;
  for(const item of [...r.findings.map(f=>({detail:`${TENDER_ROLES[role]}, ${f.type}, ${f.title}. ${f.detail}`,critical:f.critical,sources:f.sources})),...r.work_items.map(w=>({detail:`${TENDER_ROLES[role]}, werkpost, ${w.description}, ${w.quantity??'onbekend'} ${w.unit}, ${w.basis}.`,critical:false,sources:w.sources}))]){
   // Unsourced items remain in the role summaries; never manufacture a source for them.
   for(const s of item.sources)for(let start=0;start<item.detail.length;start+=900)passages.push({...s,detail:item.detail.slice(start,start+900),roles:[role],critical:item.critical});
  }
 }
 return unique(passages);
}
function synthesisTasks(t){
 const passages=synthesisPassages(t),tasks=passages.length?evidenceGroups(passages).map(evidence=>({evidence})):[];
 // Carry every unsourced open point into the offer workflow, without inventing citations.
 let note='';const flush=()=>{if(note){tasks.push({evidence:[],extraNote:{role:'contract',text:'Onbevestigde punten zonder bron. Neem deze expliciet op als open punt, geen vastgesteld feit.\n'+note}});note='';}};
 for(const role of t.roles){const r=currentRun(t,role)?.result;if(!r)continue;const items=[...r.findings.filter(f=>!f.sources.length).map(f=>`${TENDER_ROLES[role]}, ${f.critical?'KRITIEK, ':''}${f.type}, ${f.title}. ${f.detail}`),...r.work_items.filter(w=>!w.sources.length).map(w=>`${TENDER_ROLES[role]}, werkpost, ${w.description}, ${w.quantity??'onbekend'} ${w.unit}, ${w.basis}.`)];
  for(const text of items)for(let start=0;start<text.length;start+=1800){const part=text.slice(start,start+1800);if(note.length+part.length>2200)flush();note+=part+'\n';}
 }flush();return tasks.length?tasks:[{evidence:[]}];
}
export function estimateBlock(data,contract){
 const body=tenderRequestBody(data,'estimate-model',contract),content=body.input[0].content;
 const chars=body.instructions.length+JSON.stringify(body.text).length+content.filter(x=>x.type==='input_text').reduce((s,x)=>s+x.text.length,0);
 const source=data.stage==='extract'?data.documents[0]:null;
 const sourceTokens=source?(source.name.toLowerCase().endsWith('.pdf')?2200*(data.pages||2):Math.ceil((source.file_data.length*3/4)/2.5)):0;
 return Math.ceil(chars/2.5)+sourceTokens+body.max_output_tokens;
}

// One paid request at a time. Both reservation and successful response are saved before advancing.
export async function runTenderBlocks(t,blocks,{analyze,onProgress=()=>{},onSave=()=>{},shouldStop=()=>false,cache={get:readBlock,set:writeBlock},contract,maxRequests}={}){
 const state=processing(t),started=signature(t);contract ||= await loadTenderContract();maxRequests ??= state.batch;
 if(!Number.isFinite(state.budget)||state.budget<10000||state.budget>500000)throw Error('Kies een tokenlimiet tussen 10.000 en 500.000.');
 if(![1,3,6,0].includes(maxRequests))throw Error('Ongeldige blokkeuze.');
 let calls=0;const sources=[];
 state.sourceTotal=blocks.length;state.sourceDone=0;
 const check=()=>{if(signature(t)!==started)throw Error('Het dossier is gewijzigd. Het antwoord is niet overgenomen.');};
 async function request(key,data,label,prepare){
  check();const cached=await cache.get(key);check();if(cached){const checked=data.stage==='extract'?validateEvidence(cached,data.documents):validateTenderResult(cached,t.documents,data.role);if(data.stage==='extract'&&!checked.complete)throw Error('Het opgeslagen bronblok is onvolledig. Verklein het bronblok.');return checked;}
  if(shouldStop()||maxRequests&&calls>=maxRequests)return null;
  if(prepare)data=await prepare();check();if(shouldStop())return null;
  const reserved=estimateBlock(data,contract);
  if(state.spent+reserved>state.budget){state.last=`Tokenlimiet bereikt. Voor het volgende blok is circa ${reserved.toLocaleString('nl-NL')} tokens ruimte nodig. Verhoog de limiet om verder te gaan.`;await onSave();return null;}
  state.spent+=reserved;state.requests++;calls++;state.last=label;await onSave();onProgress(label);
  let usage=null;
  try{
   const answer=await analyze(data,value=>{usage=value;});check();
   const validated=data.stage==='extract'?validateEvidence(answer,data.documents):validateTenderResult(answer,t.documents,data.role);
   if(data.stage==='review')for(const item of [...validated.findings,...validated.work_items])for(const s of item.sources)if(!data.evidence.some(p=>p.document_id===s.document_id&&p.location===s.location&&(!s.quote||p.quote.includes(s.quote))))throw Error('Een bronverwijzing valt buiten dit analyseblok. Het antwoord is niet overgenomen.');
   if(data.stage==='extract'&&!validated.complete)throw Error('Dit bronblok is niet volledig uitgelezen. Kies minder PDF pagina’s per blok of splits het tekstbestand. Controleer onleesbare pagina’s in het origineel.');
   await cache.set(key,validated);return validated;
  }finally{
   if(usage){const input=Number.isSafeInteger(usage.input)&&usage.input>=0?usage.input:0,output=Number.isSafeInteger(usage.output)&&usage.output>=0?usage.output:0,cached=Number.isSafeInteger(usage.cached)&&usage.cached>=0?usage.cached:0;state.spent+=input+output-reserved;state.actualInput+=input;state.actualOutput+=output;state.cached+=cached;}
   // Without provider usage, retain the conservative reservation, including failed requests.
   await onSave();
  }
 }
 for(const block of blocks){
  const data={stage:'extract',role:'contract',documents:[block.document],meta:t.meta,prompt:'',prior:[],source_range:block.range,pages:block.units};
  const result=await request('source:'+block.key,data,`Bronblok ${state.sourceDone+1} van ${blocks.length}, ${block.label}`,block.loadDocument?async()=>({...data,documents:[await block.loadDocument()]}):undefined);
  if(!result){if(!state.last.startsWith('Tokenlimiet'))state.last='Gepauzeerd. Afgeronde blokken zijn opgeslagen. Hervat de beoordeling om verder te gaan.';await onSave();return {paused:true,calls};}sources.push(result);state.sourceDone++;await onSave();
 }
 const allPassages=unique(sources.flatMap(s=>s.passages));
 for(const role of [...t.roles,'synthesis']){
  check();if(currentRun(t,role))continue;
  const tasks=role==='synthesis'?synthesisTasks(t):evidenceGroups(allPassages.filter(p=>p.roles.includes(role))).map(evidence=>({evidence})),groups=tasks.map(task=>task.evidence);
  let run=t.runs[role];if(!run||run.signature!==started||run.pipeline!==BLOCK_VERSION)run=t.runs[role]={id:uid(),signature:started,pipeline:BLOCK_VERSION,status:'running',result:null,completed:0,total:groups.length};
  run.status='running';run.total=groups.length;const results=[];
  for(let i=0;i<groups.length;i++){
   const data={stage:'review',role,documents:t.documents,meta:t.meta,prompt:t.prompts[role]||'',prior:[],evidence:groups[i],notes:roleNotes(t,role==='synthesis'?t.roles:t.roles.slice(0,t.roles.indexOf(role))),source_range:`deel ${i+1} van ${groups.length}`};
   if(tasks[i].extraNote)data.notes.push(tasks[i].extraNote);
   // Source summaries supply context when no discipline-specific passage was found.
   if(!groups[i].length&&!tasks[i].extraNote)data.notes=[...data.notes.slice(0,5),{role:'contract',text:('Geen specifieke passages voor deze rol in de bronindex. Controleer de scope en formuleer ontbrekende informatie als open vraag. Bronoverzicht, '+sources.map(s=>s.summary).join('\n')).slice(0,2400)}];
   const key='review:'+await digest(JSON.stringify({version:BLOCK_VERSION,started,epoch:state.epoch,data}));
   let result;try{result=await request(key,data,`${TENDER_ROLES[role]}, blok ${i+1} van ${groups.length}`);}catch(err){run.status='failed';await onSave();throw err;}
   if(!result){run.status='paused';if(!state.last.startsWith('Tokenlimiet'))state.last='Gepauzeerd. Afgeronde blokken zijn opgeslagen. Hervat de beoordeling om verder te gaan.';await onSave();return {paused:true,calls};}
   results.push(result);run.completed=results.length;run.result=mergeBlockResults(role,results,t.documents);await onSave();onProgress(`${TENDER_ROLES[role]}, ${run.completed} van ${groups.length} blokken opgeslagen`);
  }
  run.status='done';await onSave();
 }
 state.last='Alle blokken zijn beoordeeld. Controleer de originele bronnen en open punten.';await onSave();return {done:true,calls};
}
