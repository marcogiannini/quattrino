import { isValidISODate } from './dates';
import { parseHlc } from './hlc';
import { MAX_CENTS } from './money';
import {
  SCHEMA_VERSION,
  type Budget,
  type Category,
  type CategoryKind,
  type Hlc,
  type Settings,
  type Snapshot,
  type Transaction,
  type TxType,
} from './types';

/**
 * Validazione rigorosa di uno snapshot proveniente dall'esterno (file remoto, backup).
 * Anche dopo la decifratura i dati sono trattati come non fidati: si ricostruiscono
 * i record campo per campo, scartando proprietà sconosciute.
 */

export class SnapshotError extends Error {
  constructor(
    readonly code: 'corrupt' | 'newer-schema',
    message: string,
  ) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const ID_RE = /^[A-Za-z0-9_-]{1,100}$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const MAX_RECORDS_PER_TABLE = 200_000;

const bad = (msg: string): never => {
  throw new SnapshotError('corrupt', msg);
};
const isObj = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);
const str = (x: unknown, what: string, max = 200): string =>
  typeof x === 'string' && x.length <= max ? x : bad(`Campo non valido: ${what}`);
const hlc = (x: unknown, what: string): Hlc =>
  typeof x === 'string' && parseHlc(x) !== null ? x : bad(`Timestamp non valido: ${what}`);
const cents = (x: unknown, what: string): number =>
  typeof x === 'number' && Number.isSafeInteger(x) && x > 0 && x <= MAX_CENTS ? x : bad(`Importo non valido: ${what}`);

function table<T>(raw: unknown, name: string, build: (id: string, r: Record<string, unknown>) => T): Record<string, T> {
  if (!isObj(raw)) return bad(`Tabella non valida: ${name}`);
  const keys = Object.keys(raw);
  if (keys.length > MAX_RECORDS_PER_TABLE) bad(`Troppi record: ${name}`);
  const out: Record<string, T> = {};
  for (const id of keys) {
    if (FORBIDDEN_KEYS.has(id) || !ID_RE.test(id)) bad(`Identificativo non valido in ${name}`);
    const r = raw[id];
    if (!isObj(r)) return bad(`Record non valido in ${name}`);
    if (r.id !== id) bad(`Identificativo incoerente in ${name}`);
    out[id] = build(id, r);
  }
  return out;
}

const tomb = (r: Record<string, unknown>): { deleted?: true } => {
  if (r.deleted === undefined) return {};
  return r.deleted === true ? { deleted: true } : bad('Campo "deleted" non valido');
};

export function parseSnapshot(x: unknown): Snapshot {
  if (!isObj(x)) return bad('Snapshot non valido');
  if (x.schema !== SCHEMA_VERSION) {
    if (typeof x.schema === 'number' && x.schema > SCHEMA_VERSION) {
      throw new SnapshotError('newer-schema', 'I dati provengono da una versione più recente dell’app.');
    }
    return bad('Versione dello schema non riconosciuta');
  }

  const transactions = table<Transaction>(x.transactions, 'transactions', (id, r) => {
    if (r.type !== 'income' && r.type !== 'expense') bad('Tipo di movimento non valido');
    const date = str(r.date, 'date', 10);
    if (!isValidISODate(date)) bad('Data non valida');
    return {
      id,
      type: r.type as TxType,
      amountCents: cents(r.amountCents, 'amountCents'),
      categoryId: str(r.categoryId, 'categoryId', 100),
      date,
      note: str(r.note ?? '', 'note', 500),
      createdAt: hlc(r.createdAt, 'createdAt'),
      updatedAt: hlc(r.updatedAt, 'updatedAt'),
      ...tomb(r),
    };
  });

  const categories = table<Category>(x.categories, 'categories', (id, r) => {
    if (r.kind !== 'income' && r.kind !== 'expense' && r.kind !== 'both') bad('Tipo di categoria non valido');
    const color = str(r.color, 'color', 7);
    if (!COLOR_RE.test(color)) bad('Colore non valido');
    if (typeof r.builtin !== 'boolean' || typeof r.archived !== 'boolean') bad('Flag di categoria non validi');
    return {
      id,
      name: str(r.name, 'name', 60),
      kind: r.kind as CategoryKind,
      icon: str(r.icon, 'icon', 16),
      color,
      builtin: r.builtin as boolean,
      archived: r.archived as boolean,
      updatedAt: hlc(r.updatedAt, 'updatedAt'),
      ...tomb(r),
    };
  });

  const budgets = table<Budget>(x.budgets, 'budgets', (id, r) => {
    if (r.categoryId !== null && typeof r.categoryId !== 'string') bad('Categoria del budget non valida');
    return {
      id,
      categoryId: r.categoryId === null ? null : str(r.categoryId, 'categoryId', 100),
      amountCents: cents(r.amountCents, 'amountCents'),
      updatedAt: hlc(r.updatedAt, 'updatedAt'),
      ...tomb(r),
    };
  });

  const s = x.settings;
  if (!isObj(s)) return bad('Impostazioni non valide');
  const currency = str(s.currency, 'currency', 3);
  if (!/^[A-Z]{3}$/.test(currency)) bad('Valuta non valida');
  const locale = str(s.locale, 'locale', 35);
  try {
    new Intl.Locale(locale);
  } catch {
    bad('Lingua non valida');
  }
  const settings: Settings = { currency, locale, updatedAt: hlc(s.updatedAt, 'settings.updatedAt') };

  return { schema: SCHEMA_VERSION, transactions, categories, budgets, settings };
}

/** Timestamp massimo presente nello snapshot (per far avanzare l'orologio locale). */
export function maxSnapshotHlc(s: Snapshot): Hlc {
  let best = s.settings.updatedAt;
  for (const t of [s.transactions, s.categories, s.budgets]) {
    for (const r of Object.values(t)) if (r.updatedAt > best) best = r.updatedAt;
  }
  return best;
}
