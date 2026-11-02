# Vergunningradar Zakelijk

Website, webapp en afzonderlijke server voor het functioneel ontwerp van 1 november 2026.

## Wat je nu kunt gebruiken

De GitHub Pages-website opent standaard als herkenbare demo. Zestien fictieve projecten, filters, leaddetails, score-uitleg, notities, statussen, feedback, CSV-export, onboarding, regio-instellingen, mailvoorbeeld, abonnementscherm, opt-outformulier en beheer zijn beschikbaar. Demogegevens blijven in de browser. Er wordt geen echte e-mail verstuurd, KvK-registratie getoond of betaling uitgevoerd. Bedrijfsnamen en adressen zijn fictief, de scores volgen wel de echte regels.

De productie-API staat in `backend/`. Deze werkt met SQLite, Python 3.13, SMTP en de officiële KOOP-, PDOK-, KvK- en Mollie-API's. Accounts en opvolggegevens worden niet gepubliceerd naar GitHub Pages. De repo bevat geen sleutels of productiegegevens.

## Offertewerkplaats voor installatiebedrijven

Open `calculator.html` via de link Offertewerkplaats op de website of in de werkruimte. De extra pagina bevat een gerichte klantintake, opdrachtdossier met bevestigingen, kostencatalogus met 12.437 bestaande fabrikantartikelen, 300 generieke voorbeeldartikelen en 35 materiaalgroepen, calculatie van uren en inkoop, overhead, risico, marge of opslag, korting en btw. Conceptontwerp, projectplan, offerteafdruk en projectexport werken lokaal. De volledigheidsscore van 95 procent is geen technische zekerheid. Voor een persoonlijke AI test kun je bij Configuratie jouw eigen OpenAI API sleutel en model invullen en rechtstreeks vanaf GitHub Pages testen. De sleutel blijft alleen in het tabbladgeheugen en wordt gewist bij verversen. Voor gedeeld klantgebruik is de serverstand met serverzijdige sleutel bedoeld. Er staat geen werkende sleutel in deze repository.

Naast de klantintake is er een afzonderlijk bestektraject. Kies Nieuwe opdracht en vervolgens TenderNed, bestek of contract. Voeg PDF, DOCX, TXT of MD toe. Contractmanager, E-specialist, W-specialist, werkvoorbereider, calculator en offertemanager voeren afzonderlijke beoordelingen uit met instelbare aanvullende prompts. Bronverwijzingen, eisen, open vragen, werkpostvoorstellen en een gezamenlijke offerteopzet moeten handmatig worden gecontroleerd. De pagina haalt geen stukken automatisch van TenderNed op.

Zie [docs/OFFERTEWERKPLAATS.md](docs/OFFERTEWERKPLAATS.md) voor gebruik, rekenregels en de grenzen van deze demo.

## Lokaal bekijken

```sh
python3 -m http.server 3000 --directory web
```

Open http://localhost:3000. Geen installatie, build of externe scripts nodig voor de frontend.

```sh
npm test
npm run build
```

De build kopieert alleen de openbare frontend naar `dist/`. Python-code en secrets worden nooit als Pages-artifact verpakt.

## GitHub Pages

De workflow `.github/workflows/pages.yml` test en publiceert na een push naar `main`. Als GitHub de eerste automatische activering niet toestaat, kies eenmalig bij Settings, Pages, Build and deployment, Source de optie **GitHub Actions**. Draai daarna de workflow opnieuw via Actions. De officiële repo-naam bevat een hoofdletter: `BASBRWS/Vergunningsradar`. Gebruik de URL die de deployment teruggeeft, inclusief `Vergunningsradar`.

## Productie aansluiten

Volg [docs/INSTALLATIE.md](docs/INSTALLATIE.md). Er zijn externe accounts, API-sleutels, een EU-server, een API-domein en een verzenddomein nodig. Dit is niet automatisch geactiveerd. GitHub Pages draait geen serverprocessen of geheime API-aanroepen.

De publieke instelling `web/config.js` bevat uitsluitend `apiBase`. Met een lege waarde draait de demo. Met jouw API-URL draait de app op echte accounts. Netwerkfouten schakelen nooit stilzwijgend terug naar fictieve data.

## Ontwerp en implementatie

- [Functionele dekking en open punten](docs/DEKKING.md).
- [Beveiliging, privacy en beheer](docs/BEHEER.md).
- Het aangeleverde functioneel ontwerp is de inhoudelijke basis. Het gekoppelde Claude-artifact was niet toegankelijk, daarom is geen onzichtbare inhoud uit dat architectuurplan verondersteld.

## Officiële brondocumentatie

- KOOP SRU 2.0, https://www.koopoverheid.nl/documenten/2021/02/09/handleiding-voor-het-uitvragen-van-de-collectie-officiele-publicaties.
- De oude lokale bekendmakingencollectie is uitgefaseerd. https://www.koopoverheid.nl/actueel/nieuws/2025/06/02/nieuwe-handleiding-sru-2.0-v1.4-beschikbaar.
- PDOK BAG OGC v2, https://api.pdok.nl/kadaster/bag/ogc/v2.
- PDOK Locatieserver, https://www.pdok.nl/introductie/-/article/pdok-locatieserver.
- KvK Zoeken, https://developers.kvk.nl/nl/documentation/zoeken-api.
- KvK Basisprofiel, https://developers.kvk.nl/nl/documentation/basisprofiel-api.
- Mollie, https://docs.mollie.com/reference/create-payment.
- GitHub Pages, https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages.


## Fabrikantcatalogus

De standaard selectie bevat 12.737 materiaal- en productartikelen, aangevuld met 11 bestaande personeels- en voorbeeldregels. De 12.437 fabrikantartikelen komen uit openbare bestanden van Wavin Nederland, Bals Nederland, Schneider Electric Nederland en Vasco. Daarin staan ook door Wavin gevoerde merken. Identiteiten en varianten zijn overgenomen uit bronregels, niet gegenereerd als combinaties van maten of vermogens. De 300 generieke voorbeeldartikelen blijven herkenbaar behouden.

Nieuwe fabrikantartikelen starten zonder netto inkoopprijs. De bruto bronprijs blijft apart zichtbaar. Jouw eigen prijs moet vóór offertevrijgave ingevuld en gecontroleerd worden. Dit is geen live voorraadkoppeling en geen volledige groothandelscatalogus. Bronbestand, bronregel, datum en waar beschikbaar EAN zijn zichtbaar per artikel.

Configuratie bevat zoeken op fabrikantnummer, EAN of omschrijving, filters op merk, vakgebied, productgroep en prijsstatus, en paginering met 50 regels. Er is ruimte voor 20.000 catalogusartikelen en CSV import tot 10 MB. De bestaande limiet van 500 calculatieregels per offerte blijft gelden. Alleen eigen wijzigingen en verwijderingen worden naast projecten in browseropslag bewaard. De standaard bronselectie staat in de websitebestanden.

Bronregister met downloadlinks, controledatum en SHA-256 staat in `web/catalog-sources.json`. De import is reproduceerbaar met `python3 scripts/build-professional-catalog.py --cache /tmp/catalog-sources` en daarna `node scripts/export-catalog.mjs`. Controleer veranderde bronbestanden en tests vóór publicatie. De oorspronkelijke fabrikantbestanden worden niet in deze repository opgenomen.
