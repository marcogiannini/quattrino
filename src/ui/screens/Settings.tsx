import { useRef, useState, type FormEvent } from 'react';
import { BackupError, exportBackup, readBackup, transactionsToCsv } from '../../core/backup';
import type { Ledger } from '../../core/ledger';
import type { CategoryKind } from '../../core/types';
import { errorText } from '../common';
import { confirmAction, isDesktopApp, saveFile } from '../desktop';
import type { SyncUi } from '../useSync';

const stamp = (): string => new Date().toISOString().slice(0, 10);

function Categories({ ledger }: { ledger: Ledger }) {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('🏷️');
  const [kind, setKind] = useState<CategoryKind>('expense');
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);

  const add = (e: FormEvent) => {
    e.preventDefault();
    try {
      ledger.addCategory({ name, kind, icon });
      setName('');
      setError('');
    } catch (err) {
      setError(errorText(err));
    }
  };
  const rename = () => {
    if (!editing) return;
    try {
      ledger.updateCategory(editing.id, { name: editing.name });
      setEditing(null);
      setError('');
    } catch (err) {
      setError(errorText(err));
    }
  };
  const kindLabel = { expense: 'uscite', income: 'entrate', both: 'entrambe' } as const;

  return (
    <div className="card">
      <h2>Categorie</h2>
      <ul className="list">
        {ledger.categories().map((c) => (
          <li key={c.id} style={{ opacity: c.archived ? 0.55 : 1 }}>
            <span aria-hidden="true">{c.icon}</span>
            {editing?.id === c.id ? (
              <>
                <input aria-label="Nuovo nome" value={editing.name} onChange={(e) => setEditing({ id: c.id, name: e.target.value })} />
                <button className="btn primary" onClick={rename}>OK</button>
              </>
            ) : (
              <>
                <span className="grow">{c.name} <span className="muted small">· {kindLabel[c.kind]}{c.archived ? ' · archiviata' : ''}</span></span>
                <button className="btn" onClick={() => setEditing({ id: c.id, name: c.name })}>Rinomina</button>
                <button className="btn" onClick={() => ledger.setCategoryArchived(c.id, !c.archived)}>{c.archived ? 'Ripristina' : 'Archivia'}</button>
              </>
            )}
          </li>
        ))}
      </ul>
      <form onSubmit={add} style={{ marginTop: 12 }} noValidate>
        <h3>Nuova categoria</h3>
        <div className="row wrap">
          <div style={{ width: 64 }}><input aria-label="Icona" value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={8} /></div>
          <div className="grow"><input aria-label="Nome della categoria" placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} /></div>
          <select aria-label="Tipo" style={{ width: 'auto' }} value={kind} onChange={(e) => setKind(e.target.value as CategoryKind)}>
            <option value="expense">Uscite</option>
            <option value="income">Entrate</option>
            <option value="both">Entrambe</option>
          </select>
          <button className="btn primary" type="submit">Aggiungi</button>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
      </form>
    </div>
  );
}

function DesktopSyncNotice() {
  return (
    <div className="card">
      <h2>Sincronizzazione</h2>
      <p className="muted small">
        Nell’app desktop la sincronizzazione con Google Drive non è ancora disponibile. Per avere i dati su più computer usa
        “Esporta backup” e salva il file in una cartella già sincronizzata dal tuo servizio cloud (Drive, iCloud, OneDrive,
        Dropbox…); sull’altro dispositivo usa “Ripristina” con la modalità “Unisci ai dati attuali”. La versione web
        sincronizza con Google Drive.
      </p>
    </div>
  );
}

