"""HTTP JSON API. Publiceer uitsluitend achter de meegeleverde HTTPS-proxy."""
import os,json,secrets,time,re,logging,urllib.parse
from datetime import timedelta,date
from http.server import ThreadingHTTPServer,BaseHTTPRequestHandler
from .domain import *
from .store import *
from .jobs import list_leads,address_key,opted_out,resolve_pending
from . import sources,billing
log=logging.getLogger('radar')
class HTTPError(Exception):
    def __init__(self,status,message):self.status=status;self.message=message

def read_only(a):return not ((a['paid_until'] or '')>=today() or (a['trial_end']>=today() and not a['cancelled_at']))
def get_user(c,authorization):
    if not authorization.startswith('Bearer '):raise HTTPError(401,'Opnieuw inloggen is nodig.')
    r=c.execute('SELECT u.*,a.company,a.trial_end,a.status,a.paid_until,a.cancelled_at FROM sessions s JOIN users u ON s.user_id=u.id JOIN accounts a ON a.id=u.account_id WHERE s.hash=? AND s.expires>?',(hashed(authorization[7:]),time.time())).fetchone()
    if not r:raise HTTPError(401,'Je sessie is verlopen. Opnieuw inloggen is nodig.')
    return {**dict(r),'readOnly':read_only(r)}
def require_owner(u):
    if u['role'] not in ['owner','admin']:raise HTTPError(403,'Alleen de accountbeheerder kan dit aanpassen.')
def require_admin(u):
    if u['role']!='admin':raise HTTPError(403,'Alleen de beheerder heeft toegang.')
def require_write(u):
    if u['readOnly']:raise HTTPError(403,'Je account is alleen-lezen. Kies eerst een abonnement.')
def email_body(link):return 'Open deze link om verder te gaan.\n\n'+link+'\n\nHeb je dit niet aangevraagd? Negeer deze e-mail.'
def web_link(query):return os.environ['PUBLIC_WEB_URL'].rstrip('/')+'/#auth/'+query

def request_login(c,d,ip):
    if not os.environ.get('SMTP_HOST'):raise ValueError('Inlogmails zijn nog niet aangesloten.')
    email=str(d.get('email','')).strip().lower()
    if not email_valid(email):raise ValueError('Vul een geldig e-mailadres in.')
    limited(c,'auth-ip:'+ip,20);limited(c,'auth-email:'+email,5)
    existing=c.execute('SELECT * FROM users WHERE email=?',(email,)).fetchone()
    if not existing and not d.get('signup'):return {'ok':True}
    company=str(d.get('company','')).strip()[:120]
    if not existing and not company:raise ValueError('Vul je bedrijfsnaam in.')
    preferences=validate_prefs(d.get('preferences',DEFAULT_PREFS))
    t=issue_token(c,'login',{'email':email,'company':company,'preferences':preferences})
    outbox(c,email,'Jouw inloglink voor Vergunningradar',email_body(web_link('token='+t)))
    return {'ok':True}
def verify_login(c,d):
    payload=consume_token(c,str(d.get('token','')),'login');email=payload['email']
    u=c.execute('SELECT * FROM users WHERE email=?',(email,)).fetchone()
    if not u:
        account=uid();user=uid();created=now().isoformat();trial=(now().date()+timedelta(days=30)).isoformat();role='admin' if email==os.environ.get('ADMIN_EMAIL','').lower() else 'owner'
        c.execute('INSERT INTO accounts(id,company,created,trial_end) VALUES(?,?,?,?)',(account,payload['company'],created,trial))
        c.execute('INSERT INTO users VALUES(?,?,?,?,?,?)',(user,account,email,role,1,created))
        c.execute('INSERT INTO preferences VALUES(?,?)',(account,dumps(payload['preferences'])))
    else:user=u['id']
    token=secrets.token_urlsafe(32);c.execute('INSERT INTO sessions VALUES(?,?,?)',(hashed(token),user,time.time()+12*3600))
    return {'token':token}

