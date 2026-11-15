import { useMemo, useState } from 'react';
import { dayLabel, monthRange } from '../../core/dates';
import type { Ledger } from '../../core/ledger';
import type { Transaction } from '../../core/types';
import { CategoryDot, MonthNav, categoryName, money, useT } from '../common';

export function TxRow({ ledger, tx, onClick }: { ledger: Ledger; tx: Transaction; onClick: () => void }) {
  const t = useT(ledger);
  const c = ledger.category(tx.categoryId);
  const name = categoryName(t, c);
  const kind = tx.type === 'income' ? t('tx.incomeWord') : t('tx.expenseWord');
  return (
    <button className="tx" onClick={onClick} aria-label={t('tx.rowAria', { name: c ? name : t('tx.generic'), kind, amount: money(ledger, tx.amountCents) })}>
      <CategoryDot category={c} />
      <span className="grow">
        <div className="name">{name}{tx.recurringId && <span className="muted small" title={t('tx.recurringBadge')}> ↻</span>}</div>
        {tx.note && <div className="note">{tx.note}</div>}
      </span>
      <span className={`num ${tx.type === 'income' ? 'inc' : 'exp'}`}>
        <strong>
          {tx.type === 'income' ? '+' : '−'}
          {money(ledger, tx.amountCents)}
        </strong>
      </span>
    </button>
  );
}

export function TransactionsScreen({
  ledger,
  month,
  onMonth,
  onEdit,
}: {
  ledger: Ledger;
  month: string;
  onMonth: (m: string) => void;
  onEdit: (tx: Transaction) => void;
}) {
  const t = useT(ledger);
  const lc = ledger.settings.locale;
  const [type, setType] = useState<'all' | 'expense' | 'income'>('all');
  const [cat, setCat] = useState('all');
  const [q, setQ] = useState('');
  const all = ledger.transactions();

  const groups = useMemo(() => {
    const { from, to } = monthRange(month);
    const needle = q.trim().toLocaleLowerCase(lc);
    const rows = all.filter(
      (x) =>
        x.date >= from &&
        x.date <= to &&
        (type === 'all' || x.type === type) &&
        (cat === 'all' || x.categoryId === cat) &&
        (needle === '' || x.note.toLocaleLowerCase(lc).includes(needle) || categoryName(t, ledger.category(x.categoryId)).toLocaleLowerCase(lc).includes(needle)),
    );
    const byDay = new Map<string, Transaction[]>();
    for (const x of rows) byDay.set(x.date, [...(byDay.get(x.date) ?? []), x]);
    return [...byDay.entries()];
  }, [all, month, type, cat, q, ledger, lc, t]);

  return (
    <>
      <h1>{t('tx.title')}</h1>
      <MonthNav month={month} onChange={onMonth} locale={ledger.settings.locale} />
      <div className="row wrap" style={{ marginBottom: 8 }}>
        <div className="grow" style={{ minWidth: 140 }}>
          <input type="search" aria-label={t('tx.searchLabel')} placeholder={t('tx.searchPh')} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select aria-label={t('tx.type')} style={{ width: 'auto' }} value={type} onChange={(e) => setType(e.target.value as typeof type)}>
          <option value="all">{t('tx.all')}</option>
          <option value="expense">{t('common.expenses')}</option>
          <option value="income">{t('common.income')}</option>
        </select>
        <select aria-label={t('tx.category')} style={{ width: 'auto' }} value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="all">{t('tx.allCats')}</option>
          {ledger.categories().map((c) => (
            <option key={c.id} value={c.id}>{categoryName(t, c)}</option>
          ))}
        </select>
      </div>

      {groups.length === 0 && <p className="empty">{t('tx.empty')}</p>}
      {groups.map(([date, rows]) => (
        <section className="daygroup" key={date}>
          <h3>{dayLabel(date, ledger.settings.locale)}</h3>
          {rows.map((x) => (
            <TxRow key={x.id} ledger={ledger} tx={x} onClick={() => onEdit(x)} />
          ))}
        </section>
      ))}
    </>
  );
}
