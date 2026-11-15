import { isValidISODate } from './dates';
import { MAX_CENTS, parseAmountToCents } from './money';
import type { Category, Transaction, TxType } from './types';

/**
 * Importazione di movimenti da file CSV (anche quelli esportati da Quattrino).
 * Tutto il testo del file è trattato come non fidato: ogni riga è validata e le righe
 * non valide vengono segnalate con numero di riga e motivo, senza bloccare le altre.
 */

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 20_000;

export type DateOrder = 'dmy' | 'mdy';
export type UnknownCategoryPolicy = 'create' | 'fallback';
export type ImportErrorCode = 'date' | 'amount' | 'type' | 'missing' | 'category-kind' | 'note-too-long';

export interface ParsedCsv {
  delimiter: string;
  header: string[];
  rows: string[][];
}

/** Rimuove il BOM e sceglie il separatore più frequente nella prima riga (fuori dalle virgolette). */
export function detectDelimiter(text: string): string {
  const first = text.replace(/^﻿/, '').split(/\r?\n/, 1)[0] ?? '';
  let best = ';';
  let bestN = -1;
  for (const d of [';', ',', '\t']) {
    let n = 0;
    let inQ = false;
    for (const ch of first) {
      if (ch === '"') inQ = !inQ;
      else if (ch === d && !inQ) n += 1;
    }
    if (n > bestN) {
      best = d;
      bestN = n;
    }
  }
  return best;
}

/** Lettore CSV (RFC 4180): virgolette, virgolette doppie, a capo dentro i campi. */
export function parseCsv(input: string, delimiter?: string): ParsedCsv {
  const text = input.replace(/^﻿/, '');
  const delim = delimiter ?? detectDelimiter(text);
  const all: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQ = false;
  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    if (!(row.length === 1 && row[0]!.trim() === '')) all.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQ = false;
      } else field += ch;
    } else if (ch === '"' && field === '') inQ = true;
    else if (ch === delim) endField();
    else if (ch === '\n') endRow();
    else if (ch === '\r') {
      if (text[i + 1] === '\n') i++;
      endRow();
    } else field += ch;
    if (all.length > MAX_IMPORT_ROWS + 1) break;
  }
  if (field !== '' || row.length > 0) endRow();
  const [header = [], ...rows] = all;
  return { delimiter: delim, header: header.map((h) => h.trim()), rows };
}

export interface ColumnMap {
  date: number;
  amount: number;
  type: number | null;
  category: number | null;
  note: number | null;
}

const norm = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z]/g, '');

const NAMES: Record<keyof ColumnMap, string[]> = {
  date: ['data', 'date', 'giorno', 'day'],
  amount: ['importo', 'amount', 'valore', 'value', 'totale', 'total', 'ammontare'],
  type: ['tipo', 'type', 'segno'],
  category: ['categoria', 'category'],
  note: ['nota', 'note', 'notes', 'descrizione', 'description', 'causale', 'memo'],
};

/** Riconosce le colonne dai titoli (italiano e inglese). Restituisce null se data o importo mancano. */
export function detectColumns(header: readonly string[]): ColumnMap | null {
  const find = (key: keyof ColumnMap): number | null => {
    const i = header.findIndex((h) => NAMES[key].includes(norm(h)));
    return i === -1 ? null : i;
  };
  const date = find('date');
  const amount = find('amount');
  if (date === null || amount === null) return null;
  return { date, amount, type: find('type'), category: find('category'), note: find('note') };
}

export function parseDate(raw: string, order: DateOrder): string | null {
  const s = raw.trim();
  if (isValidISODate(s)) return s;
  const iso = /^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$/.exec(s);
  if (iso) return fmt(+iso[1]!, +iso[2]!, +iso[3]!);
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(s);
  if (!m) return null;
  let a = +m[1]!;
  let b = +m[2]!;
  let y = +m[3]!;
  if (m[3]!.length === 2) y += 2000;
  if (order === 'mdy') [a, b] = [b, a];
  return fmt(y, b, a);
}

function fmt(y: number, m: number, d: number): string | null {
  const s = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return isValidISODate(s) ? s : null;
}

/** Importo con segno: "-12,50", "(12,50)", "12,50-", "+1.200,00". */
export function parseSignedAmount(raw: string): { cents: number; negative: boolean } | null {
  let s = raw.trim();
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/^[−–]/, '-');
  if (s.startsWith('-')) {
    negative = !negative;
    s = s.slice(1);
  } else if (s.startsWith('+')) s = s.slice(1);
  if (s.endsWith('-')) {
    negative = true;
    s = s.slice(0, -1);
  }
  const cents = parseAmountToCents(s);
  if (cents === null || cents > MAX_CENTS) return null;
  return { cents, negative };
}

const INCOME_WORDS = new Set(['entrata', 'entrate', 'income', 'credit', 'credito', 'accredito', 'in', '+']);
const EXPENSE_WORDS = new Set(['uscita', 'uscite', 'spesa', 'expense', 'debit', 'debito', 'addebito', 'out', '-']);

export function parseType(raw: string): TxType | null {
  const s = raw.trim().toLowerCase();
  if (INCOME_WORDS.has(s)) return 'income';
  if (EXPENSE_WORDS.has(s)) return 'expense';
  return null;
}

