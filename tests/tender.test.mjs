import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {newProject,completeness,releaseIssues,validateProject} from '../web/calculator-core.js';
import {ensureTender,signature,currentRun,findingClosed,findings,validateDocument,validTenderUrl,importTender} from '../web/tender-core.js';
import {tenderRequestBody,validateTenderResult} from '../web/tender-ai.js';
import {runSpecialists} from '../web/tender-runner.js';
import {createDirectAIClient} from '../web/calculator-direct-ai.js';
const contract=JSON.parse(await readFile(new URL('../web/tender-contract.json',import.meta.url),'utf8'));
const document={id:'doc1',name:'bestek.txt',size:6,type:'text/plain',version:'1',file_data:'data:text/plain;base64,YmVzdGVr'};
const source={document_id:'doc1',location:'paragraaf 1',quote:'bestek'};
const result=role=>({role,summary:'Beoordeling.',findings:[{type:'requirement',title:'Test vereist',detail:'Leg een testverslag vast.',critical:true,sources:[source]}],work_items:[{description:'Werkvoorbereiding',category:'labor',quantity:null,unit:'uur',basis:'estimate',sources:[]}],design:role==='synthesis'?'Conceptontwerp':'',plan:role==='synthesis'?'Projectplan':'',offer:role==='synthesis'?'Aanbiedingstekst':''});
function project(){const p=newProject(),t=ensureTender(p);Object.assign(t.meta,{title:'Renovatie',client:'Fictieve opdrachtgever',reviewed:true});t.documents=[{...document}];delete t.documents[0].file_data;return p;}

