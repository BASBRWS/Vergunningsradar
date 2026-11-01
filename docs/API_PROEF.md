# Werkende API-demo zonder publieke uitrol

Deze testversie staat op een aparte `api-proof/`-branch. De Pages-workflow reageert alleen op `main`. De API-proef maakt geen deployment en activeert geen klantendienst.

## Proberen

Open `proof/vergunningradar-api-demo.html` in een moderne browser. Dit is één compleet HTML-bestand. Het werkt zonder eigen server. Internet is nodig voor de openbare API-aanroepen.

Druk op **Start echte API-proef**. De standaardproef gebruikt drie bestaande Dordtse publicaties uit 2021 en 2025. De referentie laat de bronopvraging, BAG-controle, uitsluiting van een woonadres en afhandeling van een onduidelijke adresreeks zien. Het zijn archiefvoorbeelden, geen actuele leads. Je kunt ook zelf een gemeente en periode kiezen. Een lege actuele uitslag blijft leeg. Er worden geen fictieve projecten bijgeplaatst.

Bij **Projecten** open je het echte pand, de BAG-objecten, oppervlakte, bouwjaar, score en originele publicatie. Je kunt een kaart laden en statussen en notities lokaal opslaan. Alleen opvolging en een vrijwillig testprofiel worden in jouw browser bewaard. Ongecontroleerde adressen en ruwe publicatieteksten worden niet opgeslagen of geëxporteerd.

## KvK apart testen

De GitHub-proef roept de officiële KvK-testomgeving aan met de openbaar gedocumenteerde testsleutel. Het resultaat is opgenomen in de demo die je als workflow-artifact downloadt. Rechtstreeks vanuit de browser testen kan ook; CORS-beperkingen worden dan apart getoond en overschrijven het serverbewijs niet. Deze omgeving bevat fictieve bedrijven. Die worden nooit aan de echte vergunningadressen gekoppeld. Een fout, onleesbaar CORS-antwoord of ontbrekende testvestiging wordt zichtbaar gemeld. Er is geen terugval naar een verzonnen succes.

De geslaagde controle van 1 november 2026 heeft KvK Zoeken, Vestigingsprofiel en Basisprofiel werkelijk aangeroepen. Het rapport bevat de actuele status en responstijd per aanroep. Eerdere directe browserachtige aanvragen kregen een gatewayfout; daarom worden serverproef en browserproef gescheiden getoond. Een eigen testsleutel kan als GitHub Actions-secret `KVK_TEST_API_KEY` worden ingesteld. Die sleutel wordt nooit naar de HTML gekopieerd.

Een niet geslaagde test betekent niet dat op het echte pand geen bedrijf staat. De leadlijst zegt daarom **Niet opgehaald** en telt geen bedrijfspunten mee.

## Bewijs opnieuw uitvoeren via GitHub

De workflow **Technische API-proef, geen publicatie** start na een push op de testbranch. Hij voert bedrijfsregeltests uit, leest KOOP en BAG, probeert KvK-test en bewaart een geschoond JSON-rapport plus een downloadbare HTML-demo als artifact. Het artifact heeft een bewaartermijn van zeven dagen. Het is geen gepubliceerde website.

Een groene workflow bewijst alleen dat de verplichte KOOP/BAG-proef en regressies zijn geslaagd. De afzonderlijke KvK-status blijft in de samenvatting en het rapport staan, ook als die fout is. Mollie, e-mailbezorging en beveiligde klantaccounts zijn niet getest of geactiveerd.

Handmatig op een computer met Python en Node.

```sh
npm test
python3 -m backend.api_proof --output artifacts/api-proof.json
node scripts/build-api-demo.mjs --report artifacts/api-proof.json --output artifacts/Vergunningradar_API_demo.html
```

Open daarna `artifacts/Vergunningradar_API_demo.html`. Het bestand bevat een gedateerde momentopname en kan opnieuw echte browseraanroepen uitvoeren. De API-log toont responstijden en fouten. Adresvragen en sleutelheaders worden niet in het log opgenomen.

## Grenzen van het bewijs

De browserproef controleert maximaal 200 bronrecords en 40 adressen per run. Een begrensde selectie wordt als onvolledig aangeduid. Onbekende adresreeksen worden niet geraden. Geen dekkingclaim voor alle tien gemeenten, geen productieaccount en geen bezorg- of beschikbaarheidsgarantie.

Officiële documentatie van de openbare KvK-testsleutel en fictieve testdata.
https://developers.kvk.nl/nl/faq/apis?activeFaq=1
https://developers.kvk.nl/nl/documentation/testing/swagger-basisprofiel-api
