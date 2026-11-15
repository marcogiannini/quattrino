import { useState, type FormEvent } from 'react';
import type { Ledger } from '../../core/ledger';
import { centsToInput, parseAmountToCents } from '../../core/money';
import { budgetStatuses, type BudgetStatus } from '../../core/stats';
import { MonthNav, errorText, money } from '../common';

const LABEL = { ok: 'In linea', warning: 'Vicino al limite', over: 'Superato' } as const;
const COLOR = { ok: 'var(--ok)', warning: 'var(--warn)', over: 'var(--over)' } as const;

export function budgetName(ledger: Ledger, categoryId: string | null): string {
  if (categoryId === null) return '🧾 Totale uscite';
  const c = ledger.category(categoryId);
  return `${c?.icon ?? '❔'} ${c?.name ?? 'Categoria rimossa'}`;
}

/** Barra di avanzamento; lo stato è espresso anche a parole, non solo con il colore. */
export function BudgetBar({ ledger, s }: { ledger: Ledger; s: BudgetStatus }) {
  return (
    <div>
      <div className="row between wrap">
        <span>{budgetName(ledger, s.budget.categoryId)}</span>
        <span className={`badge ${s.state}`}>{LABEL[s.state]}</span>
      </div>
      <div className="track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.round(s.ratio * 100))} aria-label={`Budget utilizzato al ${Math.round(s.ratio * 100)}%`}>
        <div className="fill" style={{ width: `${Math.min(100, s.ratio * 100)}%`, background: COLOR[s.state] }} />
      </div>
      <div className="row between small muted num">
        <span>{money(ledger, s.spentCents)} di {money(ledger, s.budget.amountCents)}</span>
        <span>{s.remainingCents >= 0 ? `restano ${money(ledger, s.remainingCents)}` : `oltre di ${money(ledger, -s.remainingCents)}`}</span>
      </div>
    </div>
  );
}

export function BudgetScreen({ ledger, month, onMonth }: { ledger: Ledger; month: string; onMonth: (m: string) => void }) {
  const statuses = budgetStatuses(ledger.budgets(), ledger.transactions(), month).sort((a, b) => b.ratio - a.ratio);
  const taken = new Set(ledger.budgets().map((b) => b.categoryId));
  const candidates: (string | null)[] = [null, ...ledger.categories({ includeArchived: false }).filter((c) => c.kind !== 'income').map((c) => c.id)];
  const [target, setTarget] = useState<string>('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');

  const save = (e: FormEvent) => {
    e.preventDefault();
    const cents = parseAmountToCents(amount);
    if (cents === null) return setError('Inserisci un importo valido maggiore di zero.');
    try {
      ledger.setBudget(target === '' ? null : target === '__total' ? null : target, cents);
      setAmount('');
      setError('');
    } catch (err) {
      setError(errorText(err));
    }
  };

  return (
    <>
      <h1>Budget</h1>
      <MonthNav month={month} onChange={onMonth} locale={ledger.settings.locale} />
      <p className="muted small">I limiti sono mensili e si ripetono ogni mese. Contano solo le uscite.</p>

      {statuses.length === 0 ? (
        <p className="empty">Nessun budget impostato. Aggiungine uno qui sotto per tenere sotto controllo le spese.</p>
      ) : (
        statuses.map((s) => (
          <div className="card" key={s.budget.id}>
            <BudgetBar ledger={ledger} s={s} />
            <div className="row" style={{ marginTop: 8 }}>
              <button
                className="btn"
                onClick={() => {
                  setTarget(s.budget.categoryId ?? '__total');
                  setAmount(centsToInput(s.budget.amountCents));
                }}
              >
                Modifica
              </button>
              <button className="btn danger" onClick={() => ledger.removeBudget(s.budget.categoryId)}>Rimuovi</button>
            </div>
          </div>
        ))
      )}

      <form className="card" onSubmit={save} noValidate>
        <h2>Imposta un budget mensile</h2>
        <label>
          Categoria
          <select value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="" disabled>Scegli…</option>
            {candidates.map((id) => (
              <option key={id ?? '__total'} value={id ?? '__total'}>
                {budgetName(ledger, id)}
                {taken.has(id) ? ' (già impostato)' : ''}
              </option>
            ))}
          </select>
        </label>
        <label>
          Limite mensile ({ledger.settings.currency})
          <input inputMode="decimal" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn primary" type="submit" disabled={target === ''}>Salva budget</button>
      </form>
    </>
  );
}
