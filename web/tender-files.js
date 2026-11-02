import {uid,validateDocument} from './tender-core.js';
let database;
function db(){return database ||= new Promise((resolve,reject)=>{if(!globalThis.indexedDB)return reject(Error('Bestandsopslag in deze browser is niet beschikbaar.'));const req=indexedDB.open('vr-tender-documents-v1',1);req.onupgradeneeded=()=>req.result.createObjectStore('files',{keyPath:'id'});req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(Error('Bestandsopslag openen is niet gelukt.'));});}
async function operation(mode,fn){const d=await db();return new Promise((resolve,reject)=>{const tx=d.transaction('files',mode),req=fn(tx.objectStore('files'));let result;req.onsuccess=()=>result=req.result;tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(Error('Opslaan of lezen is niet gelukt. Controleer de beschikbare browseropslag.'));tx.onabort=tx.onerror;});}
export async function putDocument(file,current){
 const type=validateDocument(file,current),id=uid();let hash='';
 if(globalThis.crypto?.subtle){const result=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());hash=[...new Uint8Array(result)].map(x=>x.toString(16).padStart(2,'0')).join('');}
 await operation('readwrite',s=>s.put({id,blob:file}));return {id,name:file.name.slice(0,200),size:file.size,type,version:'1',hash};
}
export async function getDocument(id){const row=await operation('readonly',s=>s.get(id));if(!row?.blob)throw Error('Een bronbestand ontbreekt in deze browser. Voeg het originele bestand opnieuw toe.');return row.blob;}
export async function hasDocument(id){return Boolean(await operation('readonly',s=>s.getKey(id)));}
export async function deleteDocument(id){await operation('readwrite',s=>s.delete(id));}
export async function documentInputs(documents){return Promise.all(documents.map(async d=>{const blob=await getDocument(d.id);const file_data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Bestand uitlezen is niet gelukt.'));reader.readAsDataURL(new Blob([blob],{type:d.type}));});return {...d,file_data};}));}
// Checkpoints share the transactional IndexedDB store; original files keep their own keys.
export async function readBlock(key){return (await operation('readonly',s=>s.get('block:'+key)))?.result||null;}
export async function writeBlock(key,result){await operation('readwrite',s=>s.put({id:'block:'+key,result}));}
