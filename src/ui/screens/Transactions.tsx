import { useMemo, useState } from 'react';
import { dayLabel, monthRange } from '../../core/dates';
import type { Ledger } from '../../core/ledger';
import type { Transaction } from '../../core/types';
import { CategoryDot, MonthNav, money } from '../common';

export function TxRow({ ledger, tx, onClick }: { ledger: Ledger; tx: Transaction; onClick: () => void }) {
  const c = ledger.category(tx.categoryId);
  return (
    <button className="tx" onClick={onClick} aria-label={`${c?.name ?? 'Movimento'}, ${tx.type === 'income' ? 'entrata' : 'uscita'} ${money(ledger, tx.amountCents)}. Modifica`}>
      <CategoryDot category={c} />
      <span className="grow">
        <div className="name">{c?.name ?? 'Categoria rimossa'}</div>
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
  const [type, setType] = useState<'all' | 'expense' | 'income'>('all');
  const [cat, setCat] = useState('all');
  const [q, setQ] = useState('');
  const all = ledger.transactions();

  const groups = useMemo(() => {
    const { from, to } = monthRange(month);
    const needle = q.trim().toLocaleLowerCase('it');
    const rows = all.filter(
      (t) =>
        t.date >= from &&
        t.date <= to &&
        (type === 'all' || t.type === type) &&
        (cat === 'all' || t.categoryId === cat) &&
        (needle === '' || t.note.toLocaleLowerCase('it').includes(needle) || (ledger.category(t.categoryId)?.name ?? '').toLocaleLowerCase('it').includes(needle)),
    );
    const byDay = new Map<string, Transaction[]>();
    for (const t of rows) byDay.set(t.date, [...(byDay.get(t.date) ?? []), t]);
    return [...byDay.entries()];
  }, [all, month, type, cat, q, ledger]);

  return (
    <>
      <h1>Movimenti</h1>
      <MonthNav month={month} onChange={onMonth} locale={ledger.settings.locale} />
      <div className="row wrap" style={{ marginBottom: 8 }}>
        <div className="grow" style={{ minWidth: 140 }}>
          <input type="search" aria-label="Cerca per nota o categoria" placeholder="Cerca…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select aria-label="Tipo" style={{ width: 'auto' }} value={type} onChange={(e) => setType(e.target.value as typeof type)}>
          <option value="all">Tutti</option>
          <option value="expense">Uscite</option>
          <option value="income">Entrate</option>
        </select>
        <select aria-label="Categoria" style={{ width: 'auto' }} value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="all">Tutte le categorie</option>
          {ledger.categories().map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {groups.length === 0 && <p className="empty">Nessun movimento in questo periodo. Tocca “+” per aggiungerne uno.</p>}
      {groups.map(([date, rows]) => (
        <section className="daygroup" key={date}>
          <h3>{dayLabel(date, ledger.settings.locale)}</h3>
          {rows.map((t) => (
            <TxRow key={t.id} ledger={ledger} tx={t} onClick={() => onEdit(t)} />
          ))}
        </section>
      ))}
    </>
  );
}
