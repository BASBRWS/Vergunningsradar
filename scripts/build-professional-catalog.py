"""Build factual catalogue snapshots from public manufacturer files, without executing macros.

Only identifiers, short item labels, units and list prices are retained. List prices
are reference data, never assumed net purchase costs. Source files are not published.
Usage: python3 scripts/build-professional-catalog.py --cache /tmp/catalog-sources
"""
import argparse
from collections import Counter, defaultdict
from decimal import Decimal, InvalidOperation
import hashlib
import io
import json
from pathlib import Path
import re
import urllib.request
from urllib.parse import urlsplit
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parents[1]
DATE = '2026-11-02'
SOURCES = {
 'wavin': {'name':'Wavin Nederland, PAB2 prijs- en productbestand 2026','url':'https://mediahub.wavin.com/m/358b8a99d3e0b3a3/original/PAB2-Prijzen-01-01-2026.zip','page':'https://wavin.com/nl/downloads?s=C01_F001_S301','priceDate':'2026, bronbestand januari, revisie april'},
 'bals': {'name':'Bals Nederland, bruto prijslijst 2026/7','url':'https://bals.nl/app/uploads/2026/05/Bruto-PL-2026-7_online.xlsx','page':'https://bals.nl/downloads/','priceDate':'2026/7'},
 'schneider': {'name':'Schneider Electric Nederland, prijslijst 1 juli 2026','url':'https://download.se.com/files?p_Doc_Ref=NL-Pricelist-20260701&p_enDocType=Price+List&p_File_Name=NL-Pricelist-20260701.xlsx','page':'https://www.se.com/nl/nl/download/document/NL-Pricelist-20260701/','priceDate':'2026-07-01'},
 'vasco-heat': {'name':'Vasco Nederland, radiatoren en toebehoren mei 2026','url':'https://vasco.eu/files/Vasco-NL-Radiatoren-en-toebehoren-05-2026.xlsx','page':'https://vasco.eu/nl/professional/support/documentatie-downloads/prijslijsten','priceDate':'2026-05'},
 'vasco-vent': {'name':'Vasco Nederland, ventilatie mei 2026','url':'https://vasco.eu/files/Vasco-NL-Ventilatie-Ventilation-05-2026.xlsx','page':'https://vasco.eu/nl/professional/support/documentatie-downloads/prijslijsten','priceDate':'2026-05'},
 'vasco-pump': {'name':'Vasco Nederland, warmtepompen 2026','url':'https://vasco.eu/files/Vasco-NL-Warmtepompen-05-2026.xlsx','page':'https://vasco.eu/nl/professional/support/documentatie-downloads/prijslijsten','priceDate':'2026, controleer actuele versie'},
}
NS = {'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
UNIT = {'PCE':'stuk','MTR':'meter','ST':'stuk','Stuk':'stuk','m':'meter','SET':'set','PR':'paar'}

def number(value):
    try:
        n=Decimal(str(value).strip())
        return float(n) if n.is_finite() and 0<n<=1e6 else None
    except (InvalidOperation, ValueError):return None

def gtin(value):
    value=str(value).strip()
    if not re.fullmatch(r'\d{8}|\d{12,14}',value):return ''
    digits=list(map(int,value));weight=[3,1]
    return value if (sum(n*weight[i%2] for i,n in enumerate(reversed(digits[:-1])))+digits[-1])%10==0 else ''

def xlsx_rows(data, sheet):
    """Read cached cell values only; no formulas, external links or macros run."""
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        strings=[''.join(n.itertext()) for n in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('s:si',NS)] if 'xl/sharedStrings.xml' in z.namelist() else []
        books=ET.fromstring(z.read('xl/workbook.xml')).find('s:sheets',NS)
        links=ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
        targets={v.attrib['Id']:v.attrib['Target'] for v in links}
        selected=next(s for s in books if s.attrib['name']==sheet)
        target=targets[selected.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']]
        path=target.lstrip('/') if target.startswith('/') else 'xl/'+target
        blanks=0
        with z.open(path) as stream:
            for _,row in ET.iterparse(stream,events=('end',)):
                if row.tag!='{'+NS['s']+'}row':continue
                values={}
                for c in row:
                    v=c.find('s:v',NS)
                    if v is not None:
                        value=v.text or ''
                        if c.attrib.get('t')=='s':value=strings[int(value)]
                    else:
                        inline=c.find('s:is',NS);value=''.join(inline.itertext()) if inline is not None else ''
                    if value:values[re.sub(r'\d','',c.attrib['r'])]=value
                n=int(row.attrib['r']);row.clear()
                if not values:
                    blanks+=1
                    if blanks>500:break  # Ignore a million styled empty rows in a manufacturer workbook.
                    continue
                blanks=0;yield n,values

def item(source,brand,code,name,group,discipline,unit,price,ean='',series='',row='',pack=None):
    brand={'PIPELIFE':'Pipelife','GRIFFON':'Griffon'}.get(brand,brand)
    short=re.sub(r'\s+',' ',name).strip()
    key=brand.casefold()+'|'+code
    record={'id':'pro-'+hashlib.sha256(key.encode()).hexdigest()[:20], 'code':re.sub(r'[^A-Z0-9]','',brand.upper())[:10]+'-'+code,
       'brand':brand,'manufacturerCode':code,'name':(brand+' '+short)[:200], 'group':group,'discipline':discipline,
       'category':'material' if any(k in group.lower() for k in ['buis','leiding','hulpstuk','koppeling','montage','verbruik','afvoer','riolering']) else 'product',
       'unit':unit,'cost':0,'priceType':'missing','sourceId':source,'sourceRow':row,'sourceDate':DATE}
    if gtin(ean):record['ean']=gtin(ean)
    if series:record['series']=series[:100]
    if price:record['listPrice']=round(price,4)
    if pack:record['packQty']=pack
    return record

def wavin(data):
    z=zipfile.ZipFile(io.BytesIO(data));articles=defaultdict(list)
    for row in z.read('ArtLev.txt').decode('cp1252').splitlines():
        code=row[165:185].strip();unit=UNIT.get(row[585:588]);price=number(row[559:575]);basis=number(row[575:585])
        if unit and price and basis:articles[code].append((number(row[604:620]) or 1,unit,price/basis))
    for index,row in enumerate(z.read('Product.txt').decode('cp1252').splitlines(),1):
        code=row[1:21].strip();brand=row[219:254].strip();series=row[254:289].strip();name=row[56:126].strip()
        # No discontinued products, pallet duplicates or heavy civil engineering range.
        if row[126:129].strip() or not articles[code] or not name:continue
        if any(x in series.lower() for x in ['tegra','x-stream','ultra-3','infiltratie','drainage','polderroof','kolken','olieafscheider','avk en gietijzer','controleputten','pvc-a','ts buis']):continue
        group='Water en drukleidingen';discipline='Werktuigbouw'
        if any(x in series.lower() for x in ['tigris','hep2o','schroefkoppeling','lijmfitting','drukhulp','ecoﬁt','ecofit','elgef','progef','pp verloop']):group='Water, buizen en koppelingen'
        elif any(x in series.lower() for x in ['wadal','wafix','sitech','as-hulp','as-buis','quickstream pe','flexibele koppelingen','pp buis','rio manchet']):group='Afvoer en riolering'
        elif any(x in series.lower() for x in ['hwa','rwa','dak','goot','hemelwater']):group='Hemelwaterafvoer'
        elif 'ventil' in series.lower():group='Ventilatie, kanalen en hulpstukken'
        elif 'vloerverwarming' in series.lower():group='Vloerverwarming'
        elif any(x in series.lower() for x in ['elektro','flexbedraad','kabelbescherming','meterkast']):group='Elektro, buizen en kabelbescherming';discipline='Elektrotechniek'
        elif any(x in series.lower() for x in ['bevestig','beugel','zadel','bifix','strut','klemnok','muur','moer','ophangoog','speciedeksel']):group='Montage en bevestiging';discipline='Montage en verbruik'
        elif any(x in series.lower() for x in ['lijm','cleaner','glijmiddel','reinigin','ptfe','poets','kimband']):group='Lijm, afdichting en verbruik';discipline='Montage en verbruik'
        elif 'gereedschap' in series.lower() or 'perstang' in series.lower():group='Gereedschap en installatiehulpmiddelen';discipline='Montage en verbruik'
        pack,unit,price=min(articles[code],key=lambda a:a[0])
        yield item('wavin',brand,code,name,group,discipline,unit,price,row[34:48],series,'Product.txt regel '+str(index),pack)

def bals(data):
    for n,r in xlsx_rows(data,'Blad1'):
        code=r.get('A','');name=r.get('C','');price=number(r.get('D',''))
        if not re.fullmatch(r'B\d+',code) or not name or not price:continue
        group='CEE en industriële contactmaterialen'
        if any(w in name.lower() for w in ['flens','deksel','klem','doos','wartel','pakking','schroef','frame','beugel']):group='CEE, toebehoren en montage'
        yield item('bals','Bals',code,name,group,'Elektrotechniek','stuk',price,r.get('G',''),r.get('B',''),'Blad1 rij '+str(n),number(r.get('H','')))

def schneider(data):
    for n,r in xlsx_rows(data,'Prijslijst'):
        code=r.get('B','');name=r.get('C','');unit=UNIT.get(r.get('E',''));price=number(r.get('R',''))
        if not name or not unit or not price or not gtin(r.get('A','')):continue
        group=''
        # Explicit, existing building-installation ranges, rather than all 39,000 industrial parts.
        if code.startswith(('A9','R9')):group='Modulaire beveiliging en schakelen'
        elif code.startswith(('METSE','A9MEM')):group='Energiemeting en bewaking'
        elif code.startswith(('NU','MTN')):group='Schakelmateriaal en gebouwautomatisering'
        elif code.startswith(('IMT','ISM')):group='Kabelmanagement en installatiedozen'
        elif code.startswith(('VDI','ACT')):group='Data en netwerkinstallatie'
        elif code.startswith(('EVH','EVF','EVA')):group='Laadvoorzieningen'
        elif code.startswith(('NSYCRN','NSYPLM','NSYSM','NSYSF')):group='Verdeelkasten en behuizingen'
        if not group:continue
        # Only ready-to-order product identities, not quote-only combinations or made-up variants.
        p=item('schneider','Schneider Electric',code,name,group,'Elektrotechniek',unit,price,r.get('A',''),'', 'Prijslijst rij '+str(n),number(r.get('D','')))
        p['priceDate']=r.get('L','');yield p

def vasco(data,key):
    if key=='vasco-heat':sheets=['Paneelradiatoren','Flatline','Toebehoren','Vloerverwarming','RAIO']
    elif key=='vasco-vent':sheets=['Ventilatie NL']  # Spare parts sheet explicitly says Belgium; do not label it Dutch.
    else:sheets=['Warmtepompen']
    for sheet in sheets:
        header=None
        for n,r in xlsx_rows(data,sheet):
            if any('Artikelnummer' in v for v in r.values()) and any('Omschrijving' in v for v in r.values()):header=r;continue
            if not header:continue
            get=lambda label:next((r.get(c,'') for c,v in header.items() if v.startswith(label)),'')
            code=get('Artikelnummer');name=get('Omschrijving');price=number(get('Brutoprijs'));ean=get('EAN')
            if not code or not name or not price:continue
            group={'Paneelradiatoren':'Paneelradiatoren','Flatline':'Vlakke radiatoren','Toebehoren':'Radiatorventielen en toebehoren','Vloerverwarming':'Vloerverwarming','RAIO':'Radiatoren met ventilator','Ventilatie NL':'Ventilatie en WTW','Warmtepompen':'Warmtepompen en toebehoren'}[sheet]
            yield item(key,'Vasco',code,name,group,'Werktuigbouw','stuk',price,ean,sheet,sheet+' rij '+str(n))

def build(cache):
    records=[];seen=set();manifest={}
    for key,source in SOURCES.items():
        path=cache/key
        if not path.exists():
            print('Download',key,flush=True)
            with urllib.request.urlopen(source['url'],timeout=90) as response:data=response.read(25*1024*1024+1)
            if len(data)>25*1024*1024:raise ValueError('Source too large')
            path.write_bytes(data)
        data=path.read_bytes();manifest[key]={**source,'retrieved':DATE,'sha256':hashlib.sha256(data).hexdigest()}
        parser=wavin(data) if key=='wavin' else bals(data) if key=='bals' else schneider(data) if key=='schneider' else vasco(data,key)
        for p in parser:
            identity=(p['brand'].casefold(),p['manufacturerCode'])
            if identity in seen:continue
            seen.add(identity);records.append(p)
        manifest[key]['items']=sum(p['sourceId']==key for p in records)
        print(key,manifest[key]['items'],flush=True)
    records.sort(key=lambda p:(p['discipline'],p['group'],p['brand'],p['manufacturerCode']))
    if not 5000<len(records)<19000:raise ValueError('Unexpected catalogue size, review source changes')
    fields=['id','code','brand','manufacturerCode','name','group','discipline','category','unit','ean','series','listPrice','packQty','sourceRow','priceDate']
    # Separate source files keep individual repository blobs reviewable and reasonably sized.
    for key in SOURCES:
        rows=[[p.get(k,'') for k in fields] for p in records if p['sourceId']==key]
        out='// Factual manufacturer snapshot. Generated by scripts/build-professional-catalog.py.\nexport default '+json.dumps(rows,ensure_ascii=False,separators=(',',':'))+';\n'
        (ROOT/'web'/('catalog-'+key+'.js')).write_text(out)
    (ROOT/'web'/'catalog-sources.json').write_text(json.dumps({'version':'professional-2026-11-v1','fields':fields,'sources':manifest},ensure_ascii=False,indent=2)+'\n')
    (ROOT/'web'/'catalog-sources.js').write_text('// Generated source registry.\nexport default '+json.dumps({'version':'professional-2026-11-v1','fields':fields,'sources':manifest},ensure_ascii=False,separators=(',',':'))+';\n')
    print(json.dumps({'total':len(records),'groups':dict(Counter(p['group'] for p in records)),'brands':dict(Counter(p['brand'] for p in records))},ensure_ascii=False,indent=2))

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--cache',type=Path,required=True);args=parser.parse_args();args.cache.mkdir(parents=True,exist_ok=True);build(args.cache)
