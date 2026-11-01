import os, sqlite3, json, secrets, hashlib, time
from pathlib import Path
from contextlib import contextmanager
from .domain import MUNICIPALITIES,KEYWORDS,WEIGHTS,now
DB_PATH=os.environ.get('DB_PATH','data/radar.sqlite3')
SCHEMA='''
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS accounts(id TEXT PRIMARY KEY,company TEXT NOT NULL,created TEXT NOT NULL,trial_end TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'trial',paid_until TEXT,customer_id TEXT,subscription_id TEXT,interval TEXT,cancelled_at TEXT);
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,email TEXT NOT NULL UNIQUE,role TEXT NOT NULL,email_enabled INTEGER NOT NULL DEFAULT 1,created TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS preferences(account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS tokens(hash TEXT PRIMARY KEY,kind TEXT NOT NULL,data TEXT NOT NULL,expires REAL NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires REAL NOT NULL);
CREATE TABLE IF NOT EXISTS leads(id TEXT PRIMARY KEY,municipality TEXT NOT NULL,day TEXT NOT NULL,address_key TEXT NOT NULL,data TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS leads_day ON leads(day DESC);
CREATE INDEX IF NOT EXISTS leads_address ON leads(address_key);
CREATE TABLE IF NOT EXISTS followups(account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,status TEXT NOT NULL DEFAULT 'nieuw',note TEXT NOT NULL DEFAULT '',assignee TEXT NOT NULL DEFAULT '',feedback TEXT,updated TEXT NOT NULL,PRIMARY KEY(account_id,lead_id));
CREATE TABLE IF NOT EXISTS deliveries(user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,sent TEXT NOT NULL,PRIMARY KEY(user_id,lead_id));
CREATE TABLE IF NOT EXISTS outbox(id TEXT PRIMARY KEY,kind TEXT NOT NULL,recipient TEXT NOT NULL,subject TEXT NOT NULL,body TEXT NOT NULL,data TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',created REAL NOT NULL,sent REAL,attempts INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS optouts(id TEXT PRIMARY KEY,kvk TEXT NOT NULL DEFAULT '',address TEXT NOT NULL DEFAULT '',email TEXT NOT NULL,status TEXT NOT NULL,created TEXT NOT NULL,address_key TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS cache(key TEXT PRIMARY KEY,data TEXT NOT NULL,expires REAL NOT NULL);
CREATE TABLE IF NOT EXISTS pending(id TEXT PRIMARY KEY,publication_id TEXT NOT NULL,municipality TEXT NOT NULL,created TEXT NOT NULL,reason TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS reports(municipality TEXT NOT NULL,day TEXT NOT NULL,publications INTEGER NOT NULL,leads INTEGER NOT NULL,errors INTEGER NOT NULL,zero_streak INTEGER NOT NULL,PRIMARY KEY(municipality,day));
CREATE TABLE IF NOT EXISTS checkpoints(municipality TEXT PRIMARY KEY,day TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS config(key TEXT PRIMARY KEY,data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS payments(id TEXT PRIMARY KEY,account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,status TEXT NOT NULL,amount TEXT NOT NULL,description TEXT NOT NULL,day TEXT NOT NULL,data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS ratelimits(key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires REAL NOT NULL);
CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY,user_id TEXT,action TEXT NOT NULL,object_id TEXT NOT NULL,created TEXT NOT NULL);
'''
def dumps(d): return json.dumps(d,ensure_ascii=False,separators=(',',':'))
def uid(): return secrets.token_hex(16)
def hashed(s): return hashlib.sha256(s.encode()).hexdigest()
@contextmanager
def db():
    Path(DB_PATH).parent.mkdir(parents=True,exist_ok=True)
    c=sqlite3.connect(DB_PATH,timeout=30);c.row_factory=sqlite3.Row;c.execute('PRAGMA foreign_keys=ON');c.execute('PRAGMA busy_timeout=30000')
    try: yield c;c.commit()
    except: c.rollback();raise
    finally:c.close()
def init():
    with db() as c:
        c.executescript(SCHEMA)
        c.execute('PRAGMA journal_mode=WAL')
        for k,v in dict(municipalities=[dict(name=n,active=True) for n in MUNICIPALITIES],keywords=KEYWORDS,weights=WEIGHTS).items(): c.execute('INSERT OR IGNORE INTO config VALUES(?,?)',(k,dumps(v)))
def config(c): return {r['key']:json.loads(r['data']) for r in c.execute('SELECT * FROM config')}
def issue_token(c,kind,data,seconds=900):
    t=secrets.token_urlsafe(32);c.execute('INSERT INTO tokens VALUES(?,?,?,?)',(hashed(t),kind,dumps(data),time.time()+seconds));return t
def consume_token(c,t,kind):
    c.execute('BEGIN IMMEDIATE')
    r=c.execute('SELECT * FROM tokens WHERE hash=? AND kind=? AND expires>?',(hashed(t),kind,time.time())).fetchone()
    if not r: raise ValueError('Deze link is verlopen of al gebruikt.')
    c.execute('DELETE FROM tokens WHERE hash=?',(hashed(t),));return json.loads(r['data'])
def outbox(c,recipient,subject,body,kind='system',data=None,key=None):
    key=key or uid();c.execute('INSERT OR IGNORE INTO outbox(id,kind,recipient,subject,body,data,created) VALUES(?,?,?,?,?,?,?)',(key,kind,recipient,subject,body,dumps(data or {}),time.time()));return key
def audit(c,user,action,obj):c.execute('INSERT INTO audit VALUES(?,?,?,?,?)',(uid(),user,action,obj,now().isoformat()))
def limited(c,key,limit=8,window=3600):
    key=hashed(key);t=time.time();r=c.execute('SELECT * FROM ratelimits WHERE key=?',(key,)).fetchone()
    if r and r['expires']>t and r['count']>=limit:raise ValueError('Te veel aanvragen. Probeer later opnieuw.')
    if not r or r['expires']<=t:c.execute('INSERT OR REPLACE INTO ratelimits VALUES(?,?,?)',(key,1,t+window))
    else:c.execute('UPDATE ratelimits SET count=count+1 WHERE key=?',(key,))
