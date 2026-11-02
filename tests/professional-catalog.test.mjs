import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {INSTALLATION_PRODUCTS,LEGACY_INSTALLATION_PRODUCTS,mergeInstallationCatalog,filterCatalog,MAX_CATALOG_ITEMS} from '../web/installation-catalog.js';
import {PROFESSIONAL_PRODUCTS,CATALOG_SOURCES,catalogMetadata} from '../web/professional-catalog.js';
import {encodeCatalog,decodeCatalog,serializeVault} from '../web/catalog-storage.js';
import {CATALOG,parseCSV,newProject,validateProject,releaseIssues} from '../web/calculator-core.js';

test('manufacturer catalogue has 12,437 distinct sourced product identities with units and no invented purchase prices',()=>{
 assert.equal(PROFESSIONAL_PRODUCTS.length,12437);assert.equal(INSTALLATION_PRODUCTS.length,12737);assert.equal(new Set(PROFESSIONAL_PRODUCTS.map(p=>p.id)).size,12437);assert.equal(new Set(INSTALLATION_PRODUCTS.map(p=>p.code.toUpperCase())).size,12737);
 assert.ok(new Set(PROFESSIONAL_PRODUCTS.map(p=>p.brand)).size>=13);assert.ok(new Set(INSTALLATION_PRODUCTS.map(p=>p.group)).size>=35);
 for(const p of PROFESSIONAL_PRODUCTS){assert.ok(p.manufacturerCode&&p.brand&&p.sourceRow&&p.discipline&&p.name);assert.ok(CATALOG_SOURCES[p.sourceId]);assert.ok(p.unit);assert.equal(p.cost,0);assert.equal(p.priceType,'missing');assert.ok(p.listPrice>0);assert.ok(CATALOG_SOURCES[p.sourceId].sha256.match(/^[a-f0-9]{64}$/));catalogMetadata(p);}
 assert.equal(PROFESSIONAL_PRODUCTS.filter(p=>p.sourceId==='wavin').length,5084);assert.equal(PROFESSIONAL_PRODUCTS.filter(p=>p.sourceId==='schneider').length,3285);
});
test('existing manufacturer SKUs and GTINs are searchable, with brand, discipline and price filters combined',()=>{
 const probe=PROFESSIONAL_PRODUCTS.find(p=>p.brand==='Schneider Electric'&&p.manufacturerCode==='A9F73101');assert.ok(probe);assert.equal(filterCatalog(INSTALLATION_PRODUCTS,'A9F73101')[0].id,probe.id);assert.ok(filterCatalog(INSTALLATION_PRODUCTS,probe.ean).some(p=>p.id===probe.id));
 const matched=filterCatalog(INSTALLATION_PRODUCTS,'16', '', 'Schneider Electric','Elektrotechniek','missing');assert.ok(matched.length>0);assert.ok(matched.every(p=>p.brand==='Schneider Electric'&&p.discipline==='Elektrotechniek'&&p.priceType==='missing'));
 assert.equal(filterCatalog(INSTALLATION_PRODUCTS,'', '', 'Vasco','Elektrotechniek').length,0);assert.equal(filterCatalog(INSTALLATION_PRODUCTS,'', '', '', '', 'demo').length,300);
});
test('upgrading an old browser catalogue retains personal prices, own articles and all project data',()=>{
 const legacy=structuredClone(LEGACY_INSTALLATION_PRODUCTS),custom={id:'my-item',code:'MY-42',name:'Eigen klem',category:'material',unit:'stuk',cost:4.2};legacy[0].cost=7.77;legacy[0].priceType='eigen';
 const next=mergeInstallationCatalog([...legacy,custom]);assert.equal(next.length,12738);assert.equal(next[0].cost,7.77);assert.equal(next.find(p=>p.id===custom.id).cost,4.2);assert.deepEqual(mergeInstallationCatalog(next),next);
 const vault={projects:[newProject()],active:'project',catalog:next,defaults:{},catalogPacks:['professional-2026-11-v1']};const saved=JSON.parse(serializeVault(vault,CATALOG));assert.deepEqual(saved.projects,vault.projects);const restored=decodeCatalog(saved.catalogState,CATALOG);assert.equal(restored.find(p=>p.id===legacy[0].id).cost,7.77);assert.ok(restored.some(p=>p.id==='my-item'));
});
test('unchanged catalogue storage is tiny, and local edits and removals survive reloads',()=>{
 const copy=structuredClone(CATALOG),original=PROFESSIONAL_PRODUCTS[0];let state=encodeCatalog(copy,CATALOG);assert.ok(JSON.stringify(state).length<100);assert.equal(state.overrides.length,0);
 copy.find(p=>p.id===original.id).cost=55.5;copy.find(p=>p.id===original.id).priceType='eigen';const removed=PROFESSIONAL_PRODUCTS[1];copy.splice(copy.findIndex(p=>p.id===removed.id),1);state=encodeCatalog(copy,CATALOG);
 assert.equal(state.overrides.length,1);assert.deepEqual(state.removed,[removed.id]);assert.ok(JSON.stringify(state).length<1500);
 const rebuilt=decodeCatalog(state,CATALOG);assert.equal(rebuilt.find(p=>p.id===original.id).cost,55.5);assert.ok(!rebuilt.some(p=>p.id===removed.id));assert.equal(rebuilt.length,CATALOG.length-1);assert.deepEqual(encodeCatalog(rebuilt,CATALOG),state);
});
test('full catalogue CSV round-trips manufacturer identity, source, price basis and units without truncation',async()=>{
 const csv=await readFile(new URL('../web/installatiecatalogus.csv',import.meta.url),'utf8'),rows=parseCSV(csv);assert.equal(rows.length,12737);assert.ok(csv.length<10*1024*1024);
 for(let i=0;i<rows.length;i++){const p=INSTALLATION_PRODUCTS[i];for(const key of ['code','name','category','group','unit','cost','priceType','brand','manufacturerCode','ean','discipline','series','listPrice','sourceId','sourceRow','sourceDate','priceDate','packQty'])assert.equal(rows[i][key],p[key],`${i} ${key}`);}
 assert.equal(mergeInstallationCatalog(rows).length,12737);assert.throws(()=>decodeCatalog({format:2,removed:[],overrides:Array(MAX_CATALOG_ITEMS+1).fill({})},CATALOG));
});
test('missing manufacturer purchase prices cannot become a released free quote, and imports preserve article provenance',()=>{
 const p=newProject();p.lines=[{...PROFESSIONAL_PRODUCTS[0],qty:1}];const clean=validateProject(p);assert.equal(clean.lines[0].sourceId,p.lines[0].sourceId);assert.equal(clean.lines[0].manufacturerCode,p.lines[0].manufacturerCode);assert.equal(clean.lines[0].priceType,'missing');assert.ok(releaseIssues(p).some(s=>s.includes('nulprijzen')));
 assert.throws(()=>catalogMetadata({listPrice:-1}));assert.throws(()=>catalogMetadata({brand:'a'.repeat(201)}));
});
