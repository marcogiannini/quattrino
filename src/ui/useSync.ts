import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { PassphraseCipher } from '../core/crypto';
import type { Ledger } from '../core/ledger';
import { SyncEngine, type SyncReport } from '../core/sync/engine';
import { GisTokenProvider } from '../core/sync/googleAuth';
import { GoogleDriveRemote } from '../core/sync/googleDrive';
import { SyncError } from '../core/sync/remote';
import { errorText } from './common';

export type SyncStatus = 'off' | 'idle' | 'syncing' | 'offline' | 'needs-auth' | 'error';

export interface SyncUi {
  status: SyncStatus;
  message: string;
  lastAt: number | null;
  report: SyncReport | null;
  /** Client ID salvato (solo l'ID, mai token o passphrase). */
  clientId: string;
  /** In passato l'utente ha attivato la sync su questo dispositivo, ma la sessione va ripresa. */
  wasEnabled: boolean;
  connect(clientId: string, passphrase: string): Promise<void>;
  syncNow(): Promise<void>;
  disconnect(): Promise<void>;
}

const KEY = 'quattrino.sync.v1';
interface Config {
  enabled: boolean;
  clientId: string;
}

function loadConfig(): Config {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY);
    if (raw) {
      const o = JSON.parse(raw) as Partial<Config>;
      if (typeof o.clientId === 'string') return { enabled: o.enabled === true, clientId: o.clientId };
    }
  } catch {
    /* archiviazione non disponibile: si riparte da zero */
  }
  return { enabled: false, clientId: (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ?? '' };
}

function saveConfig(c: Config): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(c));
  } catch {
    /* ignorato */
  }
}

/**
 * Collega il motore di sincronizzazione alla UI. La passphrase e il token Google restano
 * SOLO in memoria: dopo un riavvio l'utente deve riconnettersi (richiede comunque un gesto
 * dell'utente per il popup di Google). Con un guscio nativo si userà il portachiavi del sistema.
 */
export function useSync(ledger: Ledger): SyncUi {
  const rev = useSyncExternalStore(ledger.subscribe, () => ledger.revision, () => ledger.revision);
  const [cfg, setCfg] = useState(loadConfig);
  const session = useRef<{ engine: SyncEngine; auth: GisTokenProvider } | null>(null);
  const [st, setSt] = useState<Pick<SyncUi, 'status' | 'message' | 'lastAt' | 'report'>>({
    status: 'off',
    message: '',
    lastAt: null,
    report: null,
  });

  const run = useCallback(async () => {
    const s = session.current;
    if (!s) return;
    setSt((p) => ({ ...p, status: 'syncing', message: 'Sincronizzazione in corso…' }));
    try {
      const report = await s.engine.sync();
      const wrong = report.errors.some((e) => e.reason === 'wrong-passphrase');
      setSt({
        status: report.errors.length ? 'error' : 'idle',
        message: wrong
          ? 'La passphrase è diversa da quella degli altri dispositivi: i tuoi dati non sono stati caricati.'
          : report.errors.length
            ? 'Alcuni file remoti non sono leggibili e sono stati ignorati.'
            : 'Sincronizzato',
        lastAt: report.at,
        report,
      });
    } catch (e) {
      const kind = e instanceof SyncError ? e.kind : 'remote';
      setSt((p) => ({
        ...p,
        status: kind === 'offline' ? 'offline' : kind === 'auth' ? 'needs-auth' : 'error',
        message: kind === 'offline' ? 'Offline: le modifiche restano sul dispositivo e verranno inviate appena torna la rete.' : errorText(e),
      }));
    }
  }, []);

  // Sincronizzazione automatica dopo le modifiche (con attesa), non in caso di errori in sospeso.
  useEffect(() => {
    if (!session.current || !ledger.getState().dirty) return;
    if (st.status !== 'idle') return;
    const t = setTimeout(() => void run(), 4000);
    return () => clearTimeout(t);
  }, [rev, st.status, ledger, run]);

  // Al ritorno della rete o dell'attenzione dell'utente.
  useEffect(() => {
    const onOnline = () => void run();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void run();
    };
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [run]);

  const connect = useCallback(
    async (clientId: string, passphrase: string) => {
      const id = clientId.trim();
      if (!id) throw new Error('Inserisci il Client ID OAuth di Google.');
      if (passphrase.length < 8) throw new Error('La passphrase deve avere almeno 8 caratteri.');
      const auth = new GisTokenProvider(id);
      await auth.connect();
      const remote = new GoogleDriveRemote({ getToken: auth.getToken });
      session.current = { engine: new SyncEngine(ledger, remote, new PassphraseCipher(passphrase)), auth };
      const next = { enabled: true, clientId: id };
      setCfg(next);
      saveConfig(next);
      await run();
    },
    [ledger, run],
  );

  const disconnect = useCallback(async () => {
    const s = session.current;
    session.current = null;
    await s?.auth.disconnect();
    const next = { ...cfg, enabled: false };
    setCfg(next);
    saveConfig(next);
    setSt({ status: 'off', message: '', lastAt: null, report: null });
  }, [cfg]);

  return { ...st, clientId: cfg.clientId, wasEnabled: cfg.enabled, connect, syncNow: run, disconnect };
}
