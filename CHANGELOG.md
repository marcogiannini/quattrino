# Registro delle modifiche

Il formato segue [Keep a Changelog](https://keepachangelog.com/it/1.1.0/) e le versioni seguono il [versionamento semantico](https://semver.org/lang/it/).

## [0.2.0] — 2026-11-15

### Aggiunto
- **Spese ricorrenti** (Impostazioni → Spese ricorrenti): entrate o uscite che si ripetono ogni settimana, mese o anno, con data di fine facoltativa. I movimenti vengono creati da soli a ogni scadenza, anche per le date passate se apri l'app dopo un po' (con anteprima di quanti ne verranno creati). Il giorno 31 si adatta ai mesi corti. I movimenti generati sono normali: si possono modificare o eliminare, e un'occorrenza eliminata non torna. Modificare importo, categoria o nota di una ricorrenza vale solo per le scadenze future.
- **Importazione da CSV** (Impostazioni → Importa da CSV): legge file con `;`, `,` o tabulazione, UTF-8 o Windows-1252, intestazioni italiane o inglesi, date `gg/mm/aaaa`, `mm/gg/aaaa` o ISO, importi con segno. Mostra un'anteprima con le righe non valide (numero di riga e motivo), permette di creare le categorie mancanti o usare "Altre spese/entrate" e salta i movimenti già presenti, quindi reimportare lo stesso file non crea doppioni. I file esportati da Quattrino si reimportano identici.
- **Interfaccia in inglese** con scelta della lingua in Impostazioni (Italiano / English). Alla prima apertura segue la lingua del browser o del sistema. Date, numeri, categorie predefinite, messaggi d'errore ed esportazione CSV seguono la lingua scelta. La lingua è un'impostazione sincronizzata: vale per tutti i tuoi dispositivi.
- 41 nuovi test automatici (158 in totale): ricorrenze, migrazione, import CSV, traduzioni e interfaccia in inglese.

### Cambiato
- **Schema dei dati 1 → 2** (nuova tabella delle ricorrenze). I dati della 0.1.x si migrano da soli all'apertura e i vecchi backup si leggono ancora.
- Dopo l'aggiornamento, i backup esportati sono nel formato nuovo: **le versioni 0.1.x non li leggono** (lo segnalano come "versione più recente").

### Da sapere
- Con la sincronizzazione Google Drive attiva **aggiorna tutti i dispositivi alla 0.2.0**: un dispositivo 0.1.x non legge i file della 0.2.0 e lo segnala senza rovinarli.
- Frequenza e prima scadenza di una ricorrenza non si modificano dopo la creazione (per cambiarle: elimina e ricrea). Eliminare una ricorrenza non elimina i movimenti già creati.
- Il formato delle date nell'importazione si sceglie a mano (giorno/mese o mese/giorno): non viene indovinato.
- L'importazione non riconosce formati bancari con importi in colonne separate "Dare/Avere" né più valute.

### Limiti noti (invariati dalla 0.1.0)
- L'app desktop non sincronizza con Google Drive; Android e iOS non hanno ancora app dedicate; una sola valuta per volta; token Google e passphrase solo in memoria; l'uso offline della web app parte dalla seconda apertura con la rete.
- Nessuna notifica di budget.

### Verifiche eseguite
- 158 test automatici, controllo dei tipi e build di produzione.
- Prova nel browser (Chromium, telefono): le 13 verifiche della 0.1.0 (nessuna regressione) e 19 nuove: creazione di una ricorrenza con anteprima, nessun doppione dopo il ricaricamento, importazione di un CSV Windows-1252 con una riga errata, secondo import senza duplicati, cambio lingua persistente, errori di validazione in inglese, lingua iniziale dal browser.
- App desktop 0.2.0 compilata e avviata su **Linux**.

### Non verificato
- Importazione di estratti conto reali di banche o carte (provato solo con file di prova).
- Sincronizzazione reale tra dispositivi con ricorrenze (provata con cloud simulato e con unioni tra registri nei test).
- App desktop su **Windows e macOS**, installer prodotti da GitHub Actions, finestre di salvataggio native.
- Traduzione rivista da una persona madrelingua inglese; screen reader.

## [0.1.0] — 2026-11-15

Prima versione pubblica (anteprima).

### Aggiunto
- **Movimenti**: registrazione, modifica ed eliminazione (con "Annulla") di entrate e uscite con importo, categoria, data e nota. Gli importi accettano i formati usuali (`12,50`, `1.234,56`, `1,234.56`) e sono memorizzati in centesimi interi.
- **Categorie**: nove categorie predefinite (Alimentari, Trasporti, Casa, Salute, Svago, Utenze, Altre spese, Stipendio, Altre entrate), categorie personalizzate, rinomina e archiviazione senza perdere lo storico.
- **Statistiche**: totali di entrate e uscite, grafico mensile entrate/uscite, ripartizione per categoria; periodi: mese, ultimi 3/6/12 mesi, anno solare.
- **Budget**: limiti mensili per categoria e complessivo, con stato "in linea", "vicino al limite" (dall'80%) e "superato", espresso anche a parole.
- **Ricerca e filtri** sui movimenti; esportazione **CSV** compatibile con Excel italiano.
- **Uso offline**: i dati risiedono sul dispositivo e l'app funziona senza rete; installabile come web app (PWA).
- **Backup e ripristino su file**, cifrabile con passphrase; ripristino per unione o sostitutivo.
- **Sincronizzazione cifrata con Google Drive** (solo versione web): cifratura end-to-end (PBKDF2 → AES-256-GCM), un file per dispositivo nella cartella privata dell'app (`drive.appdata`), unione automatica dei conflitti con registro e possibilità di ripristinare la versione scartata.
- **App web** pubblicabile su qualsiasi hosting statico, anche in una sottocartella; pubblicazione automatica su GitHub Pages.
- **App desktop** (Tauri 2) per Windows, macOS e Linux, con installer prodotti da GitHub Actions al momento di un tag di versione.
- Interfaccia in italiano, tema chiaro/scuro automatico, layout per telefono e desktop.
- Suite di 117 test automatici e controllo automatico (test e build) a ogni push.

### Limiti noti
- **L'app desktop non sincronizza con Google Drive**: l'accesso di Google non funziona dentro la finestra dell'app e il flusso nativo non è ancora collegato. Si può usare il backup su file in una cartella sincronizzata da un altro servizio.
- Le app per **Android e iOS** non sono ancora incluse (la versione web si può installare sul telefono).
- Il Client ID Google, il progetto Google Cloud e la verifica dell'app sono a carico di chi pubblica l'app; in modalità "Testing" di Google i token scadono dopo 7 giorni.
- Se si perde la passphrase, i dati sul cloud non sono recuperabili (quelli sul dispositivo restano).
- La risoluzione dei conflitti lavora sul singolo record: se due dispositivi cambiano campi diversi dello stesso movimento, vince la modifica più recente (l'altra è recuperabile dal registro conflitti).
- Token Google e passphrase restano solo in memoria: dopo un riavvio vanno reinseriti.
- Una sola valuta per volta, senza conversione degli importi; testi disponibili solo in italiano.
- Nessuna gestione di spese ricorrenti, importazione da CSV o notifiche. *(ricorrenze, import CSV e inglese sono arrivati nella 0.2.0)*
- L'uso offline della web app parte dalla seconda apertura con la rete.

### Verifiche eseguite
- 117 test automatici, controllo dei tipi e build di produzione.
- Prova nel browser (Chromium, telefono e desktop): inserimento, modifica, eliminazione con annulla, budget, categorie, statistiche, persistenza dopo ricarica, uso e riapertura offline, funzionamento da una sottocartella.
- App desktop compilata e avviata su **Linux**.

### Non verificato
- Qualsiasi chiamata reale a Google Drive (l'adattatore è provato solo con risposte simulate).
- App desktop su **Windows e macOS**, installazione dai pacchetti e finestre di salvataggio native.
- Screen reader, grandi volumi di dati, Safari in navigazione privata, tema scuro e schermata Impostazioni su telefoni reali.

[0.2.0]: https://github.com/OWNER/quattrino/releases/tag/v0.2.0
[0.1.0]: https://github.com/OWNER/quattrino/releases/tag/v0.1.0
