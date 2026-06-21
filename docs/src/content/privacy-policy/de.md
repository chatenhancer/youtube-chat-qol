---
locale: de
title: "Datenschutzerklärung"
description: "Wie Chat Enhancer for YouTube lokale Speicherung, Übersetzung, Playground-Daten und Datenschutzeinstellungen handhabt."
---

# Datenschutzerklärung

Zuletzt aktualisiert: 21. Juni 2026

Chat Enhancer for YouTube ist eine Browsererweiterung für den YouTube-Livechat. Sie soll kleine Chatfunktionen hinzufügen, ohne den YouTube-Chat zu ersetzen oder Analysedaten zu sammeln.

Kurzfassung:

- Die meisten Erweiterungsfunktionen laufen lokal in deinem Browser.
- Übersetzung ist standardmäßig deaktiviert.
- Wenn Übersetzung aktiviert ist, wird der zu übersetzende Text an Google Translate gesendet.
- Playground-Spiele sind standardmäßig deaktiviert. Wenn du Playground aktivierst und verwendest, werden Spielpräsenz, Einladungen und Spielaktionen unter einem generierten Spielernamen an das Chat Enhancer Playground-Backend gesendet.
- Die Erweiterung führt keine Analysen aus, verkauft keine Daten und sammelt keinen Browserverlauf.

## Wo die Erweiterung läuft

Die Erweiterung läuft nur auf YouTube-Livechat- und Livechat-Replay-Seiten, die vom Manifest der Erweiterung erfasst werden.

Die Erweiterung verwendet die Browserberechtigung `storage` sowie Hostzugriff auf YouTube-Livechat-Seiten, Googles Übersetzungsendpunkt und das optionale Playground-Backend. Sie fordert keine allgemeinen Berechtigungen für Browserverlauf, Tab-Lesen, Scripting oder Webnavigation an.

## In deinem Browser gespeicherte Daten

Die Erweiterung speichert einige Daten, damit ihre Funktionen zwischen Seitenneuladungen funktionieren.

- **Einstellungen werden mit `chrome.storage.sync` gespeichert:** abhängig von deinen Browsereinstellungen kann der Browser diese Erweiterungseinstellungen zwischen deinen angemeldeten Browserinstallationen synchronisieren.

- **Inbox-Daten werden mit `chrome.storage.local` gespeichert:** dazu gehören überwachte Schlüsselwörter und bis zu 100 Inbox-Einträge pro Stream oder Replay. Inbox-Einträge können Nachrichtentext, Autorname, Zeitstempel, YouTube-Nachrichten-/Quellmetadaten, Treffer-Metadaten und Emoji-/Bildanzeigedaten enthalten, die zum Anzeigen der gespeicherten Nachricht benötigt werden.

- **Daten häufiger Emojis werden mit `chrome.storage.local` gespeichert:** dazu gehören lokale Nutzungszähler und Emoji-Anzeigemetadaten, die zum Aufbau der Zeile häufiger Emojis verwendet werden.

- **Daten markierter Nutzer werden mit `chrome.storage.local` gespeichert:** dazu gehören der Handle des markierten Nutzers, die Kanal-ID, sofern verfügbar, und der Zeitpunkt, zu dem die Markierung erstellt wurde. Markierte Nutzer gelten streamübergreifend im aktuellen Browserprofil und werden zum Anzeigen farbiger Avatar-Ringe verwendet.

- **Nicht gesendete Chatentwürfe werden pro Stream mit `chrome.storage.local` gespeichert:** sie werden nach einer Seitenaktualisierung wiederhergestellt. Entwürfe werden entfernt, wenn das Chat-Eingabefeld geleert, die Nachricht gesendet oder Erweiterungsdaten zurückgesetzt werden.

- **Playground-Identitätsdaten werden mit `chrome.storage.local` gespeichert, wenn Playground verwendet wird:** dabei handelt es sich um ein generiertes öffentliches/privates Schlüsselpaar, das zum Signieren von Playground-Verbindungsaufforderungen verwendet wird, damit dieselbe Browserinstallation dieselbe pseudonyme Playground-Identität behalten kann. Es ist nicht deine YouTube-Identität.

