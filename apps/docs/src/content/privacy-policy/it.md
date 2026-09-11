---
locale: it
title: "Informativa sulla privacy"
description: "Come Chat Enhancer for YouTube gestisce archiviazione locale, traduzione, dati Playground e controlli privacy."
---

# Privacy

Ultimo aggiornamento: 11 settembre 2026

Chat Enhancer for YouTube è un’estensione del browser per la live chat di YouTube. È progettata per aggiungere piccole funzioni alla chat senza sostituire la chat di YouTube o raccogliere dati analitici.

In breve:

- La maggior parte delle funzioni dell’estensione viene eseguita localmente nel tuo browser.
- La traduzione è disattivata per impostazione predefinita.
- Quando la traduzione è attiva, il testo da tradurre viene inviato a Google Translate.
- I giochi Playground sono disattivati per impostazione predefinita. Se attivi e usi Playground, presenza di gioco, inviti e azioni di gioco vengono inviati al server di gioco Chat Enhancer Playground con un nome giocatore generato.
- L’estensione non esegue analitiche, non vende dati e non raccoglie la cronologia di navigazione.

## Dove viene eseguita l’estensione

L’estensione viene eseguita sulle pagine di live chat e replay della live chat di YouTube. Viene eseguita anche sulle pagine di YouTube per supportare video e chat in modalità picture-in-picture.

L’estensione usa un’autorizzazione per salvare le proprie impostazioni e i propri dati nel browser. Usa inoltre l’accesso ai siti specifici necessari al funzionamento delle sue funzioni: pagine di live chat di YouTube, servizio di traduzione Google Translate e server di gioco Chat Enhancer Playground opzionale.

In Chrome ed Edge, l’autorizzazione `scripting` riconnette la modalità picture-in-picture di video e chat dopo il ricaricamento o l’aggiornamento dell’estensione, senza ricaricare la scheda di YouTube. L’estensione non richiede autorizzazioni generali per cronologia di navigazione, lettura delle schede o navigazione web.

Questa autorizzazione consente inoltre all’estensione di collegarsi alle chat di YouTube già aperte quando la installi o la attivi.

## Dati archiviati nel tuo browser

L’estensione archivia alcuni dati affinché le sue funzioni possano funzionare tra i ricaricamenti della pagina.

Salvo diversa indicazione qui sotto, i dati di questa sezione restano nel tuo profilo browser e non vengono inviati a Chat Enhancer. Il browser può sincronizzare le impostazioni dell’estensione tra le tue installazioni con accesso effettuato.

- **Impostazioni:** le tue scelte e preferenze per le funzioni.

- **Dati Inbox:** parole chiave monitorate e fino a 100 record Inbox per stream o replay. I record Inbox possono includere testo del messaggio, nome dell’autore, timestamp, dettagli di base del messaggio YouTube necessari per mostrare da dove proviene il messaggio salvato, dettagli di corrispondenza e informazioni su emoji o immagini necessarie per mostrare correttamente il messaggio salvato.

- **Dati degli emoji frequenti:** conteggi d’uso locali e informazioni di visualizzazione emoji usate per creare la riga degli emoji frequenti.

- **Dati dei segnalibri:** il testo del messaggio salvato e le informazioni per mostrare gli emoji, il nome, l’URL dell’avatar e, se disponibile, l’ID canale dell’autore, gli orari del messaggio e del salvataggio, oltre al titolo e all’URL dello stream. I segnalibri restano disponibili tra gli stream nel profilo browser corrente.

- **Dati degli anelli avatar:** il nome dell’autore, la data e l’ora in cui è stato aggiunto l’anello, l’URL dello stream e, se disponibili, l’URL dell’avatar, l’ID canale e il titolo dello stream per gli utenti a cui aggiungi esplicitamente un anello dal profilo dei messaggi recenti. La selezione resta disponibile tra gli stream nel profilo browser corrente e serve solo a decorare gli avatar corrispondenti.

- **Bozze di chat non inviate:** salvate separatamente per ogni stream e ripristinate dopo un aggiornamento della pagina. Le bozze vengono rimosse quando il campo chat viene svuotato, il messaggio viene inviato o i dati dell’estensione vengono reimpostati.

