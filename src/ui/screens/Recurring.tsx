import { useMemo, useState, type FormEvent } from 'react';
import { dateLabel, todayISO } from '../../core/dates';
import type { Ledger } from '../../core/ledger';
import { centsToInput, parseAmountToCents } from '../../core/money';
import { nextOccurrence, occurrenceDates } from '../../core/recurring';
import type { Frequency, RecurringRule, TxType } from '../../core/types';
import { CategoryDot, Sheet, categoryName, errorText, money, useT } from '../common';
import { confirmAction } from '../desktop';

const FREQS: Frequency[] = ['weekly', 'monthly', 'yearly'];

function RecurringSheet({ ledger, rule, onClose }: { ledger: Ledger; rule?: RecurringRule; onClose: () => void }) {
  const t = useT(ledger);
  const [type, setType] = useState<TxType>(rule?.type ?? 'expense');
  const [amount, setAmount] = useState(rule ? centsToInput(rule.amountCents) : '');
  const [note, setNote] = useState(rule?.note ?? '');
  const [frequency, setFrequency] = useState<Frequency>(rule?.frequency ?? 'monthly');
  const [start, setStart] = useState(rule?.startDate ?? todayISO());
  const [end, setEnd] = useState(rule?.endDate ?? '');
  const [error, setError] = useState('');

  const options = useMemo(() => {
    const list = ledger.categories({ includeArchived: false }).filter((c) => c.kind === 'both' || c.kind === type);
    const cur = rule && rule.type === type ? ledger.category(rule.categoryId) : undefined;
    return cur && !list.some((c) => c.id === cur.id) ? [cur, ...list] : list;
  }, [ledger, type, rule]);
  const [categoryId, setCategoryId] = useState(rule?.categoryId ?? options[0]?.id ?? '');
  const effective = options.some((c) => c.id === categoryId) ? categoryId : (options[0]?.id ?? '');

  const today = todayISO();
  const pastCount = useMemo(
    () => (rule || start >= today ? 0 : occurrenceDates({ frequency, startDate: start, endDate: end || null }, today).length),
    [rule, start, end, frequency, today],
  );

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const cents = parseAmountToCents(amount);
    if (cents === null) return setError(t('sheet.amountInvalid'));
    try {
      if (rule) ledger.updateRecurring(rule.id, { amountCents: cents, categoryId: effective, note, endDate: end || null });
      else ledger.addRecurring({ type, amountCents: cents, categoryId: effective, note, frequency, startDate: start, endDate: end || null });
      onClose();
    } catch (err) {
      setError(errorText(err, ledger));
    }
  };

  return (
    <Sheet title={rule ? t('rc.edit') : t('rc.new')} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <div className="seg" role="group" aria-label={t('sheet.kind')}>
          <button type="button" disabled={!!rule} aria-pressed={type === 'expense'} onClick={() => setType('expense')}>{t('common.expenseSingle')}</button>
          <button type="button" disabled={!!rule} aria-pressed={type === 'income'} onClick={() => setType('income')}>{t('common.incomeSingle')}</button>
        </div>
        <label>
          {t('sheet.amount', { currency: ledger.settings.currency })}
          <input inputMode="decimal" autoFocus placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label>
          {t('sheet.category')}
          <select value={effective} onChange={(e) => setCategoryId(e.target.value)}>
            {options.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon} {categoryName(t, c)}
                {c.archived ? t('sheet.archived') : ''}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('rc.freq')}
          <select value={frequency} disabled={!!rule} onChange={(e) => setFrequency(e.target.value as Frequency)}>
            {FREQS.map((f) => <option key={f} value={f}>{t(`rc.f.${f}`)}</option>)}
          </select>
        </label>
        <label>
          {t('rc.start')}
          <input type="date" value={start} disabled={!!rule} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label>
          {t('rc.end')}
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
        <label>
          {t('sheet.note')}
          <input maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        {rule && <p className="muted small">{t('rc.fixed')}</p>}
        {pastCount > 0 && <p className="muted small">{pastCount === 1 ? t('rc.preview.past1') : t('rc.preview.past', { n: pastCount })}</p>}
        {error && <p className="error" role="alert">{error}</p>}
        <div className="row between">
          {rule ? (
            <button
              type="button"
              className="btn danger"
              onClick={async () => {
                if (!(await confirmAction(t('rc.deleteConfirm')))) return;
                ledger.deleteRecurring(rule.id);
                onClose();
              }}
            >
              {t('common.delete')}
            </button>
          ) : (
            <span />
          )}
          <div className="row">
            <button type="button" className="btn" onClick={onClose}>{t('common.cancel')}</button>
            <button type="submit" className="btn primary">{t('common.save')}</button>
          </div>
        </div>
      </form>
    </Sheet>
  );
}

export function RecurringPanel({ ledger }: { ledger: Ledger }) {
  const t = useT(ledger);
  const [sheet, setSheet] = useState<{ rule?: RecurringRule } | null>(null);
  const today = todayISO();
  const rules = ledger.recurring();
  const lc = ledger.settings.locale;

  return (
    <div className="card">
      <h2>{t('rc.title')}</h2>
      <p className="muted small">{t('rc.help')}</p>
      {rules.length === 0 ? (
        <p className="muted small">{t('rc.empty')}</p>
      ) : (
        <ul className="list">
          {rules.map((r) => {
            const next = nextOccurrence(r, today);
            return (
              <li key={r.id}>
                <CategoryDot category={ledger.category(r.categoryId)} />
                <span className="grow">
                  {categoryName(t, ledger.category(r.categoryId))}
                  <span className="muted small">
                    {' '}· {t(`rc.f.${r.frequency}`)} · {next ? t('rc.next', { date: dateLabel(next, lc) }) : t('rc.ended')}
                    {r.endDate && next ? ` · ${t('rc.until', { date: dateLabel(r.endDate, lc) })}` : ''}
                    {r.note ? ` · ${r.note}` : ''}
                  </span>
                </span>
                <span className={`num ${r.type === 'income' ? 'inc' : 'exp'}`}>
                  <strong>{r.type === 'income' ? '+' : '−'}{money(ledger, r.amountCents)}</strong>
                </span>
                <button className="btn" onClick={() => setSheet({ rule: r })}>{t('common.edit')}</button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn primary" onClick={() => setSheet({})}>{t('rc.add')}</button>
      </div>
      <p className="muted small">{t('rc.note')}</p>
      {sheet && <RecurringSheet ledger={ledger} rule={sheet.rule} onClose={() => setSheet(null)} />}
    </div>
  );
}
