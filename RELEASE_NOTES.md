# Quattrino 0.1.0 — anteprima

La prima versione di **Quattrino**, l'app per tenere sotto controllo le spese personali: semplice, che funziona anche senza internet e che tiene i tuoi dati sul tuo dispositivo.

## Cosa puoi fare
- Registrare entrate e uscite in pochi secondi e correggerle quando vuoi (con "Annulla" se elimini per errore).
- Usare le categorie già pronte (Alimentari, Trasporti, Casa, Salute, Svago, Utenze…) o crearne di tue.
- Vedere dove vanno i soldi: grafici per mese e per categoria, su un mese, 3, 6, 12 mesi o sull'anno.
- Fissare un budget mensile per categoria o complessivo e ricevere un'indicazione chiara quando ti avvicini al limite o lo superi.
- Esportare i movimenti in CSV e fare un backup (anche cifrato con passphrase) da ripristinare quando serve.
- Sincronizzare più dispositivi con Google Drive nella **versione web**: i dati sono cifrati sul tuo dispositivo prima di essere caricati, Google non può leggerli.

## Come ottenerla
| Dove | Come |
|---|---|
| **Web / telefono** | Apri l'indirizzo dell'app e scegli "Installa" (Chrome, Edge) o "Aggiungi alla schermata Home" (Safari su iPhone). Per l'uso offline aprila due volte con la rete. |
| **Windows** | Scarica l'installer (`.msi` o `.exe`) dagli allegati di questa release. |
| **macOS** | Scarica il `.dmg` (scegli la versione Apple Silicon o Intel). |
| **Linux** | Scarica `.deb`, `.rpm` o `.AppImage` (rendi eseguibile l'AppImage con `chmod +x`). |

## Da sapere prima di installare
- **Build non firmate**: Windows mostrerà "App non riconosciuta" (*Ulteriori informazioni → Esegui comunque*); macOS bloccherà la prima apertura (tasto destro sull'app → *Apri*).
- **L'app desktop non sincronizza con Google Drive** (per ora). Per usare più computer, esporta il backup in una cartella già sincronizzata dal tuo servizio cloud e ripristinalo con "Unisci ai dati attuali".
- **Android e iOS**: non ci sono ancora app dedicate; la versione web si installa sul telefono.
- **Passphrase**: se la perdi, i dati sul cloud non si possono recuperare. I dati sul dispositivo restano.
- **Fai backup periodici**: i dati sono salvati nel dispositivo; se cancelli i dati del sito o disinstalli l'app possono andare persi.
- Questa è un'**anteprima**: provata nel browser e su Linux; l'app desktop su Windows e macOS non è ancora stata collaudata.

## Privacy
Nessun account, nessuna pubblicità, nessun tracciamento. I dati restano sul tuo dispositivo; se attivi la sincronizzazione, un file cifrato viene salvato in una cartella privata del tuo Google Drive.

Elenco completo delle novità, dei limiti noti e delle verifiche eseguite: [CHANGELOG.md](CHANGELOG.md).
