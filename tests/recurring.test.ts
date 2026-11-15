import { describe, expect, it } from 'vitest';
import { MAX_OCCURRENCES, generatedHlc, nextOccurrence, occurrenceDates } from '../src/core/recurring';
import { parseSnapshot } from '../src/core/snapshot';
import { mergeSnapshots } from '../src/core/merge';
import { Ledger } from '../src/core/ledger';
import { MemoryStorage } from '../src/storage/memory';
import { SEED_HLC, formatHlc, parseHlc } from '../src/core/hlc';
import { fakeClock, newLedger } from './helpers';

const rule = (frequency: 'weekly' | 'monthly' | 'yearly', startDate: string, endDate: string | null = null) => ({ frequency, startDate, endDate });

describe('date delle occorrenze', () => {
  it('mensile: il giorno 31 si adatta ai mesi corti senza "scivolare"', () => {
    expect(occurrenceDates(rule('monthly', '2026-01-31'), '2026-05-31')).toEqual([
      '2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31',
    ]);
  });
  it('mensile: attraversa il cambio d’anno', () => {
    expect(occurrenceDates(rule('monthly', '2026-11-15'), '2027-02-15')).toEqual(['2026-11-15', '2026-12-15', '2027-01-15', '2027-02-15']);
  });
  it('settimanale e annuale (29 febbraio)', () => {
    expect(occurrenceDates(rule('weekly', '2026-11-01'), '2026-11-30')).toEqual(['2026-11-01', '2026-11-08', '2026-11-15', '2026-11-22', '2026-11-29']);
    expect(occurrenceDates(rule('yearly', '2024-02-29'), '2027-12-31')).toEqual(['2024-02-29', '2025-02-28', '2026-02-28', '2027-02-28']);
  });
  it('rispetta la data di fine e non genera nel futuro', () => {
    expect(occurrenceDates(rule('monthly', '2026-01-10', '2026-03-10'), '2026-12-31')).toHaveLength(3);
    expect(occurrenceDates(rule('monthly', '2027-01-10'), '2026-12-31')).toEqual([]);
  });
  it('ha un tetto di sicurezza', () => {
    expect(occurrenceDates(rule('weekly', '2000-01-01'), '2999-12-31')).toHaveLength(MAX_OCCURRENCES);
  });
  it('prossima scadenza', () => {
    const r = { ...rule('monthly', '2026-01-31', null), id: 'x', type: 'expense', amountCents: 1, categoryId: 'c', note: '', updatedAt: SEED_HLC } as const;
    expect(nextOccurrence(r, '2026-11-15')).toBe('2026-11-30');
    expect(nextOccurrence({ ...r, endDate: '2026-11-01' }, '2026-11-15')).toBeNull();
  });
});

