---
locale: de
title: "Datenschutzerklärung"
description: "Wie Chat Enhancer for YouTube lokale Speicherung, Übersetzung, Playground-Daten und Datenschutzeinstellungen handhabt."
---

# Datenschutzerklärung

Zuletzt aktualisiert: 11. September 2026

Chat Enhancer for YouTube ist eine Browsererweiterung für den YouTube-Livechat. Sie soll kleine Chatfunktionen hinzufügen, ohne den YouTube-Chat zu ersetzen oder Analysedaten zu sammeln.

Kurzfassung:

- Die meisten Erweiterungsfunktionen laufen lokal in deinem Browser.
- Übersetzung ist standardmäßig deaktiviert.
- Wenn Übersetzung aktiviert ist, wird der zu übersetzende Text an Google Translate gesendet.
- Playground-Spiele sind standardmäßig deaktiviert. Wenn du Playground aktivierst und verwendest, werden Spielpräsenz, Einladungen und Spielaktionen unter einem generierten Spielernamen an den Chat Enhancer Playground-Spielserver gesendet.
- Die Erweiterung führt keine Analysen aus, verkauft keine Daten und sammelt keinen Browserverlauf.

## Wo die Erweiterung läuft

Die Erweiterung läuft auf YouTube-Livechat- und Livechat-Replay-Seiten. Sie läuft außerdem auf YouTube-Seiten, um Bild-in-Bild für Video und Chat zu unterstützen.

Die Erweiterung verwendet eine Berechtigung, um ihre eigenen Einstellungen und Daten in deinem Browser zu speichern. Sie verwendet außerdem Zugriff auf die spezifischen Websites, die ihre Funktionen benötigen: YouTube-Livechat-Seiten, den Übersetzungsdienst Google Translate und den optionalen Chat Enhancer Playground-Spielserver.

In Chrome und Edge stellt die Berechtigung `scripting` Bild-in-Bild für Video und Chat nach einem Neuladen oder Update der Erweiterung wieder bereit, ohne den YouTube-Tab neu zu laden. Die Erweiterung fordert keine allgemeinen Berechtigungen für Browserverlauf, Tab-Lesen oder Webnavigation an.

Mit dieser Berechtigung kann sich die Erweiterung auch mit bereits geöffneten YouTube-Chats verbinden, wenn du sie installierst oder aktivierst.

## In deinem Browser gespeicherte Daten

Die Erweiterung speichert einige Daten, damit ihre Funktionen zwischen Seitenneuladungen funktionieren.

Sofern unten nicht anders angegeben, bleiben die Daten in diesem Abschnitt in deinem Browserprofil und werden nicht an Chat Enhancer gesendet. Dein Browser kann Erweiterungseinstellungen zwischen deinen eigenen angemeldeten Browserinstallationen synchronisieren.

- **Einstellungen:** deine Funktionsauswahl und Präferenzen.

- **Inbox-Daten:** überwachte Schlüsselwörter und bis zu 100 Inbox-Einträge pro Stream oder Replay. Inbox-Einträge können Nachrichtentext, Autorname, Zeitstempel, grundlegende YouTube-Nachrichtendetails, die zeigen, woher die gespeicherte Nachricht stammt, Trefferdetails sowie Emoji- oder Bildinformationen enthalten, die zum korrekten Anzeigen der gespeicherten Nachricht benötigt werden.

- **Daten häufiger Emojis:** lokale Nutzungszähler und Emoji-Anzeigeinformationen, die zum Aufbau der Zeile häufiger Emojis verwendet werden.

- **Lesezeichendaten:** gespeicherter Nachrichtentext und Emoji-Anzeigeinformationen, Name, Avatar-URL und – sofern verfügbar – Kanal-ID des Autors, Nachrichten- und Speicherzeit sowie Streamtitel und -URL. Lesezeichen bleiben streamübergreifend im aktuellen Browserprofil verfügbar.

- **Avatarringdaten:** der Autorenname, der Zeitpunkt, zu dem der Ring hinzugefügt wurde, die Stream-URL und, sofern verfügbar, die Avatar-URL, Kanal-ID und der Stream-Titel für Nutzer, denen du ausdrücklich über ihr Profil mit aktuellen Nachrichten einen Avatarring hinzufügst. Die Auswahl bleibt streamübergreifend im aktuellen Browserprofil verfügbar und dient nur zur Kennzeichnung passender Avatare.

- **Nicht gesendete Chatentwürfe:** werden für jeden Stream separat gespeichert und nach einer Seitenaktualisierung wiederhergestellt. Entwürfe werden entfernt, wenn das Chat-Eingabefeld geleert, die Nachricht gesendet oder Erweiterungsdaten zurückgesetzt werden.

- **Playground-Identitätsdaten:** eine zufällig generierte lokale Identität, die erstellt wird, wenn Playground verwendet wird. Damit wird dieselbe Browserinstallation beim erneuten Verbinden mit Playground wiedererkannt. Es ist nicht deine YouTube-Identität.

