"""Adapters voor officiële KOOP-, PDOK- en KvK-bronnen.
Netwerkfouten worden doorgegeven. Geen woonadressen of ruwe publicaties op schijf.
"""
import json, os, re, time, urllib.request, urllib.parse, xml.etree.ElementTree as ET
from .domain import normalize, classify, today
from .store import db,dumps
SRU='https://repository.overheid.nl/sru'
BAG='https://api.pdok.nl/kadaster/bag/ogc/v2'
LOCATION='https://api.pdok.nl/bzk/locatieserver/search/v3_1/free'
KVK='https://api.kvk.nl/api'
class SourceError(Exception): pass
class MissingKey(SourceError): pass
def fetch(url,params=None,headers=None,method='GET',body=None):
    if params: url+='?'+urllib.parse.urlencode(params)
    h={'User-Agent':'Vergunningradar/0.1 (zakelijke vergunninganalyse)','Accept':'application/json, application/xml;q=0.9',**(headers or {})}
    request=urllib.request.Request(url,headers=h,method=method,data=json.dumps(body).encode() if body is not None else None)
    with urllib.request.urlopen(request,timeout=25) as res:
        raw=res.read(8_000_001)
        if len(raw)>8_000_000: raise SourceError('Bronantwoord te groot')
        return raw

def get_json(url,params=None,headers=None): return json.loads(fetch(url,params,headers))
def local(tag):return tag.rsplit('}',1)[-1]
def texts(element,name):return [(el.text or '').strip() for el in element.iter() if local(el.tag)==name and el.text]
def first(element,name,default=''):return next(iter(texts(element,name)),default)
def parse_record(r):
    pid=first(r,'identifier');title=first(r,'title');abstract=first(r,'abstract')
    return dict(id=pid,title=title,summary=abstract or title,date=first(r,'available')[:10],streets=texts(r,'straatnaam'),postal=texts(r,'postcodeHuisnummer'),city=first(r,'woonplaats'),sourceUrl='https://zoek.officielebekendmakingen.nl/'+pid+'.html')
def publications(municipality,start,end):
    creator="'s-Gravenhage" if municipality=='Den Haag' else municipality
    # publicatienaam is geen dt.type. Filter gmb-ID's na de SRU-query.
    creator_query=f'(dt.creator=="{creator}" OR dt.creator=="Den Haag")' if municipality=='Den Haag' else f'dt.creator=="{creator}"'
    query=f'c.product-area=="officielepublicaties" AND {creator_query} AND dt.available>="{start}" AND dt.available<="{end}"'
    pos=1
    while True:
        raw=fetch(SRU,{'version':'2.0','operation':'searchRetrieve','query':query,'startRecord':pos,'maximumRecords':100})
        if b'<!DOCTYPE' in raw or b'<!ENTITY' in raw:raise SourceError('Onveilige XML')
        root=ET.fromstring(raw)
        if any(local(x.tag)=='diagnostic' for x in root.iter()):raise SourceError('SRU-query afgewezen')
        records=[x for x in root.iter() if local(x.tag)=='record']
        for r in records:
            p=parse_record(r)
            if p['id'].startswith('gmb-') and re.search(r'vergunning',p['title'],re.I): yield p
        nxt=first(root,'nextRecordPosition')
        if not nxt:return
        if int(nxt)<=pos:raise SourceError('SRU-paginering loopt vast')
        pos=int(nxt)
        if pos>100000:raise SourceError('Onverwacht groot resultaat, kleinere periode nodig')

def address_queries(p):
    queries=[]
    # Gekoppelde postcode/huisnummer-paren zijn betrouwbaarder dan titelherkenning.
    for value in p.get('postal',[]):
        match=re.fullmatch(r'\s*(\d{4}\s?[A-Z]{2})\s+(\d{1,5})(?:\s*([A-Za-z]))?(?:\s+([\w-]+))?\s*',value)
        if match:queries.append(' '.join(v for v in match.groups() if v))
    if queries:return list(dict.fromkeys(queries))
    # Reeksen en gecombineerde huisnummers worden bewust niet geraden.
    title=p['title']
    if re.search(r'\d\s*(?:t/m|tot en met|en|/)\s*\d|\d\s*[-–]\s*\d',title,re.I):return []
    for m in re.finditer(r"([A-ZÀ-Ÿ][\w'’.-]*(?:\s+(?:van|de|den|der|het|[A-ZÀ-Ÿ][\w'’.-]*)){0,5})\s+(\d{1,5}[A-Za-z]?)(?!\d)",title):
        if not re.search(r'\b(?:datum|ontvangen|d.d.|kenmerk)\b',m[1],re.I):queries.append(m[0])
    return list(dict.fromkeys(queries))

