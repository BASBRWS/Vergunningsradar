export const MUNICIPALITIES = ['Rotterdam','Den Haag','Dordrecht','Delft','Leiden','Gouda','Schiedam','Vlaardingen','Nissewaard','Voorne aan Zee'];
export const KEYWORDS = {
 'Bouw & renovatie':['verbouwen','renovatie','uitbreiden','bouwen','constructie'],
 'Installatie':['warmtepomp','ventilatie','installatie','verwarming'],
 'Dak & gevel':['dak','gevel','isolatie','kozijnen'],
 'Elektrotechniek':['zonnepanelen','laadpaal','elektra','elektrotechniek'],
 'Grond & terrein':['terrein','bestrating','grondwerk','uitrit']
};
export const STATUSES=['nieuw','bekeken','benaderd','offerte','gewonnen','afgewezen'];
export const WEIGHTS={company:25,legal:10,large:20,medium:10,old:10,application:15,keywords:20};
export function classify(uses){
 const u=new Set(uses.flatMap(x=>String(x).split(/[,;|]/)).map(x=>x.trim().toLowerCase()).filter(Boolean));
 if(!u.size)return 'onbekend';
 if(u.has('woonfunctie'))return u.size===1?'particulier':'gemengd';
 if([...u].some(x=>!['kantoorfunctie','winkelfunctie','industriefunctie','logiesfunctie','sportfunctie','overige gebruiksfunctie','onderwijsfunctie','gezondheidszorgfunctie','bijeenkomstfunctie','celfunctie'].includes(x)))return 'onbekend';
 return [...u].some(x=>['onderwijsfunctie','gezondheidszorgfunctie','bijeenkomstfunctie','celfunctie'].includes(x))?'maatschappelijk':'zakelijk';
}
export function scoreLead(lead,keywords=KEYWORDS,weights=WEIGHTS){
 const text=(lead.summary||'').toLowerCase();
 const hits=[...new Set(Object.values(keywords).flat().filter(x=>text.includes(x.toLowerCase())))];
 const trades=Object.entries(keywords).filter(([,words])=>words.some(x=>text.includes(x.toLowerCase()))).map(([k])=>k);
 const legal=(lead.companies||[]).some(c=>/^(bv|nv|stichting|vereniging|besloten vennootschap|naamloze vennootschap)$/i.test(c.legalForm));
 const factors=[['Bedrijf op het adres',(lead.companies||[]).length?weights.company:0],['Rechtspersoon',legal?weights.legal:0],['Oppervlakte',lead.area>=500?weights.large:lead.area>=250?weights.medium:0],['Bouwjaar vóór 1990',lead.year>0&&lead.year<1990?weights.old:0],['Aanvraag',lead.type==='aanvraag'?weights.application:0],['Minstens twee trefwoorden',hits.length>=2?weights.keywords:0]];
 return {score:Math.max(0,Math.min(100,factors.reduce((s,[,p])=>s+p,0))),trades:trades.length?trades:['Overig'],factors,hits};
}
export function matches(lead,prefs){return prefs.municipalities.includes(lead.municipality)&&lead.trades.some(t=>prefs.trades.includes(t))&&lead.score>=prefs.minScore&&!lead.optedOut;}
export function filterLeads(leads,f={}){return leads.filter(l=>(!f.q||[l.address,l.municipality,l.summary,...(l.companies||[]).map(c=>c.name)].join(' ').toLowerCase().includes(f.q.toLowerCase()))&&(!f.municipality||l.municipality===f.municipality)&&(!f.trade||l.trades.includes(f.trade))&&(!f.status||l.status===f.status)&&l.score>=Number(f.score||0)&&(!f.from||l.date>=f.from)&&(!f.to||l.date<=f.to)&&(!f.mine||l.assignee===f.mine));}
export const escapeHTML=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function csvCell(v){let s=String(v??'');if(/^[\s]*[=+@\-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
export function toCSV(leads){return '\uFEFF'+[['Datum','Adres','Gemeente','Werkzaamheden','Bedrijven','Score','Status','Notitie'],...leads.map(l=>[l.date,l.address,l.municipality,l.summary,l.companies.map(c=>c.name).join('; '),l.score,l.status,l.note])].map(row=>row.map(csvCell).join(';')).join('\r\n');}
export function demoLeads(){
 const rows=[
 ['Dordrecht','Gevelrenovatie en isolatie van een bedrijfshal','industriefunctie',1240,1984,'Merwede Werkplaats BV','BV','Dak & gevel'],
 ['Rotterdam','Installatie warmtepomp en ventilatie in kantoor','kantoorfunctie',680,1988,'Maas Kantoor BV','BV','Installatie'],
 ['Delft','Uitbreiden van werkplaats en bouwen opslagruimte','industriefunctie',820,1979,'Delftse Makers BV','BV','Bouw & renovatie'],
 ['Schiedam','Plaatsen zonnepanelen op het dak van een magazijn','industriefunctie',950,2004,'Havenlogistiek BV','BV','Elektrotechniek'],
 ['Voorne aan Zee','Renovatie gevel en vervangen kozijnen school','onderwijsfunctie',1500,1971,'Stichting Voorbeeld Onderwijs','Stichting','Dak & gevel'],
 ['Nissewaard','Aanleg laadpaal en elektra op het terrein','winkelfunctie',430,1998,'Voorbeeld Handel VOF','VOF','Elektrotechniek'],
 ['Gouda','Verbouwen en renovatie van een winkel','winkelfunctie',310,1985,'Goudse Winkel BV','BV','Bouw & renovatie'],
 ['Leiden','Vernieuwen ventilatie in een gezondheidscentrum','gezondheidszorgfunctie',740,1986,'Stichting Voorbeeld Zorg','Stichting','Installatie'],
 ['Den Haag','Vervangen kozijnen in een kantoor','kantoorfunctie',280,1996,'Residentie Werk BV','BV','Dak & gevel'],
 ['Vlaardingen','Bestrating en grondwerk voor nieuwe uitrit','industriefunctie',540,1991,'Terreinservice BV','BV','Grond & terrein'],
 ['Rotterdam','Verbouwen van een bedrijfsruimte','industriefunctie',190,2010,'Voorbeeld Montage','Eenmanszaak','Bouw & renovatie'],
 ['Dordrecht','Isolatie dak en gevel van een sportgebouw','sportfunctie',850,1982,'Sportvereniging Voorbeeld','Vereniging','Dak & gevel'],
 ['Delft','Uitbreiden en renovatie van een kantoor','kantoorfunctie',470,1989,'Techniek Voorbeeld BV','BV','Bouw & renovatie'],
 ['Den Haag','Installatie verwarming in een winkelpand','winkelfunctie',160,1994,'Winkelvoorbeeld BV','BV','Installatie'],
 ['Leiden','Zonnepanelen en laadpaal bij bedrijfshal','industriefunctie',1100,2008,'Voorbeeld Distributie BV','BV','Elektrotechniek'],
 ['Gouda','Bestrating op eigen terrein','industriefunctie',250,1976,'Voorbeeld Opslag BV','BV','Grond & terrein']
 ];
 const streets=['Voorbeeldlaan','Demostraat','Proefkade','Voorbeeldweg'];
 return rows.map((r,i)=>{const d=new Date();d.setDate(d.getDate()-Math.floor(i/3));const l={id:`demo-${i+1}`,municipality:r[0],summary:r[1],uses:[r[2]],area:r[3],year:r[4],companies:[{name:r[5],legalForm:r[6],sbi:'Voorbeeldbranche',kvk:'Fictief',personal:['VOF','Eenmanszaak'].includes(r[6])}],address:`${streets[i%4]} ${12+i*4}`,postcode:'0000 XX',type:i===8||i===13?'besluit':'aanvraag',date:d.toLocaleDateString('sv-SE'),bagDate:d.toLocaleDateString('sv-SE'),kvkDate:d.toLocaleDateString('sv-SE'),classification:classify([r[2]]),status:i===3?'benaderd':i===6?'offerte':i===9?'gewonnen':'nieuw',note:'',assignee:'',sourceUrl:'',lat:null,lon:null};return {...l,...scoreLead(l)};});
}
