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
- Playground-Spiele sind standardmäßig deaktiviert. Wenn du Playground aktivierst und verwendest, werden Spielpräsenz, Einladungen und Spielaktionen unter einem generierten Spielernamen an den Chat Enhancer Playground-Spielserver gesendet.
- Die Erweiterung führt keine Analysen aus, verkauft keine Daten und sammelt keinen Browserverlauf.

## Wo die Erweiterung läuft

Die Erweiterung läuft nur auf YouTube-Livechat- und Livechat-Replay-Seiten, auf die die Erweiterung zugreifen darf.

Die Erweiterung verwendet eine Berechtigung, um ihre eigenen Einstellungen und Daten in deinem Browser zu speichern. Sie verwendet außerdem Zugriff auf die spezifischen Websites, die ihre Funktionen benötigen: YouTube-Livechat-Seiten, den Übersetzungsdienst Google Translate und den optionalen Chat Enhancer Playground-Spielserver.

Die Erweiterung fordert keine allgemeinen Berechtigungen für Browserverlauf, Tab-Lesen, Scripting oder Webnavigation an.

## In deinem Browser gespeicherte Daten

Die Erweiterung speichert einige Daten, damit ihre Funktionen zwischen Seitenneuladungen funktionieren.

Die in diesem Abschnitt aufgeführten Daten werden von der Erweiterung in deinem eigenen Browserprofil gespeichert. Sie werden nicht an Chat Enhancer gesendet, es sei denn, sie sind auch im Abschnitt „Außerhalb deines Browsers gesendete Daten“ unten aufgeführt.

- **Einstellungen:** werden mit dem synchronisierten Erweiterungsspeicher des Browsers (`chrome.storage.sync`) gespeichert. Abhängig von deinen Browsereinstellungen kann der Browser diese Erweiterungseinstellungen zwischen deinen angemeldeten Browserinstallationen synchronisieren.

- **Inbox-Daten:** werden mit lokalem Erweiterungsspeicher (`chrome.storage.local`) gespeichert. Dazu gehören überwachte Schlüsselwörter und bis zu 100 Inbox-Einträge pro Stream oder Replay. Inbox-Einträge können Nachrichtentext, Autorname, Zeitstempel, grundlegende YouTube-Nachrichtendetails, die zeigen, woher die gespeicherte Nachricht stammt, Trefferdetails sowie Emoji- oder Bildinformationen enthalten, die zum korrekten Anzeigen der gespeicherten Nachricht benötigt werden.

- **Daten häufiger Emojis:** werden mit lokalem Erweiterungsspeicher (`chrome.storage.local`) gespeichert. Dazu gehören lokale Nutzungszähler und Emoji-Anzeigeinformationen, die zum Aufbau der Zeile häufiger Emojis verwendet werden.

- **Daten markierter Nutzer:** werden mit lokalem Erweiterungsspeicher (`chrome.storage.local`) gespeichert. Dazu gehören der Handle des markierten Nutzers, die Kanal-ID, sofern verfügbar, und der Zeitpunkt, zu dem die Markierung erstellt wurde. Markierte Nutzer gelten streamübergreifend im aktuellen Browserprofil und werden zum Anzeigen farbiger Avatar-Ringe verwendet.

- **Nicht gesendete Chatentwürfe:** werden pro Stream mit lokalem Erweiterungsspeicher (`chrome.storage.local`) gespeichert. Sie werden nach einer Seitenaktualisierung wiederhergestellt. Entwürfe werden entfernt, wenn das Chat-Eingabefeld geleert, die Nachricht gesendet oder Erweiterungsdaten zurückgesetzt werden.

- **Playground-Identitätsdaten:** werden mit lokalem Erweiterungsspeicher (`chrome.storage.local`) gespeichert, wenn Playground verwendet wird. Dabei handelt es sich um eine zufällig generierte lokale Playground-Identität, mit der dieselbe Browserinstallation beim erneuten Verbinden mit Playground wiedererkannt wird. Es ist nicht deine YouTube-Identität.

- **Aktuelle Profilnachrichten, Befehlsstatus und Übersetzungsergebnisse:** werden nur im Arbeitsspeicher der aktuellen Livechat-Seite gehalten. Sie werden gelöscht, wenn du die Chatseite verlässt oder aktualisierst.

