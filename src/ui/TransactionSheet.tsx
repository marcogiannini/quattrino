import { useMemo, useState, type FormEvent } from 'react';
import { todayISO } from '../core/dates';
import type { Ledger } from '../core/ledger';
import { centsToInput, parseAmountToCents } from '../core/money';
import type { Transaction, TxType } from '../core/types';
import { Sheet, categoryName, errorText, useT } from './common';

export function TransactionSheet({
  ledger,
  tx,
  onClose,
  onDeleted,
}: {
  ledger: Ledger;
  tx?: Transaction;
  onClose: () => void;
  onDeleted: (id: string) => void;
}) {
  const t = useT(ledger);
  const [type, setType] = useState<TxType>(tx?.type ?? 'expense');
  const [amount, setAmount] = useState(tx ? centsToInput(tx.amountCents) : '');
  const [date, setDate] = useState(tx?.date ?? todayISO());
  const [note, setNote] = useState(tx?.note ?? '');
  const [error, setError] = useState('');

  const options = useMemo(() => {
    const list = ledger.categories({ includeArchived: false }).filter((c) => c.kind === 'both' || c.kind === type);
    const current = tx && tx.type === type ? ledger.category(tx.categoryId) : undefined;
    return current && !list.some((c) => c.id === current.id) ? [current, ...list] : list;
  }, [ledger, type, tx]);
  const [categoryId, setCategoryId] = useState(tx?.categoryId ?? options[0]?.id ?? '');
  const effectiveCategory = options.some((c) => c.id === categoryId) ? categoryId : (options[0]?.id ?? '');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const cents = parseAmountToCents(amount);
    if (cents === null) return setError(t('sheet.amountInvalid'));
    try {
      const data = { type, amountCents: cents, categoryId: effectiveCategory, date, note };
      if (tx) ledger.updateTransaction(tx.id, data);
      else ledger.addTransaction(data);
      onClose();
    } catch (err) {
      setError(errorText(err, ledger));
    }
  };

  return (
    <Sheet title={tx ? t('sheet.edit') : t('sheet.new')} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        {tx?.recurringId && <p className="muted small">↻ {t('sheet.fromRecurring')}</p>}
        <div className="seg" role="group" aria-label={t('sheet.kind')}>
          <button type="button" aria-pressed={type === 'expense'} onClick={() => setType('expense')}>{t('common.expenseSingle')}</button>
          <button type="button" aria-pressed={type === 'income'} onClick={() => setType('income')}>{t('common.incomeSingle')}</button>
        </div>
        <label>
          {t('sheet.amount', { currency: ledger.settings.currency })}
          <input inputMode="decimal" autoFocus placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label>
          {t('sheet.category')}
          <select value={effectiveCategory} onChange={(e) => setCategoryId(e.target.value)}>
            {options.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon} {categoryName(t, c)}
                {c.archived ? t('sheet.archived') : ''}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('sheet.date')}
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          {t('sheet.note')}
          <input maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="row between">
          {tx ? (
            <button
              type="button"
              className="btn danger"
              onClick={() => {
                ledger.deleteTransaction(tx.id);
                onDeleted(tx.id);
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
