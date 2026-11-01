# Offertewerkplaats voor installatiebedrijven

De extra pagina staat in `web/calculator.html`. De bestaande website linkt naar deze pagina via de website en de werkruimte. Het is een interne, lokaal opgeslagen demonstratie. De pagina publiceert geen klantdossiers, calculaties of catalogusprijzen naar GitHub.

## Gebruik

1. Open Offertewerkplaats en start een nieuwe opdracht of laad het fictieve kantoorvoorbeeld.
2. Geef per intakevraag antwoord. Het antwoord verschijnt in het opdrachtdossier. Via Aanpassen kun je elk gegeven corrigeren. Een correctie trekt de klantbevestiging en beide interne controles in.
3. Controleer de samenvatting met de klant en bevestig de ingevulde gegevens.
4. Voeg in Calculatie persoonsuren, producten, materiaal, onderaanneming, materieel en projectkosten toe. Alle prijzen zijn interne kostprijzen, zonder btw. De voorgeladen prijzen zijn voorbeelden.
5. Stel bij Configuratie de eigen kostencatalogus, overhead, risicoreserve, marge of opslag, korting, btw en capaciteit in.
6. Genereer bij Ontwerp en plan de conceptteksten uit het dossier. Werk het ontwerp en plan technisch uit, vul risico’s en afhankelijkheden aan en controleer de calculatie.
7. Leg de technische en financiële controle vast. Offerte / PDF opent de browserafdruk. Kies daar Opslaan als PDF. Zonder volledige controles wordt uitsluitend een concept aangeboden.
8. Exporteer een project als JSON om het te bewaren of over te dragen. Dit bestand bevat het gesprek en interne prijzen. Import trekt alle bevestigingen en controles in.

De catalogus gebruikt CSV met kopregel `name;category;unit;cost`. Toegestane kostensoorten zijn `labor`, `product`, `material`, `subcontract`, `equipment`, `project`. Personeel moet de eenheid `uur` gebruiken. Decimale komma’s, puntkomma’s en aangehaalde omschrijvingen worden ondersteund. Import vervangt de catalogus, niet de prijzen in bestaande calculaties.

## Gespreksrollen en volledigheid

De rollen vormen één proces met een gedeeld dossier. Frontoffice verzamelt de eerste vier gegevens. Accountmanager werkt de opdracht uit. Calculator treedt op zodra minimaal 95 van de 100 punten zijn bevestigd en ieder kritiek veld is bevestigd. Dit is een administratieve volledigheidsscore, geen statistische zekerheid of garantie voor een juist ontwerp.

| Gegeven | Gewicht | Kritiek |
| --- | ---: | --- |
| Installatiegebied | 8 | Ja |
| Opdrachtgever | 5 | Nee |
| Locatie | 5 | Nee |
| Pand en gebruik | 5 | Nee |
| Resultaat | 8 | Ja |
| Omvang en aantallen | 8 | Ja |
| Bestaande installatie | 10 | Ja |
| Bereikbaarheid | 6 | Nee |
| Technische randvoorwaarden | 10 | Ja |
| Planning | 5 | Nee |
| Budget | 4 | Nee |
| Afbakening en derden | 8 | Ja |
| Oplevering en acceptatie | 8 | Ja |
| Besluit en betaling | 5 | Nee |
| Onderbouwing | 5 | Nee |

De werkende standaardmodus is een gerichte intake met vaste vragen. Hij legt een antwoord vast bij de gestelde vraag en interpreteert geen vrije context als een taalmodel. Met gelabelde invoer zoals `scope: 24 armaturen; timing: november` kun je meerdere velden vastleggen. Dossierwijzigingen worden nooit automatisch door de klant bevestigd.

## AI aansluiten

Een vrije AI dialoog gebruikt de bestaande Python server. Er wordt geen sleutel in de openbare frontend opgeslagen.

1. Configureer `OPENAI_API_KEY` en `OPENAI_MODEL` als omgevingsvariabelen op de server. Kies een model met Responses en Structured Outputs waarvoor het eigen API account toegang heeft.
2. Gebruik de bestaande serverconfiguratie, HTTPS, CORS en accounts uit INSTALLATIE.md. Stel `web/config.js` in op de API URL. Een lege API URL laat de bestaande site en de offertewerkplaats in de lokale demo draaien.
3. Log in via Vergunningradar. De offertewerkplaats gebruikt dezelfde sessie uit sessionStorage.
4. Geef bij Configuratie toestemming om opdrachtgegevens via de backend naar de AI dienst te sturen. Kies AI verbinding testen.