function SyncPanel({ ledger, sync }: { ledger: Ledger; sync: SyncUi }) {
  const [clientId, setClientId] = useState(sync.clientId);
  const [pass, setPass] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const connected = sync.status !== 'off';
  const state = ledger.getState();

  const connect = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await sync.connect(clientId, pass);
      setPass('');
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <h2>Sincronizzazione con Google Drive</h2>
      <p className="muted small">
        I dati vengono cifrati su questo dispositivo con la tua passphrase prima di essere caricati nella cartella
        riservata all’app su Google Drive. Google non può leggerli e l’app non vede gli altri tuoi file. Se perdi la
        passphrase i dati sul cloud non sono recuperabili.
      </p>
      {connected ? (
        <>
          <p role="status">
            <strong>{sync.message || 'Connesso'}</strong>
            {sync.lastAt && <span className="muted small"> · ultimo aggiornamento {new Date(sync.lastAt).toLocaleTimeString(ledger.settings.locale)}</span>}
          </p>
          {state.dirty && <p className="muted small">Ci sono modifiche non ancora inviate.</p>}
          <div className="row wrap">
            <button className="btn primary" disabled={sync.status === 'syncing'} onClick={() => void sync.syncNow()}>Sincronizza ora</button>
            <button className="btn" onClick={() => void sync.disconnect()}>Disconnetti</button>
          </div>
          {sync.status === 'needs-auth' && <p className="error">L’accesso a Google è scaduto: disconnetti e riconnetti.</p>}
        </>
      ) : (
        <form onSubmit={connect} noValidate>
          {sync.wasEnabled && <p className="muted small">La sincronizzazione era attiva: reinserisci la passphrase per riprenderla.</p>}
          <label>
            Client ID OAuth di Google (tipo “Applicazione web”)
            <input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="xxxx.apps.googleusercontent.com" autoComplete="off" spellCheck={false} />
          </label>
          <label>
            Passphrase di cifratura (la stessa su tutti i dispositivi, minimo 8 caratteri)
            <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="new-password" />
          </label>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="btn primary" type="submit" disabled={busy}>{busy ? 'Connessione…' : 'Connetti Google Drive'}</button>
        </form>
      )}
      {state.conflictLog.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <h3>Conflitti risolti automaticamente</h3>
          <p className="muted small">Lo stesso dato è stato modificato su due dispositivi: è stata mantenuta la modifica più recente.</p>
          <ul className="list">
            {state.conflictLog.map((c, i) => (
              <li key={`${c.table}-${c.id}-${c.detectedAt}`}>
                <span className="grow small">{c.table === 'transactions' ? 'Movimento' : c.table === 'categories' ? 'Categoria' : 'Budget'} · vinta la versione {c.winner === 'local' ? 'di questo dispositivo' : 'dell’altro dispositivo'}</span>
                <button className="btn" onClick={() => ledger.restoreConflict(i)}>Ripristina l’altra</button>
                <button className="btn" onClick={() => ledger.dismissConflict(i)}>Ignora</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function BackupPanel({ ledger }: { ledger: Ledger }) {
  const [pass, setPass] = useState('');
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const doExport = async () => {
    try {
      const bytes = await exportBackup(ledger.getSnapshot(), { passphrase: pass || undefined });
      const r = await saveFile(`quattrino-backup-${stamp()}.${pass ? 'quattrino' : 'json'}`, bytes as BlobPart, 'application/octet-stream');
      if (r === 'cancelled') return;
      setMsg({ ok: true, text: pass ? 'Backup cifrato salvato.' : 'Backup salvato IN CHIARO: conservalo con cura.' });
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) });
    }
  };

  const doCsv = async () => {
    try {
      const r = await saveFile(`quattrino-movimenti-${stamp()}.csv`, transactionsToCsv(ledger.transactions(), ledger.categories()), 'text/csv;charset=utf-8');
      if (r === 'saved') setMsg({ ok: true, text: 'File CSV salvato.' });
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) });
    }
  };

  const doImport = async () => {
    const f = file.current?.files?.[0];
    if (!f) return setMsg({ ok: false, text: 'Scegli prima un file di backup.' });
    if (mode === 'replace' && !(await confirmAction('Sostituire TUTTI i dati attuali con quelli del backup? Esporta prima un backup se non sei sicuro.'))) return;
    try {
      const snap = await readBackup(new Uint8Array(await f.arrayBuffer()), { passphrase: pass || undefined });
      if (mode === 'replace') ledger.replaceAll(snap);
      else ledger.applyRemote(snap);
      setMsg({ ok: true, text: mode === 'replace' ? 'Dati ripristinati dal backup.' : 'Backup unito ai dati esistenti.' });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof BackupError && e.code === 'passphrase-required' ? 'Il backup è cifrato: inserisci la passphrase qui sopra.' : errorText(e) });
    }
  };

  return (
    <div className="card">
      <h2>Backup e ripristino</h2>
      <p className="muted small">Funziona senza cloud: salva il file dove vuoi (anche in una cartella già sincronizzata da Drive, iCloud o OneDrive).</p>
      <label>
        Passphrase del backup (lascia vuoto per un file in chiaro)
        <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="off" />
      </label>
      <div className="row wrap" style={{ marginBottom: 14 }}>
        <button className="btn primary" onClick={() => void doExport()}>Esporta backup</button>
        <button className="btn" onClick={() => void doCsv()}>Esporta CSV</button>
      </div>
      <label>
        File di backup da ripristinare
        <input ref={file} type="file" accept=".quattrino,.json,application/json" />
      </label>
      <div className="seg" role="group" aria-label="Modalità di ripristino">
        <button aria-pressed={mode === 'merge'} onClick={() => setMode('merge')}>Unisci ai dati attuali</button>
        <button aria-pressed={mode === 'replace'} onClick={() => setMode('replace')}>Sostituisci tutto</button>
      </div>
      <button className="btn" onClick={() => void doImport()}>Ripristina</button>
      {msg && <p className={msg.ok ? 'small' : 'error'} role="status">{msg.text}</p>}
    </div>
  );
}

export function SettingsScreen({ ledger, sync }: { ledger: Ledger; sync: SyncUi }) {
  const [error, setError] = useState('');
  return (
    <>
      <h1>Impostazioni</h1>
      <Categories ledger={ledger} />
      <div className="card">
        <h2>Valuta</h2>
        <label>
          Valuta dei movimenti (cambia solo il simbolo, non converte gli importi)
          <select
            value={ledger.settings.currency}
            onChange={(e) => {
              try {
                ledger.updateSettings({ currency: e.target.value });
                setError('');
              } catch (err) {
                setError(errorText(err));
              }
            }}
          >
            {['EUR', 'USD', 'GBP', 'CHF'].map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        {error && <p className="error" role="alert">{error}</p>}
      </div>
      {isDesktopApp() ? <DesktopSyncNotice /> : <SyncPanel ledger={ledger} sync={sync} />}
      <BackupPanel ledger={ledger} />
      <p className="muted small">Quattrino 0.1.0 · ID dispositivo {ledger.deviceId} · i dati risiedono su questo dispositivo.</p>
    </>
  );
}
