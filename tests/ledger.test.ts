import { describe, expect, it } from 'vitest';
import { Ledger } from '../src/core/ledger';
import { ValidationError } from '../src/core/types';
import { MemoryStorage } from '../src/storage/memory';
import { fakeClock, newLedger } from './helpers';

const expense = (over: Partial<Parameters<Ledger['addTransaction']>[0]> = {}) => ({
  type: 'expense' as const,
  amountCents: 1250,
  categoryId: 'cat-alimentari',
  date: '2026-11-03',
  ...over,
});

describe('Ledger: movimenti', () => {
  it('parte con le categorie predefinite richieste', async () => {
    const { ledger } = await newLedger();
    const names = ledger.categories().map((c) => c.name);
    for (const n of ['Alimentari', 'Trasporti', 'Casa', 'Salute', 'Svago', 'Utenze']) expect(names).toContain(n);
    expect(ledger.transactions()).toEqual([]);
  });

  it('registra, modifica e cancella un movimento', async () => {
    const clock = fakeClock();
    const { ledger } = await newLedger(clock.now);
    const t = ledger.addTransaction(expense({ note: '  spesa settimanale ' }));
    expect(t.note).toBe('spesa settimanale');
    expect(ledger.transactions()).toHaveLength(1);

    clock.advance();
    const u = ledger.updateTransaction(t.id, { amountCents: 2000, categoryId: 'cat-casa' });
    expect(u.amountCents).toBe(2000);
    expect(u.updatedAt > t.updatedAt).toBe(true);
    expect(ledger.transactions()[0]!.categoryId).toBe('cat-casa');

    ledger.deleteTransaction(t.id);
    expect(ledger.transactions()).toHaveLength(0);
    expect(ledger.getSnapshot().transactions[t.id]!.deleted).toBe(true); // tombstone conservato

    ledger.restoreTransaction(t.id);
    expect(ledger.transactions()).toHaveLength(1);
  });

  it('ordina dal più recente e, a parità di data, per inserimento', async () => {
    const clock = fakeClock();
    const { ledger } = await newLedger(clock.now);
    const a = ledger.addTransaction(expense({ date: '2026-11-01' }));
    clock.advance();
    const b = ledger.addTransaction(expense({ date: '2026-11-05' }));
    clock.advance();
    const c = ledger.addTransaction(expense({ date: '2026-11-05' }));
    expect(ledger.transactions().map((t) => t.id)).toEqual([c.id, b.id, a.id]);
  });

  it.each([
    ['importo zero', { amountCents: 0 }],
    ['importo con decimali', { amountCents: 10.5 }],
    ['importo negativo', { amountCents: -1 }],
    ['data inesistente', { date: '2026-02-30' }],
    ['categoria inesistente', { categoryId: 'cat-xyz' }],
    ['categoria prototype', { categoryId: 'constructor' }],
    ['categoria di entrata su una uscita', { categoryId: 'cat-stipendio' }],
    ['nota troppo lunga', { note: 'x'.repeat(201) }],
  ])('rifiuta: %s', async (_label, over) => {
    const { ledger } = await newLedger();
    expect(() => ledger.addTransaction(expense(over))).toThrow(ValidationError);
    expect(ledger.transactions()).toHaveLength(0);
  });

  it('non modifica un movimento inesistente o già cancellato', async () => {
    const { ledger } = await newLedger();
    expect(() => ledger.updateTransaction('nope', { amountCents: 1 })).toThrow(ValidationError);
    const t = ledger.addTransaction(expense());
    ledger.deleteTransaction(t.id);
    expect(() => ledger.updateTransaction(t.id, { amountCents: 5 })).toThrow(ValidationError);
  });

  it('persiste lo stato e lo ricarica alla riapertura', async () => {
    const { ledger, storage } = await newLedger();
    ledger.addTransaction(expense());
    await ledger.flush();
    const reopened = await Ledger.open(storage);
    expect(reopened.transactions()).toHaveLength(1);
    expect(reopened.deviceId).toBe(ledger.deviceId);
  });

  it('notifica gli ascoltatori e incrementa la revisione', async () => {
    const { ledger } = await newLedger();
    let calls = 0;
    const off = ledger.subscribe(() => (calls += 1));
    const r0 = ledger.revision;
    ledger.addTransaction(expense());
    expect(calls).toBe(1);
    expect(ledger.revision).toBe(r0 + 1);
    off();
    ledger.addTransaction(expense());
    expect(calls).toBe(1);
  });

  it('rifiuta dati salvati da una versione futura dello schema', async () => {
    const { ledger } = await newLedger();
    const state = structuredClone(ledger.getState()) as any;
    state.snapshot.schema = 99;
    await expect(Ledger.open(new MemoryStorage(state))).rejects.toThrow(/più recente/);
  });
});

