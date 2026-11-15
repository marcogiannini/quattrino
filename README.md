# Quattrino

App per le spese personali, offline-first, con sincronizzazione cifrata su Google Drive (opzionale).
Progetto e motivazioni: [`docs/PROGETTO.md`](docs/PROGETTO.md).

## Cosa è pronto e cosa no

| | Stato |
|---|---|
| Registrazione/modifica movimenti, categorie, statistiche, budget, CSV | Pronto, provato |
| Archiviazione locale e uso offline (web/PWA) | Pronto, provato |
| Backup/ripristino su file cifrato | Pronto, provato |
| Cifratura e motore di sync, conflitti | Pronto, provato con cloud **simulato** |
| Sync reale con Google Drive | Codice scritto e provato con risposte simulate; **serve un tuo Client ID Google** e un collaudo reale |
| App desktop (Tauri) e mobile (Capacitor) | **Non inclusi**: istruzioni sotto, da compilare e provare sul sistema di destinazione |

## Requisiti
- Node.js 20 o superiore (provato con 22), npm.

## Installare, avviare, verificare

```bash
npm install
npm test          # 117 test automatici
npm run build     # controllo dei tipi + build in dist/
npm run dev       # sviluppo: http://localhost:5173
npm run preview   # prova la build (con service worker): http://localhost:4173
```

Il service worker, e quindi la riapertura offline, è attivo solo nella build (`preview`), non in `dev`.

### Provarla su ogni piattaforma

**Subito, su tutti e cinque i sistemi (PWA).** Pubblica `dist/` su un hosting https (qualunque hosting statico) e apri l'indirizzo:
- Windows/Linux: Chrome o Edge → icona "Installa" nella barra degli indirizzi.
- macOS: Chrome/Edge → "Installa"; Safari → File → Aggiungi al Dock.
- Android: Chrome → menu → "Installa app".
- iOS: Safari → Condividi → "Aggiungi alla schermata Home".
Per provare dal telefono in rete locale: `npm run dev -- --host` (la sincronizzazione Google richiede https, quindi non funziona su indirizzi `http://192.168…`).

**Desktop nativo (Tauri 2), da fare.** Servono Rust e i componenti di sistema indicati dalla guida ufficiale di Tauri per il tuo sistema operativo.
```bash
npm i -D @tauri-apps/cli && npx tauri init     # frontendDist: ../dist, devUrl: http://localhost:5173
npx tauri build
```
Si compila sul sistema di destinazione (Windows per .msi, macOS per .dmg, Linux per .deb/.AppImage).

**Mobile nativo (Capacitor), da fare.**
```bash
npm i @capacitor/core @capacitor/cli && npx cap init Quattrino <id.pacchetto.tuo> --web-dir=dist
npm i @capacitor/android @capacitor/ios && npx cap add android && npx cap add ios
npm run build && npx cap sync
npx cap open android   # Android Studio
npx cap open ios       # Xcode: richiede un Mac
```
Nei gusci nativi, per Google va collegato il flusso PKCE (`src/core/sync/pkce.ts`, solo logica) con il browser di sistema e un redirect, oppure usato l'SDK ufficiale di Google per la piattaforma.

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
- Store Android e iOS: [`docs/PUBBLICAZIONE-MOBILE.md`](docs/PUBBLICAZIONE-MOBILE.md).
- Su GitHub, a ogni push parte un controllo automatico (`.github/workflows/ci.yml`: test e build).
- Licenza: non ne è stata scelta nessuna. Senza un file `LICENSE` il codice resta "tutti i diritti riservati" anche se il repository è pubblico: aggiungine uno (per esempio MIT o GPL) se vuoi permettere ad altri di usarlo.
