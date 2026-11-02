import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {newTender,signature,currentRun,syncTenderPrompts} from '../web/tender-core.js';
import {tenderRequestBody} from '../web/tender-ai.js';
const contract=JSON.parse(await readFile(new URL('../web/tender-contract.json',import.meta.url),'utf8'));
const original=await readFile(new URL('../docs/tenderned-rolprompts.md',import.meta.url),'utf8');
const sections=new Map([...original.matchAll(/^## (.+?)\n+```\n([\s\S]*?)\n```/gm)].map(m=>[m[1],m[2].trim()]));
const names={contract:'Contractmanager',electrical:'Elektrotechniek',mechanical:'Werktuigbouw',execution:'Werkvoorbereiding en uitvoering',calculator:'Calculator',synthesis:'Offertemanager'};
const doc={id:'d',name:'bestek.txt',size:6,file_data:'data:text/plain;base64,YmVzdGVr'};
test('all six default roles and the complete shared base preserve the supplied prompts',()=>{
 assert.equal(contract.base_prompt,sections.get('[BASIS] – gedeeld door alle rollen'));
 for(const role of contract.roles)assert.equal(role.prompt,sections.get(names[role.id]));
 assert.ok(contract.roles.find(r=>r.id==='synthesis').prompt.includes('## 10. Open punten en verantwoordelijken'));
});
test('both original and block requests combine base, selected role and custom prompt with a compatible JSON envelope',()=>{
 for(const role of contract.roles)for(const stage of ['', 'review']){
  const t=newTender(),data={role:role.id,meta:t.meta,prompt:'Mijn aanvullende controle.',prior:[],documents:[doc],...(stage?{stage,evidence:[],notes:[],source_range:'deel 1 van 1'}:{})};
  const body=tenderRequestBody(data,'claude-opus-5-5',contract);assert.ok(body.instructions.includes(contract.base_prompt));assert.ok(body.instructions.includes(role.prompt));assert.ok(body.instructions.includes(data.prompt));assert.ok(body.instructions.endsWith(contract.output_adapter));assert.ok(body.text.format.schema.properties.offer);assert.equal(body.text.format.schema.properties.rol,undefined);
 }
});
test('a changed standard prompt invalidates old approvals while preserving custom prompts and historical findings',()=>{
 const t=newTender();t.prompts.contract='Eigen aandachtspunt';t.runs.contract={id:'old',status:'done',signature:signature(t),result:{summary:'Bewaar deze historie.'}};t.scopeReviewed=true;
 assert.ok(currentRun(t,'contract'));assert.equal(syncTenderPrompts(t,contract),true);assert.equal(currentRun(t,'contract'),null);assert.equal(t.prompts.contract,'Eigen aandachtspunt');assert.equal(t.runs.contract.result.summary,'Bewaar deze historie.');assert.equal(t.scopeReviewed,false);assert.equal(syncTenderPrompts(t,contract),false);
});
