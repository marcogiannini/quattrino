import { isValidISODate } from './dates';
import { formatHlc } from './hlc';
import type { Frequency, Hlc, RecurringRule } from './types';

/**
 * Spese ricorrenti. Le occorrenze sono movimenti normali con identificativo DETERMINISTICO
 * (`<idRegola>-<data>`) e timestamp deterministici e "vecchi": se due dispositivi generano la
 * stessa occorrenza il risultato è identico (nessun duplicato, nessun falso conflitto) e
 * qualunque modifica o eliminazione fatta dall'utente vince sempre sulla copia generata.
 */

/** Limite di sicurezza sulle occorrenze generate per una regola. */
export const MAX_OCCURRENCES = 1000;
export const MIN_START_DATE = '2000-01-01';

const DAY_MS = 86_400_000;

const parts = (d: string): [number, number, number] => d.split('-').map(Number) as [number, number, number];
const daysInMonth = (y: number, m: number): number => new Date(Date.UTC(y, m, 0)).getUTCDate();
const iso = (y: number, m: number, d: number): string =>
  `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

export function addDays(date: string, n: number): string {
  const [y, m, d] = parts(date);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return iso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/** Date delle occorrenze di una regola, dalla prima fino a `upTo` (incluso) e alla scadenza. */
export function occurrenceDates(
  rule: Pick<RecurringRule, 'frequency' | 'startDate' | 'endDate'>,
  upTo: string,
): string[] {
  const last = rule.endDate !== null && rule.endDate < upTo ? rule.endDate : upTo;
  const out: string[] = [];
  const [sy, sm, sd] = parts(rule.startDate);
  for (let k = 0; out.length < MAX_OCCURRENCES; k++) {
    let date: string;
    if (rule.frequency === 'weekly') {
      date = addDays(rule.startDate, 7 * k);
    } else {
      const step = rule.frequency === 'monthly' ? k : 12 * k;
      const idx = sy * 12 + (sm - 1) + step;
      const y = Math.floor(idx / 12);
      const m = (idx % 12) + 1;
      date = iso(y, m, Math.min(sd, daysInMonth(y, m)));
    }
    if (date > last) break;
    out.push(date);
  }
  return out;
}

export const occurrenceId = (ruleId: string, date: string): string => `${ruleId}-${date}`;

/** Timestamp deterministico (2 giorni prima della data) per i movimenti generati. */
export function generatedHlc(date: string): Hlc {
  const [y, m, d] = parts(date);
  return formatHlc(Math.max(1, Date.UTC(y, m - 1, d) - 2 * DAY_MS), 0, 'recurring');
}

export function checkRuleDates(startDate: string, endDate: string | null): 'start' | 'end' | 'order' | null {
  if (!isValidISODate(startDate) || startDate < MIN_START_DATE) return 'start';
  if (endDate !== null) {
    if (!isValidISODate(endDate)) return 'end';
    if (endDate < startDate) return 'order';
  }
  return null;
}

export const FREQUENCIES: readonly Frequency[] = ['weekly', 'monthly', 'yearly'];

/** Prossima data di addebito dopo `after` (esclusa), oppure null se la regola è terminata. */
export function nextOccurrence(rule: RecurringRule, after: string): string | null {
  const dates = occurrenceDates({ ...rule, endDate: rule.endDate }, addDays(after, 800));
  const next = dates.find((d) => d > after);
  return next ?? null;
}