- **Aktuelle Profilnachrichten, Befehlsstatus und Übersetzungsergebnisse werden nur im Arbeitsspeicher der aktuellen Livechat-Seite gehalten. Sie werden gelöscht, wenn die Seite verlassen wird.**

## Außerhalb deines Browsers gesendete Daten

Chatübersetzung und Entwurfsübersetzung sind standardmäßig deaktiviert.

Wenn Übersetzung oder Playground-Funktionen aktiviert sind, können Daten an diese Dienste gesendet werden:

- **Google Translate unter `https://translate.googleapis.com/translate_a/single`**

  Die Chatübersetzung sendet geeignete sichtbare und eingehende Chatnachrichtentexte. Die Entwurfsübersetzung sendet den Entwurfstext, den du aus dem Chatfeld übersetzen lässt.

  Übersetzungsanfragen enthalten den zu übersetzenden Text und die Zielsprache. Die Erweiterung sendet keine YouTube-Cookies oder YouTube-Anmeldedaten mit Übersetzungsanfragen.

  Der Zugriff auf Google Translate über `translate.googleapis.com` ist inoffiziell und kann begrenzt, geändert oder nicht verfügbar sein.

- **Chat Enhancer Playground unter `https://playground.chatenhancer.com`**

  Playground ist standardmäßig deaktiviert. Wenn du Playground aktivierst und das Spielepanel verwendest, verbindet sich die Erweiterung mit dem Playground-Backend, damit angemeldete Nutzer im selben Stream Verfügbarkeit sehen, Einladungen austauschen und Spiele spielen können.

  Playground-Nachrichten können den Stream-/Videoschlüssel, deinen generierten öffentlichen Playground-Schlüssel und deine Signatur, deinen generierten Spielernamen, deine Liste verfügbarer Spiele, Einladungen und Einladungsantworten sowie Spielaktionen wie Schachzüge enthalten.

  Die Generierung von HELP-A-FRIEND! Trivia-Fragen kann ausgewählte YouTube-Replay-Transkriptausschnitte und Spielkennungen an das Playground-Backend senden. Das Backend verwendet OpenAI, um aus diesen Ausschnitten Trivia-Fragen zu generieren.

  Die Replay-Trivia-Generierung kann eine Cloudflare-Turnstile-Verifizierung auf `https://playground.chatenhancer.com` erfordern. Cloudflare kann normale Verifizierungsdaten wie IP-Adresse, User-Agent und Challenge-Ergebnis erhalten.

  Playground sendet keinen Livechat-Nachrichtentext, deinen YouTube-Anzeigenamen, deine YouTube-Avatar-URL, YouTube-Cookies oder YouTube-Anmeldedaten an das Playground-Backend.

  Wie jeder Webdienst kann das Playground-Backend normale Verbindungsmetadaten wie IP-Adresse und User-Agent vom Browser oder Netzwerkanbieter erhalten.

## Datenkontrollen

Du kannst Erweiterungsdaten über die Erweiterungspopup mit der Zurücksetzen-Schaltfläche löschen. Dadurch werden lokale Erweiterungsdaten und synchronisierte Erweiterungseinstellungen gelöscht und anschließend die Standardeinstellungen wiederhergestellt.

Du kannst die Erweiterung auch aus deinem Browser entfernen. Je nach Browser kann das Entfernen der Erweiterung auch ihren lokalen Erweiterungsspeicher löschen.

## Was nicht gesammelt wird

Die Erweiterung führt keine Analysen aus.

Die Erweiterung sammelt keinen Browserverlauf.

Die Erweiterung verkauft keine Nutzerdaten.

Mit Ausnahme der oben beschriebenen optionalen Playground-Spiele sendet die Erweiterung keine Daten an einen von der Erweiterung betriebenen Server.

Die Erweiterung speichert aktuelle Profilnachrichten oder Übersetzungsergebnisse nicht, nachdem die Livechat-Seite verlassen wurde.

Chat Enhancer for YouTube ist nicht mit YouTube oder Google verbunden.

Bei Datenschutzfragen verwende den E-Mail-Link auf https://www.chatenhancer.com.
