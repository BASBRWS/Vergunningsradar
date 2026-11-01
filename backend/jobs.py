"""Draai python -m backend.jobs ingest|digest|mail|cleanup|scheduler."""
import sys,os,json,re,time,ssl,smtplib,hashlib,fcntl,logging
from email.message import EmailMessage
from datetime import date,datetime,timedelta
from .domain import *
from .store import *
from . import sources
log=logging.getLogger('radar')
def address_key(l):return normalize(l['address']+' '+l['postcode']+' '+l['municipality'])
def opted_out(c,l):
    key=address_key(l)
    if c.execute("SELECT 1 FROM optouts WHERE status='approved' AND address_key=? AND address_key!=''",(key,)).fetchone():return True
    kvks={x['kvk'] for x in l.get('companies',[])}
    return any(r['kvk'] in kvks for r in c.execute("SELECT kvk FROM optouts WHERE status='approved' AND kvk!=''"))
def persist_lead(publication,municipality,bag):
    if bag.get('classification') not in ['zakelijk','maatschappelijk']:return False
    l={**bag,'date':publication['date'],'summary':re.sub(r'\b\S+@\S+\b','',publication['summary'])[:1500],'type':'besluit' if re.search(r'verleen|geweiger|besluit|intrekk',publication['title'],re.I) else 'aanvraag','sourceUrl':publication['sourceUrl'],'publicationId':publication['id']}
    l['id']=hashlib.sha256((publication['id']+'|'+address_key(l)).encode()).hexdigest()[:32]
    with db() as c:
        if opted_out(c,l):return False
    l['companies']=sources.companies(bag);l['kvkDate']=today()
    with db() as c:
        if opted_out(c,l):return False
        cfg=config(c);l.update(score_lead(l,cfg['keywords'],cfg['weights']))
        for k in ['street','number','letter','addition']:l.pop(k,None)
        c.execute('INSERT INTO leads VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',(l['id'],municipality,l['date'],address_key(l),dumps(l)))
    return True
def queue(c,p,municipality,reason):
    # Alleen verwijzingen; geen ongecontroleerde adressen/publicatietekst opslaan.
    pid=hashed(p['id']+'|'+municipality)
    c.execute('INSERT OR IGNORE INTO pending VALUES(?,?,?,?,?)',(pid,p['id'],municipality,today(),reason))
def process_publication(p,municipality,manual=None):
    count=0;unknown=False;queries=[manual] if manual else sources.address_queries(p)
    if not queries:
        with db() as c:queue(c,p,municipality,'Geen eenduidig adres')
        return 0
    for q in queries:
        bag=sources.resolve_address(q,municipality)
        if not bag or bag['classification']=='onbekend':unknown=True;continue
        if bag['classification'] in ['gemengd','particulier']:continue
        count+=int(persist_lead(p,municipality,bag))
    if unknown:
        with db() as c:queue(c,p,municipality,'BAG-match ontbreekt of is niet eenduidig')
    return count

def ingest():
    if not os.environ.get('KVK_API_KEY'):raise RuntimeError('Ingestie gestopt. KVK_API_KEY ontbreekt. Geen onvolledige leads opgeslagen.')
    day=now().date()
    with db() as c:municipalities=[m['name'] for m in config(c)['municipalities'] if m['active']]
    for municipality in municipalities:
        with db() as c:r=c.execute('SELECT day FROM checkpoints WHERE municipality=?',(municipality,)).fetchone()
        start=date.fromisoformat(r['day'])+timedelta(days=1) if r else day-timedelta(days=14)
        # Maximaal 31 dagen per run. Een langdurige storing wordt in volgende runs ingehaald.
        end=min(day-timedelta(days=1),start+timedelta(days=30))
        cursor=start
        while cursor<=end:
            publications_count=lead_count=errors=0
            try:
                for p in sources.publications(municipality,cursor.isoformat(),cursor.isoformat()):
                    publications_count+=1
                    try:lead_count+=process_publication(p,municipality)
                    except Exception as exc:
                        errors+=1;log.warning('Publicatie mislukt %s %s %s',municipality,p['id'],type(exc).__name__)
            except Exception as exc:
                errors+=1;log.warning('Gemeente mislukt %s %s',municipality,type(exc).__name__)
            with db() as c:
                last=c.execute('SELECT zero_streak FROM reports WHERE municipality=? AND day<? ORDER BY day DESC LIMIT 1',(municipality,cursor.isoformat())).fetchone()
                streak=(last['zero_streak'] if last else 0)+(1 if cursor.weekday()<5 else 0) if publications_count==0 and not errors else 0
                c.execute('INSERT OR REPLACE INTO reports VALUES(?,?,?,?,?,?)',(municipality,cursor.isoformat(),publications_count,lead_count,errors,streak))
                if not errors:c.execute('INSERT OR REPLACE INTO checkpoints VALUES(?,?)',(municipality,cursor.isoformat()))
                if streak>=3 and os.environ.get('ADMIN_EMAIL'):outbox(c,os.environ['ADMIN_EMAIL'],'Broncontrole nodig. '+municipality,'Deze gemeente had minstens drie werkdagen geen vergunningpublicaties. Controleer de bron en zoekquery.','system',key='zero-'+municipality+'-'+cursor.isoformat())
            if errors:break # Volgende run opnieuw deze dag, andere gemeenten gaan door.
            cursor+=timedelta(days=1)
    if os.environ.get('ADMIN_EMAIL'):
        with db() as c:
            reports=[dict(r) for r in c.execute('SELECT * FROM reports WHERE day>=? ORDER BY municipality',( (day-timedelta(days=3)).isoformat(),))]
            outbox(c,os.environ['ADMIN_EMAIL'],'Dagrapport Vergunningradar '+today(),dumps(reports),'system',key='report-'+today())

