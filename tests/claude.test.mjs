import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createDirectAIClient,directRequestBody} from '../web/calculator-direct-ai.js';
import {claudeRequestBody,claudeReply,CLAUDE_VERSION} from '../web/claude-api.js';
import {tenderRequestBody} from '../web/tender-ai.js';
import {newProject} from '../web/calculator-core.js';
const key='sk-ant-unit-test-not-a-real-key';
const reply={reply:'Waar wil je de installatie?',next_field:'address',updates:[],preparation:[]};
const envelope=value=>({type:'message',stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify(value)}]});
const response=(value,status=200)=>({ok:status===200,status,text:async()=>JSON.stringify(value)});
const payload=()=>({message:'Ik wil de verwarming vervangen.',fields:newProject().fields,messages:[],preparation:[],asked:'trade'});
const contract=JSON.parse(await readFile(new URL('../web/tender-contract.json',import.meta.url),'utf8'));
const meta={title:'Demo',client:'Demo',reference:'',url:'',location:'',deadline:''};
function tender(documents){return {role:'contract',prompt:'',prior:[],meta,documents};}

test('Claude uses its fixed host and headers, tests the structured contract and never sends keys to OpenAI',async()=>{
 const calls=[],client=createDirectAIClient(async(url,options)=>{calls.push({url,options});return response(envelope(reply));});client.configure(key,'user-claude-model','anthropic');
 await assert.rejects(()=>client.chat(payload()),/Test eerst/);await client.test();assert.equal(client.status().provider,'anthropic');await client.chat(payload());
 for(const c of calls){assert.equal(c.url,'https://api.anthropic.com/v1/messages');assert.equal(c.options.headers['x-api-key'],key);assert.equal(c.options.headers['anthropic-version'],CLAUDE_VERSION);assert.equal(c.options.headers['anthropic-dangerous-direct-browser-access'],'true');assert.equal(c.options.headers.Authorization,undefined);assert.equal(c.options.redirect,'error');assert.ok(!c.options.body.includes(key));const body=JSON.parse(c.options.body);assert.equal(body.output_config.format.type,'json_schema');assert.ok(!Object.hasOwn(body,'store'));}
 assert.ok(Object.values(JSON.parse(JSON.parse(calls[0].options.body).messages[0].content[0].text).fields).every(f=>f.value===''));assert.ok(!JSON.stringify(client.status()).includes(key));
});
test('switching providers cannot reuse a key or keep a successful connection without another test',async()=>{
 const client=createDirectAIClient(async()=>response(envelope(reply)));client.configure(key,'claude-model','anthropic');await client.test();assert.throws(()=>client.configure('','openai-model','openai'),/sleutel/);client.configure('sk-openai-unit-test-no-real-key','openai-model','openai');assert.equal(client.status().tested,false);await assert.rejects(()=>client.chat(payload()),/Test eerst/);assert.throws(()=>client.configure(key,'claude-model','evil'),/aanbieder/);
});
test('Claude PDFs retain exact bytes and text documents decode as UTF-8, DOCX fails before a provider request',()=>{
 const pdf={id:'pdf1',name:'bestek.pdf',size:8,file_data:'data:application/pdf;base64,JVBERi0xLjc='},txt={id:'txt1',name:'nota.md',size:4,file_data:'data:text/markdown;base64,ZsOpZQ=='};
 const body=claudeRequestBody(tenderRequestBody(tender([pdf,txt]),'user-model',contract));const blocks=body.messages[0].content;assert.equal(blocks[1].source.media_type,'application/pdf');assert.equal(blocks[1].source.data,'JVBERi0xLjc=');assert.equal(blocks[2].source.type,'text');assert.equal(blocks[2].source.data,'fée');assert.equal(blocks[2].title,'nota.md');assert.ok(!Object.hasOwn(blocks[1],'citations'));
 const docx={id:'docx1',name:'bestek.docx',size:2,file_data:'data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,UEs='};assert.throws(()=>claudeRequestBody(tenderRequestBody(tender([docx]),'user-model',contract)),/DOCX om naar PDF/);
});
test('Claude refusals, truncated output and schema or source injections never create approved dossier data',async()=>{
 for(const value of [{...envelope(reply),stop_reason:'refusal'},{...envelope(reply),stop_reason:'max_tokens'},envelope({...reply,approved:true}),{type:'message',stop_reason:'end_turn',content:[{type:'text',text:'not-json'}]}]){const client=createDirectAIClient(async()=>response(value));client.configure(key,'user-model','anthropic');await assert.rejects(()=>client.test());assert.equal(client.status().tested,false);}
 assert.throws(()=>claudeReply({type:'message',stop_reason:'tool_use',content:[]}));
});
test('Claude error messages do not echo provider messages or credentials and never fall back',async()=>{
 for(const status of [400,401,403,404,413,429,529]){const calls=[],client=createDirectAIClient(async(url)=>{calls.push(url);return response({error:{message:key,type:'invalid_api_key'}},status);});client.configure(key,'user-model','anthropic');await assert.rejects(()=>client.test(),e=>!e.message.includes(key));assert.equal(calls.length,1);assert.equal(calls[0],'https://api.anthropic.com/v1/messages');}
});
test('clearing a Claude key during a request discards the result and invalidates the tested state',async()=>{
 let resolve;const client=createDirectAIClient(()=>new Promise(r=>resolve=r));client.configure(key,'user-model','anthropic');const pending=client.test();client.clear();resolve(response(envelope(reply)));await assert.rejects(()=>pending,/sleutel is gewist/);assert.equal(client.status().hasKey,false);assert.equal(client.status().tested,false);
});
test('Claude tender analysis reuses local source validation and cannot write prices or confirmations',async()=>{
 const old=globalThis.fetch;globalThis.fetch=async()=>({ok:true,json:async()=>contract});let i=0;
 const analysis={role:'contract',summary:'Controleer de testverplichting.',findings:[],work_items:[],design:'',plan:'',offer:''};
 try{const client=createDirectAIClient(async()=>response(envelope(i++?analysis:reply)));client.configure(key,'user-model','anthropic');await client.test();const doc={id:'d',name:'bestek.txt',size:6,file_data:'data:text/plain;base64,YmVzdGVr'};assert.equal((await client.analyzeTender(tender([doc]))).role,'contract');analysis.price=999;await assert.rejects(()=>client.analyzeTender(tender([doc])));}
 finally{globalThis.fetch=old;}
});
