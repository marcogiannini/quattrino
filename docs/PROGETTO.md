# Quattrino — progetto dell'app per le spese personali

Documento di progetto. Per installare e provare il codice vedi `README.md`.

## 0. Ipotesi e decisioni principali

**Ipotesi**
- Utente singolo, uno o più dispositivi propri; nessun account "Quattrino" e nessun server nostro da gestire.
- Una sola valuta per volta (impostabile); gli importi non vengono convertiti.
- I dati sono finanziari e quindi sensibili: la privacy viene prima della comodità.
- Il cloud serve solo a sincronizzare e a fare da copia di sicurezza, mai a far funzionare l'app.

**Decisioni**
| Tema | Scelta | Perché |
|---|---|---|
| Codice | Un'unica base TypeScript + React | Un solo progetto per cinque sistemi operativi |
| Distribuzione | PWA subito; desktop con Tauri 2; mobile con Capacitor | Ogni guscio incapsula la stessa app web |
| Dati | Offline-first: il database locale è l'unica fonte di verità | L'app non dipende mai dalla rete |
| Importi | Interi in centesimi | Niente errori di virgola mobile |
| Sync | Un file cifrato per dispositivo, unione per record con orologio ibrido | Nessun lock sul cloud, convergenza garantita |
| Cloud | Google Drive `appDataFolder` (scope `drive.appdata`), dietro un'interfaccia sostituibile | Scope non sensibile, cartella privata dell'app |
| Cifratura | Passphrase → PBKDF2 → AES-256-GCM, end-to-end | Google vede solo byte cifrati |
| Backup | File cifrato locale, indipendente da qualsiasi cloud | Drive non basta come unica copia (vedi §5.4) |

## 1. Funzionalità essenziali e flusso d'uso

**Essenziali (implementate)**
1. Registrare, modificare, eliminare (con "Annulla") entrate e uscite: importo, categoria, data, nota.
2. Categorie predefinite (Alimentari, Trasporti, Casa, Salute, Svago, Utenze, Altre spese, Stipendio, Altre entrate) e personalizzate (crea, rinomina, archivia senza perdere lo storico).
3. Statistiche: spese per categoria, entrate contro uscite per mese, periodi (mese, 3/6/12 mesi, anno).
4. Budget mensili per categoria e complessivo, con stato "in linea / vicino al limite (≥80%) / superato".
5. Ricerca e filtri sui movimenti. Esportazione CSV (Excel italiano) e importazione da CSV (v0.2.0).
6. Sincronizzazione cifrata (Google Drive), conflitti, backup e ripristino.

**Flusso principale**: apro l'app → tocco **+** → importo, categoria, (data, nota) → Salva → la panoramica si aggiorna subito → se il budget della categoria si avvicina al limite lo vedo nella panoramica → a fine mese consulto le Statistiche. La sincronizzazione parte da sola in background; l'app funziona identica anche senza rete.

## 2. Tecnologia consigliata