def approve_optout(c,id,user):
    row=c.execute("SELECT * FROM optouts WHERE id=? AND status='confirmed'",(id,)).fetchone()
    if not row:raise ValueError('Bevestigd verzoek niet gevonden.')
    key=''
    if row['address']:
        candidates=[]
        for m in MUNICIPALITIES:
            if normalize(m) in normalize(row['address']):
                b=sources.resolve_address(row['address'],m)
                if b and b.get('address'):candidates.append(b)
        if len(candidates)!=1:raise ValueError('Adres kan niet eenduidig worden gekoppeld. Laat het volledige BAG-adres met postcode en gemeente bevestigen.')
        key=address_key(candidates[0])
    c.execute("UPDATE optouts SET status='approved',address_key=? WHERE id=?",(key,id))
    removed=[]
    for r in c.execute('SELECT * FROM leads').fetchall():
        l=json.loads(r['data'])
        if (key and r['address_key']==key) or (row['kvk'] and any(x['kvk']==row['kvk'] for x in l.get('companies',[]))):
            # Bij uitsluiting van een bedrijf ook het adres uitsluiten, zodat verouderde KvK-cache geen terugkeer veroorzaakt.
            c.execute("INSERT OR IGNORE INTO optouts VALUES(?,?,?,?,?,?,?)",('address-'+r['address_key'],'',l['address']+' '+l['postcode']+' '+l['municipality'],row['email'],'approved',now().isoformat(),r['address_key']))
            removed.append(r['id']);c.execute('DELETE FROM leads WHERE id=?',(r['id'],))
    for r in c.execute('SELECT * FROM cache').fetchall():
        companies=json.loads(r['data'])
        if row['kvk'] and any(x.get('kvk')==row['kvk'] for x in companies):c.execute('DELETE FROM cache WHERE key=?',(r['key'],))
    for r in c.execute("SELECT id,data FROM outbox WHERE kind='digest' AND status='pending'").fetchall():
        if set(json.loads(r['data']).get('leads',[]))&set(removed):c.execute("UPDATE outbox SET status='cancelled',body='' WHERE id=?",(r['id'],))
    audit(c,user,'optout-approved',id)
    return {'ok':True,'removed':len(removed)}

