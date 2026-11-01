# Productie aansluiten

## Benodigd

Een eigen Linux-server in de EU, Docker Compose, een API-domein, KvK-API-abonnement met Zoeken, Basisprofiel en Vestigingsprofiel, SMTP-account met TLS, geverifieerd verzenddomein met SPF/DKIM/DMARC en een Mollie-account. Kies ook EU-locaties voor databases, back-ups en mailverwerking. GitHub Pages host uitsluitend de openbare bestanden; GitHub garandeert daarmee geen uitsluitend Europese frontendlevering. Als letterlijk alle gegevensverwerking binnen de EU moet blijven, host ook `web/` bij je EU-provider.

## Configuratie

1. Kloon de repo op de server. Kopieer `.env.example` naar `.env`. Vul de lege waarden in met gegevens uit jouw provideraccounts. Bewaar dit bestand alleen op de server met rechten 600.
2. Laat de DNS van `API_DOMAIN` naar de server wijzen. Open poort 80 en 443. `PUBLIC_API_URL` is `https://` gevolgd door jouw API-domein. `PUBLIC_WEB_URL` is de exacte Pages-URL zonder afsluitende slash. `ALLOWED_ORIGIN` is alleen protocol en host van de website, zonder pad.
3. `ADMIN_EMAIL` is jouw beheermailadres. Pas dit vóór het eerste aanmelden in. Een bevestigd nieuw account met exact dit e-mailadres krijgt de beheerrol. Bestaande accounts worden niet automatisch gepromoveerd als je deze instelling later verandert.
4. Start de services.

```sh
chmod 600 .env
docker compose up -d --build
```

5. Controleer `/health`. De API meldt of KvK, mail en betalingen zijn geconfigureerd, zonder sleutels te tonen.
6. Zet `apiBase` in `web/config.js` op jouw `PUBLIC_API_URL` en commit dit. Zet daar nooit sleutels in. Pages publiceert de aanpassing automatisch.
7. Test een inlogmail, KvK-adresverrijking, een uitsluitverzoek, accountisolatie en een eerste Mollie-testbetaling met bijbehorende webhook en verlenging. Gebruik voor deze checks uitsluitend eigen testadressen en Mollie-testdata. Pas daarna `MOLLIE_API_KEY` aan naar de live-sleutel.
8. Zet `BILLING_ENABLED=true` pas na het vaststellen van prijs, btw, facturatieproces en abonnementsvoorwaarden. Het voorgestelde tarief is €39 exclusief btw per maand of €468 per jaar. De betaalde bedragen inclusief 21 procent btw zijn €47,19 en €566,28. Er wordt geen korting verondersteld.

## Pijplijn en tijdzone

De scheduler gebruikt `Europe/Amsterdam`, inclusief zomer- en wintertijd. Op werkdagen begint ingestie vanaf 06.00 uur. De verzendronde start vanaf 07.00 uur. Inlog- en systeemmails worden elke 30 seconden verwerkt. De eerste run haalt 14 dagen op. Iedere gemeente heeft een eigen checkpoint. Een fout bij een publicatie blokkeert alleen het checkpoint van die gemeente. De volgende run probeert die datum opnieuw. Duplicaten krijgen dezelfde lead-ID; bestaande opvolggegevens blijven intact.

Op maandag worden ook de vrijdag, zaterdag en zondag ingehaald. Bij uitval kan de scheduler na herstart later verzenden. Exacte levering om 07.00 uur is geen gegarandeerde SLA van deze code. Controleer runtime, bronsnelheid, SMTP-limieten en tijdige backfill vóór klanten starten.

Handmatig draaien.

```sh
docker compose exec api python -m backend.jobs ingest
docker compose exec api python -m backend.jobs digest
docker compose exec api python -m backend.jobs mail
docker compose exec api python -m backend.jobs cleanup
```

## Voor commerciële start

Laat de grondslag en opt-outprocedure toetsen. Stel de verantwoordelijke organisatie, contactgegevens, privacyverklaring, voorwaarden, verwerkersregister en facturatieproces vast. Valideer de tien gemeenten met proefbedrijven. Meet precisie en volume op echte publicaties, voer een capaciteitstest met 1.000 leads uit en onderzoek KvK-kosten. Het budget van €50 per maand voor 100 klanten is niet bewezen; betaalde KvK-aanroepen kunnen dat budget overschrijden. Kosten worden niet als voldaan gepresenteerd.
