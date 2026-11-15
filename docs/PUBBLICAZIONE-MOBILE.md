# Pubblicare Quattrino su Android e iOS

Guida operativa. Le parti con **[verificato]** derivano dalle pagine ufficiali di Google, Apple e Capacitor consultate il 15/11/2026; le parti con **[da controllare]** sono conoscenza generale che conviene riconfermare sulla documentazione ufficiale prima di agire (le regole degli store cambiano spesso).

## 0. Prima di tutto: un blocco da risolvere

Nella versione attuale l'accesso a Google per la sincronizzazione usa Google Identity Services, pensato per i browser. **Dentro un'app nativa (WebView) non funzionerà**: Google non consente l'accesso OAuth in WebView incorporate, va usato il browser di sistema o l'SDK ufficiale della piattaforma **[da controllare]**.

Due strade:
- **A. Prima versione senza sincronizzazione Google**: pubblichi l'app con archiviazione locale, backup/ripristino su file ed esportazione CSV (tutto già funzionante) e nascondi il pannello Google. Aggiungi la sync in un aggiornamento. È la strada più rapida e con meno rischi di rifiuto.
- **B. Con sincronizzazione**: prima collega il flusso PKCE (`src/core/sync/pkce.ts` contiene già la parte pura e testata) a un plugin che apre il browser di sistema e riceve il ritorno su uno schema URI personalizzato, creando in Google Cloud i Client ID di tipo Android e iOS. Poi collaudi su dispositivi reali.

## 1. Preparare i gusci con Capacitor (su un computer di sviluppo)

```bash
npm ci
npm i @capacitor/core @capacitor/cli
npx cap init Quattrino it.tuodominio.quattrino --web-dir=dist   # id pacchetto: definitivo, scegline uno tuo
npm i @capacitor/android @capacitor/ios
npm run build
npx cap add android
npx cap add ios        # richiede un Mac con Xcode
npx cap sync
```
- L'**id pacchetto** (es. `it.tuodominio.quattrino`) identifica l'app per sempre sugli store: scegli un dominio inverso che controlli e non cambiarlo dopo la pubblicazione.
- Servono icone e schermata iniziale nelle dimensioni richieste dagli store: l'icona attuale è un SVG per il web, vanno generate le versioni PNG (per esempio con `@capacitor/assets`).
- Ogni modifica al codice web: `npm run build && npx cap sync`.

## 2. Android — Google Play

**Cosa serve**
1. Un account sviluppatore Google Play (una tantum a pagamento, importo da verificare nella Console **[da controllare]**).
2. **Account personale creato dopo il 13/11/2023** **[verificato]**: prima di poter pubblicare in produzione devi fare un *test chiuso* con **almeno 12 tester** che restano iscritti **ininterrottamente per almeno 14 giorni**. Finché non è soddisfatto, le pagine "Produzione" e "Pre-registrazione" restano disabilitate. Conta almeno due settimane in più nei tempi. (Un account "organizzazione" ha regole diverse.)
3. **Livello API di destinazione** **[verificato]**: dal 31/08/2026 nuove app e aggiornamenti devono avere come *target* **Android 16 (API 36)**; la proroga fino al 01/11/2026 è già scaduta. Controlla sulla pagina ufficiale quale livello è richiesto al momento del tuo invio e mantieni aggiornati Capacitor e Android Studio.

**Procedura** (da Capacitor, **[verificato]**)
1. `npx cap open android` → Android Studio.
2. *Build → Generate Signed Bundle* → crea una **keystore** (file di firma). **Conservala, con alias e password, in più copie sicure**: senza non potrai più aggiornare l'app (valuta la firma gestita da Google Play App Signing **[da controllare]**).
3. Genera il pacchetto di rilascio **AAB** (`android/app/build/outputs/bundle/release`).
4. In Play Console: crea l'app → carica l'AAB in un **test chiuso** → invita i 12+ tester → dopo 14 giorni richiedi l'accesso alla produzione.
5. Compila la scheda dello store: descrizione, schermate, icona, categoria, **URL dell'informativa sulla privacy**, il modulo **Sicurezza dei dati** (Data safety) e la classificazione dei contenuti **[da controllare]**.
6. Invia in revisione e poi pubblica.

## 3. iOS — App Store

