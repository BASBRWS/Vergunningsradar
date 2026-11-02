import json,os,unittest
from unittest.mock import patch,MagicMock
from backend import ai_provider,quotation_chat,tender,server
from test_backend import Base
from test_quotation_chat import input_data
from test_tender import data as tender_data,result as tender_result

ENV={'AI_PROVIDER':'anthropic','ANTHROPIC_API_KEY':'sk-ant-test-not-real','ANTHROPIC_MODEL':'user-claude-model','OPENAI_API_KEY':'do-not-use-openai-key','OPENAI_MODEL':'do-not-use-openai-model'}
def envelope(value):return {'type':'message','stop_reason':'end_turn','content':[{'type':'text','text':json.dumps(value)}]}
def mock_response(value):
    response=MagicMock();response.__enter__.return_value.read.return_value=json.dumps(value).encode();return response

class ClaudeTests(unittest.TestCase):
    def test_truncation_has_a_machine_readable_cause_and_never_accepts_partial_json(self):
        with self.assertRaises(ai_provider.AIResponseError) as error:ai_provider.parse_claude({**envelope(tender_result()),'stop_reason':'max_tokens'})
        self.assertEqual(error.exception.code,'AI_OUTPUT_LIMIT');self.assertEqual(error.exception.stop_reason,'max_tokens')
    def test_opus_review_uses_reasoning_room_and_reuses_static_prompts(self):
        d={**tender_data(),'stage':'review','source_range':'deel 1','evidence':[],'notes':[]}
        body=ai_provider.claude_body(tender.request_body(d,'claude-opus-5-5'))
        self.assertEqual(body['max_tokens'],6000);self.assertEqual(body['output_config']['effort'],'medium');self.assertEqual(body['system'][0]['cache_control'],{'type':'ephemeral'})
        d['answer_tokens']=12000;self.assertEqual(tender.request_body(d,'claude-opus-5-5')['max_output_tokens'],12000)
        d['answer_tokens']=1000000
        with self.assertRaises(ValueError):tender.request_body(d,'claude-opus-5-5')
    def test_configuration_selects_claude_without_fallback_or_secret_in_capabilities(self):
        with patch.dict(os.environ,ENV):
            self.assertTrue(quotation_chat.configured());self.assertEqual(ai_provider.model(),'user-claude-model')
            with patch.dict(os.environ,{'ANTHROPIC_API_KEY':''}):self.assertFalse(quotation_chat.configured())
            with patch.dict(os.environ,{'AI_PROVIDER':'evil'}):self.assertFalse(quotation_chat.configured())
    def test_real_intake_path_uses_messages_and_existing_validation(self):
        reply={'reply':'Waar staat de installatie?','next_field':'address','updates':[],'preparation':[]}
        with patch.dict(os.environ,ENV),patch('urllib.request.urlopen',return_value=mock_response(envelope(reply))) as call:
            self.assertEqual(quotation_chat.chat(input_data()),reply);req=call.call_args.args[0];body=json.loads(req.data)
            self.assertEqual(req.full_url,'https://api.anthropic.com/v1/messages');self.assertEqual(req.get_header('X-api-key'),ENV['ANTHROPIC_API_KEY']);self.assertEqual(req.get_header('Anthropic-version'),'2026-10-21');self.assertNotIn('do-not-use-openai-key',req.data.decode());self.assertEqual(body['model'],'user-claude-model');self.assertEqual(body['output_config']['format']['type'],'json_schema')
    def test_tender_uses_same_documents_and_schema_and_rejects_bad_sources(self):
        with patch.dict(os.environ,ENV),patch('urllib.request.urlopen',return_value=mock_response(envelope(tender_result()))) as call:
            self.assertEqual(tender.analyze(tender_data()),tender_result());body=json.loads(call.call_args.args[0].data);self.assertEqual(body['messages'][0]['content'][1]['source']['data'],'bestek')
        bad=tender_result();bad['findings'][0]['sources'][0]['document_id']='invented'
        with patch.dict(os.environ,ENV),patch('urllib.request.urlopen',return_value=mock_response(envelope(bad))):
            with self.assertRaises(ValueError):tender.analyze(tender_data())
    def test_unsupported_docx_is_blocked_before_a_provider_call(self):
        d=tender_data();d['documents'][0].update(name='bestek.docx',size=2,file_data='data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,UEs=')
        with patch.dict(os.environ,ENV),patch('urllib.request.urlopen') as call:
            with self.assertRaisesRegex(ValueError,'DOCX om naar PDF'):tender.analyze(d)
            call.assert_not_called()
    def test_refusal_and_token_limit_cannot_become_valid_answers(self):
        for stop in ['refusal','max_tokens','tool_use']:
            with patch.dict(os.environ,ENV),patch('urllib.request.urlopen',return_value=mock_response({**envelope({}),'stop_reason':stop})):
                with self.assertRaises(ValueError):quotation_chat.chat(input_data())

class ClaudeAuthTests(Base):
    def test_server_capabilities_expose_only_provider_and_model_not_keys(self):
        with patch.dict(os.environ,ENV):
            token=self.login();r=server.dispatch('GET','/calculator/capabilities',{},'Bearer '+token);self.assertEqual(r['provider'],'anthropic');self.assertEqual(r['model'],'user-claude-model');self.assertNotIn(ENV['ANTHROPIC_API_KEY'],json.dumps(r))
            with patch.object(ai_provider,'complete') as call:
                with self.assertRaises(server.HTTPError):server.dispatch('POST','/calculator/chat',input_data())
                call.assert_not_called()
