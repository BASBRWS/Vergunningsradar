"""Leest echte API's, schrijft uitsluitend een begrensd en geschoond bewijsrapport.
Geen accounts, betalingen, e-mailverzending of productie-KvK. Geschikt voor Actions.
"""
import json,os,time,urllib.error,urllib.parse,argparse
from pathlib import Path
from unittest.mock import patch
from . import sources
from .domain import now,score_lead
PUBLIC_TEST_KEY='l7xx1f2691f2520d487b902f4e0b57a0b197'
REFERENCES=['gmb-2021-160445','gmb-2025-383923','gmb-2025-383004']

def run_proof():
    traces=[];original=sources.fetch
    def traced(url,params=None,headers=None,method='GET',body=None):
        start=time.perf_counter();r=dict(service='KVK-test' if 'api.kvk.nl' in url else 'KOOP' if 'repository.overheid' in url else 'PDOK',endpoint=url.split('?')[0],status=None,ok=False,at=now().isoformat(),message='')
        try:
            raw=original(url,params,headers,method,body);r.update(status=200,ok=True);return raw
        except urllib.error.HTTPError as exc:
            r.update(status=exc.code,message='De API gaf HTTP '+str(exc.code)+'.')
            if 'api.kvk.nl' in url:
                body=exc.read(2048).decode(errors='replace')
                if 'Policy Falsified' in body:r['message']+=' Gatewayantwoord, Policy Falsified.'
            raise
        except Exception as exc:r['message']=type(exc).__name__;raise
        finally:r['durationMs']=round((time.perf_counter()-start)*1000);traces.append(r)
    result=dict(generatedAt=now().isoformat(),sourceMode='reference',municipality='Dordrecht',from_='',to='',sourceCount=0,publicationCount=0,residential=0,mixed=0,unknown=0,errors=0,checkedAddresses=0,pendingPublications=0,addressLimit=40,truncated=False,leads=[],traces=[])
    result['from']=result.pop('from_')
    kvk=dict(status='not-run',at=now().isoformat(),traces=[],linkedToRealAddress=False)
    with patch.object(sources,'fetch',traced):
        for id in REFERENCES:
            raw=sources.fetch(sources.SRU,{'version':'2.0','operation':'searchRetrieve','query':f'dt.identifier=="{id}"','maximumRecords':1})
            if b'<!DOCTYPE' in raw or b'<!ENTITY' in raw:raise RuntimeError('Onveilige XML')
            root=sources.ET.fromstring(raw)
            if sources.local(root.tag)!='searchRetrieveResponse':raise RuntimeError('Ongeldig SRU-antwoord')
            records=[x for x in root.iter() if sources.local(x.tag)=='record'];result['sourceCount']+=len(records)
            for record in records:
                p=sources.parse_record(record);result['publicationCount']+=1;queries=sources.address_queries(p)
                if not queries:result['pendingPublications']+=1;continue
                for q in queries:
                    result['checkedAddresses']+=1
                    try:b=sources.resolve_address(q,'Dordrecht')
                    except Exception:result['errors']+=1;continue
                    if not b or b['classification']=='onbekend':result['unknown']+=1;continue
                    if b['classification']=='particulier':result['residential']+=1;continue
                    if b['classification']=='gemengd':result['mixed']+=1;continue
                    lead={k:v for k,v in b.items() if k not in ['street','number','letter','addition','city']}
                    lead.update(id=p['id']+'|'+ '-'.join(b['bagIds']),publicationId=p['id'],date=p['date'],summary=p['summary'],sourceUrl=p['sourceUrl'],type='besluit' if __import__('re').search('verleen|geweiger|besluit|intrekk',p['title'],__import__('re').I) else 'aanvraag',companies=[],kvkDate='',companyState='not-tested-for-this-address',status='nieuw',note='')
                    lead.update(score_lead(lead));result['leads'].append(lead)
        result['traces']=[dict(r) for r in traces];start=len(traces)
        try:
            key=os.environ.get('KVK_TEST_API_KEY') or PUBLIC_TEST_KEY
            base='https://api.kvk.nl/test/api';headers={'apikey':key}
            search=sources.get_json(base+'/v2/zoeken',{'kvkNummer':'68750110'},headers)
            item=next((r for r in search.get('resultaten',[]) if r.get('kvkNummer')=='68750110' and r.get('vestigingsnummer')),None)
            if not item:raise ValueError('Testvestiging ontbreekt')
            profile=sources.get_json(base+'/v1/vestigingsprofielen/'+item['vestigingsnummer'],headers=headers)
            basis=sources.get_json(base+'/v1/basisprofielen/68750110',headers=headers)
            kvk.update(status='ok',company={'name':profile.get('eersteHandelsnaam',''),'kvk':'68750110','legalForm':basis.get('_embedded',{}).get('eigenaar',{}).get('rechtsvorm',''),'sbi':'; '.join(str(x.get('sbiCode','')) for x in profile.get('sbiActiviteiten',[])),'environment':'KVK test, fictieve gegevens'})
        except Exception as exc:
            kvk.update(status='error',message='De officiële KvK-test is niet geslaagd. '+(traces[-1]['message'] if len(traces)>start else type(exc).__name__),serverStatus=traces[-1]['status'] if len(traces)>start else None)
        kvk['traces']=[dict(r) for r in traces[start:]]
    return {'pipeline':result,'kvk':kvk,'scope':{'accounts':'not-tested','mail':'preview-only','mollie':'not-configured','productionKvk':'not-tested'}}

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--output',default='artifacts/api-proof.json');args=parser.parse_args()
    report=run_proof();path=Path(args.output);path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(report,ensure_ascii=False,indent=2))
    p=report['pipeline'];print(json.dumps({'publications':p['publicationCount'],'businessLeads':len(p['leads']),'residentialExcluded':p['residential']+p['mixed'],'pending':p['pendingPublications']+p['unknown'],'errors':p['errors'],'kvkTest':report['kvk']['status'],'kvkHttpStatus':report['kvk'].get('serverStatus'),'report':str(path)}))
    if not p['leads'] or p['errors']:raise SystemExit('KOOP/BAG-proef niet volledig geslaagd. Bekijk het rapport.')
if __name__=='__main__':main()
