import test from 'node:test';
import assert from 'node:assert/strict';
import {isUncertainAnswer,preparationText} from '../web/intake-guide.js';
import {connectionState,friendlyConnectionError} from '../web/calculator-connection.js';
import {newProject,FIELDS,setField,localReply,deferQuestion,upsertPreparation,resolvePreparation,completeness,confirmFields,generateDocuments,releaseIssues,validateProject} from '../web/calculator-core.js';

test('customer uncertainty is recognized without treating a lack of budget limit as uncertainty',()=>{
 for(const text of ['Ik weet niet hoeveel groepen er zijn','Dat weet ik eigenlijk niet','Ik weet het exacte vermogen niet','Geen idee','Daar heb ik geen verstand van','Dat is onbekend'])assert.equal(isUncertainAnswer(text),true,text);
 for(const text of ['Geen budgetgrens','Geen extra beperkingen','Ik weet dat het een kantoor is'])assert.equal(isUncertainAnswer(text),false,text);
});
test('unknown answers get a simpler question once and are then deferred without an endless loop',()=>{
 const p=newProject();p.asked='existing';
 const first=localReply(p,'Ik weet het niet');assert.match(first,/Wat zie je nu hangen/);assert.equal(p.asked,'existing');assert.equal(p.fields.existing.confirmed,false);
 const second=localReply(p,'Geen idee');assert.match(second,/Locatieopname/);assert.notEqual(p.asked,'existing');assert.equal(p.preparation.length,1);assert.equal(p.preparation[0].kind,'site_visit');assert.equal(p.preparation[0].resolved,false);assert.equal(completeness(p).ready,false);
});
test('an assumption can support a concept but cannot become a verified fact through customer acceptance',()=>{
 const p=newProject();for(const f of FIELDS)setField(p,f.id,'Vastgelegd gegeven');p.asked='constraints';deferQuestion(p,'assumption');
 p.preparation[0].accepted=true;confirmFields(p);
 assert.equal(p.fields.constraints.confirmed,false);assert.equal(completeness(p).score,90);assert.equal(completeness(p).ready,false);
 assert.ok(releaseIssues(p).some(x=>x.includes('voorbereidingspunten')));
 const docs=generateDocuments(p);assert.match(docs.design,/Voorlopige aanname/);assert.match(docs.plan,/nog te verifiëren/);assert.match(preparationText(p),/klant akkoord/);
});
test('recording verified site findings requires an outcome and then requires customer confirmation again',()=>{
 const p=newProject();for(const f of FIELDS)setField(p,f.id,'Vastgelegd gegeven');const item=upsertPreparation(p,'existing','site_visit','Controleer bestaande installatie.');
 for(const v of ['','Ik weet niet','Voorlopig geschikt'])assert.throws(()=>resolvePreparation(p,item.id,v));
 resolvePreparation(p,item.id,'Installateur heeft opnameverslag V2 gecontroleerd en de bestaande aansluitpunten vastgelegd.');
 assert.equal(item.resolved,true);assert.equal(p.fields.existing.confirmed,false);confirmFields(p);assert.equal(completeness(p).score,100);
 const imported=validateProject(p);assert.equal(imported.preparation[0].resolved,false);assert.equal(imported.preparation[0].accepted,false);
});
test('a labelled unknown value creates an action and the intake proceeds with another field',()=>{
 const p=newProject();localReply(p,'existing: Onbekend; customer: Test BV');assert.equal(p.preparation[0].field,'existing');assert.notEqual(p.asked,'existing');
});
test('connection diagnostics distinguish absent configuration, missing login, timeout and network access',()=>{
 assert.equal(connectionState('','').code,'no_server');assert.match(connectionState('','').message,/nog niet aangesloten/);
 assert.equal(connectionState('https://api.example.test','').code,'login');assert.equal(connectionState('https://api.example.test','token').ready,true);
 assert.match(friendlyConnectionError(new TypeError('Failed to fetch')),/bereikt/);assert.match(friendlyConnectionError({name:'TimeoutError'}),/niet op tijd/);
});
