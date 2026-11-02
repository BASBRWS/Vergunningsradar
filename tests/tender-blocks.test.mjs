import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {newTender,currentRun,signature} from '../web/tender-core.js';
import {runTenderBlocks,processing,estimateBlock,evidenceGroups,mergeBlockResults} from '../web/tender-block-runner.js';
import {prepareSourceBlocks,textRanges} from '../web/tender-source-blocks.js';
import {tenderRequestBody} from '../web/tender-ai.js';
import {EVIDENCE_SCHEMA,SOURCE_INSTRUCTIONS,validateEvidence} from '../web/tender-block-contract.js';
import {createDirectAIClient} from '../web/calculator-direct-ai.js';
const contract=JSON.parse(await readFile(new URL('../web/tender-contract.json',import.meta.url),'utf8'));
const source={document_id:'doc1',location:'paragraaf 1',quote:'bestek'};
const passage={...source,detail:'Testen vereist.',roles:['contract','electrical','calculator'],critical:true};
const evidence={summary:'Testverplichting.',complete:true,passages:[passage]};
const doc={id:'doc1',name:'bestek.txt',size:6,version:'1',file_data:'data:text/plain;base64,YmVzdGVr'};
const block={key:'source-key',documentId:'doc1',document:doc,units:0,range:'tekens 1 tot en met 6',label:'bestek.txt'};
const result=role=>({role,summary:'Beoordeling.',findings:[{type:'requirement',title:'Test vereist',detail:'Testen opnemen.',critical:true,sources:[source]}],work_items:[],design:role==='synthesis'?'Ontwerp':'',plan:role==='synthesis'?'Planning':'',offer:role==='synthesis'?'Offertedeel':''});
function setup(){const t=newTender();t.roles=['contract','electrical'];t.documents=[{...doc}];delete t.documents[0].file_data;const values=new Map(),cache={get:async key=>structuredClone(values.get(key)),set:async(key,value)=>values.set(key,structuredClone(value))};return {t,values,cache};}
test('three-request batch resumes from durable source and specialist blocks after JSON reload',async()=>{
 const {t,cache}=setup(),calls=[];const options={contract,cache,analyze:async(d,onUsage)=>{calls.push(d);onUsage({input:120,output:80,cached:10});return d.stage==='extract'?structuredClone(evidence):result(d.role);}};
 const first=await runTenderBlocks(t,[block],options);assert.equal(first.paused,true);assert.equal(calls.length,3);assert.ok(currentRun(t,'contract'));assert.ok(currentRun(t,'electrical'));assert.equal(t.processing.spent,600);assert.equal(t.processing.actualInput,360);assert.equal(t.processing.cached,30);
 const reloaded=JSON.parse(JSON.stringify(t));const final=await runTenderBlocks(reloaded,[block],options);assert.equal(final.done,true);assert.equal(calls.length,4);assert.deepEqual(calls.map(d=>d.stage==='extract'?'source':d.role),['source','contract','electrical','synthesis']);assert.equal(reloaded.processing.spent,800);
 assert.ok(calls.slice(1).every(d=>d.documents.every(x=>!x.file_data)));assert.ok(calls.slice(1).every(d=>tenderRequestBody(d,'model',contract).input[0].content.every(x=>x.type!=='input_file')));
});
test('failed blocks never automatically retry and earlier successful blocks are reused',async()=>{
 const {t,cache}=setup();let fail=true,calls=0;const options={contract,cache,maxRequests:0,analyze:async d=>{calls++;if(d.stage==='extract')return evidence;if(d.role==='electrical'&&fail)throw Error('timeout');return result(d.role);}};
 await assert.rejects(()=>runTenderBlocks(t,[block],options),/timeout/);assert.equal(calls,3);assert.ok(currentRun(t,'contract'));assert.equal(t.runs.electrical.status,'failed');const spent=t.processing.spent;
 fail=false;await runTenderBlocks(t,[block],options);assert.equal(calls,5);assert.ok(currentRun(t,'synthesis'));assert.ok(t.processing.spent>spent);
});
test('budget is reserved and persisted before transport, and blocks pause before exceeding it',async()=>{
 const {t,cache}=setup();const state=processing(t);state.budget=10000;let calls=0,saved=0;
 const expensive={...block,document:{...doc,name:'drawing.pdf',file_data:'data:application/pdf;base64,JVBERi0='},units:3};
 const paused=await runTenderBlocks(t,[expensive],{contract,cache,maxRequests:0,onSave:()=>saved++,analyze:async()=>{calls++;return evidence;}});assert.equal(paused.paused,true);assert.equal(calls,0);assert.equal(state.spent,0);assert.ok(state.last.startsWith('Tokenlimiet'));assert.ok(saved);
 state.budget=60000;await runTenderBlocks(t,[block],{contract,cache,maxRequests:1,onSave:()=>saved++,analyze:async()=>{assert.ok(state.spent>0);assert.equal(state.requests,1);return evidence;}});assert.equal(state.requests,1);
});
test('prompt edits invalidate specialist caches but reuse the unchanged source index',async()=>{
 const {t,cache}=setup();let sources=0,reviews=0;const options={contract,cache,maxRequests:0,analyze:async d=>{if(d.stage==='extract'){sources++;return evidence;}reviews++;return result(d.role);}};
 await runTenderBlocks(t,[block],options);t.prompts.contract='Bekijk mijlpalen.';await runTenderBlocks(t,[block],options);assert.equal(sources,1);assert.equal(reviews,6);
});
test('incomplete extraction, changed dossier and invented source ranges cannot become completed blocks',async()=>{
 for(const mode of ['incomplete','mutation','source']){const {t,cache}=setup();await assert.rejects(()=>runTenderBlocks(t,[block],{contract,cache,maxRequests:0,analyze:async d=>{if(mode==='mutation')t.meta.title='Gewijzigd';if(d.stage==='extract')return {...evidence,complete:mode!=='incomplete'};const r=result(d.role);r.findings[0].sources=[{...source,location:'niet aangeleverd'}];return r;}}));assert.equal(currentRun(t,'contract'),null);}
 assert.throws(()=>validateEvidence({...evidence,passages:[{...passage,document_id:'invented'}]},[doc]));
});
test('partial role results and a checkpoint survive pausing halfway through a large role',async()=>{
 const {t,cache}=setup();t.roles=['contract'];const many={...evidence,passages:Array.from({length:24},(_,i)=>({...passage,detail:'Eis '+i+' '+('x'.repeat(880)),roles:['contract']}))};let paid=0;
 const options={contract,cache,maxRequests:3,analyze:async d=>{paid++;return d.stage==='extract'?many:result(d.role);}};
 const first=await runTenderBlocks(t,[block],options);assert.equal(first.paused,true);assert.equal(t.runs.contract.completed,2);assert.ok(t.runs.contract.result);assert.equal(currentRun(t,'contract'),null);
 const cloned=JSON.parse(JSON.stringify(t));await runTenderBlocks(cloned,[block],{...options,maxRequests:0});assert.ok(currentRun(cloned,'contract'));assert.ok(currentRun(cloned,'synthesis'));assert.equal(paid,5);
});
test('text chunks cover every character, bound length and do not cut UTF-16 surrogate pairs',()=>{
 const text=('hoofdstuk 😀 1\n'+('abc'.repeat(400))+'\n').repeat(40),ranges=textRanges(text);let end=0;
 for(const r of ranges){assert.ok(r.start<=end);assert.ok(r.text.length<=6000);assert.ok(!/[\uD800-\uDBFF]$/.test(r.text));assert.equal(r.text,text.slice(r.start,r.end));end=r.end;}assert.equal(end,text.length);
});
test('PDF blocks contain every original page once, use original page ranges and stable content keys',async()=>{
 const code=await readFile(new URL('../web/vendor/pdf-lib.min.js',import.meta.url),'utf8'),lib=new Function('var exports={}; var module={exports};'+code+';return exports;')();
 const pdf=await lib.PDFDocument.create();for(let i=0;i<5;i++)pdf.addPage([300+i,400+i]);const bytes=await pdf.save(),document={id:'pdf1',name:'bestek.pdf',size:bytes.length,version:'1'};
 const options={pdfLibrary:lib,getBlob:async()=>new Blob([bytes]),pages:2},blocks=await prepareSourceBlocks([document],options);assert.equal(blocks.length,3);assert.deepEqual(blocks.map(b=>b.units),[2,2,1]);assert.equal(blocks[1].range,'pagina 3 tot en met 4');
 const sizes=[];for(const b of blocks){assert.equal(b.document.file_data,undefined);const loaded=await b.loadDocument();const part=await lib.PDFDocument.load(Buffer.from(loaded.file_data.split(',')[1],'base64'));sizes.push(...part.getPages().map(p=>p.getWidth()));}assert.deepEqual(sizes,[300,301,302,303,304]);assert.deepEqual((await prepareSourceBlocks([document],options)).map(b=>b.key),blocks.map(b=>b.key));
});
test('transport measures real Claude usage including cache reads and cache writes',async()=>{
 const old=globalThis.fetch;globalThis.fetch=async()=>({ok:true,json:async()=>contract});let i=0,usage;
 const client=createDirectAIClient(async()=>({ok:true,text:async()=>JSON.stringify({type:'message',stop_reason:'end_turn',usage:{input_tokens:20,output_tokens:10,cache_creation_input_tokens:30,cache_read_input_tokens:40},content:[{type:'text',text:JSON.stringify(i++?evidence:{reply:'OK',next_field:'',updates:[],preparation:[]})}]})}));
 try{client.configure('sk-ant-test-not-a-real-api-key','model','anthropic');await client.test();await client.analyzeTender({stage:'extract',role:'contract',documents:[doc],meta:newTender().meta,prompt:'',prior:[],source_range:'tekens 1 tot en met 6'},u=>usage=u);assert.deepEqual(usage,{input:90,output:10,cached:40});}finally{globalThis.fetch=old;}
});
test('browser and backend share exactly the same extraction schema and source instructions',async()=>{
 const shared=JSON.parse(await readFile(new URL('../web/tender-block-contract.json',import.meta.url),'utf8'));assert.deepEqual(shared.schema,EVIDENCE_SCHEMA);assert.equal(shared.instructions,SOURCE_INSTRUCTIONS);
});
test('resuming never rebuilds PDF bytes for cached source blocks or for unpaid blocks beyond the batch',async()=>{
 const {t,cache}=setup();let loads=0;const lazy={...block,loadDocument:async()=>{loads++;return doc;}};
 const options={contract,cache,maxRequests:1,analyze:async d=>d.stage==='extract'?evidence:result(d.role)};
 await runTenderBlocks(t,[lazy,{...lazy,key:'second'}],options);assert.equal(loads,1);
 await runTenderBlocks(t,[lazy,{...lazy,key:'second'}],options);assert.equal(loads,2);
 await runTenderBlocks(t,[lazy,{...lazy,key:'second'}],options);assert.equal(loads,2);
});
test('all critical findings without source survive bounded synthesis tasks even when summaries are too small',async()=>{
 const {t,cache}=setup();t.roles=['contract'];let offered='';
 await runTenderBlocks(t,[block],{contract,cache,maxRequests:0,analyze:async d=>{if(d.stage==='extract')return evidence;if(d.role==='contract'){const r=result('contract');r.findings=Array.from({length:20},(_,i)=>({type:'risk',title:'Onbevestigd punt '+i,detail:'Risico '+i+' '+('x'.repeat(200)),critical:true,sources:[]}));return r;}offered+=JSON.stringify(d.notes);return {...result('synthesis'),findings:[]};}});
 for(let i=0;i<20;i++)assert.ok(offered.includes('Onbevestigd punt '+i));assert.ok(currentRun(t,'synthesis'));
});
