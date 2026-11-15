import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Ledger } from './core/ledger';
import { IndexedDbStorage } from './storage/indexedDb';
import { App } from './ui/App';
import './ui/styles.css';

async function boot(): Promise<void> {
  const root = createRoot(document.getElementById('root')!);
  try {
    const ledger = await Ledger.open(new IndexedDbStorage());
    // Chiede al browser di non eliminare i dati locali sotto pressione di spazio (best effort).
    void navigator.storage?.persist?.();
    root.render(
      <StrictMode>
        <App ledger={ledger} />
      </StrictMode>,
    );
  } catch (e) {
    root.render(
      <main className="fatal">
        <h1>Impossibile aprire i dati locali</h1>
        <p>{e instanceof Error ? e.message : String(e)}</p>
        <p>
          Se usi la navigazione privata o hai bloccato l’archiviazione del sito, riprova da una finestra normale. I tuoi dati non
          sono stati modificati.
        </p>
      </main>,
    );
  }
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined);
  }
}

void boot();