def list_leads(c,account):
    rows=c.execute('SELECT l.data,f.status,f.note,f.assignee,f.feedback FROM leads l LEFT JOIN followups f ON l.id=f.lead_id AND f.account_id=? ORDER BY l.day DESC',(account,))
    result=[];cfg=config(c)
    for r in rows:
        l=json.loads(r['data'])
        if l.get('kvkDate','')<(now().date()-timedelta(days=90)).isoformat():l['companies']=[];l['kvkDate']='';l.update(score_lead(l,cfg['keywords'],cfg['weights']))
        l.update(status=r['status'] or 'nieuw',note=r['note'] or '',assignee=r['assignee'] or '',feedback=json.loads(r['feedback']) if r['feedback'] else None)
        if not opted_out(c,l):result.append(l)
    return result

def digest():
    if now().weekday()>=5:return
    with db() as c:
        for u in c.execute('SELECT u.*,a.trial_end,a.paid_until,a.cancelled_at,a.status AS account_status,p.data AS preferences FROM users u JOIN accounts a ON a.id=u.account_id JOIN preferences p ON p.account_id=a.id').fetchall():
            if not u['email_enabled']:continue
            active=(u['paid_until'] or '')>=today() or (u['trial_end']>=today() and not u['cancelled_at'])
            if not active:continue
            p=json.loads(u['preferences'])
            sent={r[0] for r in c.execute('SELECT lead_id FROM deliveries WHERE user_id=?',(u['id'],))}
            # Nieuwe abonnees starten met 14 dagen, daarna ook nog niet gemelde inhaaldata.
            cutoff=(datetime.fromisoformat(u['created']).date()-timedelta(days=14)).isoformat()
            selected=sorted([l for l in list_leads(c,u['account_id']) if l['date']>=cutoff and l['id'] not in sent and matches(l,p)],key=lambda l:l['score'],reverse=True)
            if not selected:continue
            key='digest-'+u['id']+'-'+today()
            unsub=issue_token(c,'unsubscribe',{'user':u['id']},seconds=2*365*86400)
            web=os.environ['PUBLIC_WEB_URL'].rstrip('/')
            lines=[f"{len(selected)} nieuwe projecten in jouw regio",'']
            for l in selected[:15]:lines += [f"Score {l['score']} · {l['municipality']} · {l['address']}",l['summary'],', '.join(x['name'] for x in l['companies']),web+'/#lead/'+l['id'],'']
            if len(selected)>15:lines += [f"En {len(selected)-15} meer in de webapp.",web+'/#leads','']
            lines += ['Instellingen. '+web+'/#settings','Afmelden. '+web+'/#auth/unsubscribe='+unsub]
            outbox(c,u['email'],f"{len(selected)} nieuwe projecten in jouw regio, {now().strftime('%d %m')}",'\n'.join(lines),'digest',{'user':u['id'],'leads':[l['id'] for l in selected]},key)
        for a in c.execute("SELECT * FROM accounts WHERE status='trial'").fetchall():
            if date.fromisoformat(a['trial_end'])-now().date()==timedelta(days=5):
                for u in c.execute("SELECT email FROM users WHERE account_id=? AND role IN ('owner','admin')",(a['id'],)):
                    outbox(c,u['email'],'Je proefperiode loopt over 5 dagen af','Kies je abonnement in de webapp. Zonder betaling wordt je account alleen-lezen.','system',key='trial25-'+a['id'])

