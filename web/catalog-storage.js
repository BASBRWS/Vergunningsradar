// Keep the shared manufacturer snapshot in source code; persist only local differences.
// This prevents a 12,000-item catalogue from exhausting localStorage for project dossiers.
const baseIndexes=new WeakMap();
function index(base){if(!baseIndexes.has(base))baseIndexes.set(base,new Map(base.map(p=>[p.id,{p,raw:JSON.stringify(p)}])));return baseIndexes.get(base);}
export function encodeCatalog(catalog,base){
 const baseline=index(base),present=new Set(catalog.map(p=>p.id));
 return {format:2,overrides:catalog.filter(p=>baseline.get(p.id)?.raw!==JSON.stringify(p)),removed:base.filter(p=>!present.has(p.id)).map(p=>p.id)};
}
export function decodeCatalog(state,base,limit=20000){
 if(!state||state.format!==2||!Array.isArray(state.overrides)||!Array.isArray(state.removed)||state.overrides.length>limit||state.removed.length>limit||state.removed.some(id=>typeof id!=='string'))throw Error('Ongeldige opgeslagen catalogus.');
 const removed=new Set(state.removed),overrides=new Map();
 for(const p of state.overrides){if(!p||typeof p.id!=='string'||overrides.has(p.id))throw Error('Ongeldige dubbele artikelidentiteit.');overrides.set(p.id,p);}
 const result=base.filter(p=>!removed.has(p.id)).map(p=>{const next=overrides.get(p.id)||p;overrides.delete(p.id);return structuredClone(next);});
 result.push(...structuredClone([...overrides.values()]));if(result.length>limit)throw Error('Te veel catalogusregels.');return result;
}
export function serializeVault(vault,base){const {catalog,...rest}=vault;return JSON.stringify({...rest,catalogState:encodeCatalog(catalog,base)});}
