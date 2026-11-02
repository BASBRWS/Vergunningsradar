import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createDirectAIClient,directRequestBody,validateDirectReply,DIRECT_SCHEMA} from '../web/calculator-direct-ai.js';
import {newProject} from '../web/calculator-core.js';
const FAKE_KEY='sk-unit-test-not-a-real-api-key';
const reply={reply:'Wat wil je laten aanpassen?',next_field:'trade',updates:[],preparation:[]};
const envelope=data=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(data)}]}]});
const response=(data,status=200)=>({ok:status>=200&&status<300,status,text:async()=>JSON.stringify(data)});
const payload=()=>({message:'Ik wil verwarming laten aanpassen.',fields:newProject().fields,messages:[],preparation:[],asked:'trade'});

test('direct mode calls only OpenAI, keeps the key out of the body, and tests before chat',async()=>{
 const calls=[];const client=createDirectAIClient(async(url,options)=>{calls.push({url,options});return response(envelope(reply));});
 client.configure(FAKE_KEY,'my-allowed-model');
 await assert.rejects(()=>client.chat(payload()),/Test eerst/);assert.equal(calls.length,0);
 assert.equal((await client.test()).providerTested,true);assert.equal(client.status().tested,true);
 const probe=JSON.parse(calls[0].options.body);const input=JSON.parse(probe.input);assert.ok(Object.values(input.fields).every(f=>f.value===''));assert.deepEqual(input.history,[]);
 assert.equal(calls[0].url,'https://api.openai.com/v1/responses');assert.equal(calls[0].options.headers.Authorization,'Bearer '+FAKE_KEY);assert.equal(calls[0].options.redirect,'error');assert.equal(calls[0].options.credentials,'omit');
 assert.ok(!calls[0].options.body.includes(FAKE_KEY));assert.equal(probe.store,false);assert.equal(probe.text.format.strict,true);assert.deepEqual(probe.text.format.schema.required,DIRECT_SCHEMA.required);
 assert.deepEqual(await client.chat(payload()),reply);assert.ok(!JSON.stringify(client.status()).includes(FAKE_KEY));
 client.clear();assert.equal(client.status().hasKey,false);assert.equal(client.status().tested,false);await assert.rejects(()=>client.test(),/sleutel/);
});
test('no key, invalid key or missing model fails before any network request',async()=>{
 let calls=0;const client=createDirectAIClient(async()=>{calls++;throw Error('Should not call');});
 assert.throws(()=>client.configure('','model'),/sleutel/);assert.throws(()=>client.configure('bad key','model'),/sleutel/);assert.throws(()=>client.configure(FAKE_KEY,''),/modelnaam/);
 await assert.rejects(()=>client.test(),/sleutel/);assert.equal(calls,0);
});
test('API errors are understandable and never echo an invalid key from provider error messages',async()=>{
 for(const [status,code,expected] of [[401,'invalid_api_key',/accepteert/],[403,'forbidden',/geen toegang/],[404,'model_not_found',/model/],[429,'insufficient_quota',/tegoed/],[429,'rate_limit_exceeded',/veel aanvragen/],[400,'bad_request',/Structured Outputs/]]){
  const client=createDirectAIClient(async()=>response({error:{code,message:'Invalid key '+FAKE_KEY}},status));client.configure(FAKE_KEY,'my-model');
  await assert.rejects(()=>client.test(),err=>{assert.match(err.message,expected);assert.ok(!err.message.includes(FAKE_KEY));assert.ok(!err.stack.includes(FAKE_KEY));return true;});assert.equal(client.status().tested,false);
 }
});
test('clearing a key during a request discards the result and cannot reactivate the connection',async()=>{
 let complete;const pending=new Promise(resolve=>complete=resolve);const client=createDirectAIClient(()=>pending);client.configure(FAKE_KEY,'my-model');const probe=client.test();client.clear();complete(response(envelope(reply)));
 await assert.rejects(()=>probe,/sleutel is gewist/);assert.equal(client.status().tested,false);assert.equal(client.status().hasKey,false);
});
test('provider output cannot confirm facts, change prices, add tasks with verified state or return a fake confidence',()=>{
 for(const invalid of [{...reply,confidence:.99},{...reply,updates:[{field:'price',value:'100'}]},{...reply,updates:[{field:'trade',value:'Elektra',confirmed:true}]},{...reply,preparation:[{field:'existing',kind:'site_visit',note:'Controleer',resolved:true}]},{...reply,next_field:'secret'}])assert.throws(()=>validateDirectReply(invalid));
 assert.deepEqual(validateDirectReply({...reply,preparation:[{field:'existing',kind:'site_visit',note:'Controleer de bestaande installatie.'}]}).preparation.length,1);
});
test('direct request strips costs, field source data and extra task properties from its input',()=>{
 const data=payload();data.lines=[{cost:99999,name:'private-cost'}];data.fields.trade.source='DO-NOT-FORWARD';data.preparation=[{field:'existing',kind:'followup',note:'Navragen.',accepted:false,resolved:false,cost:88888,owner:'DO-NOT-FORWARD'}];
 const body=directRequestBody(data,'my-model'),raw=JSON.stringify(body),input=JSON.parse(body.input);
 assert.ok(!raw.includes('DO-NOT-FORWARD'));assert.ok(!raw.includes('private-cost'));assert.ok(!raw.includes('88888'));assert.ok(!Object.hasOwn(input,'lines'));
 assert.equal(body.model,'my-model');assert.ok(body.instructions.includes('voorlopig'));assert.ok(body.instructions.includes('locatieopname'));
});
test('a refusal, malformed answer or incomplete generation never produces a verified connection',async()=>{
 for(const envelopeValue of [null,{status:'incomplete',output:[]},{status:'completed',output:[{type:'message',content:[{type:'refusal',refusal:'no'}]}]},envelope({...reply,updates:[{field:'cost',value:'10'}]})]){
  const client=createDirectAIClient(async()=>response(envelopeValue));client.configure(FAKE_KEY,'my-model');await assert.rejects(()=>client.test());assert.equal(client.status().tested,false);
 }
});
test('browser client contains no storage, console logging or key value interpolation in configuration HTML',async()=>{
 const source=await readFile(new URL('../web/calculator-direct-ai.js',import.meta.url),'utf8');assert.ok(!/localStorage|sessionStorage|console\./.test(source));
 const app=await readFile(new URL('../web/calculator.js',import.meta.url),'utf8');assert.ok(!/value="\$\{[^}]*pendingDirectKey/.test(app));assert.ok(app.includes("addEventListener('pagehide'"));
});
