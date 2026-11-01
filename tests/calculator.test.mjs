import test from 'node:test';
import assert from 'node:assert/strict';
import {FIELDS,DEFAULT_SETTINGS,newProject,calculate,setField,confirmFields,completeness,phase,localReply,releaseIssues,generateDocuments,parseCSV,validateProject,cents,known} from '../web/calculator-core.js';
const settings=patch=>({...DEFAULT_SETTINGS,overhead:0,risk:0,profit:0,vat:21,...patch});
const line=(cost,qty=1,category='product')=>({id:'a',name:'Test',category,unit:category==='labor'?'uur':'stuk',cost,qty});
test('margin and markup differ, VAT and discount use the rounded net price',()=>{
 const a=calculate([line(1000)],settings({profit:20,discount:10}));
 assert.equal(a.beforeDiscount,125000);assert.equal(a.net,112500);assert.equal(a.vat,23625);assert.equal(a.gross,136125);assert.equal(a.profit,12500);
 const b=calculate([line(1000)],settings({profit:20,profitMode:'markup'}));assert.equal(b.net,120000);
});
test('overhead bases and reserve do not charge labor twice',()=>{
 const lines=[line(40,10,'labor'),line(600)];
 for(const [mode,overhead,expected] of [['direct',10,10000],['labor',10,4000],['hour',5,5000],['fixed',75,7500]]){
  const t=calculate(lines,settings({overheadMode:mode,overhead,risk:5}));assert.equal(t.direct,100000);assert.equal(t.overhead,expected);assert.equal(t.risk,Math.round((100000+expected)*.05));assert.equal(t.hours,10);assert.equal(t.days,1);
 }
});
test('fractional quantities round unit price then amount, not binary floats',()=>{
 const t=calculate([line(.1,3),line(12.345,2.5)],settings());assert.equal(t.direct,30+3088);assert.equal(t.gross,t.net+t.vat);
});
test('decimal half cents round up consistently for costs and percentages',()=>{
 assert.equal(cents(1.005),101);assert.equal(cents(10.075),1008);assert.equal(cents(.000001),0);
 const t=calculate([line(1.005)],settings({vat:50}));assert.equal(t.direct,101);assert.equal(t.vat,51);
 for(const v of ['??','Dat weet ik niet','onbekend','n.t.b.'])assert.equal(known(v),false);
});
test('invalid numbers, personnel units and missing settings fail visibly',()=>{
 for(const qty of [-1,NaN,Infinity,'1'])assert.throws(()=>calculate([line(10,qty)],settings()));
 assert.throws(()=>calculate([{...line(40,1,'labor'),unit:'dag'}],settings()));
 assert.throws(()=>calculate([line(10)],settings({profit:100})));
 assert.throws(()=>calculate([line(10)],settings({overheadMode:'unknown'})));
});
test('95 percent requires confirmed facts and every critical item',()=>{
 assert.equal(FIELDS.reduce((s,f)=>s+f.weight,0),100);
 const p=newProject();for(const f of FIELDS)setField(p,f.id,'Door klant vastgelegd');assert.equal(completeness(p).score,0);confirmFields(p);assert.equal(completeness(p).score,100);assert.equal(phase(p),'Calculator');
 setField(p,'customer','Gewijzigde klant');assert.equal(completeness(p).score,95);assert.equal(completeness(p).ready,true);
 setField(p,'scope','Nieuwe omvang');assert.equal(completeness(p).ready,false);
 p.fields.scope.value='onbekend';p.fields.scope.confirmed=true;assert.equal(completeness(p).ready,false);
});
test('field edits revoke both reviews, imported files revoke every confirmation',()=>{
 const p=newProject();p.technicalReview=true;p.financialReview=true;setField(p,'trade','Elektra');assert.equal(p.technicalReview,false);assert.equal(p.financialReview,false);
 confirmFields(p);const imported=validateProject(p);assert.notEqual(imported.id,p.id);assert.equal(imported.fields.trade.confirmed,false);assert.equal(imported.technicalReview,false);
});
test('local intake records explicit fields and does not invent confirmations',()=>{
 const p=newProject();localReply(p,'Elektra');assert.equal(p.fields.trade.value,'Elektra');assert.equal(p.asked,'customer');assert.equal(completeness(p).score,0);
 localReply(p,'customer: Test BV; address: Testadres');assert.equal(p.fields.customer.value,'Test BV');assert.equal(p.fields.address.value,'Testadres');assert.equal(p.asked,'building');
});
test('release blocks empty and unchecked jobs, document generation uses recorded facts',()=>{
 const p=newProject();assert.ok(releaseIssues(p).length>=4);
 for(const f of FIELDS)setField(p,f.id,'Bevestigde gegevens');confirmFields(p);p.lines=[line(100)];Object.assign(p,generateDocuments(p));p.technicalReview=true;p.financialReview=true;assert.deepEqual(releaseIssues(p),[]);
 p.settings.discount=99;assert.ok(releaseIssues(p).some(x=>x.includes('onder de kostprijs')));
});
test('CSV accepts quoted semicolons, decimal commas and BOM; bad rows fail',()=>{
 const rows=parseCSV('\uFEFFname;category;unit;cost\r\n"Kabel; flexibel";material;meter;"2,85"\r\nMonteur;labor;uur;42');assert.equal(rows[0].name,'Kabel; flexibel');assert.equal(rows[0].cost,2.85);
 for(const csv of ['name;cost\nA;2','name;category;unit;cost\nA;labor;dag;40','name;category;unit;cost\nA;product;stuk;-1','name;category;unit;cost\n"A;product;stuk;4'])assert.throws(()=>parseCSV(csv));
});
