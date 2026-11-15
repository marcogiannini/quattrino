import { monthRange } from '../../core/dates';
import type { Ledger } from '../../core/ledger';
import { budgetStatuses, totals } from '../../core/stats';
import type { Transaction } from '../../core/types';
import { MonthNav, money, useT } from '../common';
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
  const t = useT(ledger);
  const txs = ledger.transactions();
  const { from, to } = monthRange(month);
  const tot = totals(txs, from, to);
  const budgets = budgetStatuses(ledger.budgets(), txs, month).sort((a, b) => b.ratio - a.ratio).slice(0, 3);
  const recent = txs.filter((x) => x.date >= from && x.date <= to).slice(0, 5);

  return (
    <>
      <h1>{t('nav.home')}</h1>
      <MonthNav month={month} onChange={onMonth} locale={ledger.settings.locale} />
      <div className="grid3">
        <div className="stat"><div className="label">{t('common.income')}</div><div className="value num inc">{money(ledger, tot.incomeCents)}</div></div>
        <div className="stat"><div className="label">{t('common.expenses')}</div><div className="value num exp">{money(ledger, tot.expenseCents)}</div></div>
        <div className="stat"><div className="label">{t('ov.balance')}</div><div className="value num">{money(ledger, tot.netCents)}</div></div>
      </div>

      <div className="card">
        <div className="row between">
          <h2>{t('nav.budget')}</h2>
          <button className="btn" onClick={onOpenBudget}>{t('ov.manage')}</button>
        </div>
        {budgets.length === 0 ? (
          <p className="muted small">{t('ov.noBudget')}</p>
        ) : (
          <div style={{ display: 'grid', gap: 14 }}>
            {budgets.map((s) => (
              <BudgetBar key={s.budget.id} ledger={ledger} s={s} />
            ))}
          </div>
        )}
      </div>

      <div className="row between" style={{ margin: '6px 2px' }}>
        <h2>{t('ov.recent')}</h2>
        <button className="btn" onClick={onOpenTransactions}>{t('ov.seeAll')}</button>
      </div>
      {recent.length === 0 ? (
        <p className="empty">{t('ov.empty')}</p>
      ) : (
        recent.map((x) => <TxRow key={x.id} ledger={ledger} tx={x} onClick={() => onEdit(x)} />)
      )}
    </>
  );
}
