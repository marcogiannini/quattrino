import { describe, expect, it } from 'vitest';
import { seedSnapshot } from '../src/core/defaults';
import { SEED_HLC } from '../src/core/hlc';
import { mergeSnapshots, stableStringify } from '../src/core/merge';
import { parseSnapshot, SnapshotError } from '../src/core/snapshot';
import type { Snapshot, Transaction } from '../src/core/types';

const T = (id: string, updatedAt: string, over: Partial<Transaction> = {}): Transaction => ({
  id,
  type: 'expense',
  amountCents: 1000,
  categoryId: 'cat-casa',
  date: '2026-11-01',
  note: '',
  createdAt: '1800000000000-00000-aaaaaaaa', // la creazione non cambia con le modifiche
  updatedAt,
  ...over,
});
const h = (n: number, node = 'aaaaaaaa') => `${String(1_800_000_000_000 + n).padStart(13, '0')}-00000-${node}`;
const snap = (...txs: Transaction[]): Snapshot => ({
  ...seedSnapshot(),
  transactions: Object.fromEntries(txs.map((t) => [t.id, t])),
});
const view = (s: Snapshot) => stableStringify(s);

describe('mergeSnapshots', () => {
  it('unisce record diversi', () => {
    const r = mergeSnapshots(snap(T('a', h(1))), snap(T('b', h(2, 'bbbbbbbb'))), SEED_HLC);
    expect(Object.keys(r.snapshot.transactions).sort()).toEqual(['a', 'b']);
    expect(r.changedLocal).toBe(true);
    expect(r.conflicts).toEqual([]);
  });

  it('vince la modifica più recente', () => {
    const local = snap(T('a', h(1), { amountCents: 100 }));
    const remote = snap(T('a', h(5, 'bbbbbbbb'), { amountCents: 500 }));
    expect(mergeSnapshots(local, remote, h(10)).snapshot.transactions.a!.amountCents).toBe(500);
    expect(mergeSnapshots(remote, local, h(10)).snapshot.transactions.a!.amountCents).toBe(500);
  });

  it('una cancellazione più recente vince sulla modifica precedente (e viceversa)', () => {
    const edited = snap(T('a', h(1), { amountCents: 100 }));
    const deleted = snap(T('a', h(2, 'bbbbbbbb'), { deleted: true }));
    expect(mergeSnapshots(edited, deleted, SEED_HLC).snapshot.transactions.a!.deleted).toBe(true);
    const editedLater = snap(T('a', h(3), { amountCents: 777 }));
    expect(mergeSnapshots(editedLater, deleted, SEED_HLC).snapshot.transactions.a!.deleted).toBeUndefined();
  });

  it('è idempotente: unire due volte lo stesso snapshot non cambia nulla', () => {
    const a = snap(T('a', h(1)));
    const b = snap(T('b', h(2, 'bbbbbbbb')));
    const once = mergeSnapshots(a, b, SEED_HLC);
    const twice = mergeSnapshots(once.snapshot, b, SEED_HLC);
    expect(view(twice.snapshot)).toBe(view(once.snapshot));
    expect(twice.changedLocal).toBe(false);
  });

  it('è commutativo e associativo su dati casuali (convergenza)', () => {
    let seed = 42;
    const rnd = (n: number) => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n);
    const nodes = ['aaaaaaaa', 'bbbbbbbb', 'cccccccc'];
    const randomSnap = (node: string): Snapshot =>
      snap(
        ...Array.from({ length: 12 }, (_, i) =>
          T(`t${rnd(8)}-${i % 4}`, h(rnd(50), node), {
            amountCents: 100 + rnd(900),
            ...(rnd(5) === 0 ? { deleted: true as const } : {}),
          }),
        ),
      );
    for (let round = 0; round < 40; round++) {
      const [a, b, c] = nodes.map(randomSnap) as [Snapshot, Snapshot, Snapshot];
      const m = (x: Snapshot, y: Snapshot) => mergeSnapshots(x, y, SEED_HLC).snapshot;
      expect(view(m(a, b))).toBe(view(m(b, a)));
      expect(view(m(m(a, b), c))).toBe(view(m(a, m(b, c))));
    }
  });

  describe('rilevamento dei conflitti', () => {
    const base = h(10);
    it('segnala quando entrambi modificano lo stesso record dopo l’ultima sync', () => {
      const local = snap(T('a', h(20), { amountCents: 100 }));
      const remote = snap(T('a', h(30, 'bbbbbbbb'), { amountCents: 200 }));
      const r = mergeSnapshots(local, remote, base);
      expect(r.conflicts).toHaveLength(1);
      expect(r.conflicts[0]).toMatchObject({ table: 'transactions', id: 'a', winner: 'remote' });
    });
    it('non segnala una semplice modifica remota (il locale non è cambiato)', () => {
      const local = snap(T('a', h(5), { amountCents: 100 }));
      const remote = snap(T('a', h(30, 'bbbbbbbb'), { amountCents: 200 }));
      expect(mergeSnapshots(local, remote, base).conflicts).toEqual([]);
    });
    it('non segnala se i contenuti coincidono', () => {
      const local = snap(T('a', h(20)));
      const remote = snap(T('a', h(30, 'bbbbbbbb')));
      expect(mergeSnapshots(local, remote, base).conflicts).toEqual([]);
    });
    it('segnala modifica contro cancellazione', () => {
      const local = snap(T('a', h(20), { amountCents: 999 }));
      const remote = snap(T('a', h(30, 'bbbbbbbb'), { deleted: true }));
      expect(mergeSnapshots(local, remote, base).conflicts).toHaveLength(1);
    });
  });

  it('le impostazioni seguono l’ultima modifica', () => {
    const a = seedSnapshot();
    const b = { ...seedSnapshot(), settings: { currency: 'USD', locale: 'en-US', updatedAt: h(5) } };
    expect(mergeSnapshots(a, b, SEED_HLC).snapshot.settings.currency).toBe('USD');
    expect(mergeSnapshots(b, a, SEED_HLC).snapshot.settings.currency).toBe('USD');
  });
});

