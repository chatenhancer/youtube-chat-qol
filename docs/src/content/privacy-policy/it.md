---
locale: it
title: "Informativa sulla privacy"
description: "Come Chat Enhancer for YouTube gestisce archiviazione locale, traduzione, dati Playground e controlli privacy."
---

# Privacy

Ultimo aggiornamento: 17 giugno 2026

Chat Enhancer for YouTube è un’estensione del browser per la live chat di YouTube. È progettata per aggiungere piccole funzioni alla chat senza sostituire la chat di YouTube o raccogliere dati analitici.

In breve:

- La maggior parte delle funzioni dell’estensione viene eseguita localmente nel tuo browser.
- La traduzione è disattivata per impostazione predefinita.
- Quando la traduzione è attiva, il testo da tradurre viene inviato a Google Translate.
- I giochi Playground sono disattivati per impostazione predefinita. Se attivi e usi Playground, presenza di gioco, inviti e azioni di gioco vengono inviati al backend Chat Enhancer Playground con un nome giocatore generato.
- L’estensione non esegue analitiche, non vende dati e non raccoglie la cronologia di navigazione.

## Dove viene eseguita l’estensione

L’estensione viene eseguita solo sulle pagine di live chat e replay della live chat di YouTube corrispondenti al manifesto dell’estensione.

L’estensione usa l’autorizzazione `storage` del browser, oltre all’accesso host per le pagine di live chat di YouTube, l’endpoint di traduzione di Google e il backend Playground opzionale. Non richiede autorizzazioni generali per cronologia di navigazione, lettura delle schede, scripting o navigazione web.

## Dati archiviati nel tuo browser

L’estensione archivia alcuni dati affinché le sue funzioni possano funzionare tra i ricaricamenti della pagina.

- **Le impostazioni sono archiviate con `chrome.storage.sync`:** a seconda delle impostazioni del browser, il browser può sincronizzare queste impostazioni dell’estensione tra le tue installazioni del browser con accesso effettuato.

- **I dati Inbox sono archiviati con `chrome.storage.local`:** includono parole chiave monitorate e fino a 100 record Inbox per stream o replay. I record Inbox possono includere testo del messaggio, nome dell’autore, timestamp, metadati del messaggio/fonte YouTube, metadati di corrispondenza e dati di visualizzazione emoji/immagine necessari per mostrare il messaggio salvato.

- **I dati degli emoji frequenti sono archiviati con `chrome.storage.local`:** includono conteggi d’uso locali e metadati di visualizzazione emoji usati per creare la riga degli emoji frequenti.

- **I dati degli utenti salvati sono archiviati con `chrome.storage.local`:** includono l’handle dell’utente salvato, l’ID canale quando disponibile e l’ora in cui il segnalibro è stato creato. Gli utenti salvati sono globali tra gli stream nel profilo browser corrente e vengono usati per mostrare anelli avatar colorati.

- **Le bozze di chat non inviate sono archiviate con `chrome.storage.local` per stream:** vengono ripristinate dopo un aggiornamento della pagina. Le bozze vengono rimosse quando il campo chat viene svuotato, il messaggio viene inviato o i dati dell’estensione vengono reimpostati.

- **Lo stato della scheda live chat è archiviato con `chrome.storage.local`:** è limitato agli ID delle schede del browser e ai timestamp dell’ultima attività per le schede live chat di YouTube attive di recente, e viene usato per mostrare se l’estensione è attualmente connessa o disconnessa. Questi record scadono dopo 12 ore.

- **I dati dell’identità Playground sono archiviati con `chrome.storage.local` se Playground viene usato:** si tratta di una coppia di chiavi pubblica/privata generata per firmare le sfide di connessione Playground, così la stessa installazione del browser può mantenere la stessa identità Playground pseudonima. Non è la tua identità YouTube.

- **Messaggi recenti del profilo, stato dei comandi e risultati di traduzione vengono conservati solo in memoria per la pagina di live chat corrente. Vengono cancellati quando la pagina viene scaricata.**

## Dati inviati fuori dal tuo browser

La traduzione della chat e la traduzione delle bozze sono disattivate per impostazione predefinita.

Quando le funzioni di traduzione o Playground sono attive, i dati possono essere inviati a questi servizi:

- **Google Translate su `https://translate.googleapis.com/translate_a/single`**

  La traduzione della chat invia il testo dei messaggi visibili e in arrivo idonei. La traduzione delle bozze invia il testo della bozza che scegli di tradurre dal campo chat.

  Le richieste di traduzione includono il testo da tradurre e la lingua di destinazione. L’estensione non invia i tuoi cookie YouTube o le tue credenziali YouTube con le richieste di traduzione.

  L’accesso a Google Translate tramite `translate.googleapis.com` non è ufficiale e può essere limitato, modificato o non disponibile.

- **Chat Enhancer Playground su `https://playground.chatenhancer.com`**

  Playground è disattivato per impostazione predefinita. Se attivi Playground e usi il pannello giochi, l’estensione si connette al backend Playground affinché gli utenti opt-in nello stesso stream possano vedere la disponibilità, scambiarsi inviti e giocare.

  I messaggi Playground possono includere la chiave dello stream/video, la tua chiave pubblica Playground generata e la firma, il tuo nome giocatore generato, la tua lista di giochi disponibili, inviti e risposte agli inviti, e azioni di gioco come mosse di scacchi.

  La generazione di domande HELP-A-FRIEND! Trivia può inviare estratti selezionati della trascrizione replay di YouTube e identificatori di gioco al backend Playground. Il backend usa OpenAI per generare domande trivia da quegli estratti.

  La generazione di Replay Trivia può richiedere verifica Cloudflare Turnstile su `https://playground.chatenhancer.com`. Cloudflare può ricevere dati normali di verifica come indirizzo IP, user agent e risultato della sfida.

  Playground non invia al backend Playground il testo della live chat, il tuo nome visualizzato YouTube, l’URL del tuo avatar YouTube, cookie YouTube o credenziali YouTube.

  Come qualsiasi servizio web, il backend Playground può ricevere metadati normali di connessione come indirizzo IP e user agent dal browser o dal provider di rete.

## Controlli sui dati

Puoi cancellare i dati dell’estensione dal popup dell’estensione usando il pulsante di reset. Questo cancella i dati locali dell’estensione e le impostazioni sincronizzate dell’estensione, poi ripristina le impostazioni predefinite.

Puoi anche rimuovere l’estensione dal browser. A seconda del browser, rimuovere l’estensione può anche rimuovere il suo archivio locale.

## Cosa non viene raccolto

L’estensione non esegue analitiche.

L’estensione non raccoglie la cronologia di navigazione.

L’estensione non vende dati utente.

Tranne per i giochi Playground opt-in descritti sopra, l’estensione non invia dati a un server di proprietà dell’estensione.

L’estensione non archivia messaggi recenti del profilo o risultati di traduzione dopo che la pagina live chat viene scaricata.

Chat Enhancer for YouTube non è affiliato a YouTube o Google.

Per domande sulla privacy, usa il link email su https://www.chatenhancer.com.
