import json,unittest
from unittest.mock import patch
from backend import tender
from test_tender import data,result

def evidence():return {'summary':'Testverplichting.','complete':True,'passages':[{'document_id':'doc1','location':'1','quote':'bestek','detail':'Testen vereist.','roles':['contract'],'critical':True}]}

class TenderBlockTests(unittest.TestCase):
    def test_extract_uses_one_source_and_small_output_contract(self):
        d={**data(),'stage':'extract','source_range':'tekens 1 tot en met 6'}
        body=tender.request_body(d,'model')
        self.assertEqual(body['max_output_tokens'],4000)
        self.assertEqual(body['text']['format']['name'],'tender_source_block')
        self.assertIn('source_range',body['input'][0]['content'][0]['text'])
        self.assertEqual(len(body['input'][0]['content']),2)
        with patch.object(tender.ai_provider,'configured',return_value=True),patch.object(tender.ai_provider,'complete',return_value=evidence()):self.assertEqual(tender.analyze(d),evidence())

    def test_review_uses_only_evidence_and_metadata_without_original_file_bytes(self):
        d={**data(),'stage':'review','source_range':'deel 1 van 1','evidence':evidence()['passages'],'notes':[]}
        del d['documents'][0]['file_data']
        body=tender.request_body(d,'model')
        self.assertEqual(body['max_output_tokens'],2800)
        self.assertEqual(len(body['input'][0]['content']),1)
        self.assertNotIn('file_data',json.dumps(body))
        with patch.object(tender.ai_provider,'configured',return_value=True),patch.object(tender.ai_provider,'complete',return_value=result()):self.assertEqual(tender.analyze(d),result())
        d['evidence'][0]['document_id']='fake'
        with self.assertRaises(ValueError):tender.request_body(d,'model')

    def test_block_schema_rejects_unknown_documents_and_overlarge_passage_lists(self):
        for change in [{'passages':evidence()['passages']*25},{'summary':'x'*501},{'approved':True}]:
            with self.assertRaises(ValueError):tender.validate_evidence({**evidence(),**change},data()['documents'])

    def test_review_requires_bounded_notes_and_valid_register(self):
        d={**data(),'stage':'review','source_range':'deel 1','evidence':[],'notes':[{'role':'contract','text':'x'*2401}]}
        with self.assertRaises(ValueError):tender.request_body(d,'model')
        d['notes']=[];d['documents'][0]['size']=0
        with self.assertRaises(ValueError):tender.request_body(d,'model')