## Außerhalb deines Browsers gesendete Daten

Chatübersetzung, Entwurfsübersetzung und Playground-Spiele sind standardmäßig deaktiviert.

Wenn Übersetzung oder Playground-Funktionen aktiviert und verwendet werden, können Daten an diese Dienste gesendet werden:

- **Google Translate unter `https://translate.googleapis.com/translate_a/single`**

  Die Chatübersetzung sendet Chatnachrichtentext, der im Livechat sichtbar und für die Übersetzung geeignet ist, während Übersetzung aktiviert ist. Die Entwurfsübersetzung sendet den Entwurfstext, den du aus dem Chatfeld übersetzen lässt.

  Übersetzungsanfragen enthalten den zu übersetzenden Text und die Zielsprache. Die Erweiterung sendet keine YouTube-Cookies oder YouTube-Anmeldedaten mit Übersetzungsanfragen.

  Der Zugriff auf Google Translate über `translate.googleapis.com` ist inoffiziell und kann begrenzt, geändert oder nicht verfügbar sein.

- **Chat Enhancer Playground unter `https://playground.chatenhancer.com`**

  Playground ist standardmäßig deaktiviert. Wenn du Playground aktivierst und das Spielepanel verwendest, verbindet sich die Erweiterung mit dem Chat Enhancer Playground-Spielserver, damit Nutzer im selben Stream, die sich dafür entschieden haben, Verfügbarkeit sehen, Einladungen austauschen und Spiele spielen können.

  Playground-Nachrichten können die YouTube-Stream- oder Video-ID, deine generierte Playground-Spieleridentität, deinen generierten Spielernamen, deine Liste verfügbarer Spiele, Einladungen und Einladungsantworten sowie Spielaktionen wie Schachzüge enthalten.

  Playground sendet keinen Livechat-Nachrichtentext, deinen YouTube-Anzeigenamen, deine YouTube-Avatar-URL, YouTube-Cookies oder YouTube-Anmeldedaten an den Playground-Spielserver.

  Separat kann die Generierung von HELP-A-FRIEND! Trivia-Fragen ausgewählte öffentliche YouTube-Videotranskriptausschnitte und Spielkennungen an den Playground-Spielserver senden. Diese Ausschnitte stammen aus dem Transkript des Videos, nicht aus dem Livechat. Der Server verwendet OpenAI, um aus diesen Ausschnitten Trivia-Fragen zu generieren.

  Die Replay-Trivia-Generierung kann eine Cloudflare-Turnstile-Verifizierung auf `https://playground.chatenhancer.com` erfordern. Cloudflare kann normale Verifizierungsdaten wie IP-Adresse, Browser- und Geräteinformationen und das Challenge-Ergebnis erhalten.

  Wie jeder Webdienst kann der Playground-Spielserver normale Verbindungsinformationen wie IP-Adresse und Browser-/Geräteinformationen vom Browser oder Netzwerkanbieter erhalten.

## Datenkontrollen

Du kannst Erweiterungsdaten über die Erweiterungspopup mit der Zurücksetzen-Schaltfläche löschen. Dadurch werden lokale Erweiterungsdaten und synchronisierte Erweiterungseinstellungen gelöscht und anschließend die Standardeinstellungen wiederhergestellt.

Du kannst die Erweiterung auch aus deinem Browser entfernen. Je nach Browser kann das Entfernen der Erweiterung auch ihren lokalen Erweiterungsspeicher löschen.

## Was Chat Enhancer nicht tut

Die Erweiterung führt keine Analysen aus.

Die Erweiterung sammelt keinen Browserverlauf.

Die Erweiterung verkauft keine Nutzerdaten.

Mit Ausnahme der oben beschriebenen optionalen Playground-Funktionen sendet die Erweiterung keine Daten an einen Chat Enhancer-Server.

Die Erweiterung speichert aktuelle Profilnachrichten oder Übersetzungsergebnisse nicht, nachdem du die Livechat-Seite verlassen oder aktualisiert hast.

Chat Enhancer for YouTube ist nicht mit YouTube oder Google verbunden.

Bei Datenschutzfragen verwende den E-Mail-Link auf https://www.chatenhancer.com.
