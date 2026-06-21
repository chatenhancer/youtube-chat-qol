---
locale: nl
title: "Privacybeleid"
description: "Hoe Chat Enhancer for YouTube lokale opslag, vertaling, Playground-gegevens en privacy-instellingen behandelt."
---

# Privacy

Laatst bijgewerkt: 21 juni 2026

Chat Enhancer for YouTube is een browserextensie voor YouTube-livechat. De extensie is ontworpen om kleine chatfuncties toe te voegen zonder YouTube-chat te vervangen of analytics te verzamelen.

De korte versie:

- De meeste extensiefuncties draaien lokaal in je browser.
- Vertaling staat standaard uit.
- Wanneer vertaling is ingeschakeld, wordt de tekst die wordt vertaald naar Google Translate gestuurd.
- Playground-games staan standaard uit. Als je Playground inschakelt en gebruikt, worden gameaanwezigheid, uitnodigingen en gameacties onder een gegenereerde spelersnaam naar de Chat Enhancer Playground-backend gestuurd.
- De extensie voert geen analytics uit, verkoopt geen gegevens en verzamelt geen browsegeschiedenis.

## Waar de extensie draait

De extensie draait alleen op YouTube-livechat- en livechatreplaypagina’s die overeenkomen met het manifest van de extensie.

De extensie gebruikt de browsermachtiging `storage`, plus hosttoegang voor YouTube-livechatpagina’s, het vertaalendpoint van Google en de opt-in Playground-backend. De extensie vraagt geen algemene machtigingen voor browsegeschiedenis, tabbladen lezen, scripting of webnavigatie.

## Gegevens die in je browser worden opgeslagen

De extensie slaat enkele gegevens op zodat de functies blijven werken tussen het opnieuw laden van pagina’s.

- **Instellingen worden opgeslagen met `chrome.storage.sync`:** afhankelijk van je browserinstellingen kan de browser deze extensie-instellingen synchroniseren tussen je eigen aangemelde browserinstallaties.

- **Inbox-gegevens worden opgeslagen met `chrome.storage.local`:** dit omvat bewaakte trefwoorden en maximaal 100 inboxrecords per stream of replay. Inboxrecords kunnen berichttekst, auteursnaam, tijdstempel, YouTube-bericht-/bronmetadata, matchmetadata en emoji-/afbeeldingsweergavegegevens bevatten die nodig zijn om het opgeslagen bericht te tonen.

- **Gegevens van veelgebruikte emoji worden opgeslagen met `chrome.storage.local`:** dit omvat lokale gebruikstellingen en emojiweergavemetadata die worden gebruikt om de rij met veelgebruikte emoji te maken.

- **Gegevens van gemarkeerde gebruikers worden opgeslagen met `chrome.storage.local`:** dit omvat de handle van de gemarkeerde gebruiker, kanaal-ID indien beschikbaar, en het tijdstip waarop de markering is gemaakt. Gemarkeerde gebruikers zijn globaal over streams in het huidige browserprofiel en worden gebruikt om gekleurde avatarringen te tonen.

- **Niet-verzonden chatconcepten worden per stream opgeslagen met `chrome.storage.local`:** ze worden hersteld na het vernieuwen van de pagina. Concepten worden verwijderd wanneer de chatinvoer wordt gewist, het bericht wordt verzonden of extensiegegevens worden gereset.

- **Playground-identiteitsgegevens worden opgeslagen met `chrome.storage.local` als Playground wordt gebruikt:** dit is een gegenereerd openbaar/privé-sleutelpaar dat wordt gebruikt om Playground-verbindingsuitdagingen te ondertekenen, zodat dezelfde browserinstallatie dezelfde pseudonieme Playground-identiteit kan behouden. Het is niet je YouTube-identiteit.

- **Recente profielberichten, opdrachtstatus en vertaalresultaten worden alleen in het geheugen bewaard voor de huidige livechatpagina. Ze worden gewist wanneer de pagina wordt verlaten.**

## Gegevens die buiten je browser worden verzonden

Chatvertaling en conceptvertaling staan standaard uit.

Wanneer vertaling of Playground-functies zijn ingeschakeld, kunnen gegevens naar deze diensten worden verzonden:

- **Google Translate op `https://translate.googleapis.com/translate_a/single`**

  Chatvertaling verzendt in aanmerking komende zichtbare en binnenkomende chatberichttekst. Conceptvertaling verzendt de concepttekst die je vanuit het chatvak kiest om te vertalen.

  Vertaalverzoeken bevatten de te vertalen tekst en de doeltaal. De extensie stuurt je YouTube-cookies of YouTube-inloggegevens niet mee met vertaalverzoeken.

  Toegang tot Google Translate via `translate.googleapis.com` is onofficieel en kan worden beperkt, gewijzigd of onbeschikbaar worden.

- **Chat Enhancer Playground op `https://playground.chatenhancer.com`**

  Playground staat standaard uit. Als je Playground inschakelt en het gamespaneel gebruikt, maakt de extensie verbinding met de Playground-backend zodat opt-in gebruikers in dezelfde stream beschikbaarheid kunnen zien, uitnodigingen kunnen uitwisselen en games kunnen spelen.

  Playground-berichten kunnen de stream-/videosleutel, je gegenereerde Playground-openbare sleutel en handtekening, je gegenereerde spelersnaam, je lijst met beschikbare games, uitnodigingen en uitnodigingsreacties, en gameacties zoals schaakzetten bevatten.

  HELP-A-FRIEND! Trivia-vraaggeneratie kan geselecteerde YouTube-replaytranscriptfragmenten en game-ID’s naar de Playground-backend sturen. De backend gebruikt OpenAI om trivia-vragen uit die fragmenten te genereren.

  Replay Trivia-generatie kan Cloudflare Turnstile-verificatie op `https://playground.chatenhancer.com` vereisen. Cloudflare kan normale verificatiegegevens ontvangen, zoals IP-adres, useragent en het resultaat van de challenge.

  Playground stuurt geen livechatberichttekst, je YouTube-weergavenaam, je YouTube-avatar-URL, YouTube-cookies of YouTube-inloggegevens naar de Playground-backend.

  Zoals elke webservice kan de Playground-backend normale verbindingsmetadata ontvangen, zoals IP-adres en useragent, van de browser of netwerkprovider.

## Gegevensbeheer

Je kunt extensiegegevens wissen vanuit de extensiepopup met de resetknop. Dit wist lokale extensiegegevens en gesynchroniseerde extensie-instellingen, en herstelt daarna de standaardinstellingen.

Je kunt de extensie ook uit je browser verwijderen. Afhankelijk van de browser kan het verwijderen van de extensie ook de lokale opslag van de extensie verwijderen.

## Wat niet wordt verzameld

De extensie voert geen analytics uit.

De extensie verzamelt geen browsegeschiedenis.

De extensie verkoopt geen gebruikersgegevens.

Behalve de hierboven beschreven opt-in Playground-games stuurt de extensie geen gegevens naar een server die eigendom is van de extensie.

De extensie slaat geen recente profielberichten of vertaalresultaten op nadat de livechatpagina is verlaten.

Chat Enhancer for YouTube is niet gelieerd aan YouTube of Google.

Gebruik voor privacyvragen de e-maillink op https://www.chatenhancer.com.
