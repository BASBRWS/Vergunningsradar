import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {INSTALLATION_PRODUCTS,LEGACY_INSTALLATION_PRODUCTS,mergeInstallationCatalog,filterCatalog} from '../web/installation-catalog.js';
import {CATALOG,CATEGORIES,DEFAULT_SETTINGS,parseCSV,newProject,validateProject,calculate} from '../web/calculator-core.js';

test('legacy material pack contains 300 unique usable generic articles, all marked as demo prices',()=>{
 assert.equal(LEGACY_INSTALLATION_PRODUCTS.length,300);
 for(const key of ['id','code','name'])assert.equal(new Set(LEGACY_INSTALLATION_PRODUCTS.map(p=>p[key])).size,300);
 assert.equal(new Set(LEGACY_INSTALLATION_PRODUCTS.map(p=>p.group)).size,10);
 for(const p of LEGACY_INSTALLATION_PRODUCTS){
  assert.ok(Object.hasOwn(CATEGORIES,p.category));assert.ok(p.unit&&p.group&&p.code);assert.equal(p.priceType,'demo');
  assert.ok(Number.isFinite(p.cost)&&p.cost>0);
  const t=calculate([{...p,qty:2}],DEFAULT_SETTINGS);assert.ok(t.direct>0);assert.equal(t.gross,t.net+t.vat);
 }
 assert.equal(CATALOG.filter(p=>p.id.startsWith('inst-')).length,300);
});
test('catalogue upgrade preserves custom prices and articles, is idempotent and respects capacity',()=>{
 const changed={...INSTALLATION_PRODUCTS[0],cost:19.99},custom={id:'custom',code:'MY-1',name:'Eigen artikel',category:'product',unit:'stuk',cost:13};
 const original=[changed,custom],merged=mergeInstallationCatalog(original);
 assert.equal(original.length,2);assert.equal(merged.length,INSTALLATION_PRODUCTS.length+1);assert.equal(merged.find(p=>p.id===changed.id).cost,19.99);assert.equal(merged.find(p=>p.id==='custom'),custom);
 assert.deepEqual(mergeInstallationCatalog(merged),merged);
 assert.throws(()=>mergeInstallationCatalog(original,300),/passen niet/);
 merged.find(p=>p.code===INSTALLATION_PRODUCTS[1].code).cost=9.99;assert.notEqual(INSTALLATION_PRODUCTS[1].cost,9.99);
});
test('CSV download imports all 300 articles with codes, groups and sample price labels, without pack duplication',async()=>{
 const csv=await readFile(new URL('../web/installatiematerialen-300.csv',import.meta.url),'utf8');
 const rows=parseCSV(csv);assert.equal(rows.length,300);
 for(let i=0;i<rows.length;i++){for(const key of ['code','group','name','category','unit','cost','priceType'])assert.equal(rows[i][key],INSTALLATION_PRODUCTS[i][key]);}
 assert.equal(mergeInstallationCatalog(rows).length,INSTALLATION_PRODUCTS.length);
});
test('article search combines words and supports article codes, dimensions and product groups',()=>{
 assert.equal(filterCatalog(INSTALLATION_PRODUCTS,'EL-013')[0].name,'YMVK installatiekabel 3G1,5 mm²');
 const result=filterCatalog(INSTALLATION_PRODUCTS,'kabel 5g2,5');assert.ok(result.length>=2);assert.ok(result.every(p=>p.name.toLowerCase().includes('5g2,5')));
 assert.equal(filterCatalog(INSTALLATION_PRODUCTS,'','Ventilatie en luchtkanalen').length,30);
 assert.equal(filterCatalog(INSTALLATION_PRODUCTS,'niets-dat-bestaat').length,0);
 const p=newProject();p.lines=[{...INSTALLATION_PRODUCTS[0],qty:3}];const imported=validateProject(p);
 assert.equal(imported.lines[0].code,INSTALLATION_PRODUCTS[0].code);assert.equal(imported.lines[0].group,INSTALLATION_PRODUCTS[0].group);
});
