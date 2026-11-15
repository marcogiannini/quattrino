# Quattrino 0.2.0 — ricorrenze, importazione CSV e inglese

Tre novità per risparmiare tempo con le spese fisse, portare dentro i dati che hai già e usare l'app in inglese.

## Novità
- **Spese ricorrenti**: affitto, abbonamenti, stipendio… Impostali una volta (ogni settimana, mese o anno, con una data di fine facoltativa) e il movimento si crea da solo a ogni scadenza, anche per le date passate se non apri l'app per un po'. Sono movimenti normali: li puoi modificare o eliminare, e se ne elimini uno non ritorna. Le trovi in *Impostazioni → Spese ricorrenti*.
- **Importa da CSV**: carica un file (anche quello esportato da Quattrino o dalla tua banca), guarda l'anteprima con le eventuali righe da correggere e importa. Se reimporti lo stesso file non si creano doppioni. In *Impostazioni → Importa da CSV*.
- **Interfaccia in inglese**: scegli *Italiano* o *English* in *Impostazioni → Lingua*. Alla prima apertura l'app usa la lingua del tuo browser o sistema. La scelta vale per tutti i tuoi dispositivi sincronizzati.

## Aggiornare dalla 0.1.0
- I tuoi dati si aggiornano da soli all'apertura: non devi fare nulla e non si perde niente.
- **Se usi la sincronizzazione con Google Drive, aggiorna tutti i dispositivi.** Un dispositivo ancora alla 0.1.x non legge i dati della 0.2.0 (lo segnala, senza rovinarli).
- I backup esportati dalla 0.2.0 non si aprono con la 0.1.x. Quelli vecchi si aprono senza problemi.

## Come ottenerla
| Dove | Come |
|---|---|
| **Web / telefono** | Apri l'indirizzo dell'app: si aggiorna da sola alla riapertura. |
| **Windows (installabile)** | Scarica `.msi` o `-setup.exe` dagli allegati di questa release. |
| **Windows (portatile)** | Scarica lo zip `…_windows_portatile.zip`, estrailo e avvia `Quattrino.exe` senza installare nulla. |
| **macOS** | Scarica il `.dmg` (Apple Silicon o Intel). |
| **Linux** | Scarica `.deb`, `.rpm` o `.AppImage` (`chmod +x` per l'AppImage). |

## Da sapere
- **Build non firmate**: Windows mostrerà "App non riconosciuta" (*Ulteriori informazioni → Esegui comunque*); su macOS prima apertura con tasto destro → *Apri*.
- **L'app desktop non sincronizza con Google Drive** (come nella 0.1.0): usa il backup in una cartella già sincronizzata dal tuo servizio cloud.
- Di una ricorrenza non si cambiano frequenza e prima scadenza: se servono, eliminala e creane una nuova (i movimenti già creati restano).
- Nell'importazione scegli tu se le date sono giorno/mese o mese/giorno.
- **Fai backup periodici** e non perdere la passphrase di sincronizzazione.
- Provata nel browser e su Linux; l'app desktop su Windows e macOS non è ancora stata collaudata. L'importazione non è stata provata con estratti conto reali.

## Privacy
Nessun account, nessuna pubblicità, nessun tracciamento. I dati restano sul tuo dispositivo; se attivi la sincronizzazione, un file cifrato viene salvato in una cartella privata del tuo Google Drive.

Elenco completo, limiti noti e verifiche: [CHANGELOG.md](CHANGELOG.md).
