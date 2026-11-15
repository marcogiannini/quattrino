# Quattrino

App per le spese personali, offline-first, con sincronizzazione cifrata su Google Drive (opzionale).
Progetto e motivazioni: [`docs/PROGETTO.md`](docs/PROGETTO.md).

## Cosa è pronto e cosa no

| | Stato |
|---|---|
| Registrazione/modifica movimenti, categorie, statistiche, budget, esportazione CSV | Pronto, provato |
| Spese ricorrenti (0.2.0) | Pronto, provato nel browser e con test; solo mensile/settimanale/annuale |
| Importazione da CSV (0.2.0) | Pronto, provato con file di prova (anche quelli esportati da Quattrino); **non provato con estratti conto reali di banche** |
| Interfaccia in italiano e inglese (0.2.0) | Pronta; la lingua si sceglie in Impostazioni e segue il browser alla prima apertura |
| Archiviazione locale e uso offline (web/PWA) | Pronto, provato |
| Backup/ripristino su file cifrato | Pronto, provato |
| Cifratura e motore di sync, conflitti | Pronto, provato con cloud **simulato** |
| Sync reale con Google Drive | Codice scritto e provato con risposte simulate; **serve un tuo Client ID Google** e un collaudo reale |
| App web (PWA) pubblicabile online | Pronta: vedi "Metterlo online" |
| App desktop (Tauri 2) | Guscio incluso (`src-tauri/`); **compilata e avviata su Linux**, Windows e macOS si compilano con GitHub Actions ma **non sono state provate** |
| App mobile (Capacitor) | **Non inclusa**: istruzioni sotto, da compilare e provare sul sistema di destinazione |

## Requisiti
- Node.js 20 o superiore (provato con 22), npm.

## Installare, avviare, verificare

```bash
npm install
npm test          # 158 test automatici
npm run build     # controllo dei tipi + build in dist/
npm run dev       # sviluppo: http://localhost:5173
npm run preview   # prova la build (con service worker): http://localhost:4173
```

Il service worker, e quindi la riapertura offline, è attivo solo nella build (`preview`), non in `dev`.
`npm run tauri dev` / `npm run tauri build` richiedono i prerequisiti descritti nella sezione "App desktop".

### Provarla su ogni piattaforma

**Subito, su tutti e cinque i sistemi (PWA).** Pubblica `dist/` su un hosting https (qualunque hosting statico) e apri l'indirizzo:
- Windows/Linux: Chrome o Edge → icona "Installa" nella barra degli indirizzi.
- macOS: Chrome/Edge → "Installa"; Safari → File → Aggiungi al Dock.
- Android: Chrome → menu → "Installa app".
- iOS: Safari → Condividi → "Aggiungi alla schermata Home".
Per provare dal telefono in rete locale: `npm run dev -- --host` (la sincronizzazione Google richiede https, quindi non funziona su indirizzi `http://192.168…`).

**Mobile nativo (Capacitor), da fare.**
```bash
npm i @capacitor/core @capacitor/cli && npx cap init Quattrino <id.pacchetto.tuo> --web-dir=dist
npm i @capacitor/android @capacitor/ios && npx cap add android && npx cap add ios
npm run build && npx cap sync
npx cap open android   # Android Studio
npx cap open ios       # Xcode: richiede un Mac
```
Nei gusci nativi, per Google va collegato il flusso PKCE (`src/core/sync/pkce.ts`, solo logica) con il browser di sistema e un redirect, oppure usato l'SDK ufficiale di Google per la piattaforma.

## Metterlo online come web app

L'app è un sito statico: la cartella `dist/` prodotta da `npm run build` si pubblica su qualsiasi hosting statico, anche in una sottocartella (i percorsi sono relativi). I dati restano nel browser di chi la usa (IndexedDB, uno spazio separato per ogni indirizzo).

**Hosting** (Cloudflare Pages, Netlify, Vercel, un tuo server web): comando di build `npm run build`, cartella da pubblicare `dist`. Qualsiasi server che serva file statici su **https** va bene.

Da sapere:
- **https obbligatorio** per installare l'app, per l'uso offline e per l'accesso a Google. Sui servizi sopra c’è già.
- **Offline**: la memorizzazione dei file per l'uso offline avviene alla prima visita, ma conviene aprire l'app **due volte con la rete** prima di contare sull'uso offline (provato).
- **Sincronizzazione Google**: nel Client ID OAuth (tipo "Applicazione web") aggiungi l'indirizzo esatto del sito, per esempio `https://tuosito.example`, tra le "Origini JavaScript autorizzate".
- **Aggiornamenti**: dopo una nuova pubblicazione, il browser può mostrare ancora la versione vecchia fino alla riapertura dell'app.

## App desktop (Windows, macOS, Linux)

