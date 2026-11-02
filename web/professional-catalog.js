import wavin from './catalog-wavin.js';
import bals from './catalog-bals.js';
import schneider from './catalog-schneider.js';
import heat from './catalog-vasco-heat.js';
import vent from './catalog-vasco-vent.js';
import pump from './catalog-vasco-pump.js';
import manifest from './catalog-sources.js';

export const CATALOG_SOURCES=manifest.sources;
export const PROFESSIONAL_PRODUCTS=Object.entries({wavin,bals,schneider,'vasco-heat':heat,'vasco-vent':vent,'vasco-pump':pump}).flatMap(([sourceId,rows])=>rows.map(row=>{
 const p=Object.fromEntries(manifest.fields.map((k,i)=>[k,row[i]]).filter(([,v])=>v!==''));
 return {...p,cost:0,priceType:'missing',sourceId,sourceDate:manifest.sources[sourceId].retrieved};
}));
export const PRICE_TYPES={missing:'Inkoopprijs ontbreekt',eigen:'Eigen inkoopprijs',demo:'Voorbeeldprijs'};
export function catalogMetadata(p){
 const result={};
 for(const key of ['brand','manufacturerCode','ean','series','sourceId','sourceRow','sourceDate','discipline','priceDate']){
  if(p[key]!==undefined&&p[key]!==''){if(typeof p[key]!=='string'||p[key].length>200)throw Error('Ongeldige artikelmetadata.');result[key]=p[key];}
 }
 for(const key of ['listPrice','packQty'])if(p[key]!==undefined&&p[key]!==''){
  const n=Number(p[key]);if(!Number.isFinite(n)||n<=0||n>1e6)throw Error('Ongeldige bruto prijs of verpakking.');result[key]=n;
 }
 return result;
}
export function articlePriceLabel(p,format){return p.priceType==='missing'||!p.cost?'inkoopprijs invullen':format(p.cost)+(p.priceType==='demo'?' voorbeeld':'');}