describe('Ledger: categorie', () => {
  it('crea categorie personalizzate e impedisce i duplicati', async () => {
    const { ledger } = await newLedger();
    const c = ledger.addCategory({ name: 'Animali', kind: 'expense', icon: '🐶' });
    expect(c.builtin).toBe(false);
    expect(() => ledger.addCategory({ name: ' animali ', kind: 'expense' })).toThrow(/già una categoria/);
    expect(() => ledger.addCategory({ name: '', kind: 'expense' })).toThrow(ValidationError);
    expect(() => ledger.addCategory({ name: 'X', kind: 'expense', color: 'red' })).toThrow(ValidationError);
    ledger.addTransaction(expense({ categoryId: c.id }));
    expect(ledger.transactions()).toHaveLength(1);
  });

  it('archivia senza perdere i vecchi movimenti e rimuove il budget', async () => {
    const { ledger } = await newLedger();
    const c = ledger.addCategory({ name: 'Palestra', kind: 'expense' });
    const t = ledger.addTransaction(expense({ categoryId: c.id }));
    ledger.setBudget(c.id, 3000);
    ledger.setCategoryArchived(c.id, true);

    expect(ledger.budgets()).toHaveLength(0);
    expect(ledger.categories({ includeArchived: false }).some((x) => x.id === c.id)).toBe(false);
    expect(ledger.category(c.id)?.name).toBe('Palestra'); // ancora risolvibile per la cronologia
    expect(() => ledger.addTransaction(expense({ categoryId: c.id }))).toThrow(/archiviata/);
    // il vecchio movimento resta modificabile senza cambiare categoria
    expect(() => ledger.updateTransaction(t.id, { note: 'ok' })).not.toThrow();

    ledger.setCategoryArchived(c.id, false);
    expect(() => ledger.addTransaction(expense({ categoryId: c.id }))).not.toThrow();
  });

  it('rinomina una categoria', async () => {
    const { ledger } = await newLedger();
    const c = ledger.addCategory({ name: 'Animali', kind: 'expense' });
    expect(ledger.updateCategory(c.id, { name: 'Pets' }).name).toBe('Pets');
    expect(() => ledger.updateCategory(c.id, { name: 'Casa' })).toThrow(/già una categoria/);
  });
});

describe('Ledger: budget e impostazioni', () => {
  it('imposta, aggiorna e rimuove i budget (uno per categoria)', async () => {
    const { ledger } = await newLedger();
    ledger.setBudget('cat-alimentari', 30000);
    ledger.setBudget('cat-alimentari', 35000);
    ledger.setBudget(null, 150000);
    expect(ledger.budgets()).toHaveLength(2);
    expect(ledger.budgets().find((b) => b.categoryId === 'cat-alimentari')!.amountCents).toBe(35000);
    ledger.removeBudget('cat-alimentari');
    expect(ledger.budgets().map((b) => b.categoryId)).toEqual([null]);
    expect(() => ledger.setBudget('cat-stipendio', 100)).toThrow(/solo le uscite/);
    expect(() => ledger.setBudget('cat-casa', 0)).toThrow(ValidationError);
  });

  it('valida valuta e lingua', async () => {
    const { ledger } = await newLedger();
    expect(ledger.updateSettings({ currency: 'USD', locale: 'en-US' }).currency).toBe('USD');
    expect(() => ledger.updateSettings({ currency: 'euro' })).toThrow(ValidationError);
  });
});