def dispatch(method,path,d,auth='',ip='local'):
    with db() as c:
        if path=='/health' and method=='GET':return {'status':'ok','mode':'production','sourcesConfigured':bool(os.environ.get('KVK_API_KEY')),'mailConfigured':bool(os.environ.get('SMTP_HOST')),'billingEnabled':os.environ.get('BILLING_ENABLED')=='true'}
        if path=='/public/week' and method=='GET':
            rows=[]
            for r in c.execute('SELECT data FROM leads WHERE day>=? ORDER BY day DESC',((now().date()-timedelta(days=7)).isoformat(),)):
                l=json.loads(r['data'])
                if not opted_out(c,l):rows.append(public_lead(l))
            return rows
        if path=='/auth/request' and method=='POST':return request_login(c,d,ip)
        if path=='/auth/verify' and method=='POST':return verify_login(c,d)
        if path=='/public/optout' and method=='POST':
            limited(c,'optout:'+ip,10);email=str(d.get('email','')).strip().lower();kvk=str(d.get('kvk','')).strip();address=str(d.get('address','')).strip()[:300]
            if not email_valid(email) or not d.get('authorized'):raise ValueError('Een geldig e-mailadres en bevoegdheidsbevestiging zijn nodig.')
            if (kvk and not re.fullmatch(r'\d{8}',kvk)) or not(kvk or address):raise ValueError('Vul een KvK-nummer van 8 cijfers of volledig adres in.')
            id=uid();c.execute('INSERT INTO optouts VALUES(?,?,?,?,?,?,?)',(id,kvk,address,email,'unconfirmed',now().isoformat(),''))
            token=issue_token(c,'optout',{'id':id},seconds=2*86400);outbox(c,email,'Bevestig je verzoek om uitsluiting',email_body(web_link('optout='+token)))
            return {'ok':True}
        if path=='/public/optout/confirm' and method=='POST':
            p=consume_token(c,str(d.get('token','')),'optout');c.execute("UPDATE optouts SET status='confirmed' WHERE id=?",(p['id'],))
            if os.environ.get('ADMIN_EMAIL'):outbox(c,os.environ['ADMIN_EMAIL'],'Een uitsluitverzoek wacht op controle','Controleer het verzoek in Beheer. Verwerk het binnen één werkdag.')
            return {'ok':True}
        if path=='/public/unsubscribe' and method=='POST':
            p=consume_token(c,str(d.get('token','')),'unsubscribe');c.execute('UPDATE users SET email_enabled=0 WHERE id=?',(p['user'],));return {'ok':True}
        if path=='/webhooks/mollie' and method=='POST':
            billing.webhook(str(d.get('id','')));return {'ok':True}
        u=get_user(c,auth);account=u['account_id']
        if path=='/me' and method=='GET':return {k:u[k] for k in ['id','account_id','company','email','role','readOnly']}
        if path=='/auth/logout' and method=='POST':c.execute('DELETE FROM sessions WHERE hash=?',(hashed(auth[7:]),));return {'ok':True}
        if path=='/leads' and method=='GET':return list_leads(c,account)
        if path.startswith('/leads/') and method=='PATCH':
            require_write(u);id=path.removeprefix('/leads/');lead=c.execute('SELECT data FROM leads WHERE id=?',(id,)).fetchone()
            if not lead or opted_out(c,json.loads(lead['data'])):raise HTTPError(404,'Project niet beschikbaar.')
            if set(d)-{'status','note','assignee','feedback'}:raise ValueError('Ongeldige opvolgvelden.')
            old=c.execute('SELECT * FROM followups WHERE account_id=? AND lead_id=?',(account,id)).fetchone();old=dict(old) if old else dict(status='nieuw',note='',assignee='',feedback=None)
            status=d.get('status',old['status']);note=str(d.get('note',old['note']));assignee=str(d.get('assignee',old['assignee']));feedback=d.get('feedback')
            if status not in STATUSES or len(note)>4000:raise ValueError('Ongeldige status of te lange notitie.')
            if assignee and not c.execute('SELECT 1 FROM users WHERE account_id=? AND email=?',(account,assignee)).fetchone():raise ValueError('Deze collega hoort niet bij je account.')
            if feedback is not None and (not isinstance(feedback,dict) or set(feedback)-{'reason','comment'} or len(dumps(feedback))>2000):raise ValueError('Ongeldige feedback.')
            c.execute('INSERT OR REPLACE INTO followups VALUES(?,?,?,?,?,?,?)',(account,id,status,note,assignee,dumps(feedback) if feedback is not None else old['feedback'],now().isoformat()))
            audit(c,u['id'],'followup',id)
            return {'status':status,'note':note,'assignee':assignee,'feedback':feedback if feedback is not None else json.loads(old['feedback']) if old['feedback'] else None}
        if path=='/settings':
            if method=='GET':
                p=json.loads(c.execute('SELECT data FROM preferences WHERE account_id=?',(account,)).fetchone()['data']);p['email']=bool(u['email_enabled']);return p
            if method=='PUT':
                require_write(u);p=validate_prefs(d)
                previous=json.loads(c.execute('SELECT data FROM preferences WHERE account_id=?',(account,)).fetchone()['data'])
                if any(p[k]!=previous[k] for k in ['municipalities','trades','minScore']):require_owner(u)
                if u['role'] in ['owner','admin']:c.execute('UPDATE preferences SET data=? WHERE account_id=?',(dumps(p),account))
                c.execute('UPDATE users SET email_enabled=? WHERE id=?',(int(p['email']),u['id']));return {'ok':True}
        if path=='/members' and method=='GET':return [dict(r) for r in c.execute('SELECT email,role FROM users WHERE account_id=?',(account,))]
        if path=='/members/invite' and method=='POST':
            require_owner(u);require_write(u);email=str(d.get('email','')).strip().lower()
            if not email_valid(email):raise ValueError('Ongeldig e-mailadres.')
            if c.execute('SELECT 1 FROM users WHERE email=?',(email,)).fetchone():raise ValueError('Dit adres kan niet worden uitgenodigd.')
            limited(c,'invite:'+account,20);t=issue_token(c,'invite',{'email':email,'account':account},seconds=7*86400)
            outbox(c,email,'Uitnodiging voor Vergunningradar',email_body(web_link('invite='+t)));return {'ok':True}
        if path=='/billing' and method=='GET':
            require_owner(u);a=c.execute('SELECT * FROM accounts WHERE id=?',(account,)).fetchone();return dict(status=a['status'],trialEnds=a['trial_end'],priceMonthly=billing.price('monthly')[0],priceAnnual=billing.price('annual')[0],invoices=[{'date':r['day'],'amount':r['amount'],'status':r['status'],'description':r['description']} for r in c.execute('SELECT * FROM payments WHERE account_id=? ORDER BY day DESC',(account,))])
        if path=='/billing/checkout' and method=='POST':require_owner(u);return {'url':billing.checkout(account,str(d.get('interval','monthly')))}
        if path=='/billing/cancel' and method=='POST':require_owner(u);billing.cancel(account);return {'ok':True}
        if path.startswith('/admin'):
            require_admin(u)
            if path=='/admin' and method=='GET':
                cfg=config(c);cfg.update(optouts=[dict(r) for r in c.execute('SELECT * FROM optouts ORDER BY created DESC')],reports=[{**dict(r),'zeroStreak':r['zero_streak']} for r in c.execute('SELECT * FROM reports ORDER BY day DESC LIMIT 100')],pendingCount=c.execute('SELECT count(*) FROM pending').fetchone()[0]);return cfg
            if path=='/admin' and method=='PUT':
                weights=d.get('weights');keywords=d.get('keywords');municipalities=d.get('municipalities')
                if not isinstance(weights,dict) or set(weights)!=set(WEIGHTS) or any(type(v)!=int or not 0<=v<=100 for v in weights.values()):raise ValueError('Ongeldige scoregewichten.')
                if not isinstance(keywords,dict) or set(keywords)!=set(KEYWORDS) or any(not isinstance(v,list) or len(v)>100 or any(not isinstance(w,str) or not w.strip() or len(w)>80 for w in v) for v in keywords.values()):raise ValueError('Ongeldige trefwoorden.')
                if not isinstance(municipalities,list) or len(municipalities)!=10 or {x.get('name') for x in municipalities}!=set(MUNICIPALITIES):raise ValueError('Ongeldige gemeenten.')
                for k,v in d.items():
                    if k in ['weights','keywords','municipalities']:c.execute('UPDATE config SET data=? WHERE key=?',(dumps(v),k))
                audit(c,u['id'],'config-updated','config');return {'ok':True}
            if path.startswith('/admin/optouts/') and method=='POST':return approve_optout(c,path.split('/')[-1],u['id'])
            if path=='/admin/pending' and method=='GET':return [{'id':r['id'],'municipality':r['municipality'],'publicationId':r['publication_id']} for r in c.execute('SELECT * FROM pending ORDER BY created')]
            if path=='/admin/resolve' and method=='POST':resolve_pending(str(d.get('id','')),str(d.get('address',''))[:300]);audit(c,u['id'],'pending-resolved',str(d.get('id','')));return {'ok':True}
            if path=='/admin/withdraw' and method=='POST':c.execute('DELETE FROM leads WHERE id=?',(str(d.get('id','')),));audit(c,u['id'],'lead-withdrawn',str(d.get('id','')));return {'ok':True}
            if path=='/admin/extend' and method=='POST':
                days=d.get('days')
                if type(days)!=int or not 1<=days<=90:raise ValueError('Kies 1 tot 90 dagen.')
                a=c.execute('SELECT trial_end FROM accounts WHERE id=?',(d.get('account'),)).fetchone()
                if not a:raise ValueError('Account niet gevonden.')
                end=max(now().date(),date.fromisoformat(a['trial_end']))+timedelta(days=days);c.execute('UPDATE accounts SET trial_end=? WHERE id=?',(end.isoformat(),d['account']));audit(c,u['id'],'trial-extended',d['account']);return {'ok':True}
        raise HTTPError(404,'Pagina niet gevonden.')

