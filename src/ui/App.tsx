import { useEffect, useState, useSyncExternalStore } from 'react';
import { monthOf, todayISO } from '../core/dates';
import type { Ledger } from '../core/ledger';
import type { Transaction } from '../core/types';
import { BudgetScreen } from './screens/Budget';
import { Overview } from './screens/Overview';
import { SettingsScreen } from './screens/Settings';
import { StatsScreen } from './screens/Stats';
import { TransactionsScreen } from './screens/Transactions';
import { TransactionSheet } from './TransactionSheet';
import { useSync } from './useSync';

type Tab = 'home' | 'tx' | 'stats' | 'budget' | 'settings';
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'home', label: 'Panoramica', icon: '🏠' },
  { id: 'tx', label: 'Movimenti', icon: '🧾' },
  { id: 'stats', label: 'Statistiche', icon: '📊' },
  { id: 'budget', label: 'Budget', icon: '🎯' },
  { id: 'settings', label: 'Impostazioni', icon: '⚙️' },
];

export function App({ ledger }: { ledger: Ledger }) {
  useSyncExternalStore(ledger.subscribe, () => ledger.revision, () => ledger.revision);
  const sync = useSync(ledger);
  const [tab, setTab] = useState<Tab>('home');
  const [month, setMonth] = useState(() => monthOf(todayISO()));
  const [sheet, setSheet] = useState<{ tx?: Transaction } | null>(null);
  const [toast, setToast] = useState<{ msg: string; undo: () => void } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  const edit = (tx: Transaction) => setSheet({ tx });

  return (
    <div className="app">
      <main>
        {ledger.saveError != null && (
          <p className="error" role="alert">
            Attenzione: non riesco a salvare i dati su questo dispositivo. Esporta un backup da Impostazioni.
          </p>
        )}
        {sync.status !== 'off' && (
          <p className="muted small" role="status" style={{ textAlign: 'right', margin: '0 0 6px' }}>
            ☁ {sync.status === 'offline' ? 'Offline' : sync.status === 'syncing' ? 'Sincronizzazione…' : sync.status === 'idle' ? 'Sincronizzato' : 'Sincronizzazione da controllare'}
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

      <button className="fab" aria-label="Aggiungi movimento" onClick={() => setSheet({})}>+</button>

      <nav className="nav" aria-label="Sezioni">
        {TABS.map((t) => (
          <button key={t.id} aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
            <span aria-hidden="true">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>

      {sheet && (
        <TransactionSheet
          ledger={ledger}
          tx={sheet.tx}
          onClose={() => setSheet(null)}
          onDeleted={(id) => setToast({ msg: 'Movimento eliminato', undo: () => ledger.restoreTransaction(id) })}
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
            Annulla
          </button>
        </div>
      )}
    </div>
  );
}
