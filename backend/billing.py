"""Mollie: eerste betaling, mandaat, verlenging en geverifieerde webhooks."""
import calendar, json, os, re
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP
from .store import db,dumps,uid,hashed,outbox
from .domain import now,today
from .sources import fetch
BASE='https://api.mollie.com/v2'
def call(path,method='GET',data=None,key=None):
    secret=os.environ.get('MOLLIE_API_KEY','')
    if not secret:raise ValueError('Mollie is nog niet geconfigureerd.')
    headers={'Authorization':'Bearer '+secret,'Content-Type':'application/json','Accept':'application/json'}
    if key:headers['Idempotency-Key']=key
    raw=fetch(BASE+path,headers=headers,method=method,body=data)
    return json.loads(raw) if raw else {}
def price(interval):
    if interval not in ['monthly','annual']:raise ValueError('Ongeldige betaalperiode.')
    net=Decimal(os.environ.get('PRICE_MONTHLY','39.00'))*(12 if interval=='annual' else 1)
    gross=(net*(1+Decimal(os.environ.get('VAT_RATE','0.21')))).quantize(Decimal('0.01'),rounding=ROUND_HALF_UP)
    return str(net.quantize(Decimal('0.01'))),str(gross)
def add_period(day,interval):
    months=12 if interval=='annual' else 1
    m=day.month-1+months;year=day.year+m//12;month=m%12+1
    return date(year,month,min(day.day,calendar.monthrange(year,month)[1]))
def checkout(account,interval):
    if os.environ.get('BILLING_ENABLED')!='true':raise ValueError('Betaalde abonnementen zijn nog niet vrijgegeven.')
    _,gross=price(interval)
    with db() as c:a=dict(c.execute('SELECT * FROM accounts WHERE id=?',(account,)).fetchone())
    if a.get('subscription_id'):raise ValueError('Er is al een abonnement. Zeg dat eerst op voordat je een nieuw plan kiest.')
    customer=a.get('customer_id')
    if not customer:
        customer=call('/customers','POST',{'name':a['company']},key='customer-'+account)['id']
        with db() as c:c.execute('UPDATE accounts SET customer_id=? WHERE id=?',(customer,account))
    # Een lopende checkout opnieuw openen voorkomt meerdere eerste afschrijvingen.
    with db() as c:r=c.execute("SELECT data FROM payments WHERE account_id=? AND status IN ('open','pending') ORDER BY day DESC LIMIT 1",(account,)).fetchone()
    if r:
        prior=json.loads(r['data']);payment=call('/payments/'+prior['id'])
        if payment['status'] in ['open','pending'] and prior.get('metadata',{}).get('interval')==interval:return payment['_links']['checkout']['href']
        if payment['status'] in ['open','pending']:raise ValueError('Rond eerst je openstaande betaling af, of annuleer die bij Mollie.')
    key='checkout-'+account+'-'+interval+'-'+today()
    payment=call('/payments','POST',{'amount':{'currency':'EUR','value':gross},'description':'Vergunningradar Zakelijk, '+('jaar' if interval=='annual' else 'maand'),'customerId':customer,'sequenceType':'first','redirectUrl':os.environ['PUBLIC_WEB_URL'].rstrip('/')+'/#billing','webhookUrl':os.environ['PUBLIC_API_URL'].rstrip('/')+'/webhooks/mollie','metadata':{'account':account,'interval':interval}},key=key)
    with db() as c:c.execute('INSERT OR REPLACE INTO payments VALUES(?,?,?,?,?,?,?)',(payment['id'],account,payment['status'],gross,payment['description'],today(),dumps(payment)))
    return payment['_links']['checkout']['href']
def webhook(payment_id):
    if not re.fullmatch(r'tr_[A-Za-z0-9]+',payment_id):raise ValueError('Ongeldige betaling.')
    # Vertrouw nooit status, bedrag of account uit de webhookbody.
    p=call('/payments/'+payment_id);meta=p.get('metadata') or {};account=meta.get('account');interval=meta.get('interval')
    with db() as c:
        a=c.execute('SELECT * FROM accounts WHERE id=?',(account,)).fetchone() if account else None
        if not a and p.get('subscriptionId'):a=c.execute('SELECT * FROM accounts WHERE customer_id=? AND subscription_id=?',(p.get('customerId'),p['subscriptionId'])).fetchone()
        if not a:raise ValueError('Onbekende betaling.')
        a=dict(a);account=a['id'];interval=interval or a.get('interval')
        if p.get('customerId')!=a.get('customer_id'):raise ValueError('Betaling hoort niet bij deze klant.')
        _,expected=price(interval)
        if p.get('amount',{}).get('currency')!='EUR' or p.get('amount',{}).get('value')!=expected:raise ValueError('Betaling heeft een afwijkend bedrag. Handmatige controle nodig.')
        old=c.execute('SELECT status FROM payments WHERE id=?',(payment_id,)).fetchone()
        processed=old and old['status']=='paid'
        if p['status']=='paid' and not processed:
            start=max(date.fromisoformat(a['paid_until']) if a.get('paid_until') else date.today(),now().date())
            until=add_period(start,interval).isoformat()
            c.execute("UPDATE accounts SET status='active',paid_until=?,interval=?,cancelled_at=NULL WHERE id=?",(until,interval,account))
        c.execute('INSERT OR REPLACE INTO payments VALUES(?,?,?,?,?,?,?)',(p['id'],account,p['status'],p['amount']['value'],p.get('description','Vergunningradar'),p.get('createdAt',today())[:10],dumps(p)))
        if p['status'] in ['failed','canceled','expired']:
            owner=c.execute("SELECT email FROM users WHERE account_id=? AND role IN ('owner','admin') LIMIT 1",(account,)).fetchone()
            if owner:outbox(c,owner['email'],'Betaling niet gelukt','Controleer je betaling en abonnement in de webapp.','system',key='failed-'+payment_id)
    # Herhaalde webhooks herstellen ook een eerdere fout bij het aanmaken van de subscription.
    if p['status']=='paid' and p.get('sequenceType')=='first':
        with db() as c:a=dict(c.execute('SELECT * FROM accounts WHERE id=?',(account,)).fetchone())
        if not a.get('subscription_id') and not a.get('cancelled_at'):
            subscription=call('/customers/'+a['customer_id']+'/subscriptions','POST',{'amount':p['amount'],'interval':'12 months' if interval=='annual' else '1 month','startDate':a['paid_until'],'description':'Vergunningradar Zakelijk','webhookUrl':os.environ['PUBLIC_API_URL'].rstrip('/')+'/webhooks/mollie','metadata':{'account':account,'interval':interval}},key='subscription-'+payment_id)
            with db() as c:c.execute('UPDATE accounts SET subscription_id=? WHERE id=?',(subscription['id'],account))
def cancel(account):
    with db() as c:a=dict(c.execute('SELECT * FROM accounts WHERE id=?',(account,)).fetchone())
    if a.get('subscription_id'):call('/customers/'+a['customer_id']+'/subscriptions/'+a['subscription_id'],'DELETE')
    with db() as c:c.execute("UPDATE accounts SET subscription_id=NULL,status='cancelled',cancelled_at=? WHERE id=?",(now().isoformat(),account))