def resolve_address(query,municipality):
    response=get_json(LOCATION,{'q':query,'fq':f'type:adres AND gemeentenaam:"{municipality}"','rows':10})
    docs=response.get('response',{}).get('docs',[])
    accepted=[]
    for d in docs:
        city=d.get('gemeentenaam','')
        if normalize(city) not in {normalize(municipality),normalize("'s-Gravenhage") if municipality=='Den Haag' else normalize(municipality)}:continue
        street=d.get('straatnaam','');number=str(d.get('huisnummer',''));letter=d.get('huisletter','') or '';addition=d.get('huisnummertoevoeging','') or ''
        full=normalize(street+number+letter+addition)
        q=normalize(query)
        postal=normalize(d.get('postcode','')+number+letter+addition)
        if q==postal or q==full or q.endswith(full) or (full in q and normalize(d.get('postcode','')) in q):accepted.append(d)
    if len(accepted)!=1: return None
    d=accepted[0]
    # Alle actuele VBO's met dit adres, niet slechts de eerste geocode-treffer.
    url=BAG+'/collections/verblijfsobject/items';params={'postcode':d['postcode'],'huisnummer':d['huisnummer'],'limit':1000,'f':'json'};features=[]
    while url:
        response=get_json(url,params);features+=response.get('features',[])
        url=next((x['href'] for x in response.get('links',[]) if x['rel']=='next'),None);params=None
        if url and not url.startswith(BAG+'/'):raise SourceError('Onverwachte BAG-paginering')
        if len(features)>10000:raise SourceError('Adres heeft te veel BAG-objecten')
    active=[]
    for f in features:
        p=f['properties']
        if normalize(p.get('huisletter') or '')!=normalize(d.get('huisletter') or '') or normalize(p.get('toevoeging') or '')!=normalize(d.get('huisnummertoevoeging') or ''):continue
        if p.get('status') not in ['Verblijfsobject in gebruik','Verblijfsobject in gebruik (niet ingemeten)','Verblijfsobject gevormd','Verbouwing verblijfsobject']:continue
        active.append(f)
    uses=[u for f in active for u in ([f['properties']['gebruiksdoel']] if isinstance(f['properties'].get('gebruiksdoel'),str) else f['properties'].get('gebruiksdoel',[]))]
    classification=classify(uses)
    if classification not in ['zakelijk','maatschappelijk']:return {'classification':classification}
    # Bouwjaren worden pas opgehaald nadat het volledige adres zakelijk blijkt.
    years=[];pands=set()
    for f in active:
        links=f['properties'].get('pand.href',[])
        if isinstance(links,str):links=[links]
        for link in links:
            if link in pands:continue
            if not link.startswith(BAG+'/collections/pand/items/'):raise SourceError('Onverwachte pandlink')
            pands.add(link);pand=get_json(link,{'f':'json'});year=pand.get('properties',{}).get('oorspronkelijk_bouwjaar')
            if year:years.append(int(year))
    geo=active[0].get('geometry',{}).get('coordinates',[])
    address=' '.join(str(x) for x in [d['straatnaam'],d['huisnummer'],d.get('huisletter'),d.get('huisnummertoevoeging')] if x)
    return dict(classification=classification,address=address,postcode=d['postcode'],city=d.get('woonplaatsnaam',''),municipality=municipality,uses=sorted(set(uses)),area=sum(int(f['properties'].get('oppervlakte',0)) for f in active),year=min(years) if years else 0,bagIds=[f['properties']['identificatie'] for f in active],bagDate=today(),lon=geo[0] if len(geo)==2 else None,lat=geo[1] if len(geo)==2 else None,street=d['straatnaam'],number=d['huisnummer'],letter=d.get('huisletter',''),addition=d.get('huisnummertoevoeging',''))

def companies(address):
    key=os.environ.get('KVK_API_KEY')
    if not key:raise MissingKey('KVK_API_KEY ontbreekt')
    cache_key='kvk:'+normalize(address['postcode']+str(address['number'])+str(address.get('letter') or '')+str(address.get('addition') or ''))
    with db() as c:
        r=c.execute('SELECT data FROM cache WHERE key=? AND expires>?',(cache_key,time.time())).fetchone()
        if r:return json.loads(r['data'])
    headers={'apikey':key};companies=[];page=1
    while True:
        result=get_json(KVK+'/v2/zoeken',{'postcode':address['postcode'],'huisnummer':address['number'],'huisletter':address.get('letter') or '', 'huisnummerToevoeging':address.get('addition') or '','pagina':page,'resultatenPerPagina':100},headers)
        for item in result.get('resultaten',[]):
            vid=item.get('vestigingsnummer');kvk=item.get('kvkNummer')
            if not vid or not kvk:continue
            profile=get_json(KVK+'/v1/vestigingsprofielen/'+vid,headers=headers)
            addresses=profile.get('adressen',[])
            if not any(normalize(a.get('postcode',''))==normalize(address['postcode']) and str(a.get('huisnummer',''))==str(address['number']) and normalize(a.get('huisletter') or '')==normalize(address.get('letter') or '') and normalize(a.get('huisnummerToevoeging') or '')==normalize(address.get('addition') or '') and a.get('type')=='bezoekadres' for a in addresses):continue
            basis=get_json(KVK+'/v1/basisprofielen/'+kvk,headers=headers)
            if basis.get('indNonMailing')=='Ja':continue
            # Geen eigenaarobjecten, contactgegevens, websites of persoonsnamen cachen.
            legal=basis.get('_embedded',{}).get('eigenaar',{}).get('rechtsvorm','')
            names=profile.get('handelsnamen',[]);name=profile.get('eersteHandelsnaam') or (names[0].get('naam','') if names else '')
            if not name:continue
            sbi=profile.get('sbiActiviteiten',[])
            companies.append(dict(name=name,legalForm=legal,kvk=kvk,sbi='; '.join(str(s.get('sbiCode',''))+' '+s.get('sbiOmschrijving','') for s in sbi),personal=bool(re.search('eenmanszaak|vof|vennootschap onder firma',legal,re.I))))
        if not result.get('volgende'):break
        page+=1
        if page>100:raise SourceError('KvK-resultaat te groot')
    with db() as c:c.execute('INSERT OR REPLACE INTO cache VALUES(?,?,?)',(cache_key,dumps(companies),time.time()+90*86400))
    return companies
