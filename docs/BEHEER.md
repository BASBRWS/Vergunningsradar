# Beheer en beveiliging

## Accountgrenzen

De API leidt account-ID en rol altijd af uit de gehashte Bearer-sessie. De client kan die niet meegeven voor opvolging of betalingen. Leads zelf zijn broninformatie, opvolging wordt uitsluitend binnen een klantaccount gedeeld. Beheer is servermatig afgeschermd. Demobeheer op Pages bevat alleen fictieve gegevens en geeft geen productierechten.

Inlogtokens zijn willekeurig, eenmalig en 15 minuten geldig. Sessies zijn 12 uur geldig. De authenticatietabellen bevatten alleen hashes. De mailwachtrij bevat de inloglink totdat de mail is verstuurd, daarna wordt de mailinhoud gewist. Beveilig ook de database en back-ups op schijfniveau. De frontend bewaart de sessie in sessionStorage en gebruikt een Content Security Policy zonder externe scripts. Inloglinks gebruiken het URL-fragment en worden niet naar de Pages-server gestuurd. Auth-aanvragen hebben een limiet per direct aangesloten proxy-IP en per mailadres. De proxy-IP-limiet is gedeeld achter Caddy; voeg vóór schaalvergroting een betrouwbare proxy-rate-limiter toe in plaats van een door clients te vervalsen X-Forwarded-For te vertrouwen.

## Bronkwaliteit

De bronadapters geven netwerkfouten door. Ze slaan nooit een onduidelijk BAG-adres automatisch als zakelijk op. Een bronwijziging kan de dekking verkleinen. Controleer de eerste runs handmatig en houd onbekende publicaties bij. Een handelsnaam kan persoonsnamen bevatten; er wordt geen apart eigenaarobject opgeslagen. KvK non-mailing-indicaties worden uitgesloten. Verifieer de KvK-licentievoorwaarden voor jouw toepassing.

## Opt-outs

Een e-mailbevestiging bewijst alleen toegang tot dat mailadres, niet bevoegdheid voor het bedrijf. Controleer die bevoegdheid vóór goedkeuring in Beheer. De API koppelt een volledig adres opnieuw aan BAG; een onduidelijk adres wordt geweigerd. Een KvK-opt-out verwijdert bestaande leads met dat bedrijf en sluit de bekende adressen ook uit. Een bedrijf op een later nieuw adres wordt na KvK-verrijking herkend en onderdrukt. Pending ochtendmails met verwijderde leads worden geannuleerd. Reeds verzonden mails kunnen niet worden teruggehaald.

## Bezorging

De outbox voorkomt dagelijkse dubbele digests na herstart. Bij twijfel of SMTP een mail heeft aangenomen, krijgt de mail status `uncertain`. Een procescrash tijdens verzending laat `sending` staan. Controleer deze gevallen in SQLite en bij je mailprovider. Zet ze pas terug naar `pending` als je hebt vastgesteld dat de mail niet is aangenomen. Door bewuste terughoudendheid wordt geen exactly-oncegarantie geclaimd. Dagrapporten worden als systeemmail naar ADMIN_EMAIL gezet. De beheerpagina toont de verwerkingscijfers.

## Bewaarbeleid

Dagelijkse opschoning verwijdert leads ouder dan 730 dagen, KvK-cache ouder dan 90 dagen, onbekende publicatieverwijzingen vanaf 7 dagen en accounts 365 dagen na opzeggen of het verlopen van een ongebruikt proefaccount. Verouderde KvK-gegevens worden ook uit leads verwijderd; de score wordt dan opnieuw berekend zonder bedrijfspunten. Opvolggegevens, sessies en betalingen worden bij accountverwijdering met foreign keys verwijderd. De gecomprimeerde fiscale boekhouding moet los van de operationele database worden ingericht volgens de toepasselijke bewaarplicht.

Uitgaande mailinhoud wordt na verzending gewist, outboxrecords na 30 dagen. Uitsluitingen blijven bestaan. Onbevestigde uitsluitverzoeken worden na 7 dagen verwijderd. Stel ook voor back-ups dezelfde bewaartermijnen in en herpas opt-outs bij terugzetten.

## Operationeel

Maak versleutelde EU-back-ups met SQLite's online back-up-API, test herstel en controleer schijfruimte. Test HTTPS, SMTP en certificaten. Bewaar sleutels alleen in `.env` op de server of in een echte secrets manager. Roteer ze bij een vermoeden van lekken. Nooit via GitHub Pages, URL-queryparameters, frontendcode of logs.

De standaard HTTP-server is bewust klein en heeft geen externe Python-packages. Caddy handelt HTTPS af. Laat vóór commerciële start een onafhankelijke beveiligingsreview en lasttest uitvoeren. De code is een eerste implementatie, geen certificering of SLA.
