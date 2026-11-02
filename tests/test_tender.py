import base64,json,os,unittest
from unittest.mock import patch,MagicMock
from backend import tender,server
from test_backend import Base

def data():
    return {'role':'contract','prompt':'Controleer de testverplichting.','meta':{k:'' for k in ('title','client','reference','url','deadline','location')},'prior':[],
        'documents':[{'id':'doc1','name':'bestek.txt','size':6,'version':'1','file_data':'data:text/plain;base64,'+base64.b64encode(b'bestek').decode()}]}
def result():return {'role':'contract','summary':'Beoordeeld','findings':[{'type':'requirement','title':'Testen','detail':'Testen vereist','critical':True,'sources':[{'document_id':'doc1','location':'1','quote':'bestek'}]}],'work_items':[],'design':'','plan':'','offer':''}

class TenderTests(unittest.TestCase):
    def test_bounded_documents_stripped_metadata_and_original_files(self):
        d=data();d['meta']['apiKey']='never-forward';body=tender.request_body(d,'user-model')
        self.assertFalse(body['store']);self.assertTrue(body['text']['format']['strict']);self.assertNotIn('never-forward',json.dumps(body));self.assertEqual(body['input'][0]['content'][1]['file_data'],d['documents'][0]['file_data'])
        for change in [{'size':100},{'file_data':'data:text/plain;base64,!!!!'},{'name':'bestek.exe'},{'name':'bestek.pdf','file_data':'data:application/pdf;base64,YmVzdGVr'}]:
            d=data();d['documents'][0].update(change)
            with self.assertRaises(ValueError):tender.request_body(d,'user-model')
    def test_result_rejects_unknown_sources_and_model_approvals(self):
        d=data();r=result();r['findings'][0]['sources'][0]['document_id']='invented'
        with self.assertRaises(ValueError):tender.validate_result(r,d['documents'],'contract')
        for extra in [{'confidence':.99},{'approved':True},{'price':100}]:
            with self.assertRaises(ValueError):tender.validate_result({**result(),**extra},d['documents'],'contract')
    def test_provider_transport_and_output_validation(self):
        response=MagicMock();response.__enter__.return_value.read.return_value=json.dumps({'status':'completed','output':[{'type':'message','content':[{'type':'output_text','text':json.dumps(result())}]}]}).encode()
        with patch.dict(os.environ,{'OPENAI_API_KEY':'test-only','OPENAI_MODEL':'user-model'}),patch('urllib.request.urlopen',return_value=response) as call:
            self.assertEqual(tender.analyze(data()),result());request=call.call_args.args[0];self.assertEqual(request.full_url,'https://api.openai.com/v1/responses');self.assertFalse(json.loads(request.data)['store'])
    def test_incomplete_output_never_returns_an_analysis(self):
        response=MagicMock();response.__enter__.return_value.read.return_value=b'{"status":"incomplete","output":[]}'
        with patch.dict(os.environ,{'OPENAI_API_KEY':'test-only','OPENAI_MODEL':'user-model'}),patch('urllib.request.urlopen',return_value=response):
            with self.assertRaises(ValueError):tender.analyze(data())

class TenderAuthTests(Base):
    def test_tender_uses_authentication_and_shared_api_budget(self):
        with patch.object(tender,'analyze',return_value=result()) as analyze:
            with self.assertRaises(server.HTTPError):server.dispatch('POST','/calculator/tender',data())
            analyze.assert_not_called();token=self.login()
            self.assertEqual(server.dispatch('POST','/calculator/tender',data(),'Bearer '+token),result())
            with server.db() as c:c.execute("UPDATE accounts SET trial_end='2020-01-01'")
            with self.assertRaises(server.HTTPError):server.dispatch('POST','/calculator/tender',data(),'Bearer '+token)
            self.assertEqual(analyze.call_count,1)
