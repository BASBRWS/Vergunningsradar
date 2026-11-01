"""Pure bedrijfsregels, gelijk aan web/core.js. Geen externe afhankelijkheden."""
import re
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo
TZ = ZoneInfo('Europe/Amsterdam')
MUNICIPALITIES = ['Rotterdam','Den Haag','Dordrecht','Delft','Leiden','Gouda','Schiedam','Vlaardingen','Nissewaard','Voorne aan Zee']
KEYWORDS = {'Bouw & renovatie':['verbouwen','renovatie','uitbreiden','bouwen','constructie'], 'Installatie':['warmtepomp','ventilatie','installatie','verwarming'], 'Dak & gevel':['dak','gevel','isolatie','kozijnen'], 'Elektrotechniek':['zonnepanelen','laadpaal','elektra','elektrotechniek'], 'Grond & terrein':['terrein','bestrating','grondwerk','uitrit']}
WEIGHTS = dict(company=25, legal=10, large=20, medium=10, old=10, application=15, keywords=20)
DEFAULT_PREFS = dict(municipalities=MUNICIPALITIES,trades=[*KEYWORDS,'Overig'],minScore=40,email=True,push=False)
STATUSES = ['nieuw','bekeken','benaderd','offerte','gewonnen','afgewezen']
ALLOWED_USES = {'kantoorfunctie','winkelfunctie','industriefunctie','logiesfunctie','sportfunctie','overige gebruiksfunctie','onderwijsfunctie','gezondheidszorgfunctie','bijeenkomstfunctie','celfunctie'}
def now(): return datetime.now(TZ)
def today(): return now().date().isoformat()
def normalize(s): return re.sub(r'[^a-z0-9]', '', str(s).casefold())
def classify(uses):
    values = {v.strip().lower() for u in uses for v in re.split('[,;|]',str(u)) if v.strip()}
    if not values: return 'onbekend'
    if 'woonfunctie' in values: return 'particulier' if len(values)==1 else 'gemengd'
    if values-ALLOWED_USES: return 'onbekend'
    return 'maatschappelijk' if values & {'onderwijsfunctie','gezondheidszorgfunctie','bijeenkomstfunctie','celfunctie'} else 'zakelijk'
def score_lead(lead,keywords=None,weights=None):
    keywords = keywords or KEYWORDS
    weights = weights or WEIGHTS
    text = lead.get('summary','').casefold()
    hits = {w for words in keywords.values() for w in words if w.casefold() in text}
    trades = [trade for trade,words in keywords.items() if any(w.casefold() in text for w in words)] or ['Overig']
    companies = lead.get('companies',[])
    legal = any(c.get('legalForm','').lower() in {'bv','nv','stichting','vereniging','besloten vennootschap','naamloze vennootschap'} for c in companies)
    factors = [['Bedrijf op het adres',weights['company'] if companies else 0], ['Rechtspersoon',weights['legal'] if legal else 0], ['Oppervlakte', weights['large'] if lead.get('area',0)>=500 else weights['medium'] if lead.get('area',0)>=250 else 0], ['Bouwjaar vóór 1990',weights['old'] if 0<lead.get('year',0)<1990 else 0], ['Aanvraag',weights['application'] if lead.get('type')=='aanvraag' else 0], ['Minstens twee trefwoorden',weights['keywords'] if len(hits)>=2 else 0]]
    return dict(score=max(0,min(100,sum(p for _,p in factors))),trades=trades,factors=factors,hits=sorted(hits))
def matches(l,p): return l['municipality'] in p['municipalities'] and bool(set(l['trades'])&set(p['trades'])) and l['score']>=p['minScore'] and not l.get('optedOut')
def validate_prefs(p):
    if not isinstance(p,dict): raise ValueError('Ongeldige instellingen.')
    municipalities=p.get('municipalities',[]); trades=p.get('trades',[])
    if not isinstance(municipalities,list) or not municipalities or set(municipalities)-set(MUNICIPALITIES): raise ValueError('Kies geldige gemeenten.')
    if not isinstance(trades,list) or not trades or set(trades)-{*KEYWORDS,'Overig'}: raise ValueError('Kies geldige vakgebieden.')
    score=p.get('minScore',40)
    if not isinstance(score,(int,float)) or isinstance(score,bool) or not 0<=score<=100: raise ValueError('Score moet tussen 0 en 100 liggen.')
    return dict(municipalities=list(dict.fromkeys(municipalities)),trades=list(dict.fromkeys(trades)),minScore=int(score),email=bool(p.get('email',True)),push=False)
def publication_window(day):
    """Maandag omvat vrijdag, zaterdag en zondag; overige dagen de vorige dag."""
    return day-timedelta(days=3 if day.weekday()==0 else 1), day-timedelta(days=1)
def email_valid(s): return isinstance(s,str) and len(s)<=254 and bool(re.fullmatch(r'[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+',s))
def public_lead(l):
    # Een expliciete allowlist voorkomt lekken van bedrijfsnamen en opvolggegevens.
    result={k:l.get(k) for k in ['id','date','municipality','address','summary','trades','type','sourceUrl']}
    for company in l.get('companies',[]):
        name=company.get('name','')
        if name:result['summary']=re.sub(re.escape(name),'[bedrijfsnaam afgeschermd]',result.get('summary',''),flags=re.I)
    return result