def accept_invite(d):
    with db() as c:
        p=consume_token(c,str(d.get('token','')),'invite')
        if c.execute('SELECT 1 FROM users WHERE email=?',(p['email'],)).fetchone():raise ValueError('Dit adres heeft al een account.')
        if not c.execute('SELECT 1 FROM accounts WHERE id=?',(p['account'],)).fetchone():raise ValueError('Account niet meer beschikbaar.')
        id=uid();c.execute('INSERT INTO users VALUES(?,?,?,?,?,?)',(id,p['account'],p['email'],'user',1,now().isoformat()))
        token=secrets.token_urlsafe(32);c.execute('INSERT INTO sessions VALUES(?,?,?)',(hashed(token),id,time.time()+12*3600));return {'token':token}

class Handler(BaseHTTPRequestHandler):
    server_version='Vergunningradar'
    def log_message(self,*args):pass # Geen URL's, tokens, adressen of e-mails in accesslogs.
    def send_json(self,status,data):
        raw=dumps(data).encode();self.send_response(status);origin=self.headers.get('Origin','')
        if origin==os.environ.get('ALLOWED_ORIGIN'):self.send_header('Access-Control-Allow-Origin',origin)
        self.send_header('Vary','Origin');self.send_header('Access-Control-Allow-Headers','Content-Type, Authorization');self.send_header('Access-Control-Allow-Methods','GET, POST, PUT, PATCH, OPTIONS');self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Cache-Control','no-store');self.send_header('X-Content-Type-Options','nosniff');self.send_header('Content-Length',str(len(raw)));self.end_headers();self.wfile.write(raw)
    def handle_request(self):
        try:
            origin=self.headers.get('Origin','');allowed=os.environ.get('ALLOWED_ORIGIN','')
            if origin and origin!=allowed:raise HTTPError(403,'Deze website heeft geen toegang tot de API.')
            if self.command=='OPTIONS':self.send_json(200,{});return
            path=urllib.parse.urlsplit(self.path).path
            n=int(self.headers.get('Content-Length','0'))
            if n<0 or n>65536:raise HTTPError(413,'Aanvraag te groot.')
            raw=self.rfile.read(n);data={}
            if raw:
                if path=='/webhooks/mollie':data={k:v[0] for k,v in urllib.parse.parse_qs(raw.decode()).items()}
                else:
                    if 'application/json' not in self.headers.get('Content-Type',''):raise HTTPError(415,'JSON is vereist.')
                    data=json.loads(raw)
                    if not isinstance(data,dict):raise ValueError('Een JSON-object is vereist.')
            result=accept_invite(data) if path=='/auth/invite' and self.command=='POST' else dispatch(self.command,path,data,self.headers.get('Authorization',''),self.client_address[0])
            self.send_json(200,result)
        except HTTPError as exc:self.send_json(exc.status,{'error':exc.message})
        except (ValueError,KeyError,TypeError) as exc:self.send_json(400,{'error':str(exc) if isinstance(exc,ValueError) else 'Ongeldige aanvraag.'})
        except Exception as exc:log.error('API fout %s',type(exc).__name__);self.send_json(503,{'error':'De dienst is tijdelijk niet beschikbaar. Probeer later opnieuw.'})
    do_GET=handle_request;do_POST=handle_request;do_PUT=handle_request;do_PATCH=handle_request;do_OPTIONS=handle_request

if __name__=='__main__':
    logging.basicConfig(level=logging.INFO);init()
    for name in ['PUBLIC_WEB_URL','PUBLIC_API_URL','ALLOWED_ORIGIN']:
        if not os.environ.get(name):raise SystemExit(name+' ontbreekt')
    if not os.environ['PUBLIC_WEB_URL'].startswith('https://') and os.environ.get('DEVELOPMENT')!='true':raise SystemExit('HTTPS is verplicht.')
    ThreadingHTTPServer(('0.0.0.0',int(os.environ.get('PORT','8080'))),Handler).serve_forever()
