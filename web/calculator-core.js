import {MAX_CATALOG_ITEMS} from './installation-catalog.js?v=20261102-claude';
import {catalogMetadata} from './professional-catalog.js';
import {tenderChecklist,importTender} from './tender-core.js';
import {validateTenderResult} from './tender-ai.js';
import {GUIDES,PREPARATION_KINDS,isUncertainAnswer,preparationFor,preparationText} from './intake-guide.js';
import {INSTALLATION_PRODUCTS} from './installation-catalog.js?v=20261102-claude';
// All amounts in the calculation result are integer euro cents.
export const FIELDS = [
  ['trade','Installatiegebied',8,true,'Wat wil je laten installeren of aanpassen, bijvoorbeeld elektra, verwarming, water of ventilatie?'],
  ['customer','Opdrachtgever',5,false,'Voor wie is de opdracht en wie is de contactpersoon?'],
  ['address','Projectlocatie',5,false,'Op welk adres wordt het werk uitgevoerd?'],
  ['building','Pand en gebruik',5,false,'Wat voor pand is het, hoe groot is het en blijft het tijdens het werk in gebruik?'],
  ['goal','Gewenst resultaat',8,true,'Wat moet na oplevering werken en welk probleem wil je oplossen?'],
  ['scope','Omvang en aantallen',8,true,'Welke onderdelen en aantallen zijn nodig, en in welke ruimtes? Noem ook wat vervangen of verwijderd wordt.'],
  ['existing','Bestaande installatie',10,true,'Kun je beschrijven wat er nu aanwezig is? Typenummers en aansluitcapaciteit hoef je niet zelf te weten.'],
  ['access','Bereikbaarheid en werkplek',6,false,'Hoe zijn de werkplekken bereikbaar? Denk aan hoogte, kabelroutes, parkeren en werktijden.'],
  ['constraints','Technische randvoorwaarden',10,true,'Zijn er wensen of beperkingen rond geluid, uiterlijk, overlast of werkzaamheden in het pand? Technische controles kan de installateur voorbereiden.'],
  ['timing','Planning',5,false,'Wanneer moet het werk starten en klaar zijn? Zijn er vaste momenten waarop de installatie uit mag?'],
  ['budget','Budget en opties',4,false,'Wat is het beschikbare budget? Als er geen budgetgrens is, kun je dat ook aangeven.'],
  ['exclusions','Afbakening en derden',8,true,'Wat valt buiten de opdracht en wie regelt bouwkundig werk, herstel, vergunningen en andere leveranciers?'],
  ['acceptance','Oplevering en acceptatie',8,true,'Wanneer vind je het werk goed opgeleverd? We kunnen ook samen een oplevercontrole voorstellen.'],
  ['decision','Besluit en betaling',5,false,'Wie beslist over de offerte en welke betalingsafspraken zijn gewenst?'],
  ['docs','Onderbouwing',5,false,'Heb je een plattegrond, foto’s of eerdere offertes? Als die er niet zijn kunnen we een locatieopname voorstellen.']
].map(([id,label,weight,critical,question])=>({id,label,weight,critical,question}));
export const CATEGORIES = {labor:'Personeel',product:'Producten',material:'Materiaal',subcontract:'Onderaanneming',equipment:'Materieel',project:'Projectkosten'};
export const DEFAULT_SETTINGS = {company:'Jouw installatiebedrijf',quotePrefix:'OFF',hourDay:8,crew:2,overheadMode:'direct',overhead:12,risk:5,profitMode:'margin',profit:20,discount:0,vat:21,validDays:30,terms:'Betaling volgens overeengekomen termijnen. Meerwerk uitsluitend na schriftelijk akkoord. Planning na bevestiging van levertijden en beschikbaarheid.'};
export const CATALOG = [
  {id:'werk',name:'Monteur installatie',category:'labor',unit:'uur',cost:42},
  {id:'hulp',name:'Assistent monteur',category:'labor',unit:'uur',cost:30},
  {id:'engineer',name:'Werkvoorbereiding en engineering',category:'labor',unit:'uur',cost:58},
  {id:'leider',name:'Projectleiding',category:'labor',unit:'uur',cost:65},
  {id:'led',name:'LED armatuur, voorbeeld',category:'product',unit:'stuk',cost:85},
  {id:'kast',name:'Verdeler, voorbeeld',category:'product',unit:'stuk',cost:650},
  {id:'kabel',name:'Installatiekabel, voorbeeld',category:'material',unit:'meter',cost:2.8},
  {id:'klein',name:'Bevestigingsmateriaal, voorbeeld',category:'material',unit:'set',cost:95},
  {id:'hoog',name:'Hoogwerker huur, voorbeeld',category:'equipment',unit:'dag',cost:165},
  {id:'rit',name:'Transport en afvoer, voorbeeld',category:'project',unit:'rit',cost:75},
  {id:'keur',name:'Onafhankelijke inspectie, voorbeeld',category:'subcontract',unit:'post',cost:425},
  ...INSTALLATION_PRODUCTS
].map(c=>({...c,priceType:c.priceType||'demo'}));
export const money = cents => new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(cents/100);
export const id = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
export const newProject = () => ({flow:'intake',id:id(),name:'Nieuwe installatieopdracht',created:new Date().toISOString(),updated:new Date().toISOString(),revision:1,fields:Object.fromEntries(FIELDS.map(f=>[f.id,{value:'',confirmed:false,source:''}])),messages:[],lines:[],assumptions:'',design:'',plan:'',technicalReview:false,financialReview:false,settings:{...DEFAULT_SETTINGS},asked:'trade',example:false,preparation:[],intakeFollowup:null});
export function known(value){return typeof value==='string' && value.trim().length>1 && !isUncertainAnswer(value) && !/^(onbekend|weet ik niet|n\.?t\.?b\.?|nog niet bekend|later|te bepalen|geen idee)(?:\s|[.,;]|$)/i.test(value.trim()) && !/\b(?:dat weet ik niet|ik weet het niet|nog te bepalen)\b/i.test(value) && !/^\?+$/.test(value.trim());}
export function completeness(p){
  if(p.flow==='tender')return tenderChecklist(p);
  const missing=FIELDS.filter(f=>!known(p.fields[f.id]?.value)||!p.fields[f.id]?.confirmed||preparationFor(p,f.id));
  const score=100-missing.reduce((s,f)=>s+f.weight,0);
  return {score,missing,critical:missing.filter(f=>f.critical),ready:score>=95&&!missing.some(f=>f.critical)};
}
export function phase(p){if(p.flow==='tender')return 'Bestek en aanbesteding';if(FIELDS.slice(0,4).some(f=>!known(p.fields[f.id]?.value)&&!preparationFor(p,f.id)))return 'Frontoffice';if(!completeness(p).ready)return 'Accountmanager';return 'Calculator';}
export function nextField(p){return FIELDS.find(f=>!known(p.fields[f.id]?.value)) || FIELDS.find(f=>!p.fields[f.id]?.confirmed) || null;}
export function invalidate(p){p.technicalReview=false;p.financialReview=false;p.revision++;p.updated=new Date().toISOString();}
export function setField(p,key,value,source='Gesprek'){
  if(!FIELDS.some(f=>f.id===key)||typeof value!=='string')throw new Error('Onbekend opdrachtveld.');
  p.fields[key]={value:value.trim().slice(0,3000),confirmed:false,source};invalidate(p);
}
export function confirmFields(p){for(const f of FIELDS)if(known(p.fields[f.id].value)&&!preparationFor(p,f.id))p.fields[f.id].confirmed=true;p.updated=new Date().toISOString();}
const finite=(value,label,min=0,max=1e8)=>{if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)throw new Error(`${label} valt buiten het toegestane bereik.`);return value;};
// Decimal arithmetic avoids binary float rounding at half-cent boundaries.
const fraction=value=>{const [m,x='0']=String(value).split('e'),[w,d='']=m.split('.'),power=d.length-Number(x),n=BigInt(w+d);return power<0?[n*10n**BigInt(-power),1n]:[n,10n**BigInt(power)];};
const roundRatio=(n,d)=>Number((2n*n+d)/(2n*d));
export const cents=value=>{const [n,d]=fraction(value);return roundRatio(n*100n,d);};
const percentAmount=(base,rate)=>{const [n,d]=fraction(rate);return roundRatio(BigInt(base)*n,d*100n);};
export function calculate(lines,s){
  const pct=(k,max=100)=>finite(s[k],k,0,max)/100;
  const groups=Object.fromEntries(Object.keys(CATEGORIES).map(k=>[k,0]));let hours=0;
  if(!Array.isArray(lines)||lines.length>500)throw new Error('Maximaal 500 calculatieregels.');
  const details=lines.map(l=>{
    if(!Object.hasOwn(groups,l.category))throw new Error('Onbekende kostensoort.');
    const qty=finite(l.qty,'Aantal',0,1e6),cost=finite(l.cost,'Kostprijs',0,1e6);
    if(l.category==='labor'&&l.unit!=='uur')throw new Error('Personeel moet in uren worden berekend.');
    const [qn,qd]=fraction(qty),amount=roundRatio(qn*BigInt(cents(cost)),qd);groups[l.category]+=amount;
    if(l.category==='labor')hours+=qty;
    return {...l,amount};
  });
  const direct=Object.values(groups).reduce((a,b)=>a+b,0);
  let overhead;
  if(s.overheadMode==='hour'){finite(s.overhead,'Overhead per uur',0,10000);const [hn,hd]=fraction(hours);overhead=roundRatio(hn*BigInt(cents(s.overhead)),hd);}
  else if(s.overheadMode==='fixed')overhead=cents(finite(s.overhead,'Vaste overhead',0,1e7));
  else if(['direct','labor'].includes(s.overheadMode)){pct('overhead',500);overhead=percentAmount(s.overheadMode==='labor'?groups.labor:direct,s.overhead);}
  else throw new Error('Onbekende overheadmethode.');
  pct('risk');const risk=percentAmount(direct+overhead,s.risk);
  const totalCost=direct+overhead+risk;
  if(!['margin','markup'].includes(s.profitMode))throw new Error('Onbekende winstmethode.');
  pct('profit',s.profitMode==='margin'?95:500);const [pn,pd]=fraction(s.profit);
  const beforeDiscount=s.profitMode==='margin'?roundRatio(BigInt(totalCost)*100n*pd,100n*pd-pn):roundRatio(BigInt(totalCost)*(100n*pd+pn),100n*pd);
  pct('discount',99);const discount=percentAmount(beforeDiscount,s.discount);
  pct('vat');const net=beforeDiscount-discount,vat=percentAmount(net,s.vat),gross=net+vat;
  const crew=finite(s.crew,'Ploeggrootte',1,1000),day=finite(s.hourDay,'Uren per dag',1,24);
  const days=Math.ceil(hours/(crew*day));
  for(const v of [direct,overhead,risk,totalCost,beforeDiscount,discount,net,vat,gross])if(!Number.isSafeInteger(v))throw new Error('Calculatiebedrag is te groot.');
  return {groups,details,hours,days,direct,overhead,risk,totalCost,beforeDiscount,discount,net,vat,gross,profit:net-totalCost,margin:net?(net-totalCost)/net*100:0};
}
export function releaseIssues(p){
  const c=completeness(p),issues=[];
  if(!c.ready)issues.push(`Opdracht nog niet compleet, ${c.score} procent bevestigd. Kritieke open punten, ${c.critical.map(f=>f.label).join(', ')||'geen'}.`);
  const unresolved=(p.preparation||[]).filter(x=>!x.resolved);
  if(unresolved.length)issues.push(`${unresolved.length} voorbereidingspunten, aannames of opnamecontroles zijn nog niet geverifieerd.`);
  if(!p.lines.length)issues.push('Nog geen calculatieregels.');
  if(p.lines.some(l=>l.qty<=0||l.cost<=0||!l.name?.trim()||!l.unit?.trim()))issues.push('Controleer lege omschrijvingen, eenheden, nulprijzen en nulaantallen.');
  if(!p.design.trim()||!p.plan.trim())issues.push('Conceptontwerp en projectplan ontbreken.');
  if(!p.technicalReview)issues.push('Technische controle door installateur ontbreekt.');
  if(!p.financialReview)issues.push('Controle van prijzen, uren en voorwaarden ontbreekt.');
  try{const t=calculate(p.lines,p.settings);if(t.margin<0)issues.push('De verkoopprijs ligt onder de kostprijs.');}catch(e){issues.push(e.message);}
  return issues;
}
export function nextIntakeField(p){return FIELDS.find(f=>!known(p.fields[f.id]?.value)&&!preparationFor(p,f.id))||null;}
export function upsertPreparation(p,field,kind,note){
 const f=FIELDS.find(x=>x.id===field);if(!f||!Object.hasOwn(PREPARATION_KINDS,kind)||typeof note!=='string'||!note.trim())throw new Error('Vul een geldig voorbereidingspunt in.');
 p.preparation ||= [];let item=p.preparation.find(x=>x.field===field&&!x.resolved);
 if(!item){item={id:id(),field,label:f.label,kind,note:'',owner:kind==='site_visit'?'Installateur':'Werkvoorbereider',date:'',accepted:false,resolved:false,resolution:''};p.preparation.push(item);}
 if(item.kind!==kind&&['Installateur','Werkvoorbereider'].includes(item.owner))item.owner=kind==='site_visit'?'Installateur':'Werkvoorbereider';
 item.kind=kind;item.note=note.trim().slice(0,3000);item.accepted=false;item.resolved=false;p.fields[field].confirmed=false;invalidate(p);return item;
}
export function resolvePreparation(p,itemId,resolution){
 const item=(p.preparation||[]).find(x=>x.id===itemId);
 if(!item||typeof resolution!=='string'||!known(resolution))throw new Error('Leg eerst een concrete, gecontroleerde uitkomst vast. Een aanname of onbekend antwoord is geen verificatie.');
 if(/^(aanname|voorlopig|we nemen aan)/i.test(resolution.trim()))throw new Error('Een voorlopige aanname is nog geen gecontroleerde uitkomst.');
 item.resolution=resolution.trim().slice(0,3000);item.resolved=true;
 setField(p,item.field,item.resolution,'Gecontroleerde uitkomst voorbereiding');
}
export function deferQuestion(p,kind){
 const field=p.intakeFollowup?.field||p.asked;if(!field||!GUIDES[field])throw new Error('Selecteer eerst een vraag of opdrachtveld.');
 const guide=GUIDES[field],chosen=kind||guide.kind;
 const item=upsertPreparation(p,field,chosen,chosen==='assumption'?guide.assumption:guide.task);
 p.intakeFollowup=null;const next=nextIntakeField(p);p.asked=next?.id||'';
 return `${PREPARATION_KINDS[chosen]}, ${item.label}.\n${item.note}\nDit blijft een open voorbereidingspunt${chosen==='assumption'?', de klant kan het voorlopige uitgangspunt apart accepteren':''}.\n\n${next?next.question:'De intakevragen zijn doorlopen. Bekijk de samenvatting en de open punten bij Voorbereiding. Je kunt nu een conceptplan en een voorlopige calculatie maken.'}`;
}
export function localReply(p,text){
 const t=text.trim();let changed=[];
 for(const part of t.split(/\n|;/)){
  const m=part.match(/^\s*([^:]+):\s*(.+)$/);if(!m)continue;
  const key=m[1].trim().toLowerCase(),f=FIELDS.find(f=>f.id===key||f.label.toLowerCase()===key);
  if(f){setField(p,f.id,m[2],'Klant, gelabeld antwoord');changed.push(f.label);if(isUncertainAnswer(m[2]))upsertPreparation(p,f.id,GUIDES[f.id].kind,GUIDES[f.id].task);}
 }
 const asking=p.asked;
 if(!changed.length&&asking&&t.length>1){
  if(/^(?:volgende(?: vraag)?|overslaan|ga(?: maar)? verder|parkeren)[.!]?$/i.test(t))return deferQuestion(p);
  if(isUncertainAnswer(t)||/wat bedoel|kun je.*uitleggen|snap.*niet|begrijp.*niet/i.test(t)){
   setField(p,asking,'Nog niet bekend. Klantantwoord, '+t,'Klant geeft onzekerheid aan');
   if(p.intakeFollowup?.field===asking)return deferQuestion(p);
   upsertPreparation(p,asking,'followup','Klant weet dit nog niet. Eerst in begrijpelijke taal doorvragen.');
   p.intakeFollowup={field:asking};
   return `Dat hoef je niet zelf technisch te weten. Ik zet dit als open punt in de voorbereiding.\n\n${GUIDES[asking].question}\n\nAls je dat ook niet weet kun je een voorlopige aanname laten voorstellen, een opname voorbereiden of dit punt parkeren.`;
  }
  setField(p,asking,t,p.intakeFollowup?'Klant, antwoord op eenvoudigere vervolgvraag':'Klant, antwoord op gerichte vraag');changed=[FIELDS.find(f=>f.id===asking).label];if(p.intakeFollowup?.field===asking){const item=preparationFor(p,asking);if(item)item.note='Aanvullend klantantwoord, '+t+'. Werkvoorbereider controleert of dit het open punt voldoende beantwoordt.';}p.intakeFollowup=null;
 }
 const next=nextIntakeField(p);p.asked=next?.id||'';
 const lead=changed.length?`Genoteerd bij ${changed.join(', ')}. Controleer de samenvatting voordat je deze bevestigt.`:'Je kunt opdrachtvelden aanpassen of een veldnaam met een dubbele punt gebruiken.';
 return `${lead}\n\n${next?next.question:'De intakevragen zijn doorlopen. Bevestig wat bekend is. Bekijk de open punten bij Voorbereiding en werk een conceptontwerp, projectplan en voorlopige calculatie uit.'}`;
}
export function generateDocuments(p){
  const v=k=>p.fields[k]?.value||'Nog vast te stellen';
  const t=calculate(p.lines,p.settings);
  const preparation=preparationText(p)||'Geen afzonderlijke voorbereidingspunten vastgelegd.';
  const open=completeness(p).missing.map(f=>f.label).join(', ')||'Geen ontbrekende bevestigingen';
  return {
    design:`CONCEPTONTWERP, REVISIE ${p.revision}\n\nDoel\n${v('goal')}\n\nSituatie en bestaande installatie\n${v('building')}\n${v('existing')}\n\nWerkpakket en componenten\n${v('scope')}\n${p.lines.filter(l=>['product','material'].includes(l.category)).map(l=>`${l.qty} ${l.unit}, ${l.name}`).join('\n')||'Componentenlijst nog door calculator in te vullen.'}\n\nTechnische uitgangspunten\n${v('constraints')}\n\nRoutes en bereikbaarheid\n${v('access')}\n\nVerificatie en oplevering\n${v('acceptance')}\n\nBuiten scope en derden\n${v('exclusions')}\n\nOnderbouwing\n${v('docs')}\n\nAannames en risico’s\n${p.assumptions||'Nog expliciet vast te leggen door de installateur.'}\n\nVoorbereiding, aannames en locatieopname\n${preparation}\n\nOpen dossierpunten\n${open}\n\nDit is een functioneel concept op basis van de ingevoerde gegevens. Dimensionering, schema’s, selectie en toepasselijke eisen vereisen technische uitwerking en controle.`,
    plan:`CONCEPTPROJECTPLAN, REVISIE ${p.revision}\n\nOpdracht\n${p.name}\n${v('customer')}\n${v('address')}\n\n1. Opname en voorbereiding\nWerkvoorbereider controleert ${v('docs')}. Technische uitgangspunten en ontbrekende metingen vastleggen. Geen bestelling voordat de componentkeuze is goedgekeurd.\n\n2. Engineering en inkoop\nWerkpakket ${v('scope')}. Calculator koppelt aantallen, uren en actuele leveranciersprijzen. Leverancier bevestigt levertijden.\n\n3. Uitvoering\nUitvoerder plant ${t.hours} begrote persoonsuren met een ploeg van ${p.settings.crew}. Rekenindicatie ${t.days} werkdagen bij ${p.settings.hourDay} uur per persoon per dag, zonder levertijd, fasering of wachttijd. Bereikbaarheid ${v('access')}.\n\n4. Beproeving en overdracht\nInstallateur test en registreert ${v('acceptance')}. Klant bevestigt restpunten en overdracht.\n\nPlanning en afhankelijkheden\n${v('timing')}\n\nAfbakening en derden\n${v('exclusions')}\n\nBesluitvorming\n${v('decision')}\n\nAannames en risico’s\n${p.assumptions||'Nog te beoordelen tijdens de opname.'}\n\nVoorbereiding en opnameacties vóór definitieve uitwerking\n${preparation}\n\nOpen dossierpunten\n${open}`
  };
}
export function parseCSV(text){
  const sep=text.split(/\r?\n/)[0].includes(';')?';':',';const rows=[];let row=[],cell='',quote=false;
  for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quote&&text[i+1]==='"'){cell+='"';i++;}else quote=!quote;}else if(c===sep&&!quote){row.push(cell);cell='';}else if(c==='\n'&&!quote){row.push(cell.replace(/\r$/,''));if(row.some(x=>x.trim()))rows.push(row);row=[];cell='';}else cell+=c;}
  if(quote)throw new Error('Een aanhalingsteken in de CSV is niet afgesloten.');
  if(cell||row.length){row.push(cell.replace(/\r$/,''));rows.push(row);}
  const headers=rows.shift()?.map(x=>x.trim().toLowerCase().replace(/^\uFEFF/,''))||[];
  for(const h of ['name','category','unit','cost'])if(!headers.includes(h))throw new Error('CSV-kolommen vereist, name;category;unit;cost.');
  if(!rows.length||rows.length>MAX_CATALOG_ITEMS)throw new Error('Importeer 1 tot '+MAX_CATALOG_ITEMS+' catalogusregels.');
  return rows.map((r,i)=>{if(r.length!==headers.length)throw new Error(`CSV-regel ${i+2} heeft een verkeerd aantal kolommen.`);const v=Object.fromEntries(headers.map((h,j)=>[h,r[j].trim()]));if(!v.cost&&v.pricetype!=='missing')throw new Error(`Kostprijs ontbreekt op regel ${i+2}.`);const cost=Number(v.cost.replace(',','.'));finite(cost,'Kostprijs',0,1e6);if(!v.name||!v.unit||!Object.hasOwn(CATEGORIES,v.category)||(v.category==='labor'&&v.unit!=='uur'))throw new Error(`Controleer CSV-regel ${i+2}.`);return {id:id(),name:v.name.slice(0,200),category:v.category,unit:v.unit.slice(0,30),cost,...(v.code?{code:v.code.slice(0,40)}:{}),...(v.group?{group:v.group.slice(0,100)}:{}),...(['demo','eigen','missing'].includes(v.pricetype)?{priceType:v.pricetype}:{}),...catalogMetadata(Object.fromEntries(['brand','manufacturerCode','ean','series','sourceId','sourceRow','sourceDate','discipline','priceDate','listPrice','packQty'].filter(k=>v[k.toLowerCase()]!==undefined&&v[k.toLowerCase()]!=='').map(k=>[k,v[k.toLowerCase()]])))};});
}
export function validateProject(p){
  if(!p||typeof p!=='object'||!p.fields||!Array.isArray(p.lines)||!p.settings)throw new Error('Ongeldig projectbestand.');
  const clean=newProject();clean.name=String(p.name||clean.name).slice(0,200);clean.settings={...DEFAULT_SETTINGS,...Object.fromEntries(Object.keys(DEFAULT_SETTINGS).filter(k=>Object.hasOwn(p.settings,k)).map(k=>[k,p.settings[k]]))};
  for(const k of ['company','quotePrefix','terms'])if(typeof clean.settings[k]!=='string')throw new Error('Ongeldige bedrijfsinstelling.');
  finite(clean.settings.validDays,'Geldigheid',1,365);
  for(const f of FIELDS){const value=p.fields[f.id]?.value;if(typeof value!=='string'||value.length>3000)throw new Error('Ongeldige opdrachtgegevens.');clean.fields[f.id]={value,confirmed:false,source:'Import, opnieuw bevestigen'};}
  clean.lines=p.lines.map(l=>({id:id(),name:String(l.name||'').slice(0,200),category:l.category,unit:String(l.unit||'').slice(0,30),qty:l.qty,cost:l.cost,...(typeof l.code==='string'?{code:l.code.slice(0,40)}:{}),...(typeof l.group==='string'?{group:l.group.slice(0,100)}:{}),...(['demo','eigen','missing'].includes(l.priceType)?{priceType:l.priceType}:{}),...catalogMetadata(l)}));calculate(clean.lines,clean.settings);
  for(const k of ['design','plan','assumptions']){if(typeof p[k]!=='string'||p[k].length>30000)throw new Error('Ongeldige documenttekst.');clean[k]=p[k];}
  clean.messages=(Array.isArray(p.messages)?p.messages:[]).slice(-100).filter(m=>['user','assistant'].includes(m.role)&&typeof m.text==='string').map(m=>({role:m.role,text:m.text.slice(0,5000),phase:String(m.phase||'Import')}));
  if(p.preparation!==undefined){
   if(!Array.isArray(p.preparation)||p.preparation.length>30)throw new Error('Ongeldige voorbereidingspunten.');
   clean.preparation=p.preparation.map(x=>{
    if(!x||!FIELDS.some(f=>f.id===x.field)||!Object.hasOwn(PREPARATION_KINDS,x.kind)||typeof x.note!=='string'||!x.note.trim()||x.note.length>3000||typeof x.resolution!=='string'||x.resolution.length>3000)throw new Error('Ongeldig voorbereidingspunt.');
    return {id:id(),field:x.field,label:FIELDS.find(f=>f.id===x.field).label,kind:x.kind,note:x.note,owner:String(x.owner||'Installateur').slice(0,100),date:typeof x.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x.date)?x.date:'',accepted:false,resolved:false,resolution:x.resolution};
   });
  }
  if(p.flow==='tender'){clean.flow='tender';clean.tender=importTender(p.tender);for(const [role,run] of Object.entries(clean.tender.runs))if(run.result)validateTenderResult(run.result,clean.tender.documents,role);}
  clean.asked=nextIntakeField(clean)?.id||'';return clean;
}
