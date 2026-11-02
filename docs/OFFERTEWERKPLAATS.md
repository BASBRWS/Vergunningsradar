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

Er zijn twee verbindingswijzen. Bij een nog niet aangesloten server opent de configuratie standaard in Persoonlijke test, rechtstreeks naar OpenAI. Bij een ingesteld serveradres blijft de serverstand standaard actief.

### Persoonlijke test vanaf GitHub Pages

Open Configuratie en kies Persoonlijke test, rechtstreeks naar OpenAI. Vul jouw eigen OpenAI API sleutel en de modelnaam uit jouw OpenAI project in. Het model moet Responses en Structured Outputs ondersteunen. Er wordt geen modelnaam verondersteld, omdat toegang per API project kan verschillen. Klik AI verbinding testen. Deze test doet een echte modelaanroep met een controlebericht zonder klantgegevens. Na een geslaagde test kun je toestemming geven voor het AI gesprek.

Deze stand vereist geen extra hosting, serveradres of Vergunningradar account. De browser stuurt de sleutel alleen als Authorization header naar het vaste adres `https://api.openai.com/v1/responses`. De sleutel komt niet in de URL, aanvraagbody, HTML broncode, GitHub repository, localStorage, sessionStorage, printdocumenten of projectexport. Hij leeft alleen in het geheugen van de JavaScript module en tijdelijk in het wachtwoordveld tijdens invoer. Bij verversen, verlaten van de pagina, wisselen van verbindingswijze, AI uitschakelen of Sleutel wissen worden de sleutel en het invoerveld gewist. Modelnaam en verbindingstoestemming zijn in deze stand ook niet persistent.