- **Dati dell’identità Playground:** un’identità locale generata casualmente e creata se Playground viene usato. Serve a riconoscere la stessa installazione del browser quando si riconnette a Playground. Non è la tua identità YouTube.

- **Dati temporanei della pagina:** i messaggi recenti del profilo, lo stato dei comandi e i risultati di traduzione vengono conservati solo in memoria per la pagina di live chat corrente. Vengono cancellati quando lasci o aggiorni la pagina della chat.

## Dati inviati fuori dal tuo browser

I dati vengono inviati a questi servizi solo quando la funzione corrispondente è attiva e viene usata:

### Google Translate (`translate-pa.googleapis.com`)

La traduzione della chat invia il testo dei messaggi visibili nella live chat e idonei alla traduzione mentre la traduzione è attiva. La traduzione delle bozze invia il testo della bozza che scegli di tradurre dal campo chat.

Le richieste di traduzione includono il testo da tradurre e la lingua di destinazione. L’estensione non invia i tuoi cookie YouTube o le tue credenziali YouTube con le richieste di traduzione.

L’accesso a Google Translate tramite `translate-pa.googleapis.com` non è ufficiale e può essere limitato, modificato o non disponibile.

### <span id="playground"></span>Chat Enhancer Playground ([playground.chatenhancer.com](https://playground.chatenhancer.com))

Se attivi Playground e usi il pannello giochi, l’estensione si connette al server di gioco Chat Enhancer Playground affinché gli utenti opt-in nello stesso stream possano vedere la disponibilità, scambiarsi inviti e giocare.

I messaggi Playground possono includere l’identificatore dello stream o del video YouTube, la tua identità giocatore Playground generata, il tuo nome giocatore generato, la tua lista di giochi disponibili, inviti e risposte agli inviti, e azioni di gioco come mosse di scacchi.

Playground memorizza risultati compatti delle partite collegati alle identità giocatore Playground generate per fornire statistiche dei giocatori. I risultati memorizzati possono includere la versione del gioco, orari di inizio e fine, esito e motivo della conclusione, ruoli dei partecipanti e piccole statistiche specifiche del gioco, come mosse o punteggi. Non includono il contenuto delle domande trivia o lo stato completo della partita.

L’estensione non invia al server di gioco Playground il testo della live chat, il tuo nome visualizzato YouTube, l’URL del tuo avatar YouTube, cookie YouTube o credenziali YouTube.

Separatamente, la generazione di domande HELP-A-FRIEND! Trivia può inviare estratti selezionati di trascrizioni pubbliche di video YouTube e identificatori di gioco al server di gioco Playground. Questi estratti provengono dalla trascrizione del video, non dalla live chat. Il server usa OpenAI per generare domande trivia da quegli estratti.

La generazione di Replay Trivia può richiedere verifica Cloudflare Turnstile su [playground.chatenhancer.com](https://playground.chatenhancer.com). Cloudflare può ricevere dati normali di verifica come indirizzo IP, informazioni sul browser e sul dispositivo, e risultato della sfida.

Come qualsiasi servizio web, il server di gioco Playground può ricevere normali informazioni di connessione come indirizzo IP e informazioni sul browser/dispositivo dal browser o dal provider di rete.

## Controlli sui dati

Puoi cancellare i dati dell’estensione dal popup dell’estensione usando il pulsante di reset. Questo cancella i dati locali dell’estensione e le impostazioni sincronizzate dell’estensione, poi ripristina le impostazioni predefinite.

Puoi anche rimuovere l’estensione dal browser. A seconda del browser, rimuovere l’estensione può anche rimuovere il suo archivio locale.

Reimpostare o rimuovere l’estensione non elimina automaticamente i risultati delle partite già memorizzati da Playground.

## Cosa non fa l’estensione

- Eseguire analitiche.
- Raccogliere la cronologia di navigazione.
- Vendere dati utente.
- Inviare dati a un server Chat Enhancer, salvo che tu usi le funzioni Playground opt-in descritte sopra.

## Domande

Per domande sulla privacy, [contatta l’assistenza](https://www.chatenhancer.com/it/support).

Chat Enhancer for YouTube non è affiliato a YouTube o Google.
