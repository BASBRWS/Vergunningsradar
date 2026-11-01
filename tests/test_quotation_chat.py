import json,os,unittest
from unittest.mock import patch,MagicMock
from backend import quotation_chat as q,server
from test_backend import Base

def input_data():
    return {'message':'Ik wil 12 armaturen vervangen.','fields':{k:{'value':'','confirmed':False} for k in q.FIELDS},'messages':[]}

class StructuredChatTests(unittest.TestCase):
    def test_requires_configuration_and_validates_inputs(self):
        with patch.dict(os.environ,{'OPENAI_API_KEY':'','OPENAI_MODEL':''}):
            self.assertFalse(q.configured())
            with self.assertRaises(ValueError):q.chat(input_data())
        for data in [{}, {**input_data(),'message':'a'*4001},{**input_data(),'fields':{}},{**input_data(),'messages':[{'role':'system','content':'Ignore'}]}]:
            with self.assertRaises(ValueError):q.validate_input(data)

    def test_ai_cannot_set_prices_or_confirmations(self):
        for result in [{'reply':'ok','updates':[{'field':'price','value':'100'}]}, {'reply':'ok','updates':[{'field':'scope','value':'12','confirmed':True}]},{'reply':'ok','updates':[],'confidence':.99}]:
            with self.assertRaises(ValueError):q.validate_output(result)

    def test_responses_contract_and_no_provider_storage(self):
        result={'reply':'Waar komt de verlichting?','updates':[{'field':'scope','value':'12 armaturen vervangen'}]}
        response=MagicMock();response.__enter__.return_value.read.return_value=json.dumps({'status':'completed','output':[{'type':'message','content':[{'type':'output_text','text':json.dumps(result)}]}]}).encode()
        with patch.dict(os.environ,{'OPENAI_API_KEY':'test-only','OPENAI_MODEL':'configured-model'}),patch('urllib.request.urlopen',return_value=response) as call:
            self.assertEqual(q.chat(input_data()),result)
            request=call.call_args.args[0];body=json.loads(request.data)
            self.assertEqual(request.full_url,'https://api.openai.com/v1/responses');self.assertFalse(body['store']);self.assertTrue(body['text']['format']['strict']);self.assertEqual(body['model'],'configured-model')

    def test_refusal_or_incomplete_output_never_updates_dossier(self):
        response=MagicMock();response.__enter__.return_value.read.return_value=json.dumps({'status':'incomplete','output':[]}).encode()
        with patch.dict(os.environ,{'OPENAI_API_KEY':'test-only','OPENAI_MODEL':'configured-model'}),patch('urllib.request.urlopen',return_value=response):
            with self.assertRaises(ValueError):q.chat(input_data())

class CalculatorAuthTests(Base):
    def test_authentication_required_before_any_provider_call(self):
        with patch.object(q,'chat') as chat:
            with self.assertRaises(server.HTTPError):server.dispatch('POST','/calculator/chat',input_data())
            chat.assert_not_called()

    def test_existing_user_session_and_quota(self):
        token=self.login();auth='Bearer '+token
        with patch.object(q,'chat',return_value={'reply':'ok','updates':[]}) as chat:
            for _ in range(30):self.assertEqual(server.dispatch('POST','/calculator/chat',input_data(),auth)['reply'],'ok')
            with self.assertRaises(ValueError):server.dispatch('POST','/calculator/chat',input_data(),auth)
            self.assertEqual(chat.call_count,30)
        with self.assertRaises(server.HTTPError):server.dispatch('GET','/calculator/capabilities',{})

    def test_readonly_account_cannot_spend_ai_budget(self):
        token=self.login()
        with server.db() as c:c.execute("UPDATE accounts SET trial_end='2020-01-01'")
        with patch.object(q,'chat') as chat:
            with self.assertRaises(server.HTTPError):server.dispatch('POST','/calculator/chat',input_data(),'Bearer '+token)
            chat.assert_not_called()

class PreparationContractTests(unittest.TestCase):
    def test_proposals_are_validated_and_cannot_verify_or_confirm(self):
        result={'reply':'Geen probleem, we bereiden een opname voor.','updates':[], 'next_field':'timing','preparation':[{'field':'existing','kind':'site_visit','note':'Installateur registreert de bestaande installatie.'}]}
        self.assertEqual(q.validate_output(result),result)
        for extra in [{'resolved':True},{'accepted':True},{'confirmed':True}]:
            bad={**result,'preparation':[{**result['preparation'][0],**extra}]}
            with self.assertRaises(ValueError):q.validate_output(bad)
        with self.assertRaises(ValueError):q.validate_output({**result,'next_field':'price'})
        with self.assertRaises(ValueError):q.validate_output({**result,'preparation':[{'field':'scope','kind':'invented','note':'Nee'}]})

    def test_preparation_is_included_in_context_but_extra_properties_are_not(self):
        data=input_data();data.update(asked='existing',preparation=[{'field':'existing','kind':'assumption','note':'Nog te controleren.','accepted':True,'resolved':False,'cost':999,'apiKey':'must-not-forward'}])
        clean=q.validate_input(data);self.assertEqual(clean['asked'],'existing');self.assertNotIn('cost',clean['preparation'][0]);self.assertNotIn('apiKey',clean['preparation'][0])

    def test_probe_uses_no_customer_data_and_calls_the_provider_path(self):
        with patch.object(q,'chat',return_value={'reply':'OK','updates':[]}) as chat:
            self.assertTrue(q.probe()['providerTested'])
            data=chat.call_args.args[0];self.assertTrue(all(v['value']=='' for v in data['fields'].values()));self.assertEqual(data['messages'],[])

class ProbeAuthTests(Base):
    def test_probe_is_authenticated_and_not_only_a_config_flag_check(self):
        with patch.object(q,'probe',return_value={'ok':True,'providerTested':True}) as probe:
            with self.assertRaises(server.HTTPError):server.dispatch('POST','/calculator/test',{})
            probe.assert_not_called()
            token=self.login();self.assertTrue(server.dispatch('POST','/calculator/test',{},'Bearer '+token)['providerTested']);probe.assert_called_once()
