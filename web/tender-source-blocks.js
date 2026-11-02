import {getDocument} from './tender-files.js';
import {BLOCK_VERSION} from './tender-block-contract.js';
let pdfPromise;
export function loadPdfLibrary(){
 if(globalThis.PDFLib)return Promise.resolve(globalThis.PDFLib);
 return pdfPromise ||= new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=new URL('./vendor/pdf-lib.min.js',import.meta.url).href;script.onload=()=>globalThis.PDFLib?resolve(globalThis.PDFLib):reject(Error('PDF hulpmiddel is niet beschikbaar.'));script.onerror=()=>{pdfPromise=null;script.remove();reject(Error('PDF hulpmiddel laden mislukt. Probeer opnieuw.'));};document.head.append(script);});
}
export async function digest(value){const bytes=typeof value==='string'?new TextEncoder().encode(value):value;const hash=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(hash)].map(n=>n.toString(16).padStart(2,'0')).join('');}
export function textRanges(text,max=6000){
 const ranges=[];let start=0;
 while(start<text.length){let end=Math.min(start+max,text.length);if(end<text.length){const newline=text.lastIndexOf('\n',end);if(newline>start+max/2)end=newline+1;if(/[\uD800-\uDBFF]/.test(text[end-1]))end--;}
  ranges.push({start,end,text:text.slice(start,end)});if(end===text.length)break;start=Math.max(start+1,end-160);
 }return ranges;
}
export function dataUrl(bytes,mime){let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return 'data:'+mime+';base64,'+btoa(binary);}
export async function prepareSourceBlocks(documents,{pages=2,getBlob=getDocument,pdfLibrary,onProgress=()=>{}}={}){
 if(![1,2,3].includes(pages))throw Error('Kies 1, 2 of 3 PDF pagina’s per blok.');
 const blocks=[];
 for(const doc of documents){
  onProgress(doc.name);const blob=await getBlob(doc.id),bytes=new Uint8Array(await blob.arrayBuffer());
  const hash=await digest(bytes),ext=doc.name.split('.').pop().toLowerCase();
  const add=async(range,units,mime,readBytes)=>{const key=await digest([BLOCK_VERSION,doc.id,hash,doc.version,range].join('|'));const descriptor={...doc,name:ext==='pdf'?doc.name:doc.name.replace(/\.[^.]+$/,'.txt'),type:mime};blocks.push({key,documentId:doc.id,label:doc.name+', '+range,range,units,document:descriptor,loadDocument:async()=>{const content=await readBytes();if(!content.length||content.length>6*1024*1024)throw Error('Een bronblok is te groot. Verklein of comprimeer '+doc.name+'.');return {...descriptor,size:content.length,file_data:dataUrl(content,mime)};}});};
  if(ext==='pdf'){
   const lib=pdfLibrary||await loadPdfLibrary();let pdf;try{pdf=await lib.PDFDocument.load(bytes);}catch{throw Error('PDF niet leesbaar of beveiligd. Sla '+doc.name+' opnieuw op als onbeveiligde PDF.');}
   const count=pdf.getPageCount();if(!count)throw Error('PDF bevat geen pagina’s.');
   for(let start=0;start<count;start+=pages){const end=Math.min(start+pages,count);await add(`pagina ${start+1} tot en met ${end}`,end-start,'application/pdf',async()=>{const part=await lib.PDFDocument.create();const copied=await part.copyPages(pdf,Array.from({length:end-start},(_,i)=>start+i));copied.forEach(p=>part.addPage(p));return part.save();});}
  }else if(ext==='txt'||ext==='md'){
   let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw Error('Sla '+doc.name+' op als UTF-8.');}
   if(!text.trim())throw Error(doc.name+' bevat geen leesbare tekst.');
   for(const r of textRanges(text))await add(`tekens ${r.start+1} tot en met ${r.end}`,0,'text/plain',async()=>new TextEncoder().encode(r.text));
  }else throw Error('Zet '+doc.name+' om naar PDF voor de beoordeling in blokken.');
 }
 return blocks;
}
