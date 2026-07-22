---
locale: it
title: "Informativa sulla privacy"
description: "Come Chat Enhancer for YouTube gestisce archiviazione locale, traduzione, dati Playground e controlli privacy."
---

# Privacy

Ultimo aggiornamento: 21 giugno 2026

Chat Enhancer for YouTube è un’estensione del browser per la live chat di YouTube. È progettata per aggiungere piccole funzioni alla chat senza sostituire la chat di YouTube o raccogliere dati analitici.

In breve:

- La maggior parte delle funzioni dell’estensione viene eseguita localmente nel tuo browser.
- La traduzione è disattivata per impostazione predefinita.
- Quando la traduzione è attiva, il testo da tradurre viene inviato a Google Translate.
- I giochi Playground sono disattivati per impostazione predefinita. Se attivi e usi Playground, presenza di gioco, inviti e azioni di gioco vengono inviati al server di gioco Chat Enhancer Playground con un nome giocatore generato.
- L’estensione non esegue analitiche, non vende dati e non raccoglie la cronologia di navigazione.

## Dove viene eseguita l’estensione

L’estensione viene eseguita solo sulle pagine di live chat e replay della live chat di YouTube a cui l’estensione è autorizzata ad accedere.

L’estensione usa un’autorizzazione per salvare le proprie impostazioni e i propri dati nel browser. Usa inoltre l’accesso ai siti specifici necessari al funzionamento delle sue funzioni: pagine di live chat di YouTube, servizio di traduzione Google Translate e server di gioco Chat Enhancer Playground opzionale.

L’estensione non richiede autorizzazioni generali per cronologia di navigazione, lettura delle schede, scripting o navigazione web.

## Dati archiviati nel tuo browser

L’estensione archivia alcuni dati affinché le sue funzioni possano funzionare tra i ricaricamenti della pagina.

I dati elencati in questa sezione sono archiviati dall’estensione nel tuo profilo browser. Non vengono inviati a Chat Enhancer, salvo che siano elencati anche nella sezione "Dati inviati fuori dal tuo browser" qui sotto.

- **Impostazioni:** salvate usando l’archiviazione sincronizzata dell’estensione del browser (`chrome.storage.sync`). A seconda delle impostazioni del browser, il browser può sincronizzare queste impostazioni dell’estensione tra le tue installazioni del browser con accesso effettuato.

- **Dati Inbox:** salvati usando l’archiviazione locale dell’estensione (`chrome.storage.local`). Includono parole chiave monitorate e fino a 100 record Inbox per stream o replay. I record Inbox possono includere testo del messaggio, nome dell’autore, timestamp, dettagli di base del messaggio YouTube necessari per mostrare da dove proviene il messaggio salvato, dettagli di corrispondenza e informazioni su emoji o immagini necessarie per mostrare correttamente il messaggio salvato.

- **Dati degli emoji frequenti:** salvati usando l’archiviazione locale dell’estensione (`chrome.storage.local`). Includono conteggi d’uso locali e informazioni di visualizzazione emoji usate per creare la riga degli emoji frequenti.

- **Dati dei segnalibri:** salvati usando l’archiviazione locale dell’estensione (`chrome.storage.local`). Possono includere il testo del messaggio salvato e le informazioni per mostrare gli emoji, il nome, l’URL dell’avatar e, se disponibile, l’ID canale dell’autore, gli orari del messaggio e del salvataggio, oltre al titolo e all’URL dello stream. I segnalibri restano disponibili tra gli stream nel profilo browser corrente.

- **Dati degli anelli avatar:** salvati usando l’archiviazione locale dell’estensione (`chrome.storage.local`). Includono il nome dell’autore, la data e l’ora in cui è stato aggiunto l’anello, l’URL dello stream e, se disponibili, l’URL dell’avatar, l’ID canale e il titolo dello stream per gli utenti a cui aggiungi esplicitamente un anello dal profilo dei messaggi recenti. La selezione resta disponibile tra gli stream nel profilo browser corrente e serve solo a decorare gli avatar corrispondenti; non controlla se un utente è online.

