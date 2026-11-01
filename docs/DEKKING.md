# Dekking functioneel ontwerp

De openbare demo is geen actieve commerciële dienst. Onderstaande serverfuncties vereisen configuratie en acceptatie op echte bronnen.

| Eis | Implementatie en grens |
|---|---|
| F01 | KOOP SRU officiële publicaties, werkdagscheduler, checkpoint per gemeente. Eerste 14 dagen, daarna inhaalverwerking. |
| F02 | Per herkend adres een BAG-match, alle actuele VBO's op hetzelfde adres en gekoppelde panden. Meervoudige postcode/huisnummerparen worden gesplitst. Ambigue adresreeksen gaan naar de beheerwachtrij, ze worden niet geraden. Geen garantie op volledige adresextractie uit vrije tekst. |
| F03 | Geen woonfunctie toegestaan, ook geen gemengde adressen. Ruwe publicatieteksten worden niet op schijf bewaard. Onbekende gevallen bewaren alleen publicatie-ID's. |
| F04 | KvK Zoeken, Vestigingsprofiel en Basisprofiel. Alleen exact bezoekadres en handelsnaam. Geen eigenaarnamen of contactgegevens gekopieerd. Cache 90 dagen. |
| F05 | Trefwoorden en score BR3, met uitleg van alle punten. |
| F06 | Accountselectie en minimumscore. Alleen accountbeheerder wijzigt de selectie. Gebruiker kan eigen mail aan- en uitzetten. |
| F07 | SMTP-ochtendmail, maximaal 15 kaarten als leesbare tekstblokken met links. Geen HTML-mailtemplate. Idempotente outbox en afleverregistratie. Geen mail zonder leads. Geen gegarandeerde exact-eenmaalbezorging bij een onzekere SMTP-netwerkfout, die gevallen vereisen controle. |
| F08 | Zoeken, gemeente, vakgebied, score, status, datum en collega. Clientfilter op geladen leads. |
| F09 | Bronverwijzing, pandgegevens, bedrijven en peildata. Echte locaties kunnen na een klik als kaart worden geladen of in OpenStreetMap worden geopend. Demo-adressen hebben bewust geen geografische locatie. |
| F10 | Automatisch bekeken, statussen, notities, accountgescheiden opslag. |
| F11 | Reden en toelichting opgeslagen bij de opvolging. Herijking door beheerder, geen automatische zelflerende score. |
| F12 | E-maillink, 30 dagen proef, dag-25-herinnering, daarna alleen-lezen. Mollie eerste betaling plus periodiek abonnement, maand/jaar en opzegging. Betaaloverzicht aanwezig; formele fiscale facturen vereisen apart facturatieproces. |
| F13 | Openbaar verzoek, bevestigingslink, handmatige bevoegdheidscontrole en goedkeuring. Na goedkeuring direct verwijderd uit lijsten en uitgesloten. De werkdagtermijn is een beheerafspraak, geen automatische garantie. |
| F14 | Gemeenten, trefwoorden, gewichten, dagrapporten, opt-outs, proefverlenging, intrekken van onjuiste leads en opnieuw koppelen van onbekende adressen. Vervanging van een bestaande lead verloopt via intrekken en gecontroleerde nieuwe verwerking. |
| F15 | Uitnodiging per mail, dezelfde accountgrens en toewijzing aan geaccepteerde collega's. |
| F16 | CSV met alle gefilterde leads en beveiliging tegen spreadsheetformules. |
| F17 | Niet geactiveerd. Push na MVP, geen neppermissieverzoek. |
| F18–F20 | Niet geïmplementeerd, conform could. |
| F21 | Uitgesloten. |

## Niet-functionele eisen

N01 en N02 moeten worden gemeten in de gekozen hosting. N03 vereist een productielasttest. N04 heeft een responsieve lay-out met mobiele projectkaarten en bediening. N05 wordt technisch ondersteund, maar grondslag, EU-providerkeuze en definitieve juridische stukken ontbreken nog. N06 gebruikt gehashte tokens, e-maillinks en accountgebonden opvolging. N07 bewaart bron en peildata. N08 is nog niet aangetoond. N09 heeft checkpoints en zelfstandige gemeenten. N10 is Nederlands.

## Succes meten

Volume is zichtbaar in dagrapporten. Relevantiefeedback en gewonnen/afgewezen statussen worden opgeslagen. Het accountmodel registreert proefperiodes en betalingen. Een gecombineerd dashboard voor precisie, actie en betaalbereidheid volgt nadat definities en eerste proefdata vaststaan. Geen fictieve succesmetingen.
