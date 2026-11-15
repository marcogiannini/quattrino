import { describe, expect, it } from 'vitest';
import { budgetStatuses, monthlySeries, sumByCategory, totals } from '../src/core/stats';
import type { Budget, Transaction } from '../src/core/types';

let n = 0;
const tx = (type: 'income' | 'expense', amountCents: number, categoryId: string, date: string): Transaction => ({
  id: `t${n++}`,
  type,
  amountCents,
  categoryId,
  date,
  note: '',
  createdAt: 'x',
  updatedAt: 'x',
});

const data: Transaction[] = [
  tx('income', 200000, 'cat-stipendio', '2026-10-27'),
  tx('expense', 8000, 'cat-alimentari', '2026-10-30'),
  tx('income', 210000, 'cat-stipendio', '2026-11-01'),
  tx('expense', 12000, 'cat-alimentari', '2026-11-02'),
  tx('expense', 6000, 'cat-alimentari', '2026-11-20'),
  tx('expense', 50000, 'cat-casa', '2026-11-05'),
  tx('expense', 4000, 'cat-svago', '2026-11-30'),
];

describe('statistiche', () => {
  it('somma entrate e uscite nel periodo (estremi inclusi)', () => {
    expect(totals(data, '2026-11-01', '2026-11-30')).toEqual({
      incomeCents: 210000,
      expenseCents: 72000,
      netCents: 138000,
    });
  });

  it('raggruppa per categoria con quote e ordine decrescente', () => {
    const r = sumByCategory(data, 'expense', '2026-11-01', '2026-11-31');
    expect(r.map((c) => [c.categoryId, c.totalCents, c.count])).toEqual([
      ['cat-casa', 50000, 1],
      ['cat-alimentari', 18000, 2],
      ['cat-svago', 4000, 1],
    ]);
    expect(r.reduce((s, c) => s + c.share, 0)).toBeCloseTo(1, 10);
    expect(r[0]!.share).toBeCloseTo(50000 / 72000, 10);
  });

  it('restituisce un elenco vuoto senza dati', () => {
    expect(sumByCategory([], 'expense', '2026-01-01', '2026-12-31')).toEqual([]);
  });

  it('costruisce la serie mensile con i mesi vuoti a zero', () => {
    const s = monthlySeries(data, '2026-09', '2026-11');
    expect(s.map((p) => p.month)).toEqual(['2026-09', '2026-10', '2026-11']);
    expect(s[0]).toMatchObject({ incomeCents: 0, expenseCents: 0, netCents: 0 });
    expect(s[1]).toMatchObject({ incomeCents: 200000, expenseCents: 8000, netCents: 192000 });
    expect(s[2]).toMatchObject({ incomeCents: 210000, expenseCents: 72000, netCents: 138000 });
  });
});

describe('budget', () => {
  const b = (categoryId: string | null, amountCents: number): Budget => ({
    id: `b-${categoryId}`,
    categoryId,
    amountCents,
    updatedAt: 'x',
  });

  it('classifica ok / attenzione / superato', () => {
    const st = budgetStatuses(
      [b('cat-alimentari', 40000), b('cat-casa', 55000), b('cat-svago', 3000), b('cat-salute', 10000)],
      data,
      '2026-11',
    );
    const by = Object.fromEntries(st.map((s) => [s.budget.categoryId, s]));
    expect(by['cat-alimentari']).toMatchObject({ spentCents: 18000, state: 'ok', remainingCents: 22000 });
    expect(by['cat-casa']).toMatchObject({ spentCents: 50000, state: 'warning' }); // 90,9%
    expect(by['cat-svago']).toMatchObject({ spentCents: 4000, state: 'over', remainingCents: -1000 });
    expect(by['cat-salute']).toMatchObject({ spentCents: 0, state: 'ok' });
  });

  it('al 100% esatto non è ancora "superato"', () => {
    const [s] = budgetStatuses([b('cat-svago', 4000)], data, '2026-11');
    expect(s!.state).toBe('warning');
  });

  it('il budget complessivo conta tutte le uscite del mese e ignora le entrate', () => {
    const [s] = budgetStatuses([b(null, 100000)], data, '2026-11');
    expect(s).toMatchObject({ spentCents: 72000, state: 'ok' });
    expect(budgetStatuses([b(null, 100000)], data, '2026-10')[0]!.spentCents).toBe(8000);
  });
});
