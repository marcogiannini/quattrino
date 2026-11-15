import { useRef, useState, type FormEvent } from 'react';
import { BackupError, exportBackup, readBackup, transactionsToCsv } from '../../core/backup';
import type { Ledger } from '../../core/ledger';
import type { CategoryKind } from '../../core/types';
import { LANGUAGES, langOf } from '../../i18n';
import { categoryName, errorText, useT } from '../common';
import { ImportPanel } from './ImportPanel';
import { RecurringPanel } from './Recurring';
import { confirmAction, isDesktopApp, saveFile } from '../desktop';
import type { SyncUi } from '../useSync';

const stamp = (): string => new Date().toISOString().slice(0, 10);

function Categories({ ledger }: { ledger: Ledger }) {
  const t = useT(ledger);
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
      setError(errorText(err, ledger));
    }
  };
  const rename = () => {
    if (!editing) return;
    try {
      ledger.updateCategory(editing.id, { name: editing.name });
      setEditing(null);
      setError('');
    } catch (err) {
      setError(errorText(err, ledger));
    }
  };

  return (
    <div className="card">
      <h2>{t('se.categories')}</h2>
      <ul className="list">
        {ledger.categories().map((c) => (
          <li key={c.id} style={{ opacity: c.archived ? 0.55 : 1 }}>
            <span aria-hidden="true">{c.icon}</span>
            {editing?.id === c.id ? (
              <>
                <input aria-label={t('se.newName')} value={editing.name} onChange={(e) => setEditing({ id: c.id, name: e.target.value })} />
                <button className="btn primary" onClick={rename}>OK</button>
              </>
            ) : (
              <>
                <span className="grow">{categoryName(t, c)} <span className="muted small">· {t(`se.kind.${c.kind}`)}{c.archived ? ` · ${t('se.archivedTag')}` : ''}</span></span>
                <button className="btn" onClick={() => setEditing({ id: c.id, name: c.name })}>{t('se.rename')}</button>
                <button className="btn" onClick={() => ledger.setCategoryArchived(c.id, !c.archived)}>{c.archived ? t('se.restore') : t('se.archive')}</button>
              </>
            )}
          </li>
        ))}
      </ul>
      <form onSubmit={add} style={{ marginTop: 12 }} noValidate>
        <h3>{t('se.newCategory')}</h3>
        <div className="row wrap">
          <div style={{ width: 64 }}><input aria-label={t('se.icon')} value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={8} /></div>
          <div className="grow"><input aria-label={t('se.categoryName')} placeholder={t('se.name')} value={name} onChange={(e) => setName(e.target.value)} maxLength={40} /></div>
          <select aria-label={t('se.kindLabel')} style={{ width: 'auto' }} value={kind} onChange={(e) => setKind(e.target.value as CategoryKind)}>
            <option value="expense">{t('common.expenses')}</option>
            <option value="income">{t('common.income')}</option>
            <option value="both">{t('common.both')}</option>
          </select>
          <button className="btn primary" type="submit">{t('se.add')}</button>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
      </form>
    </div>
  );
}

function DesktopSyncNotice({ ledger }: { ledger: Ledger }) {
  const t = useT(ledger);
  return (
    <div className="card">
      <h2>{t('se.sync')}</h2>
      <p className="muted small">{t('se.desktopSync')}</p>
    </div>
  );
}