describe('generazione dei movimenti ricorrenti', () => {
  it('crea le occorrenze scadute, una sola volta (idempotente)', async () => {
    const { ledger } = await newLedger();
    ledger.addRecurring({ type: 'expense', amountCents: 65000, categoryId: 'cat-casa', note: 'Affitto', frequency: 'monthly', startDate: '2026-09-03' });
    expect(ledger.generateRecurring('2026-11-14')).toBe(3);
    expect(ledger.generateRecurring('2026-11-14')).toBe(0);
    expect(ledger.transactions().map((t) => t.date)).toEqual(['2026-11-03', '2026-10-03', '2026-09-03']);
    expect(ledger.generateRecurring('2026-12-03')).toBe(1);
    expect(ledger.transactions()[0]!.recurringId).toMatch(/^rule-/);
  });

  it('un’occorrenza eliminata dall’utente non torna', async () => {
    const { ledger } = await newLedger();
    ledger.addRecurring({ type: 'expense', amountCents: 1000, categoryId: 'cat-svago', frequency: 'weekly', startDate: '2026-11-01' });
    ledger.generateRecurring('2026-11-08');
    ledger.deleteTransaction(ledger.transactions()[0]!.id);
    expect(ledger.generateRecurring('2026-11-08')).toBe(0);
    expect(ledger.transactions()).toHaveLength(1);
  });

  it('eliminare la regola ferma il futuro ma lascia lo storico; la modifica dell’importo vale per il futuro', async () => {
    const { ledger } = await newLedger();
    const r = ledger.addRecurring({ type: 'income', amountCents: 200000, categoryId: 'cat-stipendio', frequency: 'monthly', startDate: '2026-10-01' });
    ledger.generateRecurring('2026-10-15');
    ledger.updateRecurring(r.id, { amountCents: 210000 });
    ledger.generateRecurring('2026-11-15');
    expect(ledger.transactions().map((t) => t.amountCents)).toEqual([210000, 200000]);
    ledger.deleteRecurring(r.id);
    expect(ledger.recurring()).toHaveLength(0);
    expect(ledger.generateRecurring('2027-05-01')).toBe(0);
    expect(ledger.transactions()).toHaveLength(2);
  });

  it('valida i dati e non permette di cambiare frequenza o inizio', async () => {
    const { ledger } = await newLedger();
    const base = { type: 'expense' as const, amountCents: 100, categoryId: 'cat-casa', frequency: 'monthly' as const, startDate: '2026-01-01' };
    expect(() => ledger.addRecurring({ ...base, amountCents: 0 })).toThrow();
    expect(() => ledger.addRecurring({ ...base, startDate: '1999-01-01' })).toThrow();
    expect(() => ledger.addRecurring({ ...base, endDate: '2025-01-01' })).toThrow();
    expect(() => ledger.addRecurring({ ...base, categoryId: 'cat-stipendio' })).toThrow();
    const r = ledger.addRecurring(base);
    ledger.updateRecurring(r.id, { frequency: 'weekly', startDate: '2020-01-01' } as never);
    expect(ledger.recurring()[0]).toMatchObject({ frequency: 'monthly', startDate: '2026-01-01' });
  });

  it('due dispositivi che generano le stesse occorrenze non creano doppioni né conflitti', async () => {
    const a = (await newLedger()).ledger;
    const b = (await newLedger()).ledger;
    const r = a.addRecurring({ type: 'expense', amountCents: 999, categoryId: 'cat-utenze', frequency: 'monthly', startDate: '2026-09-05' });
    b.applyRemote(a.getSnapshot());
    expect(b.recurring()).toHaveLength(1);
    a.generateRecurring('2026-11-14');
    b.generateRecurring('2026-11-14');
    const toA = a.applyRemote(b.getSnapshot());
    b.applyRemote(a.getSnapshot());
    expect(toA.conflicts).toHaveLength(0);
    expect(a.transactions()).toHaveLength(3);
    expect(b.transactions().map((t) => t.id)).toEqual(a.transactions().map((t) => t.id));
    expect(a.transactions()[0]!.id).toBe(`${r.id}-2026-11-05`);
  });

  it('la modifica dell’utente su un dispositivo vince sulla copia generata dall’altro', async () => {
    const clock = fakeClock();
    const a = (await newLedger(clock.now)).ledger;
    const b = (await newLedger(clock.now)).ledger;
    a.addRecurring({ type: 'expense', amountCents: 5000, categoryId: 'cat-casa', frequency: 'monthly', startDate: '2026-11-01' });
    b.applyRemote(a.getSnapshot());
    a.generateRecurring('2026-11-14');
    a.updateTransaction(a.transactions()[0]!.id, { amountCents: 6000 });
    clock.advance(60_000);
    b.generateRecurring('2026-11-14'); // generata DOPO, ma con timestamp "vecchio"
    a.applyRemote(b.getSnapshot());
    b.applyRemote(a.getSnapshot());
    expect(a.transactions()[0]!.amountCents).toBe(6000);
    expect(b.transactions()[0]!.amountCents).toBe(6000);
  });

  it('il timestamp generato è valido e precede qualsiasi modifica reale', () => {
    const g = generatedHlc('2026-11-01');
    expect(parseHlc(g)).not.toBeNull();
    // anche una modifica fatta a mezzanotte UTC del giorno stesso (o poco prima, per i fusi) la supera
    expect(g < formatHlc(Date.UTC(2026, 10, 1) - 24 * 3600 * 1000, 0, 'aaaaaaaa')).toBe(true);
  });

  it('le regole si uniscono tra dispositivi e sopravvivono a backup e validazione', async () => {
    const { ledger } = await newLedger();
    ledger.addRecurring({ type: 'expense', amountCents: 100, categoryId: 'cat-casa', frequency: 'yearly', startDate: '2026-02-28', endDate: '2030-01-01', note: 'x' });
    ledger.generateRecurring('2026-11-14');
    const snap = parseSnapshot(JSON.parse(JSON.stringify(ledger.getSnapshot())));
    expect(Object.values(snap.recurring)).toHaveLength(1);
    const merged = mergeSnapshots((await newLedger()).ledger.getSnapshot(), snap, SEED_HLC);
    expect(Object.keys(merged.snapshot.recurring)).toHaveLength(1);
  });
});

describe('migrazione dallo schema 1 (app 0.1.x)', () => {
  it('apre i dati salvati con schema 1 aggiungendo la tabella ricorrenze, senza perdere nulla', async () => {
    const storage = new MemoryStorage();
    const old = await Ledger.open(storage);
    old.addTransaction({ type: 'expense', amountCents: 1234, categoryId: 'cat-casa', date: '2026-11-01' });
    await old.flush();
    const state = structuredClone((await storage.load())!) as unknown as { snapshot: { schema: number; recurring?: unknown } };
    state.snapshot.schema = 1;
    delete state.snapshot.recurring;
    await storage.save(state as never);
    const ledger = await Ledger.open(storage);
    expect(ledger.getSnapshot().schema).toBe(2);
    expect(ledger.transactions()).toHaveLength(1);
    expect(ledger.recurring()).toEqual([]);
    expect((await storage.load())!.snapshot.schema).toBe(2);
  });

  it('accetta backup/snapshot schema 1 e rifiuta schemi futuri', async () => {
    const { ledger } = await newLedger();
    const raw = JSON.parse(JSON.stringify(ledger.getSnapshot()));
    raw.schema = 1;
    delete raw.recurring;
    expect(parseSnapshot(raw).recurring).toEqual({});
    raw.schema = 2;
    expect(() => parseSnapshot(raw)).toThrow(); // schema 2 senza tabella: non valido
  });
});