Een sleutel in een browser blijft bereikbaar voor scripts en ontwikkelaarstools in dat tabblad. Gebruik deze stand uitsluitend voor jouw eigen ontwikkeltest, met een aparte testsleutel en passende API limieten. Hij is niet bedoeld om een bedrijfssleutel te delen met klanten of medewerkers. Zowel testen als chatten gebruiken jouw API account. Er wordt geen gratis API gebruik of werking met elk model beloofd. Bron voor tijdelijk browsergebruik, [official OpenAI documentation](https://developers.openai.com/api/reference/typescript).

Directe modelantwoorden worden eerst volledig gevalideerd. Het model kan alleen dossierwijzigingen en voorbereiding voorstellen, geen prijzen, klantbevestigingen, verificaties of vrijgave. De app voegt calculatieregels niet automatisch toe. Updates worden pas toegepast nadat het complete antwoord is verwerkt. De verbindingscontrole en foutafhandeling zijn getest met gesimuleerde providerantwoorden. Er is geen echte API sleutel gebruikt voor het testen van deze release.

### Via eigen server

Voor gedeeld gebruik bewaart de bestaande Python server de API sleutel buiten de browser. Er wordt geen sleutel in de openbare frontend opgeslagen.

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


## Bestek, contract en TenderNed

Kies Nieuwe opdracht, TenderNed, bestek of contract. Dit opent een eigen dossier in plaats van de vijftien klantintakevragen. Vul opdrachtgever, projectgegevens en de indieningsafspraken in. Een HTTPS TenderNed link is uitsluitend een referentie, geen automatische import of tenderzoekmachine. Download de oorspronkelijke stukken zelf, inclusief nota’s van inlichtingen en relevante bijlagen.

Bronbestanden worden met IndexedDB uitsluitend in de eigen browser bewaard. Ondersteund zijn PDF, DOCX, TXT en MD, maximaal 10 bestanden, 6 MB per bestand en 12 MB samen. Grote dossiers moeten per werkpakket worden verdeeld. Bestanden staan niet in GitHub en niet in de JSON projectexport. Bewaar originelen zelf. Bij een import op een andere computer moet je de stukken opnieuw toevoegen en analyseren. Een verwijderde vermelding wordt uit het dossier gehaald. De browser kan nog een kopie bewaren zolang andere lokale projectkopieën dezelfde bestandsidentiteit gebruiken.

Het gebruikte OpenAI model moet de Responses API, Structured Outputs en de aangeleverde bestandstypen ondersteunen. Voor PDF is beeldondersteuning nodig. PDF invoer omvat tekst en paginabeelden. DOCX wordt als tekst verwerkt, ingebedde afbeeldingen worden niet automatisch gelezen. Lever tekeningen als PDF aan. Een geslaagde tekstverbindingstest bewijst nog geen PDF ondersteuning voor dat model.

### Specialistbeoordelingen

De standaardvolgorde is contractmanager, elektrotechniek, werktuigbouw, werkvoorbereiding en uitvoering, calculator en daarna offertemanager. Contractmanager en offertemanager zijn verplicht. De overige rollen kun je selecteren. Elke rol krijgt de originele stukken, eigen instructies, jouw aanvullende specialistprompt en de geslaagde eerdere analyses. Dezelfde rollen zijn AI promptrollen binnen één dienst, geen onafhankelijk gevalideerde deskundigen. De centrale bron- en onzekerheidsregels blijven altijd van toepassing. De promptdefinities en het strikte uitvoercontract staan in `web/tender-contract.json`, gedeeld door browser en server.

Standaard worden zes afzonderlijke API aanvragen uitgevoerd, elk met de bronstukken. Elke aanvraag gebruikt jouw API tegoed. Analyse starten of hervatten slaat nog actuele beoordelingen over. Stop na huidige specialist wacht de lopende aanvraag af. Een fout stopt de reeks zonder automatisch te herhalen of resultaten te verzinnen. Opnieuw analyseren vervangt eerdere analyses en beoordelingen. Bestaande calculatieregels blijven staan, controleer wijzigingen en dubbeltellingen. Wijziging van metadata, bestand, rolkeuze of prompt maakt analyses verouderd.

De output bevat bevindingen, documentverwijzingen, werkpostvoorstellen en een samenvatting per rol. Alleen de offertemanager schrijft een gezamenlijk functioneel conceptontwerp, projectplan en aanbieding. Bronverwijzingen zijn AI voorstellen. De app controleert dat een genoemde documentidentiteit bestaat, niet dat de geciteerde passage of interpretatie klopt. Controleer het origineel, kies een verwerking en leg een onderbouwd besluit vast. Alle actuele bevindingen moeten beoordeeld zijn voordat vrijgave kan volgen. Een uitgezette vraag is nog niet afgehandeld. De vragenlijst voor de nota van inlichtingen kan als tekst worden gedownload; er wordt niets automatisch verstuurd of ingediend.

Een analyse levert maximaal 20 bevindingen en 15 werkpostvoorstellen per rol. Deze grenzen voorkomen onbegrensde uitvoer, maar zijn geen garantie dat een volledig omvangrijk bestek wordt afgedekt. Laat uitgebreide bestekken per onderdeel beoordelen en controleer zelf de dekking. Bij contextlimieten of een onafgerond antwoord is opsplitsen nodig. Er is geen automatische volledige juridische toets, normcontrole, installatieberekening of indiening op TenderNed.

### Van analyse naar calculatie

Werkposten hebben een bronhoeveelheid, herkenbare raming of voorlopige aanname. Een onbekend aantal blijft leeg. AI bepaalt geen kostprijzen. Controleer de hoeveelheid en koppel zelf een catalogusartikel met dezelfde kostensoort en eenheid, of vul een eigen positieve kostprijs in. Personeel gebruikt persoonsuren. De bestaande rekenmodule verwerkt vervolgens overhead, risico, marge of opslag, korting en btw. Controleer handmatig dubbele posten uit verschillende specialistbeoordelingen.

Neem de gezamenlijke offerteopzet pas over na controle. Dit vervangt scope, aanbiedingstekst, conceptontwerp en projectplan, niet de calculatie. Werk teksten daarna verder uit. De klantafdruk bevat de aanbieding, scope en documentversies plus verkoopbedragen. Interne kostprijzen blijven buiten de klantversie.

Het bestekdossier gebruikt een eigen checklist voor opdrachtgegevens, beschikbare stukken, actuele specialistbeoordelingen, offerteopzet, afgehandelde bevindingen, gecontroleerde scope en financiële calculatiecontrole. De score is volledigheid van die controles, geen kans op juistheid. De bestaande technische en financiële controles blijven aanvullend verplicht. Wijzigingen trekken die controles in. Import trekt alle bevestigingen in en bewaart analyses uitsluitend als verouderde historie.

### API en hosting

De persoonlijke teststand op GitHub Pages ondersteunt ook deze documentanalyse. Stel je eigen sleutel en model in bij Configuratie, voer de verbindingstest uit en geef in het bestekdossier afzonderlijk toestemming voor het versturen van bestanden. De sleutel blijft alleen in het tabbladgeheugen. Er is geen extra hosting nodig voor deze persoonlijke test. Voor gedeeld gebruik bewaart de bestaande serverstand de sleutel serverzijdig.

De serverroute `POST /calculator/tender` vereist een actieve sessie en schrijfrechten. De gedeelde limieten zijn 30 AI aanvragen per gebruiker en 100 per account per uur, inclusief intake en verbindingstests. De grotere documentbody wordt pas na toegangscontrole gelezen en is begrensd op 18 MB. Documenten worden niet door deze route opgeslagen. Het auditlog bevat alleen actietype en account. De Dockerbuild kopieert het gedeelde promptcontract naar de backend. Een GitHub Pages deployment publiceert alleen de frontend.

De geautomatiseerde tests gebruiken fictieve tekststukken en nagebootste modelantwoorden. Een echte documentanalyse kan pas met een werkende API sleutel en passend model worden bevestigd.

OpenAI bestandsinvoer, https://developers.openai.com/api/docs/guides/file-inputs.


## Uitbreiding fabrikantcatalogus, 2 november 2026

De basis bevat nu 12.737 product- en materiaalartikelen. Daarvan zijn 12.437 bestaande fabrikantartikelen met herleidbare bronregels, naast de bestaande 300 generieke voorbeeldartikelen. De 11 eerdere personeels- en projectregels blijven daarnaast beschikbaar. Het totaal in een nieuwe werkruimte is daardoor 12.748 catalogusregels. Eigen artikelen kunnen dit aantal veranderen.

De fabrikantselectie omvat 13 merken en 25 nieuwe productgroepen, naast de 10 eerdere generieke productgroepen. Wavin levert 5.084 geselecteerde artikelen uit het openbare PAB-bestand, inclusief merken als DYKA, Georg Fischer, Griffon, Walraven, Pipelife, Klauke, McAlpine, Martens en Plasson. Bals levert 810 artikelen voor industriële contactmaterialen. Schneider Electric levert 3.285 geselecteerde artikelen voor gebouwinstallaties. Vasco levert 2.982 radiator-, vloerwarmte- en toebehorenartikelen, 222 ventilatieartikelen en 54 warmtepomp- en toebehorenartikelen.

Er zijn geen verzonnen artikelnummers, EANs of combinaties van productmaten toegevoegd. Meerdere verpakkingsvarianten uit het Wavin artikelbestand zijn gekoppeld aan één fabrikantproduct. Uitgefaseerde Wavin producten met statuscode zijn overgeslagen. Zware civiele systemen zoals Tegra, X-Stream, infiltratie en drainage zijn buiten de selectie gelaten. De Schneider selectie gebruikt bestaande gebouwinstallatiereeksen. Het bestand vermeldt zelf dat niet alle referenties erin staan. De Belgische Vasco spare parts sheet is niet als Nederlands assortiment overgenomen.

De selectie is ruim voor woningbouw, utiliteit en onderhoud, maar pretendeert geen volledige dekking van alle installatiespecialismen of leveranciers. De fabrikantbestanden zijn een momentopname. Leverbaarheid, technische geschiktheid, actuele uitvoering en verpakking moeten voor bestelling bij de leverancier worden gecontroleerd.

Nieuwe fabrikantartikelen hebben cost 0 en priceType missing totdat je een eigen netto inkoopprijs exclusief btw vastlegt. De bruto bronprijs is afzonderlijke metadata, wordt niet automatisch in calculaties gebruikt en geldt niet als een actuele leveranciersofferte. Controleer btw, eenheid, geldigheid en kortingsafspraken in het oorspronkelijke prijsbestand. De vrijgavecontrole blokkeert regels met nulprijzen. De bestaande generieke artikelen blijven voorbeeldprijzen gebruiken.

Zoeken combineert woorden in artikelcode, fabrikantnummer, merk, EAN, serie, omschrijving, productgroep en vakgebied. Je kunt filteren op productgroep, merk, vakgebied en prijsstatus. Catalogusbeheer toont maximaal 50 regels per pagina. De calculatiekeuzelijst toont maximaal 100 zoekresultaten, verfijn bij meer resultaten de zoekopdracht. De artikelselectie bij bestekwerkposten heeft eveneens een zoekveld en een grens van 100 resultaten.

De catalogusgrens is 20.000 regels. De CSV importgrens is 10 MB. De offerte houdt maximaal 500 calculatieregels. De volledige standaardcatalogus kan worden gedownload via `installatiecatalogus.csv`. De oude download `installatiematerialen-300.csv` blijft beschikbaar. Catalogus CSV exporteert de eigen actuele catalogus, inclusief fabrikantgegevens en prijsstatus. Een CSV import vervangt de huidige catalogus. Bestaande projecten en calculatieregels behouden hun eigen prijzen.

Bij de automatische uitbreiding blijven bestaande eigen prijzen, artikelen en projecten bewaard. Browseropslag bevat alleen verschillen ten opzichte van de standaardcatalogus. Dit voorkomt dat de volledige fabrikantselectie de opslagruimte voor projectdossiers inneemt. Bij herladen worden standaardartikelen, eigen wijzigingen en verwijderingen samengevoegd. Het bronregister met downloadlinks, SHA-256, controledatum en aantallen staat in `catalog-sources.json`.