function SyncPanel({ ledger, sync }: { ledger: Ledger; sync: SyncUi }) {
  const t = useT(ledger);
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
      setError(errorText(err, ledger));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <h2>{t('sy.title')}</h2>
      <p className="muted small">{t('sy.intro')}</p>
      {connected ? (
        <>
          <p role="status">
            <strong>{sync.message || t('sy.connected')}</strong>
            {sync.lastAt && <span className="muted small"> · {t('sy.lastUpdate', { time: new Date(sync.lastAt).toLocaleTimeString(ledger.settings.locale) })}</span>}
          </p>
          {state.dirty && <p className="muted small">{t('sy.pending')}</p>}
          <div className="row wrap">
            <button className="btn primary" disabled={sync.status === 'syncing'} onClick={() => void sync.syncNow()}>{t('sy.now')}</button>
            <button className="btn" onClick={() => void sync.disconnect()}>{t('sy.disconnect')}</button>
          </div>
          {sync.status === 'needs-auth' && <p className="error">{t('sy.expired')}</p>}
        </>
      ) : (
        <form onSubmit={connect} noValidate>
          {sync.wasEnabled && <p className="muted small">{t('sy.resume')}</p>}
          <label>
            {t('sy.clientId')}
            <input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="xxxx.apps.googleusercontent.com" autoComplete="off" spellCheck={false} />
          </label>
          <label>
            {t('sy.passphrase')}
            <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="new-password" />
          </label>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="btn primary" type="submit" disabled={busy}>{busy ? t('sy.connecting') : t('sy.connect')}</button>
        </form>
      )}
      {state.conflictLog.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <h3>{t('sy.conflicts')}</h3>
          <p className="muted small">{t('sy.conflictsHelp')}</p>
          <ul className="list">
            {state.conflictLog.map((c, i) => (
              <li key={`${c.table}-${c.id}-${c.detectedAt}`}>
                <span className="grow small">{t(`sy.t.${c.table}`)} · {t(`sy.won.${c.winner}`)}</span>
                <button className="btn" onClick={() => ledger.restoreConflict(i)}>{t('sy.restoreOther')}</button>
                <button className="btn" onClick={() => ledger.dismissConflict(i)}>{t('sy.ignore')}</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function BackupPanel({ ledger }: { ledger: Ledger }) {
  const t = useT(ledger);
  const [pass, setPass] = useState('');
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const doExport = async () => {
    try {
      const bytes = await exportBackup(ledger.getSnapshot(), { passphrase: pass || undefined });
      const r = await saveFile(`quattrino-backup-${stamp()}.${pass ? 'quattrino' : 'json'}`, bytes as BlobPart, 'application/octet-stream');
      if (r === 'cancelled') return;
      setMsg({ ok: true, text: pass ? t('bk.savedEnc') : t('bk.savedPlain') });
    } catch (e) {
      setMsg({ ok: false, text: errorText(e, ledger) });
    }
  };

  const doCsv = async () => {
    try {
      const r = await saveFile(`quattrino-${t('bk.csvName')}-${stamp()}.csv`, transactionsToCsv(ledger.transactions(), ledger.categories(), t), 'text/csv;charset=utf-8');
      if (r === 'saved') setMsg({ ok: true, text: t('bk.csvSaved') });
    } catch (e) {
      setMsg({ ok: false, text: errorText(e, ledger) });
    }
  };

  const doImport = async () => {
    const f = file.current?.files?.[0];
    if (!f) return setMsg({ ok: false, text: t('bk.pickFile') });
    if (mode === 'replace' && !(await confirmAction(t('bk.confirmReplace')))) return;
    try {
      const snap = await readBackup(new Uint8Array(await f.arrayBuffer()), { passphrase: pass || undefined });
      if (mode === 'replace') ledger.replaceAll(snap);
      else ledger.applyRemote(snap);
      setMsg({ ok: true, text: mode === 'replace' ? t('bk.restored') : t('bk.merged') });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof BackupError && e.code === 'passphrase-required' ? t('bk.needPass') : errorText(e, ledger) });
    }
  };

  return (
    <div className="card">
      <h2>{t('bk.title')}</h2>
      <p className="muted small">{t('bk.help')}</p>
      <label>
        {t('bk.pass')}
        <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="off" />
      </label>
      <div className="row wrap" style={{ marginBottom: 14 }}>
        <button className="btn primary" onClick={() => void doExport()}>{t('bk.export')}</button>
        <button className="btn" onClick={() => void doCsv()}>{t('bk.csv')}</button>
      </div>
      <label>
        {t('bk.file')}
        <input ref={file} type="file" accept=".quattrino,.json,application/json" />
      </label>
      <div className="seg" role="group" aria-label={t('bk.mode')}>
        <button aria-pressed={mode === 'merge'} onClick={() => setMode('merge')}>{t('bk.merge')}</button>
        <button aria-pressed={mode === 'replace'} onClick={() => setMode('replace')}>{t('bk.replace')}</button>
      </div>
      <button className="btn" onClick={() => void doImport()}>{t('bk.restoreBtn')}</button>
      {msg && <p className={msg.ok ? 'small' : 'error'} role="status">{msg.text}</p>}
    </div>
  );
}

export function SettingsScreen({ ledger, sync }: { ledger: Ledger; sync: SyncUi }) {
  const t = useT(ledger);
  const [error, setError] = useState('');
  const update = (patch: { currency?: string; locale?: string }) => {
    try {
      ledger.updateSettings(patch);
      setError('');
    } catch (err) {
      setError(errorText(err, ledger));
    }
  };
  return (
    <>
      <h1>{t('se.title')}</h1>
      <div className="card">
        <h2>{t('se.language')}</h2>
        <label>
          {t('se.languageHelp')}
          <select value={langOf(ledger.settings.locale)} onChange={(e) => update({ locale: LANGUAGES.find((l) => l.lang === e.target.value)!.locale })}>
            {LANGUAGES.map((l) => <option key={l.lang} value={l.lang}>{l.label}</option>)}
          </select>
        </label>
        <h2 style={{ marginTop: 14 }}>{t('se.currency')}</h2>
        <label>
          {t('se.currencyHelp')}
          <select value={ledger.settings.currency} onChange={(e) => update({ currency: e.target.value })}>
            {['EUR', 'USD', 'GBP', 'CHF'].map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        {error && <p className="error" role="alert">{error}</p>}
      </div>
      <RecurringPanel ledger={ledger} />
      <Categories ledger={ledger} />
      {isDesktopApp() ? <DesktopSyncNotice ledger={ledger} /> : <SyncPanel ledger={ledger} sync={sync} />}
      <BackupPanel ledger={ledger} />
      <ImportPanel ledger={ledger} />
      <p className="muted small">{t('se.footer', { version: __APP_VERSION__, id: ledger.deviceId })}</p>
    </>
  );
}
