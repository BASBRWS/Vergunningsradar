import test from 'node:test';
import assert from 'node:assert/strict';
import { LiveClient, extractAddresses, cleanCompany, API_URLS } from '../web/api-client.js';

test('zaaknummer met koppeltekens blokkeert het echte adres niet',()=>{
 const title='Aanvraag vergunning voor het stucken aan gevel op de locatie Wieldrechtse Zeedijk 104 te Dordrecht zaaknummer Z-25-466568';
 assert.deepEqual(extractAddresses({title}),['Wieldrechtse Zeedijk 104']);
});
test('adresreeks wordt niet geraden, ook niet met een geldig zaaknummer',()=>{
 assert.deepEqual(extractAddresses({title:'Aanvraag vergunning op de locatie Octant 6 t/m 103 te Dordrecht zaaknummer Z-25-469416'}),[]);
});
test('meerdere gestructureerde postcode-huisnummerparen blijven gescheiden',()=>{
 assert.deepEqual(extractAddresses({postal:['1234AB 1','5678CD 2 A','1234AB 1'],title:''}),['1234AB 1','5678CD 2 A']);
});
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});}
function location(){return {response:{docs:[{gemeentenaam:'Dordrecht',straatnaam:'Testlaan',huisnummer:1,postcode:'1234AB'}]}};}
function vbo(use,id='one'){return {properties:{status:'Verblijfsobject in gebruik',gebruiksdoel:use,oppervlakte:300,identificatie:id,'pand.href':[API_URLS.bag+'/collections/pand/items/one']},geometry:{coordinates:[4.5,51.8]}};}
test('alle actuele objecten op het adres tellen mee voor de woonfunctiecontrole',async()=>{
 const responses=[location(),{features:[vbo('kantoorfunctie'),vbo('woonfunctie','two')]}];let calls=0;
 const client=new LiveClient({fetcher:async()=>json(responses[calls++])});
 assert.deepEqual(await client.resolve('Testlaan 1','Dordrecht'),{classification:'gemengd'});assert.equal(calls,2);
});
test('pandgegevens worden pas na de zakelijke classificatie opgehaald',async()=>{
 const responses=[location(),{features:[vbo('kantoorfunctie'),vbo('industriefunctie','two')]},{properties:{bouwjaar:1982}}];let calls=0;
 const client=new LiveClient({fetcher:async()=>json(responses[calls++])});
 const result=await client.resolve('Testlaan 1','Dordrecht');assert.equal(result.area,600);assert.equal(result.year,1982);assert.equal(calls,3);assert.equal(result.classification,'zakelijk');
});
test('onduidelijk geocode-resultaat geeft geen gok of lead',async()=>{
 const docs=location().response.docs;const client=new LiveClient({fetcher:async()=>json({response:{docs:[...docs,...docs]}})});
 assert.equal(await client.resolve('Testlaan 1','Dordrecht'),null);
});
test('foutstatus blijft fout en audit bevat geen queryadressen of sleutelheaders',async()=>{
 const client=new LiveClient({fetcher:async()=>json({},500)});
 await assert.rejects(client.request(API_URLS.location,{q:'Privéadres 10'},{headers:{apikey:'secret'}}),/HTTP 500/);
 assert.equal(client.calls[0].status,500);assert.equal(client.calls[0].ok,false);assert.ok(!JSON.stringify(client.calls).includes('Privéadres'));assert.ok(!JSON.stringify(client.calls).includes('secret'));
});
test('KvK-testuitvoer kopieert geen eigenaar- of contactgegevens',()=>{
 const c=cleanCompany({eersteHandelsnaam:'Test BV',telefoonnummer:'123',sbiActiviteiten:[]},{_embedded:{eigenaar:{naam:'Eigenaar privé',email:'privé@example.org',rechtsvorm:'BV'}}},'68750110');
 assert.equal(c.name,'Test BV');assert.ok(!JSON.stringify(c).includes('Eigenaar privé'));assert.ok(!JSON.stringify(c).includes('privé@example.org'));assert.equal(c.environment,'KVK test, fictieve gegevens');
});
