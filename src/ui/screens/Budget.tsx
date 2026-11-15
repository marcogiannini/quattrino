import { useState, type FormEvent } from 'react';
import type { Ledger } from '../../core/ledger';
import { centsToInput, parseAmountToCents } from '../../core/money';
import { budgetStatuses, type BudgetStatus } from '../../core/stats';
import type { TFn } from '../../i18n';
import { MonthNav, categoryName, errorText, money, useT } from '../common';

const COLOR = { ok: 'var(--ok)', warning: 'var(--warn)', over: 'var(--over)' } as const;

export function budgetName(ledger: Ledger, categoryId: string | null, t: TFn): string {
  if (categoryId === null) return `🧾 ${t('bu.total')}`;
  const c = ledger.category(categoryId);
  return `${c?.icon ?? '❔'} ${categoryName(t, c)}`;
}

/** Barra di avanzamento; lo stato è espresso anche a parole, non solo con il colore. */
export function BudgetBar({ ledger, s }: { ledger: Ledger; s: BudgetStatus }) {
  const t = useT(ledger);
  return (
    <div>
      <div className="row between wrap">
        <span>{budgetName(ledger, s.budget.categoryId, t)}</span>
        <span className={`badge ${s.state}`}>{t(`bu.${s.state}`)}</span>
      </div>
      <div className="track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.round(s.ratio * 100))} aria-label={t('bu.usedAria', { pct: Math.round(s.ratio * 100) })}>
        <div className="fill" style={{ width: `${Math.min(100, s.ratio * 100)}%`, background: COLOR[s.state] }} />
      </div>
      <div className="row between small muted num">
        <span>{t('bu.spentOf', { spent: money(ledger, s.spentCents), limit: money(ledger, s.budget.amountCents) })}</span>
        <span>{s.remainingCents >= 0 ? t('bu.left', { amount: money(ledger, s.remainingCents) }) : t('bu.exceeded', { amount: money(ledger, -s.remainingCents) })}</span>
      </div>
    </div>
  );
}

export function BudgetScreen({ ledger, month, onMonth }: { ledger: Ledger; month: string; onMonth: (m: string) => void }) {
  const t = useT(ledger);
  const statuses = budgetStatuses(ledger.budgets(), ledger.transactions(), month).sort((a, b) => b.ratio - a.ratio);
  const taken = new Set(ledger.budgets().map((b) => b.categoryId));
  const candidates: (string | null)[] = [null, ...ledger.categories({ includeArchived: false }).filter((c) => c.kind !== 'income').map((c) => c.id)];
  const [target, setTarget] = useState<string>('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');

  const save = (e: FormEvent) => {
    e.preventDefault();
    const cents = parseAmountToCents(amount);
    if (cents === null) return setError(t('bu.amountInvalid'));
    try {
      ledger.setBudget(target === '' ? null : target === '__total' ? null : target, cents);
      setAmount('');
      setError('');
    } catch (err) {
      setError(errorText(err, ledger));
    }
  };

  return (
    <>
      <h1>{t('bu.title')}</h1>
      <MonthNav month={month} onChange={onMonth} locale={ledger.settings.locale} />
      <p className="muted small">{t('bu.note')}</p>

      {statuses.length === 0 ? (
        <p className="empty">{t('bu.empty')}</p>
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
                {t('common.edit')}
              </button>
              <button className="btn danger" onClick={() => ledger.removeBudget(s.budget.categoryId)}>{t('common.remove')}</button>
            </div>
          </div>
        ))
      )}

      <form className="card" onSubmit={save} noValidate>
        <h2>{t('bu.setTitle')}</h2>
        <label>
          {t('tx.category')}
          <select value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="" disabled>{t('bu.choose')}</option>
            {candidates.map((id) => (
              <option key={id ?? '__total'} value={id ?? '__total'}>
                {budgetName(ledger, id, t)}
                {taken.has(id) ? t('bu.taken') : ''}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('bu.limit', { currency: ledger.settings.currency })}
          <input inputMode="decimal" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn primary" type="submit" disabled={target === ''}>{t('bu.saveBtn')}</button>
      </form>
    </>
  );
}