- **Temporäre Seitendaten:** aktuelle Profilnachrichten, Befehlsstatus und Übersetzungsergebnisse werden nur im Arbeitsspeicher der aktuellen Livechat-Seite gehalten. Sie werden gelöscht, wenn du die Chatseite verlässt oder aktualisierst.

## Außerhalb deines Browsers gesendete Daten

Nur wenn die zugehörige Funktion aktiviert und verwendet wird, werden Daten an diese Dienste gesendet:

### Google Translate (`translate-pa.googleapis.com`)

Die Chatübersetzung sendet Chatnachrichtentext, der im Livechat sichtbar und für die Übersetzung geeignet ist, während Übersetzung aktiviert ist. Die Entwurfsübersetzung sendet den Entwurfstext, den du aus dem Chatfeld übersetzen lässt.

Übersetzungsanfragen enthalten den zu übersetzenden Text und die Zielsprache. Die Erweiterung sendet keine YouTube-Cookies oder YouTube-Anmeldedaten mit Übersetzungsanfragen.

Der Zugriff auf Google Translate über `translate-pa.googleapis.com` ist inoffiziell und kann begrenzt, geändert oder nicht verfügbar sein.

### <span id="playground"></span>Chat Enhancer Playground ([playground.chatenhancer.com](https://playground.chatenhancer.com))

Wenn du Playground aktivierst und das Spielepanel verwendest, verbindet sich die Erweiterung mit dem Chat Enhancer Playground-Spielserver, damit Nutzer im selben Stream, die sich dafür entschieden haben, Verfügbarkeit sehen, Einladungen austauschen und Spiele spielen können.

Playground-Nachrichten können die YouTube-Stream- oder Video-ID, deine generierte Playground-Spieleridentität, deinen generierten Spielernamen, deine Liste verfügbarer Spiele, Einladungen und Einladungsantworten sowie Spielaktionen wie Schachzüge enthalten.

Playground speichert kompakte Spielergebnisse, die mit generierten Playground-Spieleridentitäten verknüpft sind, um Spielerstatistiken bereitzustellen. Gespeicherte Ergebnisse können die Spielversion, Start- und Endzeiten, Ergebnis und Abschlussgrund, Teilnehmerrollen sowie kleine spielspezifische Statistiken wie Züge oder Punkte enthalten. Sie enthalten keine Inhalte von Trivia-Fragen und keinen vollständigen Spielzustand.

Die Erweiterung sendet keinen Livechat-Nachrichtentext, deinen YouTube-Anzeigenamen, deine YouTube-Avatar-URL, YouTube-Cookies oder YouTube-Anmeldedaten an den Playground-Spielserver.

Separat kann die Generierung von HELP-A-FRIEND! Trivia-Fragen ausgewählte öffentliche YouTube-Videotranskriptausschnitte und Spielkennungen an den Playground-Spielserver senden. Diese Ausschnitte stammen aus dem Transkript des Videos, nicht aus dem Livechat. Der Server verwendet OpenAI, um aus diesen Ausschnitten Trivia-Fragen zu generieren.

Die Replay-Trivia-Generierung kann eine Cloudflare-Turnstile-Verifizierung auf [playground.chatenhancer.com](https://playground.chatenhancer.com) erfordern. Cloudflare kann normale Verifizierungsdaten wie IP-Adresse, Browser- und Geräteinformationen und das Challenge-Ergebnis erhalten.

Wie jeder Webdienst kann der Playground-Spielserver normale Verbindungsinformationen wie IP-Adresse und Browser-/Geräteinformationen vom Browser oder Netzwerkanbieter erhalten.

## Datenkontrollen

Du kannst Erweiterungsdaten über die Erweiterungspopup mit der Zurücksetzen-Schaltfläche löschen. Dadurch werden lokale Erweiterungsdaten und synchronisierte Erweiterungseinstellungen gelöscht und anschließend die Standardeinstellungen wiederhergestellt.

Du kannst die Erweiterung auch aus deinem Browser entfernen. Je nach Browser kann das Entfernen der Erweiterung auch ihren lokalen Erweiterungsspeicher löschen.

Das Zurücksetzen oder Entfernen der Erweiterung löscht nicht automatisch Spielergebnisse, die bereits von Playground gespeichert wurden.

## Was die Erweiterung nicht tut

- Analysen durchführen.
- Browserverlauf sammeln.
- Nutzerdaten verkaufen.
- Daten an einen Chat Enhancer-Server senden, sofern du nicht die oben beschriebenen optionalen Playground-Funktionen verwendest.

## Fragen

Bei Datenschutzfragen kannst du den [Support kontaktieren](https://www.chatenhancer.com/de/support).

Chat Enhancer for YouTube ist nicht mit YouTube oder Google verbunden.