`GET /calculator/capabilities` vereist een sessie en geeft alleen aan of de benodigde serverinstellingen aanwezig zijn. Dit is geen modelaanroep. Een echte providercontrole vindt pas plaats bij een chatbericht. `POST /calculator/chat` vereist daarnaast een schrijfbaar account. Het maximum is 30 aanvragen per gebruiker en 100 per account per uur. Quota wordt vóór de provideraanroep vastgelegd, ook bij een providerfout. Audit registreert uitsluitend het type handeling en het account, niet de gespreksinhoud.

De server gebruikt `https://api.openai.com/v1/responses`, `store: false` en een strikt JSON schema met alleen `reply` en voorgestelde tekstwijzigingen voor de vijftien opdrachtvelden. De server valideert uitvoer opnieuw. Het model kan geen kostprijzen wijzigen, bevestigingen geven of een offerte vrijgeven. De frontend voegt de calculatieregels niet toe aan de AI input. Wat iemand zelf in een gesprek of dossier typt wordt wel meegestuurd. Er wordt niet stilzwijgend naar de vaste intake overgeschakeld bij een AI fout.

Voor deze versie is geen live AI provider gebruikt. De API afhandeling is met gesimuleerde providerantwoorden getest. Er is geen API sleutel of modeltoegang aangemaakt en geen server uitgerold. Bron voor het API contract, [official OpenAI documentation, Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs).

## Rekenregels

Elke unitprijs wordt eerst naar eurocenten afgerond. Per regel wordt aantal maal die prijs afgerond. Decimale breuken worden met gehele getallen berekend, zodat binaire afronding geen halve cent verkeerd afhandelt. Alle kosten en verkoopbedragen in het resultaat zijn gehele eurocenten.

- Directe kosten zijn de som van de zes kostensoorten.
- Overhead is naar keuze een percentage over directe kosten, een percentage over personeelskosten, een eurobedrag per persoonsuur of een vast projectbedrag.
- Risicoreserve is een percentage over directe kosten plus overhead.
- Totale kostprijs is directe kosten plus overhead plus risicoreserve.
- Verkoop met doelmarge is kostprijs gedeeld door één minus het margepercentage. Verkoop met opslag is kostprijs maal één plus het opslagpercentage.
- Korting gaat van de berekende verkoopprijs af. De gerealiseerde marge wordt daarna opnieuw berekend.
- Eén projectbreed btw percentage wordt over de netto verkoopprijs berekend.
- Werkdagen zijn naar boven afgeronde persoonsuren gedeeld door ploeggrootte maal productieve uren per dag. Dit is geen ingeplande uitvoeringsduur met afhankelijkheden of levertijden.

## Grenzen van de demonstratie

Het ontwerp is een bewerkbaar functioneel concept. De app voert geen dimensionering, warmteverliesberekening, lichtberekening, kabelselectie of normtoets uit. De projecttekst moet door een vakbekwame installateur worden uitgewerkt en gecontroleerd.

Opslag staat in localStorage op het apparaat en is geen versleutelde, gescheiden opslag per medewerker of klant. Meerdere lokale projecten en de catalogus delen dezelfde browseropslag. Browsergegevens wissen verwijdert deze dossiers. Er zijn geen gebruikersrechten binnen de offertewerkplaats, centrale dossiers, leverancierkoppelingen, automatische prijsactualisering, documentuploads, ondertekening of definitief offertearchief. Offertevrijgave is een handmatige printactie, geen geregistreerde ondertekening of verzending.

Voor gebruik met echte klanten zijn een afgeschermd klantportaal, serveropslag per organisatie, formele revisiehistorie, actuele leverancierprijzen, documentverwerking en verdere vakinhoudelijke vraagbomen nog uit te werken. De klantafdruk verbergt interne kosten en het gesprek, maar een gedeelde interne werkruimte verbergt die gegevens niet.

## Verificatie

`npm test` voert bestaande regressietests en de nieuwe calculatie- en intakecontroles uit. De nieuwe tests controleren rekenregels, afronding, kritieke dossierpunten, import, intrekken van controles, authenticatie, alleen-lezen accounts, quota en gestructureerde providerantwoorden. `npm run build` kopieert alleen de openbare frontend naar dist. Browsercontrole dekt intake, voorbeeldopdracht, calculatie, configuratie en conceptdocumenten.
