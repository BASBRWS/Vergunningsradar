import {currentRun,signature,uid} from './tender-core.js';
import {validateTenderResult} from './tender-ai.js';

// Each role receives original documents and successful earlier roles. Never silently retry.
export async function runSpecialists(t,documents,{analyze,onProgress=()=>{},onSave=()=>{},shouldStop=()=>false}){
 const roles=[...t.roles,'synthesis'],started=signature(t);
 for(const role of roles){
  if(currentRun(t,role))continue;
  if(shouldStop())return {stopped:true};
  if(signature(t)!==started)throw Error('Het dossier is gewijzigd. Start een nieuwe analyse.');
  onProgress(role);
  const run={id:uid(),status:'running',signature:started,result:null};t.runs[role]=run;
  const prior=roles.slice(0,roles.indexOf(role)).map(r=>currentRun(t,r)?.result).filter(Boolean);
  try{
   const result=validateTenderResult(await analyze({role,documents,meta:t.meta,prompt:t.prompts[role]||'',prior}),documents,role);
   if(signature(t)!==started)throw Error('Het dossier is gewijzigd. Het antwoord is niet overgenomen.');
   run.result=result;run.status='done';onSave();
  }catch(err){run.status='failed';onSave();throw err;}
 }
 return {stopped:shouldStop()};
}