/** Annulla la neutralizzazione delle formule fatta dall'esportazione (apostrofo iniziale). */
const unquoteFormula = (s: string): string => (/^'[=+\-@\t\r]/.test(s) ? s.slice(1) : s);

export interface ImportItem {
  line: number;
  type: TxType;
  amountCents: number;
  date: string;
  note: string;
  /** Id di categoria esistente, oppure null se va creata (vedi newCategory). */
  categoryId: string | null;
  /** Nome della categoria da creare quando categoryId è null. */
  newCategory?: string;
  duplicate: boolean;
}

export interface ImportError {
  line: number;
  code: ImportErrorCode;
}

export interface ImportPlan {
  items: ImportItem[];
  errors: ImportError[];
  /** Nomi (con tipo) delle categorie che verranno create. */
  newCategories: { name: string; kind: TxType }[];
  truncated: boolean;
}

export interface PlanOptions {
  dateOrder: DateOrder;
  unknownCategory: UnknownCategoryPolicy;
  /** Traduzioni accettate per i nomi delle categorie predefinite (nome mostrato → id). */
  aliases?: ReadonlyMap<string, string>;
}

const keyOf = (t: { date: string; type: TxType; amountCents: number; categoryId: string; note: string }): string =>
  `${t.date}|${t.type}|${t.amountCents}|${t.categoryId}|${t.note}`;

export function planImport(
  parsed: ParsedCsv,
  cols: ColumnMap,
  categories: readonly Category[],
  existing: readonly Transaction[],
  opts: PlanOptions,
): ImportPlan {
  const active = categories.filter((c) => !c.deleted && !c.archived);
  const byName = new Map<string, Category[]>();
  const add = (name: string, c: Category) => byName.set(name, [...(byName.get(name) ?? []), c]);
  for (const c of active) add(c.name.trim().toLowerCase(), c);
  for (const [name, id] of opts.aliases ?? []) {
    const c = active.find((x) => x.id === id);
    if (c) add(name.trim().toLowerCase(), c);
  }
  const fits = (c: Category, t: TxType) => c.kind === 'both' || c.kind === t;
  const pickCategory = (name: string, t: TxType): Category | undefined => byName.get(name.trim().toLowerCase())?.find((c) => fits(c, t));
  const fallback = (t: TxType): Category | undefined =>
    active.find((c) => c.id === (t === 'income' ? 'cat-altre-entrate' : 'cat-altro-spese')) ?? active.find((c) => fits(c, t));

  const budget = new Map<string, number>();
  for (const t of existing) {
    if (t.deleted) continue;
    const k = keyOf(t);
    budget.set(k, (budget.get(k) ?? 0) + 1);
  }

  const items: ImportItem[] = [];
  const errors: ImportError[] = [];
  const fresh = new Map<string, TxType>();
  const rows = parsed.rows.slice(0, MAX_IMPORT_ROWS);

  rows.forEach((row, i) => {
    const line = i + 2;
    const cell = (idx: number | null): string => (idx === null ? '' : (row[idx] ?? '').trim());
    const fail = (code: ImportErrorCode) => errors.push({ line, code });

    if (row.every((c) => c.trim() === '')) return;
    const date = parseDate(cell(cols.date), opts.dateOrder);
    if (!date) return fail('date');
    const amt = parseSignedAmount(cell(cols.amount));
    if (!amt) return fail(cell(cols.amount) === '' ? 'missing' : 'amount');

    let type: TxType;
    if (cols.type !== null && cell(cols.type) !== '') {
      const t = parseType(cell(cols.type));
      if (!t) return fail('type');
      type = t;
    } else type = amt.negative ? 'expense' : 'income';

    const note = unquoteFormula(cell(cols.note));
    if (note.length > 200) return fail('note-too-long');
    const catName = unquoteFormula(cell(cols.category));

    let categoryId: string | null = null;
    let newCategory: string | undefined;
    const found = catName === '' ? undefined : pickCategory(catName, type);
    if (found) categoryId = found.id;
    else if (catName !== '' && opts.unknownCategory === 'create' && catName.length <= 40) {
      newCategory = catName;
      const key = `${type}|${catName.toLowerCase()}`;
      if (!fresh.has(key)) fresh.set(key, type);
    } else {
      const fb = fallback(type);
      if (!fb) return fail('category-kind');
      categoryId = fb.id;
    }

    const dup = categoryId !== null && (budget.get(keyOf({ date, type, amountCents: amt.cents, categoryId, note })) ?? 0) > 0;
    if (dup) {
      const k = keyOf({ date, type, amountCents: amt.cents, categoryId: categoryId!, note });
      budget.set(k, budget.get(k)! - 1);
    }
    items.push({ line, type, amountCents: amt.cents, date, note, categoryId, ...(newCategory ? { newCategory } : {}), duplicate: dup });
  });

  const newCategories = [...fresh.entries()].map(([k, kind]) => ({
    name: items.find((x) => x.newCategory && `${x.type}|${x.newCategory.toLowerCase()}` === k)!.newCategory!,
    kind,
  }));
  return { items, errors, newCategories, truncated: parsed.rows.length > MAX_IMPORT_ROWS };
}