describe('parseSnapshot (dati non fidati)', () => {
  const ok = () => JSON.parse(JSON.stringify(snap(T('a', h(1)))));

  it('accetta uno snapshot valido e scarta i campi sconosciuti', () => {
    const raw = ok();
    raw.transactions.a.extra = '<script>';
    const s = parseSnapshot(raw);
    expect((s.transactions.a as any).extra).toBeUndefined();
    expect(s.transactions.a!.amountCents).toBe(1000);
  });

  it.each([
    ['importo non intero', (r: any) => (r.transactions.a.amountCents = 1.5)],
    ['data impossibile', (r: any) => (r.transactions.a.date = '2026-02-31')],
    ['id incoerente', (r: any) => (r.transactions.a.id = 'zzz')],
    ['timestamp non valido', (r: any) => (r.transactions.a.updatedAt = 'ieri')],
    ['colore non valido (iniezione CSS)', (r: any) => (r.categories['cat-casa'].color = 'red;background:url(x)')],
    ['valuta non valida', (r: any) => (r.settings.currency = 'euro')],
    ['tabella mancante', (r: any) => delete r.budgets],
  ])('rifiuta: %s', (_label, mutate) => {
    const raw = ok();
    mutate(raw);
    expect(() => parseSnapshot(raw)).toThrow(SnapshotError);
  });

  it('rifiuta la chiave "__proto__" (prototype pollution) anche come chiave propria di JSON.parse', () => {
    const base = ok();
    const evil = JSON.stringify({ ...base.transactions.a, id: '__proto__' });
    const text = JSON.stringify(base).replace('"transactions":{', `"transactions":{"__proto__":${evil},`);
    const parsed = JSON.parse(text);
    expect(Object.keys(parsed.transactions)).toContain('__proto__');
    expect(() => parseSnapshot(parsed)).toThrow(SnapshotError);
  });

  it('distingue una versione di schema più recente', () => {
    const raw = ok();
    raw.schema = 3;
    try {
      parseSnapshot(raw);
      expect.unreachable();
    } catch (e) {
      expect((e as SnapshotError).code).toBe('newer-schema');
    }
  });
});