- **Nucleo**: TypeScript (tipi rigorosi), React 18, Vite. Nessuna libreria di grafici o di stato: grafici in SVG/HTML accessibili, stato in una classe (`Ledger`) osservata da React.
- **Archiviazione locale**: IndexedDB (browser e WebView). Nei gusci nativi si può passare a SQLite senza toccare il nucleo (interfaccia `StorageAdapter`).
- **Desktop (Windows, macOS, Linux)**: Tauri 2, che usa il WebView di sistema e produce installer piccoli.
- **Mobile (Android, iOS)**: Capacitor.
- **Alternative scartate**: Flutter e Kotlin Multiplatform (ottimi, ma richiedono di riscrivere tutto in un altro linguaggio, e per questa app l'interfaccia è semplice); app native separate (cinque basi di codice da mantenere).
- **Compromessi onesti**: un WebView non è identico a un'app nativa nelle animazioni e nell'integrazione col sistema; iOS richiede un Mac e un account sviluppatore Apple a pagamento per installare fuori dal simulatore.

## 3. Modello dei dati e architettura

```
src/
  core/            logica pura, senza UI né rete (tutta testata)
    types.ts       modello dati
    hlc.ts         orologio ibrido (ordinamento delle modifiche)
    ledger.ts      registro locale: unica fonte di verità
    merge.ts       unione di due snapshot (last-writer-wins per record)
    snapshot.ts    validazione rigorosa dei dati esterni
    stats.ts       totali, serie mensili, budget
    crypto.ts      PBKDF2 + AES-GCM
    backup.ts      backup cifrato, ripristino, CSV
    sync/          engine, interfaccia cloud, adattatore Drive, OAuth
  storage/         IndexedDB, memoria
  ui/              React: schermate, grafici, hook di sync
```

**Entità** (tutte con `id` stabile, `updatedAt` HLC, cancellazione logica `deleted`):
- `Transaction`: `type` (entrata/uscita), `amountCents` (intero > 0), `categoryId`, `date` (YYYY-MM-DD, senza fuso), `note`, `createdAt`, `recurringId` (solo se generato da una ricorrenza).
- `Category`: `name`, `kind` (entrata/uscita/entrambe), `icon`, `color`, `builtin`, `archived`. Le predefinite hanno id fissi uguali su tutti i dispositivi, così non si duplicano.
- `Budget`: `categoryId` (o `null` = totale uscite), `amountCents`, mensile ricorrente. Id deterministico per categoria: due dispositivi che impostano il budget della stessa categoria convergono su un solo record.
- `RecurringRule` (schema 2, v0.2.0): `type`, `amountCents`, `categoryId`, `note`, `frequency` (settimanale/mensile/annuale), `startDate`, `endDate` (opzionale). Frequenza e inizio non si modificano: per cambiarli si elimina la regola e se ne crea un'altra, così le occorrenze già create non si duplicano.
- `Settings`: valuta e lingua (`locale`: `it-IT` / `en-GB`). La lingua è un dato sincronizzato: vale per tutti i dispositivi.

**Ricorrenze e sincronizzazione.** Le occorrenze sono movimenti normali con id deterministico (`<idRegola>-<data>`) e timestamp deterministico e "vecchio" (due giorni prima della data). Se due dispositivi generano la stessa occorrenza il risultato è identico: nessun doppione e nessun falso conflitto; qualunque modifica o eliminazione dell'utente ha un timestamp più recente e vince sempre; un'occorrenza eliminata non viene ricreata (resta il segno di cancellazione). Le occorrenze si generano all'apertura, a ogni modifica/sincronizzazione e ogni ora, fino a oggi (tetto di sicurezza: 1000 per regola). Mensile: il giorno 31 si adatta ai mesi corti (28/29/30) senza "scivolare" nei mesi successivi.

**Schema 2 e compatibilità.** Lo schema dei dati passa da 1 a 2 (nuova tabella `recurring`). I dati locali della 0.1.x si migrano all'apertura senza perdere nulla; backup e file remoti dello schema 1 si leggono ancora. Un'app 0.1.x che trova un file dello schema 2 lo segnala come "versione più recente" e lo ignora (non lo rovina): con la sincronizzazione attiva **aggiornare tutti i dispositivi** alla 0.2.0.

**Importazione CSV.** Lettura RFC 4180 (virgolette, a capo nei campi, BOM), separatore riconosciuto (`;` `,` tab), codifica UTF-8 con ripiego su Windows-1252, intestazioni italiane/inglesi, date ISO/gg-mm-aaaa/mm-gg-aaaa, importi con segno (`-12,50`, `(12,50)`, `12,50-`). Ogni riga è validata: le non valide sono elencate con numero di riga e motivo senza bloccare le altre. Categorie non riconosciute: create o assegnate a "Altre spese/entrate". I duplicati (stessa data, tipo, importo, categoria, nota) si saltano contando le occorrenze, quindi un file con due righe identiche legittime resta corretto e reimportare lo stesso file non duplica. Limiti: 5 MB e 20.000 righe.

**Traduzioni.** Catalogo italiano/inglese in `src/i18n`; il tipo dell'inglese obbliga a tradurre ogni chiave. Le categorie predefinite si mostrano tradotte finché non vengono rinominate; i nomi creati dall'utente restano com'erano scritti.

**Regole di integrità** (applicate dal `Ledger` e riverificate sui dati che arrivano da fuori): importo intero positivo, data di calendario reale, categoria esistente e compatibile col tipo, categorie archiviate non selezionabili ma ancora risolvibili.

## 4. Schermate

Navigazione a schede in basso (mobile) o laterale (desktop ≥ 860 px), pulsante **+** sempre raggiungibile.

| Schermata | Contenuto |
|---|---|
| Panoramica | Entrate, uscite, saldo del mese; i 3 budget più a rischio; ultimi movimenti |
| Movimenti | Elenco per giorno, ricerca, filtri per tipo e categoria, tocco = modifica |
| Statistiche | Periodo, totali, grafico entrate/uscite per mese, ripartizione per categoria |
| Budget | Barre di avanzamento con stato a parole (non solo colore), imposta/modifica/rimuovi |
| Impostazioni | Categorie, valuta, sincronizzazione, conflitti, backup/ripristino/CSV |
| Foglio "Movimento" | Tipo, importo (accetta `12,50`, `1.234,56`…), categoria, data, nota; elimina con annulla |

Accessibilità: tema chiaro/scuro automatico, grafici con descrizione testuale, stato dei budget anche a parole, bersagli di tocco ≥ 40 px.

## 5. Sincronizzazione e sicurezza

### 5.1 Verifica di Google Drive (fonti: documentazione Google, consultata il 14/11/2026)

- **Scope `drive.appdata`**: dà accesso a una cartella nascosta e privata dell'app (`appDataFolder`). È classificato **non sensibile**: basta la verifica di base dell'app, senza la valutazione di sicurezza annuale richiesta agli scope *restricted* (`drive`, `drive.readonly`…). L'app non vede gli altri file dell'utente. È la scelta adatta a questo caso.
- **Cosa serve all'esterno** (non è qualcosa che il codice possa fare da solo): un progetto Google Cloud, l'API Drive abilitata, la schermata di consenso OAuth configurata e un Client ID OAuth.
  - Web/PWA: Client ID "Web application" con l'origine https autorizzata.
  - Desktop: Client ID "Desktop app", flusso con PKCE e redirect su `http://127.0.0.1:porta`.
  - Mobile: Client ID Android/iOS; il redirect su loopback per le app mobili è dichiarato obsoleto da Google, si usa lo schema URI personalizzato o l'SDK ufficiale.
- **Limiti da conoscere**:
  - In modalità **Testing** della schermata di consenso i refresh token **scadono dopo 7 giorni** e solo gli utenti di test possono accedere; un client non verificato ha un tetto di 100 utenti. Per uso personale prolungato conviene pubblicare l'app ("In production"), cosa che per uno scope non sensibile richiede la verifica di base.
  - La cartella `appDataFolder` **viene eliminata se l'utente disinstalla l'app da Drive** o la cancella a mano.
  - Il flusso web (Google Identity Services, "token model") fornisce solo access token di circa 1 ora, senza refresh token: il rinnovo silenzioso funziona finché la sessione Google del browser è attiva, altrimenti serve un nuovo clic su "Connetti".
- **Conclusione**: Drive è adatto e disponibile come opzione, con questi vincoli.
- **Alternative pratiche** (la sync usa l'interfaccia `RemoteStore`, quindi sono sostituzioni locali di un solo file):
  1. Cartella sincronizzata da un client già installato (Drive per desktop, iCloud Drive, OneDrive, Dropbox, Syncthing) + backup su file: nessuna integrazione OAuth.
  2. WebDAV (Nextcloud, ownCloud o simili): credenziali semplici, nessun consenso Google.
  3. Bucket compatibile S3 (con URL firmati).
  4. Solo backup manuale su file, sempre disponibile.

### 5.2 Autenticazione e protezione dei dati

- **Autenticazione al cloud**: OAuth 2.0 verso Google; con PKCE (RFC 7636, testato col vettore ufficiale) nei gusci nativi. Nessun "client secret" confidenziale nel codice. Scope minimo.
- **Cifratura end-to-end**: la passphrase non lascia mai il dispositivo. PBKDF2-HMAC-SHA256 (600.000 iterazioni, salt casuale di 16 byte) → chiave AES-256-GCM, IV nuovo a ogni cifratura. L'intestazione (formato, iterazioni, salt) è autenticata: qualunque alterazione fa fallire la decifratura. Il limite sulle iterazioni dichiarate nel file impedisce file ostili che bloccano il dispositivo.
- **Dati non fidati**: anche dopo la decifratura ogni snapshot viene ricostruito campo per campo (tipi, intervalli, date, colori, chiavi `__proto__`…) prima di toccare i dati locali.
- **Sul dispositivo**: token e passphrase restano **solo in memoria** (dopo un riavvio vanno reinseriti). Nei gusci nativi andrebbero spostati nel portachiavi di sistema (non ancora fatto).
- **Esportazione CSV**: neutralizza le celle che i fogli di calcolo eseguirebbero come formule.
- **Limite da dire chiaramente**: se si perde la passphrase i dati *sul cloud* non sono recuperabili (quelli locali restano).

### 5.3 Conflitti e offline

- **Modalità offline**: ogni modifica è applicata e salvata subito sul dispositivo; la sync riparte da sola al ritorno della rete, dopo le modifiche e quando l'app torna in primo piano. Le modifiche fatte durante una sync restano "da caricare" (testato).
- **Un file per dispositivo** (`snap-<idDispositivo>.quattrino`): ogni file ha un solo scrittore, quindi non servono lock né confronto-e-scambio sul cloud (che Drive non offre in modo affidabile).
- **Unione**: per ogni record vince la modifica con timestamp ibrido più alto (HLC: tempo fisico + contatore + id dispositivo, quindi ordine totale anche con orologi sfasati; i timestamp remoti oltre +24 h vengono ignorati). L'unione è commutativa, associativa e idempotente: l'ordine e il numero delle sincronizzazioni non cambiano il risultato (verificato anche con prove su dati casuali).
- **Cancellazioni**: lapidi (tombstone); una cancellazione più recente vince su una modifica precedente e viceversa.
- **Conflitti veri** (stesso record modificato su due dispositivi dopo l'ultima sync, contenuto diverso): vince la modifica più recente, ma la versione scartata resta nel registro e l'utente può **ripristinarla** da Impostazioni.
- **Limite noto**: la granularità è il record intero. Se su due dispositivi cambiano campi diversi dello stesso movimento, una delle due modifiche viene scartata (recuperabile dal registro conflitti).
- **Sicurezza della sync**: con passphrase diversa da quella degli altri dispositivi l'app **non pubblica** il proprio file (eviterebbe due "mondi" cifrati con chiavi diverse) e lo segnala. File remoti corrotti vengono saltati e segnalati senza bloccare gli altri.
- **Affidabilità di rete**: tentativi con attesa crescente su 429/5xx e sui limiti di frequenza di Drive, errori distinti per offline, accesso scaduto e spazio esaurito.

### 5.4 Backup e ripristino

- **Backup su file** (cifrato con passphrase, o in chiaro se lasciata vuota con avviso): non dipende da alcun cloud. Contiene solo dati attivi.
- **Ripristino**, due modalità: *Unisci* (aggiunge ciò che manca, non toglie nulla) e *Sostituisci tutto* (con conferma): i record vengono ridatati ad adesso e le cancellazioni si propagano agli altri dispositivi, così i dati "scartati" non riappaiono (testato).
- **Reinstallazione o nuovo dispositivo**: connettendo Drive con la stessa passphrase si ritrovano i dati (testato con archivio vuoto e nuovo id dispositivo).
- **Consiglio operativo**: tenere un backup su file periodico, perché la cartella nascosta di Drive sparisce se l'app viene scollegata dall'account.

## 6. Piano di sviluppo per fasi

| Fase | Contenuto | Test | Criteri di completamento | Stato |
|---|---|---|---|---|
| 1. Nucleo | Modello dati, registro, statistiche, budget, validazione | Unitari, prove su dati casuali | 100% dei test verdi; nessun importo in virgola mobile | **Fatta** |
| 2. App web/PWA | Interfaccia, IndexedDB, offline, backup/CSV | Render di fumo + prova nel browser | Flusso completo su telefono e desktop, riapertura offline | **Fatta** (provata su Chromium) |
| 3. Sync | Cifratura, motore, conflitti, adattatore Drive | Unitari con cloud simulato e `fetch` simulato | Convergenza provata; nessun dato in chiaro nel cloud | **Fatta con cloud simulato** |
| 4. Collaudo reale su Drive | Client ID reale, 2+ dispositivi, rete instabile | Manuale guidato (vedi README) | Sync bidirezionale reale, token scaduto gestito | **Da fare (servono credenziali)** |
| 5. Gusci nativi | Tauri (desktop), Capacitor (mobile), flusso PKCE nativo, portachiavi | Build e prova su ogni sistema | Installer che si avvia su Windows/macOS/Linux; app su Android e iOS | **Desktop: guscio Tauri fatto, compilato e avviato su Linux; Windows/macOS da provare. Mobile e accesso Google nativo: da fare** |
| 6. Rifinitura | Spese ricorrenti, import CSV, localizzazione (v0.2.0); notifiche budget, accessibilità con screen reader reali | Prove con utenti | Nessun errore bloccante in 2 settimane d'uso | **Parziale: ricorrenze, import CSV e inglese fatti nella 0.2.0; notifiche e prove con utenti da fare** |
| 7. Pubblicazione | Verifica dell'app Google, firma, store | Checklist di rilascio | App verificata; build firmate | **Da fare** |

## 7. Cosa è verificato e cosa no

**Verificato in questa sessione**: 158 test automatici verdi (inclusi ricorrenze, migrazione dallo schema 1, import CSV, traduzioni); controllo dei tipi; build di produzione; prova in Chromium (telefono e desktop): inserimento, modifica, eliminazione con annulla, budget, categoria personalizzata, statistiche, persistenza dopo ricarica, uso e riapertura offline, nessun errore in console; v0.2.0: creazione di una ricorrenza con anteprima e assenza di doppioni dopo il ricaricamento, importazione di un CSV Windows-1252 con riga errata, secondo import senza duplicati, cambio lingua persistente, lingua iniziale dal browser; app desktop 0.2.0 compilata e avviata su Linux.

**Non verificato**:
- Qualsiasi chiamata reale a Google (nessuna credenziale disponibile): l'adattatore Drive è provato solo contro risposte simulate; il flusso di accesso Google non è stato eseguito.
- App desktop (Tauri): compilata e avviata solo su **Linux**, in un display virtuale; navigazione e avviso della sincronizzazione verificati. Non provati: Windows, macOS, le finestre di salvataggio native, l'installazione dai pacchetti. Capacitor (Android/iOS) non è incluso. Il flusso OAuth nativo (apertura del browser, ascolto del redirect) non è collegato: `pkce.ts` contiene solo la logica pura e testata, quindi nell'app desktop la sync con Google non è disponibile.
- Nessuna prova con screen reader, con grandi volumi (oltre qualche migliaio di movimenti) o con la modalità privata di Safari.
- Le lapidi non vengono mai eliminate (cresce di poco nel tempo); la gestione è rimandata alla fase 6.
