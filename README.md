# Vergunningradar Zakelijk

Website, webapp en afzonderlijke server voor het functioneel ontwerp van 1 november 2026.

## Wat je nu kunt gebruiken

De GitHub Pages-website opent standaard als herkenbare demo. Zestien fictieve projecten, filters, leaddetails, score-uitleg, notities, statussen, feedback, CSV-export, onboarding, regio-instellingen, mailvoorbeeld, abonnementscherm, opt-outformulier en beheer zijn beschikbaar. Demogegevens blijven in de browser. Er wordt geen echte e-mail verstuurd, KvK-registratie getoond of betaling uitgevoerd. Bedrijfsnamen en adressen zijn fictief, de scores volgen wel de echte regels.

De productie-API staat in `backend/`. Deze werkt met SQLite, Python 3.13, SMTP en de officiële KOOP-, PDOK-, KvK- en Mollie-API's. Accounts en opvolggegevens worden niet gepubliceerd naar GitHub Pages. De repo bevat geen sleutels of productiegegevens.

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

## Technische API-proef zonder uitrol

De aparte `api-proof/`-branch bevat een downloadbare, zelfstandige browserdemo met echte KOOP- en BAG-aanroepen. De officiële KvK-test wordt ook via GitHub Actions uitgevoerd. Deze workflow publiceert niets naar Pages. Zie [docs/API_PROEF.md](docs/API_PROEF.md).
