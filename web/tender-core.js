export const TENDER_ROLES={contract:'Contractmanager',electrical:'Elektrotechniek',mechanical:'Werktuigbouw',execution:'Werkvoorbereiding en uitvoering',calculator:'Calculator',synthesis:'Offertemanager'};
export const TENDER_TYPES={requirement:'Eis',risk:'Risico',question:'Vraag voor opdrachtgever',assumption:'Aanname',exclusion:'Uitsluiting',scope:'Werkpakket'};
export const FILE_TYPES={pdf:'application/pdf',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',txt:'text/plain',md:'text/markdown'};
export const MAX_DOCUMENT_BYTES=6*1024*1024,MAX_TOTAL_BYTES=12*1024*1024,MAX_DOCUMENTS=10;
export const uid=()=>globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;
export function newTender(){return {meta:{title:'',client:'',reference:'',url:'',deadline:'',location:'',reviewed:false},documents:[],roles:Object.keys(TENDER_ROLES).filter(r=>r!=='synthesis'),prompts:{},runs:{},reviews:{},scopeReviewed:false,scopeText:'',offerText:'',filesAvailable:true};}
export function ensureTender(p){p.tender ||= newTender();p.flow='tender';return p.tender;}
export function signature(t){return JSON.stringify({meta:t.meta,documents:t.documents.map(d=>[d.id,d.name,d.size,d.version,d.hash||'']),roles:[...t.roles].sort(),prompts:t.prompts,promptVersion:t.promptVersion||'legacy'});}
export function syncTenderPrompts(t,contract){
 if(!contract?.version||t.promptVersion===contract.version)return false;
 t.promptVersion=contract.version;t.scopeReviewed=false;return true;
}
export function currentRun(t,role){const run=t.runs[role];return run?.status==='done'&&run.signature===signature(t)?run:null;}
export function findings(t){return Object.entries(t.runs).flatMap(([role,run])=>(run.result?.findings||[]).map((f,i)=>({...f,id:run.id+'-f'+i,role,current:run.status==='done'&&run.signature===signature(t)})));}
export function workItems(t){return Object.entries(t.runs).flatMap(([role,run])=>(run.result?.work_items||[]).map((w,i)=>({...w,id:run.id+'-w'+i,role,current:run.status==='done'&&run.signature===signature(t)})));}
export function findingClosed(t,f){const r=t.reviews[f.id];return Boolean(f.current&&r?.sourceChecked&&['covered','excluded'].includes(r.status)&&r.note?.trim().length>=8);}
export function tenderChecklist(p){
 const t=p.tender||newTender(),fs=findings(t).filter(f=>f.current),allRoles=[...t.roles,'synthesis'];
 const checks=[
  ['metadata','Opdrachtgegevens gecontroleerd',10,Boolean(t.meta.title.trim()&&t.meta.client.trim()&&t.meta.reviewed)],
  ['documents','Bronstukken beschikbaar',10,Boolean(t.documents.length&&t.filesAvailable!==false)],
  ['specialists','Alle gekozen specialisten beoordeeld op deze documentversies',20,Boolean(t.roles.includes('contract')&&allRoles.every(r=>currentRun(t,r)))],
  ['synthesis','Gezamenlijke offerteopzet beschikbaar',15,Boolean(currentRun(t,'synthesis')&&t.offerText.trim())],
  ['requirements','Alle eisen, bevindingen en open vragen beoordeeld',20,Boolean(currentRun(t,'synthesis')&&fs.every(f=>findingClosed(t,f)))],
  ['scope','Scope, conceptontwerp en projectplan gecontroleerd',15,Boolean(t.scopeReviewed&&t.scopeText.trim()&&p.design.trim()&&p.plan.trim())],
  ['calculation','Calculatie financieel gecontroleerd',10,Boolean(p.lines.length&&p.financialReview)]
 ];
 const missing=checks.filter(c=>!c[3]).map(([id,label,weight])=>({id,label,weight,critical:true}));const score=100-missing.reduce((s,c)=>s+c.weight,0);
 return {score,missing,critical:missing,ready:missing.length===0};
}
export function validateDocument(file,current){
 const ext=file.name?.split('.').pop()?.toLowerCase();if(typeof file.name!=='string'||file.name.length>200)throw Error('Gebruik een bestandsnaam van maximaal 200 tekens.');if(!FILE_TYPES[ext])throw Error('Gebruik PDF, DOCX, TXT of MD. Zet tekeningen en afbeeldingen uit Word zo nodig om naar PDF.');
 if(!Number.isFinite(file.size)||file.size<=0||file.size>MAX_DOCUMENT_BYTES)throw Error('Een bestand mag maximaal 6 MB zijn en moet inhoud hebben.');
 if(current.length>=MAX_DOCUMENTS||current.reduce((s,f)=>s+f.size,0)+file.size>MAX_TOTAL_BYTES)throw Error('Maximaal 10 bestanden en samen 12 MB per dossier.');return FILE_TYPES[ext];
}
export function validTenderUrl(value){if(!value)return true;try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&(u.hostname==='tenderned.nl'||u.hostname.endsWith('.tenderned.nl'));}catch{return false;}}
export function importTender(raw){
 if(!raw||JSON.stringify(raw).length>3500000)throw Error('Ongeldig of te groot aanbestedingsdossier.');
 const t=newTender();for(const k of Object.keys(t.meta)){if(k==='reviewed')continue;if(typeof raw.meta?.[k]!=='string'||raw.meta[k].length>3000)throw Error('Ongeldige opdrachtgegevens.');t.meta[k]=raw.meta[k];}
 if(!validTenderUrl(t.meta.url))throw Error('Gebruik een HTTPS link op TenderNed.');
 if(!Array.isArray(raw.documents)||raw.documents.length>10)throw Error('Ongeldige documentenlijst.');
 t.documents=raw.documents.map(d=>{if(!d||typeof d.name!=='string'||!FILE_TYPES[d.name.split('.').pop().toLowerCase()]||typeof d.id!=='string'||!/^[-a-zA-Z0-9_]{1,100}$/.test(d.id)||typeof d.size!=='number'||d.size<=0||d.size>MAX_DOCUMENT_BYTES)throw Error('Ongeldige documentmetadata.');return {id:d.id,name:d.name.slice(0,200),size:d.size,type:FILE_TYPES[d.name.split('.').pop().toLowerCase()],version:String(d.version||'1').slice(0,100),hash:String(d.hash||'').slice(0,64)};});
 if(t.documents.reduce((s,d)=>s+d.size,0)>MAX_TOTAL_BYTES||new Set(t.documents.map(d=>d.id)).size!==t.documents.length)throw Error('Ongeldig documentdossier.');
 if(!Array.isArray(raw.roles)||!raw.roles.includes('contract')||raw.roles.some(r=>!Object.hasOwn(TENDER_ROLES,r)||r==='synthesis'))throw Error('Ongeldige specialistkeuze.');t.roles=[...new Set(raw.roles)];
 for(const [r,prompt] of Object.entries(raw.prompts||{})){if(!Object.hasOwn(TENDER_ROLES,r)||typeof prompt!=='string'||prompt.length>6000)throw Error('Ongeldige specialistprompt.');t.prompts[r]=prompt;}
 for(const k of ['offerText','scopeText']){if(typeof raw[k]!=='string'||raw[k].length>30000)throw Error('Ongeldige offertetekst.');t[k]=raw[k];}
 // Imported analyses are retained as unverified history, never as a release approval.
 for(const [role,run] of Object.entries(raw.runs||{})){if(!Object.hasOwn(TENDER_ROLES,role)||!run||typeof run!=='object')throw Error('Ongeldige specialistanalyse.');if(run.result!==null&&run.result!==undefined&&(!Array.isArray(run.result.findings)||!Array.isArray(run.result.work_items)))throw Error('Ongeldige analysegegevens.');t.runs[role]={id:uid(),status:'stale',signature:'',result:run.result||null};}
 t.filesAvailable=false;return t;
}