Il guscio desktop usa **Tauri 2** e il WebView del sistema (WebView2, WKWebView, WebKitGTK): stessa interfaccia della versione web, installer piccoli. Differenze rispetto alla versione web:
- il salvataggio di backup e CSV usa la finestra di dialogo nativa e la conferma di sostituzione è nativa;
- **la sincronizzazione con Google Drive non è disponibile** (l'accesso di Google non funziona dentro il WebView e il flusso nativo non è ancora collegato): il pannello mostra un avviso. Per usare più computer: esporta il backup in una cartella già sincronizzata dal tuo servizio cloud e ripristinalo con "Unisci ai dati attuali" sull'altro computer.

**Compilare sul proprio computer** (serve Rust, vedi la guida ufficiale dei prerequisiti di Tauri per il tuo sistema):
```bash
npm ci
npm run tauri dev       # finestra di sviluppo
npm run tauri build     # installer in src-tauri/target/release/bundle/
```
Linux (Debian/Ubuntu): prima `sudo apt-get install -y libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev`. Windows: serve anche WebView2 (già presente su Windows 11) e gli strumenti di compilazione C++ di Visual Studio. macOS: Xcode Command Line Tools. Si compila **sul sistema di destinazione**, non c'è cross-compilazione semplice.

**Installer per tutti e tre i sistemi senza averli** (GitHub Actions, `.github/workflows/desktop.yml`):
```bash
git tag v0.2.0 && git push origin v0.2.0
```
Dopo qualche minuto trovi in *Releases* una **bozza** con gli installer (.msi/.exe, .dmg, .deb/.rpm/.AppImage). Controllali e pubblica la bozza.

**Avvisi del sistema (le build non sono firmate)**
- Windows: SmartScreen mostra "App non riconosciuta" (*Ulteriori informazioni → Esegui comunque*). Per evitarlo serve un certificato di firma del codice.
- macOS: Gatekeeper blocca le app non firmate né "notarizzate"; per distribuirle ad altri serve l'Apple Developer Program (99 USD/anno). Per prove personali: tasto destro → *Apri*, oppure `xattr -dr com.apple.quarantine /Applications/Quattrino.app`.
- Linux: nessun blocco; .AppImage va reso eseguibile (`chmod +x`).
- Prima di distribuire cambia `identifier` in `src-tauri/tauri.conf.json` (ora `com.example.quattrino`) con un identificativo tuo, in formato dominio inverso.

## Attivare la sincronizzazione con Google Drive

Operazioni **esterne al codice**, a nome tuo:
1. Console Google Cloud → crea un progetto → abilita **Google Drive API**.
2. Schermata di consenso OAuth → tipo *Esterno* → aggiungi **solo** lo scope `https://www.googleapis.com/auth/drive.appdata`. In modalità *Testing* aggiungi il tuo account come utente di test; **i token scadono dopo 7 giorni**: per un uso stabile pubblica l'app (per uno scope non sensibile la verifica è quella di base).
3. Credenziali → *ID client OAuth* → tipo **Applicazione web** → in "Origini JavaScript autorizzate" inserisci l'indirizzo https dell'app (per le prove: `http://localhost:4173`).
4. In Quattrino → Impostazioni → Sincronizzazione: incolla il Client ID, scegli una passphrase (minimo 8 caratteri, **la stessa su tutti i dispositivi**) → *Connetti*.

Collaudo consigliato (non ancora eseguito da me): connetti due browser/profili con la stessa passphrase; aggiungi un movimento su uno e verifica che compaia sull'altro; spegni la rete, modifica lo stesso movimento su entrambi, riaccendi e controlla il registro conflitti; prova la passphrase sbagliata.

**Se non vuoi usare Google**: Backup su file (Impostazioni → Esporta backup) in una cartella già sincronizzata da qualunque servizio; vedi le alternative in `docs/PROGETTO.md` §5.1.

## Dati e privacy
- I dati stanno nel browser/WebView di questo dispositivo (IndexedDB). Svuotare i dati del sito li cancella: fai backup periodici.
- Il cloud riceve solo dati cifrati con la tua passphrase. Se la perdi, i dati sul cloud non sono recuperabili.
- Token Google e passphrase non vengono scritti su disco; dopo un riavvio vanno reinseriti.

## Struttura
Vedi `docs/PROGETTO.md` §3. Test in `tests/`, uno per area (denaro/date/orologio, registro, statistiche e budget, unione e validazione, cifratura/backup/CSV, sincronizzazione, Drive/PKCE/IndexedDB, interfaccia).

## Pubblicazione
- Novità e limiti noti: [`CHANGELOG.md`](CHANGELOG.md); testo per la pagina della release: [`RELEASE_NOTES.md`](RELEASE_NOTES.md).
- Store Android e iOS: [`docs/PUBBLICAZIONE-MOBILE.md`](docs/PUBBLICAZIONE-MOBILE.md).
- Su GitHub, a ogni push parte un controllo automatico (`.github/workflows/ci.yml`: test e build).
- Licenza: non ne è stata scelta nessuna. Senza un file `LICENSE` il codice resta "tutti i diritti riservati" anche se il repository è pubblico: aggiungine uno (per esempio MIT o GPL) se vuoi permettere ad altri di usarlo.
