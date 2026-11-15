import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Ledger } from './core/ledger';
import { coreMessage, detectLocale, langOf, translator } from './i18n';
import { IndexedDbStorage } from './storage/indexedDb';
import { App } from './ui/App';
import './ui/styles.css';

async function boot(): Promise<void> {
  const root = createRoot(document.getElementById('root')!);
  try {
    const ledger = await Ledger.open(new IndexedDbStorage(), { locale: detectLocale() });
    // Chiede al browser di non eliminare i dati locali sotto pressione di spazio (best effort).
    void navigator.storage?.persist?.();
    root.render(
      <StrictMode>
        <App ledger={ledger} />
      </StrictMode>,
    );
  } catch (e) {
    const lang = langOf(detectLocale());
    const t = translator(lang);
    root.render(
      <main className="fatal">
        <h1>{t('fatal.title')}</h1>
        <p>{e instanceof Error ? coreMessage(lang, e.message) : String(e)}</p>
        <p>{t('fatal.help')}</p>
      </main>,
    );
  }
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined);
  }
}

void boot();