def send_mail():
    if not os.environ.get('SMTP_HOST') or not os.environ.get('SMTP_FROM'):raise RuntimeError('SMTP is nog niet geconfigureerd')
    # Blokkering voorkomt twee gelijktijdige bezorgprocessen.
    with open(os.path.join(os.path.dirname(DB_PATH),'mail.lock'),'a') as lock:
        try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:return
        with db() as c:rows=[dict(r) for r in c.execute("SELECT * FROM outbox WHERE status='pending' AND attempts<5 ORDER BY created LIMIT 100")]
        for r in rows:
            with db() as c:
                if r['kind']=='digest':
                    d=json.loads(r['data']);u=c.execute('SELECT * FROM users WHERE id=?',(d['user'],)).fetchone()
                    allowed={l['id'] for l in list_leads(c,u['account_id'])} if u and u['email_enabled'] else set()
                    if not set(d['leads'])<=allowed:c.execute("UPDATE outbox SET status='cancelled',body='' WHERE id=?",(r['id'],));continue
                c.execute("UPDATE outbox SET status='sending',attempts=attempts+1 WHERE id=?",(r['id'],))
            msg=EmailMessage();msg['From']=os.environ['SMTP_FROM'];msg['To']=r['recipient'];msg['Subject']=r['subject'];msg['Message-ID']='<'+r['id']+'@'+os.environ.get('MAIL_DOMAIN','vergunningradar.local')+'>';msg.set_content(r['body'])
            try:
                with smtplib.SMTP(os.environ['SMTP_HOST'],int(os.environ.get('SMTP_PORT','587')),timeout=30) as smtp:
                    smtp.starttls(context=ssl.create_default_context())
                    if os.environ.get('SMTP_USER'):smtp.login(os.environ['SMTP_USER'],os.environ['SMTP_PASSWORD'])
                    smtp.send_message(msg)
            except Exception as exc:
                # Na een netwerkfout kan SMTP de mail al hebben aangenomen. Niet blind dubbel sturen.
                with db() as c:c.execute("UPDATE outbox SET status='uncertain' WHERE id=?",(r['id'],))
                log.warning('SMTP bezorging onzeker %s %s',r['id'],type(exc).__name__);continue
            with db() as c:
                c.execute("UPDATE outbox SET status='sent',sent=?,body='' WHERE id=?",(time.time(),r['id']))
                if r['kind']=='digest':
                    d=json.loads(r['data'])
                    for lid in d['leads']:c.execute('INSERT OR IGNORE INTO deliveries VALUES(?,?,?)',(d['user'],lid,now().isoformat()))

def cleanup():
    with db() as c:
        c.execute('DELETE FROM leads WHERE day<?',((now().date()-timedelta(days=730)).isoformat(),))
        for table in ['tokens','sessions','cache','ratelimits']:c.execute('DELETE FROM '+table+' WHERE expires<?',(time.time(),))
        c.execute('DELETE FROM pending WHERE created<=?',((now().date()-timedelta(days=7)).isoformat(),))
        c.execute('DELETE FROM outbox WHERE created<?',(time.time()-30*86400,))
        c.execute("DELETE FROM accounts WHERE cancelled_at IS NOT NULL AND substr(cancelled_at,1,10)<?",((now().date()-timedelta(days=365)).isoformat(),))
        c.execute("DELETE FROM accounts WHERE status='trial' AND trial_end<?",((now().date()-timedelta(days=365)).isoformat(),))
        cfg=config(c)
        for r in c.execute('SELECT id,data FROM leads').fetchall():
            l=json.loads(r['data'])
            if l.get('kvkDate','')<(now().date()-timedelta(days=90)).isoformat() and l.get('companies'):
                l['companies']=[];l['kvkDate']='';l.update(score_lead(l,cfg['keywords'],cfg['weights']));c.execute('UPDATE leads SET data=? WHERE id=?',(dumps(l),r['id']))
        c.execute('DELETE FROM audit WHERE created<?',((now().date()-timedelta(days=730)).isoformat(),))

def resolve_pending(pending_id,address):
    with db() as c:r=c.execute('SELECT * FROM pending WHERE id=?',(pending_id,)).fetchone()
    if not r:raise ValueError('Verwijzing niet gevonden.')
    raw=sources.fetch(sources.SRU,{'version':'2.0','operation':'searchRetrieve','query':f'dt.identifier=="{r["publication_id"]}"','maximumRecords':1})
    root=sources.ET.fromstring(raw);record=next((x for x in root.iter() if sources.local(x.tag)=='record'),None)
    if record is None:raise ValueError('Publicatie niet meer beschikbaar.')
    bag=sources.resolve_address(address,r['municipality'])
    if not bag or bag['classification']=='onbekend':raise ValueError('Nog geen eenduidige BAG-match.')
    persist_lead(sources.parse_record(record),r['municipality'],bag)
    with db() as c:c.execute('DELETE FROM pending WHERE id=?',(pending_id,))

def scheduler():
    last={}
    while True:
        t=now();key=t.date().isoformat()
        if last.get('cleanup')!=key:
            cleanup();last['cleanup']=key
        if t.weekday()<5 and 6<=t.hour<7 and last.get('ingest')!=key:
            try:ingest();last['ingest']=key
            except Exception as exc:log.warning('Ingestie niet gelukt %s',type(exc).__name__)
        if t.weekday()<5 and t.hour>=7 and last.get('digest')!=key:
            try:digest();last['digest']=key
            except Exception as exc:log.warning('Digest niet gelukt %s',type(exc).__name__)
        try:send_mail()
        except Exception as exc:log.warning('Mail niet beschikbaar %s',type(exc).__name__)
        time.sleep(30)

if __name__=='__main__':
    logging.basicConfig(level=logging.INFO);init()
    commands={'ingest':ingest,'digest':digest,'mail':send_mail,'cleanup':cleanup,'scheduler':scheduler}
    if len(sys.argv)!=2 or sys.argv[1] not in commands:raise SystemExit('Gebruik ingest, digest, mail, cleanup of scheduler')
    commands[sys.argv[1]]()
