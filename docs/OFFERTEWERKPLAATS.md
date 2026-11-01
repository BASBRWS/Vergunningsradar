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

De catalogus bevat 300 extra generieke installatieproducten, naast de bestaande voorbeeldposten voor personeel en kosten. De tien productgroepen hebben elk dertig artikelen. Kabels en bedrading, schakelmateriaal en beveiliging, buis en kabelgeleiding, verlichting en regeling, waterleidingen en koppelingen, sanitair en afvoer, verwarming en appendages, warmtepomp en koeling, ventilatie en luchtkanalen, bevestiging en isolatie. Artikelcodes zijn interne democodes, geen leveranciercodes. Alle nieuwe kostprijzen zijn bewerkbare, fictieve voorbeeldprijzen exclusief btw, geen gecontroleerde marktprijzen. Specificaties zijn omschrijvingen voor een startcatalogus, geen bewijs van onderlinge compatibiliteit of geschiktheid voor een installatie.

Zoek bij Calculatie of Configuratie op naam, artikelcode en maat, of kies een productgroep. De knop Materiaallijst 300 CSV downloadt de complete productlijst. Bij een bestaande browseropslag worden de ontbrekende artikelen één keer toegevoegd. Bestaande prijzen, eigen artikelen en al gemaakte calculaties blijven behouden. Via 300 producten aanvullen kun je verwijderde voorbeeldartikelen terugzetten. De toevoeging wordt geweigerd als die de limiet van 500 catalogusregels overschrijdt; bestaande inhoud wordt dan niet overschreven.

De catalogus gebruikt CSV met verplichte kolommen `name;category;unit;cost` en optionele kolommen `code`, `group` en `priceType`. De export bevat deze metadata. Toegestane kostensoorten zijn `labor`, `product`, `material`, `subcontract`, `equipment`, `project`. Personeel moet de eenheid `uur` gebruiken. Decimale komma’s, puntkomma’s en aangehaalde omschrijvingen worden ondersteund. Import vervangt de catalogus, niet de prijzen in bestaande calculaties. Artikelen die via CSV met hun artikelcodes worden geïmporteerd worden niet opnieuw als pakket toegevoegd. Artikelcode en groep blijven bewaard bij projectexport en import. Een handmatig gewijzigde kostprijs wordt als eigen prijs gemarkeerd.

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

`GET /calculator/capabilities` vereist een sessie en geeft alleen aan of de benodigde serverinstellingen aanwezig zijn. Dit is geen modelaanroep. De knop AI verbinding testen voert daarna `POST /calculator/test` uit. Die route doet een echte modelaanroep met een generiek controlebericht, zonder klantgegevens. Pas na een geslaagd modelantwoord meldt de frontend dat de AI dienst is getest. Toestemming voor het klantgesprek staat daar los van. Zonder serveradres meldt de pagina dat de AI nog niet is aangesloten, zonder een netwerkverzoek te proberen. `POST /calculator/chat` vereist daarnaast een schrijfbaar account. Het maximum is 30 aanvragen per gebruiker en 100 per account per uur. Quota wordt vóór de provideraanroep vastgelegd, ook bij een providerfout. Audit registreert uitsluitend het type handeling en het account, niet de gespreksinhoud.

De server gebruikt `https://api.openai.com/v1/responses`, `store: false` en een strikt JSON schema met `reply`, voorgestelde tekstwijzigingen voor de vijftien opdrachtvelden, `next_field` en voorgestelde `preparation` acties. Die acties mogen alleen een veld, type en notitie voorstellen, geen klantakkoord of verificatie. De server valideert uitvoer opnieuw. Het model kan geen kostprijzen wijzigen, bevestigingen geven of een offerte vrijgeven. De frontend voegt de calculatieregels niet toe aan de AI input. Wat iemand zelf in een gesprek of dossier typt wordt wel meegestuurd. Er wordt niet stilzwijgend naar de vaste intake overgeschakeld bij een AI fout.

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

## Omgaan met onbekende gegevens

De begeleide intake herkent uitspraken zoals ik weet het vermogen niet of geen idee. Eerst stelt hij één eenvoudigere vraag over wat de klant kan zien of wil bereiken. Blijft het onbekend, dan wordt het punt geparkeerd voor navraag of een locatieopname en gaat de intake verder. De klant kan ook direct Aanname voorstellen, Opname voorbereiden of Vraag parkeren kiezen. Dezelfde vraag wordt niet eindeloos herhaald.

Het tabblad Voorbereiding bewaart per punt het opdrachtveld, de actie, de verantwoordelijke, een gewenste datum en de gecontroleerde uitkomst. De datum is een voorbereidingsvoorkeur, geen boeking. Opname-uren en reiskosten worden niet automatisch aan de calculatie toegevoegd. Het opnameplan is als PDF af te drukken. De acties komen ook in conceptontwerp, projectplan en klantofferte terecht.

Aannames zijn expliciete voorstellen zonder verzonnen vermogens, aantallen of veiligheidsconclusies. De klant kan een voorlopig uitgangspunt accepteren. Dat is geen verificatie en levert geen bevestigingspunten op. Een open voorbereidingspunt blijft de definitieve offerte blokkeren. Na navraag of opname legt de installateur de concrete uitkomst vast via Uitkomst vastleggen en verifiëren. Het bijbehorende opdrachtveld wordt aangepast en vereist daarna opnieuw klantbevestiging. Een projectimport trekt ook de verificatie en acceptatie van voorbereidingspunten in.

De AI instructies volgen dezelfde werkwijze. De AI kan eenvoudige vervolgvragen, aannames en opnamepunten voorstellen. Alleen de gebruiker kan een uitkomst verifiëren. De API accepteert geen modelvelden die bevestiging, verificatie of vrijgave claimen.
