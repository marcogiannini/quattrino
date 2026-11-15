import { monthRange } from '../../core/dates';
import type { Ledger } from '../../core/ledger';
import { budgetStatuses, totals } from '../../core/stats';
import type { Transaction } from '../../core/types';
import { MonthNav, money } from '../common';
import { BudgetBar } from './Budget';
import { TxRow } from './Transactions';

export function Overview({
  ledger,
  month,
  onMonth,
  onEdit,
  onOpenBudget,
  onOpenTransactions,
}: {
  ledger: Ledger;
  month: string;
  onMonth: (m: string) => void;
  onEdit: (tx: Transaction) => void;
  onOpenBudget: () => void;
  onOpenTransactions: () => void;
}) {
  const txs = ledger.transactions();
  const { from, to } = monthRange(month);
  const t = totals(txs, from, to);
  const budgets = budgetStatuses(ledger.budgets(), txs, month).sort((a, b) => b.ratio - a.ratio).slice(0, 3);
  const recent = txs.filter((x) => x.date >= from && x.date <= to).slice(0, 5);

  return (
    <>
      <h1>Panoramica</h1>
      <MonthNav month={month} onChange={onMonth} locale={ledger.settings.locale} />
      <div className="grid3">
        <div className="stat"><div className="label">Entrate</div><div className="value num inc">{money(ledger, t.incomeCents)}</div></div>
        <div className="stat"><div className="label">Uscite</div><div className="value num exp">{money(ledger, t.expenseCents)}</div></div>
        <div className="stat"><div className="label">Saldo del mese</div><div className="value num">{money(ledger, t.netCents)}</div></div>
      </div>

      <div className="card">
        <div className="row between">
          <h2>Budget</h2>
          <button className="btn" onClick={onOpenBudget}>Gestisci</button>
        </div>
        {budgets.length === 0 ? (
          <p className="muted small">Nessun budget impostato per tenere sotto controllo le spese.</p>
        ) : (
          <div style={{ display: 'grid', gap: 14 }}>
            {budgets.map((s) => (
              <BudgetBar key={s.budget.id} ledger={ledger} s={s} />
            ))}
          </div>
        )}
      </div>

      <div className="row between" style={{ margin: '6px 2px' }}>
        <h2>Ultimi movimenti</h2>
        <button className="btn" onClick={onOpenTransactions}>Vedi tutti</button>
      </div>
      {recent.length === 0 ? (
        <p className="empty">Ancora nessun movimento questo mese. Tocca “+” per iniziare.</p>
      ) : (
        recent.map((x) => <TxRow key={x.id} ledger={ledger} tx={x} onClick={() => onEdit(x)} />)
      )}
    </>
  );
}
