import unittest,tempfile,os,json,time
from datetime import date,timedelta
from unittest.mock import patch
from backend import store,domain,sources,billing,jobs,server
class Base(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.old=store.DB_PATH;store.DB_PATH=self.tmp.name+'/test.sqlite';store.init()
  self.env=patch.dict(os.environ,{'SMTP_HOST':'smtp.example.invalid','PUBLIC_WEB_URL':'https://example.org','ADMIN_EMAIL':'admin@example.org'},clear=False);self.env.start()
 def tearDown(self):store.DB_PATH=self.old;self.tmp.cleanup();self.env.stop()
 def login(self,email='a@example.org'):
  server.dispatch('POST','/auth/request',{'email':email,'signup':True,'company':'Test BV','preferences':domain.DEFAULT_PREFS})
  with store.db() as c:
   r=c.execute('SELECT body FROM outbox WHERE recipient=? ORDER BY created DESC LIMIT 1',(email,)).fetchone();token=r['body'].split('token=')[1].split('\n')[0]
  return server.dispatch('POST','/auth/verify',{'token':token})['token']
 def lead(self,id='one'):
  l=dict(id=id,address='Testlaan 1',postcode='1234AB',municipality='Delft',date=domain.today(),classification='zakelijk',uses=['kantoorfunctie'],companies=[dict(name='Voorbeeld BV',legalForm='BV',kvk='12345678')],summary='gevel renovatie',area=600,year=1980,type='aanvraag',kvkDate=domain.today(),sourceUrl='https://zoek.officielebekendmakingen.nl/gmb-2026-1.html');l.update(domain.score_lead(l))
  with store.db() as c:c.execute('INSERT INTO leads VALUES(?,?,?,?,?)',(id,'Delft',l['date'],jobs.address_key(l),store.dumps(l)))
  return l
class DomainTests(Base):
 def test_classification(self):
  for uses,result in [([], 'onbekend'),(['woonfunctie'],'particulier'),(['woonfunctie','industriefunctie'],'gemengd'),(['onderwijsfunctie'],'maatschappelijk'),(['kantoorfunctie'],'zakelijk'),(['onbekende functie'],'onbekend')]:self.assertEqual(domain.classify(uses),result)
 def test_scores(self):
  l=self.lead();self.assertEqual(l['score'],100);l['year']=0;self.assertEqual(domain.score_lead(l)['score'],90);l['companies'][0]['legalForm']='VOF';self.assertEqual(domain.score_lead(l)['score'],80)
 def test_monday_and_dst_windows(self):
  self.assertEqual(domain.publication_window(date(2026,11,2)),(date(2026,10,30),date(2026,11,1)));self.assertEqual(domain.publication_window(date(2026,3,30)),(date(2026,3,27),date(2026,3,29)))
 def test_month_periods(self):self.assertEqual(billing.add_period(date(2026,1,31),'monthly'),date(2026,2,28));self.assertEqual(billing.add_period(date(2024,2,29),'annual'),date(2025,2,28))
 def test_preferences(self):
  with self.assertRaises(ValueError):domain.validate_prefs({**domain.DEFAULT_PREFS,'minScore':101})
  with self.assertRaises(ValueError):domain.validate_prefs({**domain.DEFAULT_PREFS,'municipalities':[]})
 def test_address_ranges_are_not_guessed(self):self.assertEqual(sources.address_queries({'title':'Verbouwing Testlaan 1 t/m 10'}),[])
 def test_public_output_has_allowlist(self):
  l=self.lead();l['ownerEmail']='private@example.org';self.assertNotIn('ownerEmail',domain.public_lead(l));self.assertNotIn('companies',domain.public_lead(l))
class AuthTests(Base):
 def test_magic_token_single_use_and_hashed_storage(self):
  token=self.login();self.assertTrue(server.dispatch('GET','/me',{},'Bearer '+token)['email']=='a@example.org')
  with store.db() as c:self.assertFalse(c.execute('SELECT 1 FROM sessions WHERE hash=?',(token,)).fetchone())
  with self.assertRaises(ValueError):server.dispatch('POST','/auth/verify',{'token':'wrong'})
 def test_expired_tokens(self):
  with store.db() as c:t=store.issue_token(c,'login',{},seconds=-1)
  with self.assertRaises(ValueError):server.dispatch('POST','/auth/verify',{'token':t})
 def test_followups_account_isolation(self):
  a=self.login('a@example.org');b=self.login('b@example.org');self.lead()
  server.dispatch('PATCH','/leads/one',{'status':'offerte','note':'Account A'},'Bearer '+a)
  self.assertEqual(server.dispatch('GET','/leads',{},'Bearer '+b)[0]['note'],'')
  self.assertEqual(server.dispatch('GET','/leads',{},'Bearer '+a)[0]['note'],'Account A')
 def test_admin_guard(self):
  t=self.login()
  with self.assertRaises(server.HTTPError) as cm:server.dispatch('GET','/admin',{},'Bearer '+t)
  self.assertEqual(cm.exception.status,403)
 def test_read_only_trial(self):
  t=self.login();self.lead()
  with store.db() as c:c.execute("UPDATE accounts SET trial_end='2000-01-01'")
  with self.assertRaises(server.HTTPError):server.dispatch('PATCH','/leads/one',{'status':'offerte'},'Bearer '+t)
  self.assertEqual(len(server.dispatch('GET','/leads',{},'Bearer '+t)),1)
 def test_cross_account_assignment_denied(self):
  a=self.login();self.login('b@example.org');self.lead()
  with self.assertRaises(ValueError):server.dispatch('PATCH','/leads/one',{'assignee':'b@example.org'},'Bearer '+a)
 def test_invalid_status_and_oversized_note(self):
  t=self.login();self.lead()
  for body in [{'status':'superadmin'},{'note':'x'*4001},{'score':100}]:
   with self.assertRaises(ValueError):server.dispatch('PATCH','/leads/one',body,'Bearer '+t)
 def test_invite_does_not_move_existing_user(self):
  t=self.login();self.login('b@example.org')
  with self.assertRaises(ValueError):server.dispatch('POST','/members/invite',{'email':'b@example.org'},'Bearer '+t)
 def test_rate_limit(self):
  with store.db() as c:
   store.limited(c,'test',1)
   with self.assertRaises(ValueError):store.limited(c,'test',1)
class PrivacyTests(Base):
 def test_residential_never_persisted(self):
  with patch.object(sources,'companies') as kvk:
   self.assertFalse(jobs.persist_lead({},'Delft',{'classification':'particulier'}));kvk.assert_not_called()
  with store.db() as c:self.assertEqual(c.execute('SELECT count(*) FROM leads').fetchone()[0],0)
 def test_pending_only_contains_references(self):
  with store.db() as c:
   jobs.queue(c,{'id':'gmb-2026-1','title':'Privépersoon op Geheimlaan 1'},'Delft','Geen match')
   r=dict(c.execute('SELECT * FROM pending').fetchone());self.assertNotIn('Geheimlaan',str(r))
 def test_optout_deletes_existing_and_followups(self):
  t=self.login('admin@example.org');self.lead();server.dispatch('PATCH','/leads/one',{'note':'notitie'},'Bearer '+t)
  with store.db() as c:c.execute('INSERT INTO optouts VALUES(?,?,?,?,?,?,?)',('out','12345678','','user@example.org','confirmed',domain.today(),''))
  self.assertEqual(server.dispatch('POST','/admin/optouts/out',{},'Bearer '+t)['removed'],1)
  with store.db() as c:self.assertEqual(c.execute('SELECT count(*) FROM followups').fetchone()[0],0)
  self.assertEqual(server.dispatch('GET','/public/week',{}),[])
 def test_expired_kvk_removed_from_read_path(self):
  t=self.login();l=self.lead();l['kvkDate']='2000-01-01'
  with store.db() as c:c.execute('UPDATE leads SET data=?',(store.dumps(l),))
  self.assertEqual(server.dispatch('GET','/leads',{},'Bearer '+t)[0]['companies'],[])
 def test_forged_webhook_not_trusted(self):
  with patch.object(billing,'call',return_value={'id':'tr_fake','status':'paid','metadata':{'account':'nonexistent'}}):
   with self.assertRaises(ValueError):billing.webhook('tr_fake')
 def test_ingest_missing_key_fails_before_fetch(self):
  with patch.dict(os.environ,{'KVK_API_KEY':''}),patch.object(sources,'publications') as source:
   with self.assertRaises(RuntimeError):jobs.ingest()
   source.assert_not_called()
 def test_unknown_address_is_not_a_lead(self):
  with patch.object(sources,'resolve_address',return_value=None):jobs.process_publication({'id':'gmb-2026-1','title':'Verbouwen Testlaan 1'},'Delft')
  with store.db() as c:self.assertEqual(c.execute('SELECT count(*) FROM leads').fetchone()[0],0)
if __name__=='__main__':unittest.main()
