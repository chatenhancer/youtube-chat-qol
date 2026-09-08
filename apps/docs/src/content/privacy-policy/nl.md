---
locale: nl
title: "Privacybeleid"
description: "Hoe Chat Enhancer for YouTube lokale opslag, vertaling, Playground-gegevens en privacy-instellingen behandelt."
---

# Privacy

Laatst bijgewerkt: 24 juli 2026

Chat Enhancer for YouTube is een browserextensie voor YouTube-livechat. De extensie is ontworpen om kleine chatfuncties toe te voegen zonder YouTube-chat te vervangen of analytics te verzamelen.

De korte versie:

- De meeste extensiefuncties draaien lokaal in je browser.
- Vertaling staat standaard uit.
- Wanneer vertaling is ingeschakeld, wordt de tekst die wordt vertaald naar Google Translate gestuurd.
- Playground-games staan standaard uit. Als je Playground inschakelt en gebruikt, worden gameaanwezigheid, uitnodigingen en gameacties onder een gegenereerde spelersnaam naar de Chat Enhancer Playground-gameserver gestuurd.
- De extensie voert geen analytics uit, verkoopt geen gegevens en verzamelt geen browsegeschiedenis.

## Waar de extensie draait

De extensie draait alleen op YouTube-livechat- en livechatreplaypagina’s waartoe de extensie toegang mag hebben.

De extensie gebruikt een machtiging om eigen instellingen en gegevens in je browser op te slaan. De extensie gebruikt ook toegang tot de specifieke websites die nodig zijn voor de functies: YouTube-livechatpagina’s, de vertaaldienst van Google Translate en de opt-in Chat Enhancer Playground-gameserver.

De extensie vraagt geen algemene machtigingen voor browsegeschiedenis, tabbladen lezen, scripting of webnavigatie.

## Gegevens die in je browser worden opgeslagen

De extensie slaat enkele gegevens op zodat de functies blijven werken tussen het opnieuw laden van pagina’s.

Tenzij hieronder anders staat, blijven de gegevens in deze sectie in je browserprofiel en worden ze niet naar Chat Enhancer gestuurd. Je browser kan extensie-instellingen synchroniseren tussen je eigen aangemelde browserinstallaties.

- **Instellingen:** je functiekeuzes en voorkeuren.

- **Inbox-gegevens:** bewaakte trefwoorden en maximaal 100 inboxrecords per stream of replay. Inboxrecords kunnen berichttekst, auteursnaam, tijdstempel, basisgegevens van YouTube-berichten die nodig zijn om te tonen waar het opgeslagen bericht vandaan kwam, matchdetails en emoji- of afbeeldingsinformatie bevatten die nodig is om het opgeslagen bericht correct te tonen.

- **Gegevens van veelgebruikte emoji:** lokale gebruikstellingen en emojiweergave-informatie die wordt gebruikt om de rij met veelgebruikte emoji te maken.

- **Bladwijzergegevens:** de opgeslagen berichttekst en emojiweergavegegevens, naam, avatar-URL en indien beschikbaar kanaal-ID van de auteur, bericht- en opslagtijd en streamtitel en -URL. Bladwijzers blijven tussen streams beschikbaar in het huidige browserprofiel.

- **Avatarringgegevens:** de auteursnaam, het tijdstip waarop de ring is toegevoegd, de stream-URL en, indien beschikbaar, de avatar-URL, kanaal-ID en streamtitel van gebruikers aan wie je uitdrukkelijk een ring toevoegt vanuit hun profiel met recente berichten. De selectie blijft tussen streams beschikbaar in het huidige browserprofiel en wordt alleen gebruikt om overeenkomende avatars te versieren.

- **Niet-verzonden chatconcepten:** worden afzonderlijk per stream opgeslagen en hersteld na het vernieuwen van de pagina. Concepten worden verwijderd wanneer de chatinvoer wordt gewist, het bericht wordt verzonden of extensiegegevens worden gereset.

- **Playground-identiteitsgegevens:** een willekeurig gegenereerde lokale identiteit die wordt aangemaakt als Playground wordt gebruikt. Hiermee wordt dezelfde browserinstallatie herkend wanneer deze opnieuw verbinding maakt met Playground. Het is niet je YouTube-identiteit.

