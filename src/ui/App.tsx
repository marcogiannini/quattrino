import { useEffect, useState, useSyncExternalStore } from 'react';
import { monthOf, todayISO } from '../core/dates';
import type { Ledger } from '../core/ledger';
import type { Transaction } from '../core/types';
import type { Key } from '../i18n';
import { useT } from './common';
import { BudgetScreen } from './screens/Budget';
import { Overview } from './screens/Overview';
import { SettingsScreen } from './screens/Settings';
import { StatsScreen } from './screens/Stats';
import { TransactionsScreen } from './screens/Transactions';
import { TransactionSheet } from './TransactionSheet';
import { useSync } from './useSync';

type Tab = 'home' | 'tx' | 'stats' | 'budget' | 'settings';
const TABS: { id: Tab; key: Key; icon: string }[] = [
  { id: 'home', key: 'nav.home', icon: '🏠' },
  { id: 'tx', key: 'nav.tx', icon: '🧾' },
  { id: 'stats', key: 'nav.stats', icon: '📊' },
  { id: 'budget', key: 'nav.budget', icon: '🎯' },
  { id: 'settings', key: 'nav.settings', icon: '⚙️' },
];

/** Crea i movimenti delle ricorrenze scadute: all'avvio, dopo ogni modifica/sincronizzazione e al cambio di giorno. */
function useRecurring(ledger: Ledger, rev: number): void {
  useEffect(() => {
    ledger.generateRecurring(todayISO());
  }, [ledger, rev]);
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') ledger.generateRecurring(todayISO());
    };
    document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(() => ledger.generateRecurring(todayISO()), 60 * 60 * 1000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(timer);
    };
  }, [ledger]);
}

export function App({ ledger }: { ledger: Ledger }) {
  const rev = useSyncExternalStore(ledger.subscribe, () => ledger.revision, () => ledger.revision);
  const t = useT(ledger);
  const sync = useSync(ledger);
  useRecurring(ledger, rev);
  const [tab, setTab] = useState<Tab>('home');
  const [month, setMonth] = useState(() => monthOf(todayISO()));
  const [sheet, setSheet] = useState<{ tx?: Transaction } | null>(null);
  const [toast, setToast] = useState<{ msg: string; undo: () => void } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    document.documentElement.lang = ledger.settings.locale.slice(0, 2);
  }, [ledger.settings.locale]);

  const edit = (tx: Transaction) => setSheet({ tx });
  const syncLabel =
    sync.status === 'offline' ? t('app.sync.offline') : sync.status === 'syncing' ? t('app.sync.syncing') : sync.status === 'idle' ? t('app.sync.idle') : t('app.sync.check');

  return (
    <div className="app">
      <main>
        {ledger.saveError != null && (
          <p className="error" role="alert">
            {t('app.saveError')}
          </p>
        )}
        {sync.status !== 'off' && (
          <p className="muted small" role="status" style={{ textAlign: 'right', margin: '0 0 6px' }}>
            ☁ {syncLabel}
          </p>
        )}
        {tab === 'home' && (
          <Overview ledger={ledger} month={month} onMonth={setMonth} onEdit={edit} onOpenBudget={() => setTab('budget')} onOpenTransactions={() => setTab('tx')} />
        )}
        {tab === 'tx' && <TransactionsScreen ledger={ledger} month={month} onMonth={setMonth} onEdit={edit} />}
        {tab === 'stats' && <StatsScreen ledger={ledger} month={month} onMonth={setMonth} />}
        {tab === 'budget' && <BudgetScreen ledger={ledger} month={month} onMonth={setMonth} />}
        {tab === 'settings' && <SettingsScreen ledger={ledger} sync={sync} />}
      </main>

      <button className="fab" aria-label={t('app.add')} onClick={() => setSheet({})}>+</button>

      <nav className="nav" aria-label={t('nav.label')}>
        {TABS.map((x) => (
          <button key={x.id} aria-current={tab === x.id ? 'page' : undefined} onClick={() => setTab(x.id)}>
            <span aria-hidden="true">{x.icon}</span>
            {t(x.key)}
          </button>
        ))}
      </nav>

      {sheet && (
        <TransactionSheet
          ledger={ledger}
          tx={sheet.tx}
          onClose={() => setSheet(null)}
          onDeleted={(id) => setToast({ msg: t('app.deleted'), undo: () => ledger.restoreTransaction(id) })}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          {toast.msg}
          <button
            onClick={() => {
              toast.undo();
              setToast(null);
            }}
          >
            {t('common.undo')}
          </button>
        </div>
      )}
    </div>
  );
}