- **Bozze di chat non inviate:** salvate usando l’archiviazione locale dell’estensione (`chrome.storage.local`) per stream. Vengono ripristinate dopo un aggiornamento della pagina. Le bozze vengono rimosse quando il campo chat viene svuotato, il messaggio viene inviato o i dati dell’estensione vengono reimpostati.

- **Dati dell’identità Playground:** salvati usando l’archiviazione locale dell’estensione (`chrome.storage.local`) se Playground viene usato. È un’identità Playground locale generata casualmente usata per riconoscere la stessa installazione del browser quando si riconnette a Playground. Non è la tua identità YouTube.

- **Messaggi recenti del profilo, stato dei comandi e risultati di traduzione:** vengono conservati solo in memoria per la pagina di live chat corrente. Vengono cancellati quando lasci o aggiorni la pagina della chat.

## Dati inviati fuori dal tuo browser

La traduzione della chat, la traduzione delle bozze e i giochi Playground sono disattivati per impostazione predefinita.

Quando le funzioni di traduzione o Playground sono attive e vengono usate, i dati possono essere inviati a questi servizi:

- **Google Translate su `https://translate.googleapis.com/translate_a/single`**

  La traduzione della chat invia il testo dei messaggi visibili nella live chat e idonei alla traduzione mentre la traduzione è attiva. La traduzione delle bozze invia il testo della bozza che scegli di tradurre dal campo chat.

  Le richieste di traduzione includono il testo da tradurre e la lingua di destinazione. L’estensione non invia i tuoi cookie YouTube o le tue credenziali YouTube con le richieste di traduzione.

  L’accesso a Google Translate tramite `translate.googleapis.com` non è ufficiale e può essere limitato, modificato o non disponibile.

- <span id="playground"></span>**Chat Enhancer Playground su `https://playground.chatenhancer.com`**

  Playground è disattivato per impostazione predefinita. Se attivi Playground e usi il pannello giochi, l’estensione si connette al server di gioco Chat Enhancer Playground affinché gli utenti opt-in nello stesso stream possano vedere la disponibilità, scambiarsi inviti e giocare.

  I messaggi Playground possono includere l’identificatore dello stream o del video YouTube, la tua identità giocatore Playground generata, il tuo nome giocatore generato, la tua lista di giochi disponibili, inviti e risposte agli inviti, e azioni di gioco come mosse di scacchi.

  Playground non invia al server di gioco Playground il testo della live chat, il tuo nome visualizzato YouTube, l’URL del tuo avatar YouTube, cookie YouTube o credenziali YouTube.

  Separatamente, la generazione di domande HELP-A-FRIEND! Trivia può inviare estratti selezionati di trascrizioni pubbliche di video YouTube e identificatori di gioco al server di gioco Playground. Questi estratti provengono dalla trascrizione del video, non dalla live chat. Il server usa OpenAI per generare domande trivia da quegli estratti.

  La generazione di Replay Trivia può richiedere verifica Cloudflare Turnstile su `https://playground.chatenhancer.com`. Cloudflare può ricevere dati normali di verifica come indirizzo IP, informazioni sul browser e sul dispositivo, e risultato della sfida.

  Come qualsiasi servizio web, il server di gioco Playground può ricevere normali informazioni di connessione come indirizzo IP e informazioni sul browser/dispositivo dal browser o dal provider di rete.

## Controlli sui dati

Puoi cancellare i dati dell’estensione dal popup dell’estensione usando il pulsante di reset. Questo cancella i dati locali dell’estensione e le impostazioni sincronizzate dell’estensione, poi ripristina le impostazioni predefinite.

Puoi anche rimuovere l’estensione dal browser. A seconda del browser, rimuovere l’estensione può anche rimuovere il suo archivio locale.

## Cosa non fa Chat Enhancer

L’estensione non esegue analitiche.

L’estensione non raccoglie la cronologia di navigazione.

L’estensione non vende dati utente.

Tranne per le funzioni Playground opt-in descritte sopra, l’estensione non invia dati a un server Chat Enhancer.

L’estensione non archivia messaggi recenti del profilo o risultati di traduzione dopo che lasci o aggiorni la pagina live chat.

Chat Enhancer for YouTube non è affiliato a YouTube o Google.

Per domande sulla privacy, usa il link email su https://www.chatenhancer.com.
