import { monthsBetween } from './dates';
import type { Budget, Transaction, TxType } from './types';

/** Funzioni pure sulle liste di movimenti ATTIVI (già senza tombstone). */

export interface Totals {
  incomeCents: number;
  expenseCents: number;
  netCents: number;
}

export interface CategoryTotal {
  categoryId: string;
  totalCents: number;
  count: number;
  /** Quota sul totale del tipo richiesto, 0..1 */
  share: number;
}

export interface MonthPoint extends Totals {
  month: string;
}

const inRange = (t: Transaction, from: string, to: string): boolean => t.date >= from && t.date <= to;

export function totals(txs: readonly Transaction[], from: string, to: string): Totals {
  let income = 0;
  let expense = 0;
  for (const t of txs) {
    if (!inRange(t, from, to)) continue;
    if (t.type === 'income') income += t.amountCents;
    else expense += t.amountCents;
  }
  return { incomeCents: income, expenseCents: expense, netCents: income - expense };
}

export function sumByCategory(
  txs: readonly Transaction[],
  type: TxType,
  from: string,
  to: string,
): CategoryTotal[] {
  const acc = new Map<string, { total: number; count: number }>();
  let grand = 0;
  for (const t of txs) {
    if (t.type !== type || !inRange(t, from, to)) continue;
    const e = acc.get(t.categoryId) ?? { total: 0, count: 0 };
    e.total += t.amountCents;
    e.count += 1;
    acc.set(t.categoryId, e);
    grand += t.amountCents;
  }
  return [...acc.entries()]
    .map(([categoryId, e]) => ({
      categoryId,
      totalCents: e.total,
      count: e.count,
      share: grand === 0 ? 0 : e.total / grand,
    }))
    .sort((a, b) => b.totalCents - a.totalCents || a.categoryId.localeCompare(b.categoryId));
}

/** Serie mensile entrate/uscite; i mesi senza movimenti compaiono a zero. */
export function monthlySeries(txs: readonly Transaction[], fromMonth: string, toMonth: string): MonthPoint[] {
  const map = new Map<string, MonthPoint>(
    monthsBetween(fromMonth, toMonth).map((m) => [m, { month: m, incomeCents: 0, expenseCents: 0, netCents: 0 }]),
  );
  for (const t of txs) {
    const p = map.get(t.date.slice(0, 7));
    if (!p) continue;
    if (t.type === 'income') p.incomeCents += t.amountCents;
    else p.expenseCents += t.amountCents;
    p.netCents = p.incomeCents - p.expenseCents;
  }
  return [...map.values()];
}

export type BudgetState = 'ok' | 'warning' | 'over';

export interface BudgetStatus {
  budget: Budget;
  spentCents: number;
  /** Può essere negativo se il budget è superato. */
  remainingCents: number;
  /** spesa / budget (può superare 1) */
  ratio: number;
  state: BudgetState;
}

/**
 * Stato dei budget mensili. Il budget con categoryId null confronta tutte le uscite del mese.
 * `warning` da `warnAt` (default 80%) fino al 100% compreso; `over` oltre il 100%.
 */
export function budgetStatuses(
  budgets: readonly Budget[],
  txs: readonly Transaction[],
  month: string,
  warnAt = 0.8,
): BudgetStatus[] {
  const spent = new Map<string | null, number>();
  let all = 0;
  for (const t of txs) {
    if (t.type !== 'expense' || t.date.slice(0, 7) !== month) continue;
    spent.set(t.categoryId, (spent.get(t.categoryId) ?? 0) + t.amountCents);
    all += t.amountCents;
  }
  return budgets.map((budget) => {
    const spentCents = budget.categoryId === null ? all : (spent.get(budget.categoryId) ?? 0);
    const ratio = spentCents / budget.amountCents;
    const state: BudgetState = ratio > 1 ? 'over' : ratio >= warnAt ? 'warning' : 'ok';
    return { budget, spentCents, remainingCents: budget.amountCents - spentCents, ratio, state };
  });
}
