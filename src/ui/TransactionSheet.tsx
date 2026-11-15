import { useMemo, useState, type FormEvent } from 'react';
import { todayISO } from '../core/dates';
import type { Ledger } from '../core/ledger';
import { centsToInput, parseAmountToCents } from '../core/money';
import { ValidationError, type Transaction, type TxType } from '../core/types';
import { Sheet } from './common';

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
    if (cents === null) return setError('Inserisci un importo valido maggiore di zero, ad esempio 12,50.');
    try {
      const data = { type, amountCents: cents, categoryId: effectiveCategory, date, note };
      if (tx) ledger.updateTransaction(tx.id, data);
      else ledger.addTransaction(data);
      onClose();
    } catch (err) {
      setError(err instanceof ValidationError ? err.message : 'Errore imprevisto nel salvataggio.');
    }
  };

  return (
    <Sheet title={tx ? 'Modifica movimento' : 'Nuovo movimento'} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <div className="seg" role="group" aria-label="Tipo di movimento">
          <button type="button" aria-pressed={type === 'expense'} onClick={() => setType('expense')}>Uscita</button>
          <button type="button" aria-pressed={type === 'income'} onClick={() => setType('income')}>Entrata</button>
        </div>
        <label>
          Importo ({ledger.settings.currency})
          <input inputMode="decimal" autoFocus placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label>
          Categoria
          <select value={effectiveCategory} onChange={(e) => setCategoryId(e.target.value)}>
            {options.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon} {c.name}
                {c.archived ? ' (archiviata)' : ''}
              </option>
            ))}
          </select>
        </label>
        <label>
          Data
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          Nota (facoltativa)
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
              Elimina
            </button>
          ) : (
            <span />
          )}
          <div className="row">
            <button type="button" className="btn" onClick={onClose}>Annulla</button>
            <button type="submit" className="btn primary">Salva</button>
          </div>
        </div>
      </form>
    </Sheet>
  );
}