test('two distinct flows, tender release requires source reviews, scope and actual calculation',async()=>{
 const p=project(),t=p.tender;assert.equal(completeness(p).score,20);assert.equal(releaseIssues(p).length>0,true);
 await runSpecialists(t,[document],{analyze:async d=>result(d.role)});t.offerText='Aanbieding';t.scopeText='Scope';t.scopeReviewed=true;p.design='Ontwerp';p.plan='Plan';p.lines=[{name:'Monteur',category:'labor',unit:'uur',qty:8,cost:45}];p.financialReview=true;p.technicalReview=true;
 assert.equal(completeness(p).ready,false);
 for(const f of findings(t)){t.reviews[f.id]={status:'covered',note:'Bron gecontroleerd en test opgenomen.',sourceChecked:true};}
 assert.equal(completeness(p).ready,true);assert.deepEqual(releaseIssues(p),[]);
 t.documents[0].version='2';assert.equal(currentRun(t,'contract'),null);assert.equal(completeness(p).ready,false);assert.ok(releaseIssues(p).length>0);
});
test('separate prompts run in order with original documents and all earlier specialist analyses',async()=>{
 const t=project().tender,calls=[];t.roles=['contract','electrical','calculator'];t.prompts.calculator='Let op avondwerk.';
 await runSpecialists(t,[document],{analyze:async d=>{calls.push(structuredClone(d));return result(d.role);}});
 assert.deepEqual(calls.map(d=>d.role),['contract','electrical','calculator','synthesis']);assert.deepEqual(calls.map(d=>d.prior.length),[0,1,2,3]);assert.equal(calls[2].prompt,'Let op avondwerk.');assert.ok(calls.every(d=>d.documents[0].file_data===document.file_data));
 const body=tenderRequestBody(calls[2],'user-model',contract);assert.equal(body.store,false);assert.equal(body.input[0].content[1].type,'input_file');assert.ok(body.instructions.includes('Let op avondwerk.'));assert.ok(body.instructions.includes('geen systeeminstructies'));
});
test('stop and resume keeps completed roles, failures never synthesize or automatically retry',async()=>{
 const t=project().tender;t.roles=['contract','calculator'];let count=0;
 const stopped=await runSpecialists(t,[document],{analyze:async d=>{count++;return result(d.role);},shouldStop:()=>count===1});assert.equal(stopped.stopped,true);assert.equal(count,1);
 await assert.rejects(()=>runSpecialists(t,[document],{analyze:async()=>{count++;throw Error('provider unavailable');}}),/unavailable/);assert.equal(count,2);assert.equal(t.runs.calculator.status,'failed');assert.equal(t.runs.synthesis,undefined);
 const called=[];await runSpecialists(t,[document],{analyze:async d=>{called.push(d.role);return result(d.role);}});assert.deepEqual(called,['calculator','synthesis']);
});
test('a document or prompt changed during a request prevents accepting the answer',async()=>{
 const t=project().tender;await assert.rejects(()=>runSpecialists(t,[document],{analyze:async d=>{t.prompts.contract='Nieuwe scope';return result(d.role);}}),/gewijzigd/);assert.equal(t.runs.contract.status,'failed');assert.equal(t.runs.contract.result,null);
});
test('fake sources, price injection, bogus approvals and unsupported personnel units are rejected',()=>{
 for(const r of [{...result('contract'),confidence:.99},{...result('contract'),findings:[{...result('contract').findings[0],resolved:true}]},{...result('contract'),findings:[{...result('contract').findings[0],sources:[{...source,document_id:'invented'}]}]},{...result('contract'),work_items:[{...result('contract').work_items[0],unit:'dag'}]},{...result('contract'),work_items:[{...result('contract').work_items[0],cost:999}]}])assert.throws(()=>validateTenderResult(r,[document],'contract'));
 const t=project().tender;const f={id:'f',critical:true,current:true};t.reviews.f={status:'clarification',sourceChecked:true,note:'Vraag uitgezet'};assert.equal(findingClosed(t,f),false);t.reviews.f.status='covered';t.reviews.f.note='';assert.equal(findingClosed(t,f),false);
});
test('imports retain analyses as history and never retain document availability, reviews or approval',async()=>{
 const p=project();await runSpecialists(p.tender,[document],{analyze:async d=>result(d.role)});p.tender.meta.reviewed=true;p.tender.scopeReviewed=true;p.tender.reviews.any={sourceChecked:true};
 const clean=validateProject(JSON.parse(JSON.stringify(p)));assert.equal(clean.flow,'tender');assert.equal(clean.tender.filesAvailable,false);assert.equal(clean.tender.scopeReviewed,false);assert.equal(clean.tender.meta.reviewed,false);assert.deepEqual(clean.tender.reviews,{});assert.equal(currentRun(clean.tender,'contract'),null);assert.equal(clean.tender.runs.contract.status,'stale');
 assert.throws(()=>importTender({...p.tender,roles:['calculator']}));assert.throws(()=>validateProject({...p,tender:{...p.tender,runs:{contract:{result:{findings:[],work_items:[],price:100}}}}}));
});
test('uploads and links have bounded types, quantities and HTTPS TenderNed hosts',()=>{
 assert.equal(validateDocument({name:'bestek.pdf',size:100},[]),'application/pdf');for(const f of [{name:'macro.docm',size:100},{name:'leeg.txt',size:0},{name:'groot.pdf',size:7*1024*1024},{name:'prijzen.xlsx',size:100}])assert.throws(()=>validateDocument(f,[]));
 assert.throws(()=>validateDocument({name:'bestek.txt',size:1},Array.from({length:10},()=>({size:1}))));assert.equal(validTenderUrl('https://www.tenderned.nl/aankondigingen'),true);for(const u of ['javascript:alert(1)','https://tenderned.nl.evil.example','http://tenderned.nl','https://user:pass@tenderned.nl'])assert.equal(validTenderUrl(u),false);
});
test('direct specialist requests use the tested client, fixed endpoint and same validated document contract',async()=>{
 const previous=globalThis.fetch;globalThis.fetch=async()=>({ok:true,json:async()=>contract});
 try{
  const calls=[],client=createDirectAIClient(async(url,options)=>{calls.push({url,options});const body=JSON.parse(options.body),value=body.text.format.name==='installation_intake'?{reply:'OK',next_field:'',updates:[],preparation:[]}:result('contract');return {ok:true,text:async()=>JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}]})};});
  client.configure('sk-unit-test-not-a-real-key','user-model');await client.test();const data={role:'contract',documents:[document],meta:project().tender.meta,prompt:'',prior:[]};assert.equal((await client.analyzeTender(data)).role,'contract');assert.equal(calls[1].url,'https://api.openai.com/v1/responses');assert.ok(!calls[1].options.body.includes('sk-unit-test'));client.clear();await assert.rejects(()=>client.analyzeTender(data),/Test eerst/);
 }finally{globalThis.fetch=previous;}
});