**Cosa serve**
1. Un **Mac** con **Xcode**. Per l'invio ad App Store Connect servono le app compilate con **Xcode 26 e SDK iOS 26** **[verificato, voce di Apple del 28/04/2026]**: controlla che sia ancora il minimo richiesto. Senza Mac si possono usare servizi di build in cloud (per esempio runner macOS di GitHub Actions) ma la configurazione della firma resta lunga **[da controllare]**.
2. **Apple Developer Program: 99 USD all'anno** **[verificato]**. Per iscriversi come persona: Apple Account con autenticazione a due fattori, maggiore età nel tuo paese; **il tuo nome legale comparirà come venditore** sull'App Store (nessun alias). Se paghi con una carta non tua, l'iscrizione si blocca e viene chiesto un documento d'identità. Per mostrare un nome di azienda serve invece un'iscrizione come organizzazione (con numero D-U-N-S).
3. L'abbonamento si rinnova ogni anno: se scade, l'app viene tolta dallo store **[da controllare]**.

**Procedura**
1. `npx cap open ios` → Xcode. Seleziona il target dell'app → *Signing & Capabilities* → scegli il tuo team **[verificato]**.
2. Imposta nome visibile, versione, numero di build e icone.
3. *Product → Archive* → *Distribute App* → carica su **App Store Connect** (oppure esporta l'IPA e usa Apple Transporter, **[verificato]**).
4. In App Store Connect: crea la scheda dell'app, distribuisci prima con **TestFlight** a te stesso e a pochi tester per provare su iPhone reali.
5. Compila: descrizione, schermate per le dimensioni di schermo richieste, **URL dell'informativa sulla privacy**, le **etichette di privacy** dell'app (dichiarare che i dati finanziari restano sul dispositivo o vengono caricati cifrati su Google Drive), classificazione per età **[da controllare]**.
6. Invia in revisione. Prevedi più giri se arrivano richieste di chiarimento.

**Rischi di rifiuto da tenere presenti [da controllare]**
- Le app che sono "solo un sito impacchettato" possono essere respinte per funzionalità minima: Quattrino ha archiviazione locale, uso offline e backup su file, ma conviene aggiungere qualcosa di nativo e spiegarlo nelle note per la revisione.
- Se l'app offre un accesso con un account di terze parti (Google), Apple può chiedere un'alternativa equivalente: qui Google serve solo come archivio per la sync e non come account dell'app, ma va spiegato chiaramente nelle note. La strada A (§0) evita la questione nella prima versione.

## 4. Elenco di controllo prima dell'invio (entrambi gli store)

- [ ] Id pacchetto definitivo, versione e numero di build impostati
- [ ] Icone PNG, schermate, descrizione in italiano (e in inglese se vuoi il mercato internazionale: i testi dell'app sono oggi solo in italiano)
- [ ] Informativa sulla privacy pubblicata su un URL (spiega: dati sul dispositivo; con la sync, file cifrato in una cartella privata del tuo Google Drive; nessun server dell'app; nessuna pubblicità né tracciamento)
- [ ] Moduli sulla privacy compilati (Data safety / etichette di privacy)
- [ ] Provato su telefoni reali: installazione pulita, uso offline, backup e ripristino, aggiornamento da una versione precedente
- [ ] Keystore Android e certificati Apple salvati in copie sicure
- [ ] Per la sync: Client ID nativi creati, app Google verificata (§ PROGETTO.md 5.1)

## 5. Costi e tempi realistici (indicativi)

- Apple: 99 USD/anno. Google: tassa una tantum (da verificare).
- Android personale: almeno 14 giorni di test chiuso prima della produzione, più la revisione.
- iOS: dalla prima iscrizione (fino a 24 ore per la conferma **[verificato]**) alla revisione, in genere pochi giorni per invio **[da controllare]**.

## Fonti ufficiali consultate
- Google Play, requisiti dei test per account personali: https://support.google.com/googleplay/android-developer/answer/14151465
- Google Play, livello API di destinazione: https://support.google.com/googleplay/android-developer/answer/11926878
- Apple, iscrizione al Developer Program: https://developer.apple.com/support/enrollment/
- Apple, requisiti minimi SDK: https://developer.apple.com/news/upcoming-requirements/
- Capacitor, rilascio sugli store: https://capacitorjs.com/docs/vscode/release