- **Tijdelijke paginagegevens:** recente profielberichten, opdrachtstatus en vertaalresultaten worden alleen in het geheugen bewaard voor de huidige livechatpagina. Ze worden gewist wanneer je de chatpagina verlaat of vernieuwt.

## Gegevens die buiten je browser worden verzonden

Gegevens worden alleen naar deze diensten verzonden wanneer de bijbehorende functie is ingeschakeld en wordt gebruikt:

### Google Translate (`translate-pa.googleapis.com`)

Chatvertaling verzendt chatberichttekst die zichtbaar is in de livechat en in aanmerking komt voor vertaling terwijl vertaling is ingeschakeld. Conceptvertaling verzendt de concepttekst die je vanuit het chatvak kiest om te vertalen.

Vertaalverzoeken bevatten de te vertalen tekst en de doeltaal. De extensie stuurt je YouTube-cookies of YouTube-inloggegevens niet mee met vertaalverzoeken.

Toegang tot Google Translate via `translate-pa.googleapis.com` is onofficieel en kan worden beperkt, gewijzigd of onbeschikbaar worden.

### <span id="playground"></span>Chat Enhancer Playground ([playground.chatenhancer.com](https://playground.chatenhancer.com))

Als je Playground inschakelt en het gamespaneel gebruikt, maakt de extensie verbinding met de Chat Enhancer Playground-gameserver zodat opt-in gebruikers in dezelfde stream beschikbaarheid kunnen zien, uitnodigingen kunnen uitwisselen en games kunnen spelen.

Playground-berichten kunnen de YouTube-stream- of video-ID, je gegenereerde Playground-spelersidentiteit, je gegenereerde spelersnaam, je lijst met beschikbare games, uitnodigingen en uitnodigingsreacties, en gameacties zoals schaakzetten bevatten.

Playground bewaart compacte wedstrijdresultaten die aan gegenereerde Playground-spelersidentiteiten zijn gekoppeld om spelersstatistieken te bieden. Opgeslagen resultaten kunnen de gameversie, begin- en eindtijden, de uitslag en eindreden, rollen van deelnemers en kleine gamespecifieke statistieken bevatten, zoals zetten of scores. Ze bevatten geen inhoud van trivia-vragen of de volledige gamestatus.

De extensie stuurt geen livechatberichttekst, je YouTube-weergavenaam, je YouTube-avatar-URL, YouTube-cookies of YouTube-inloggegevens naar de Playground-gameserver.

Afzonderlijk kan HELP-A-FRIEND! Trivia-vraaggeneratie geselecteerde openbare YouTube-videotranscriptfragmenten en game-ID’s naar de Playground-gameserver sturen. Deze fragmenten komen uit het transcript van de video, niet uit livechat. De server gebruikt OpenAI om trivia-vragen uit die fragmenten te genereren.

Replay Trivia-generatie kan Cloudflare Turnstile-verificatie op [playground.chatenhancer.com](https://playground.chatenhancer.com) vereisen. Cloudflare kan normale verificatiegegevens ontvangen, zoals IP-adres, browser- en apparaatinformatie en het resultaat van de challenge.

Zoals elke webservice kan de Playground-gameserver normale verbindingsinformatie ontvangen, zoals IP-adres en browser-/apparaatinformatie, van de browser of netwerkprovider.

## Gegevensbeheer

Je kunt extensiegegevens wissen vanuit de extensiepopup met de resetknop. Dit wist lokale extensiegegevens en gesynchroniseerde extensie-instellingen, en herstelt daarna de standaardinstellingen.

Je kunt de extensie ook uit je browser verwijderen. Afhankelijk van de browser kan het verwijderen van de extensie ook de lokale opslag van de extensie verwijderen.

Het resetten of verwijderen van de extensie verwijdert niet automatisch wedstrijdresultaten die Playground al heeft opgeslagen.

## Wat de extensie niet doet

- Analytics uitvoeren.
- Browsegeschiedenis verzamelen.
- Gebruikersgegevens verkopen.
- Gegevens naar een Chat Enhancer-server sturen, tenzij je de hierboven beschreven opt-in Playground-functies gebruikt.

## Vragen

Neem voor privacyvragen [contact op met support](https://www.chatenhancer.com/nl/support).

Chat Enhancer for YouTube is niet gelieerd aan YouTube of Google.
