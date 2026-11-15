import { useEffect, type ReactNode } from 'react';
import { addMonths, monthLabel } from '../core/dates';
import type { Ledger } from '../core/ledger';
import { formatCents } from '../core/money';
import type { Category } from '../core/types';

export const money = (ledger: Ledger, cents: number): string =>
  formatCents(cents, ledger.settings.currency, ledger.settings.locale);

export function MonthNav({ month, onChange, locale }: { month: string; onChange: (m: string) => void; locale: string }) {
  return (
    <div className="monthnav">
      <button className="iconbtn" aria-label="Mese precedente" onClick={() => onChange(addMonths(month, -1))}>‹</button>
      <strong>{monthLabel(month, locale)}</strong>
      <button className="iconbtn" aria-label="Mese successivo" onClick={() => onChange(addMonths(month, 1))}>›</button>
    </div>
  );
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function CategoryDot({ category }: { category: Category | undefined }) {
  return (
    <span className="dot" aria-hidden="true" style={{ background: `${category?.color ?? '#868e96'}33` }}>
      {category?.icon ?? '❔'}
    </span>
  );
}

export const errorText = (e: unknown): string => (e instanceof Error ? e.message : 'Errore imprevisto.');
