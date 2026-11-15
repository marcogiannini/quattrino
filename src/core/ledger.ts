import { CATEGORY_COLORS, seedSnapshot } from './defaults';
import type { ImportPlan } from './csvImport';
import { checkRuleDates, generatedHlc, occurrenceDates, occurrenceId } from './recurring';
import { isValidISODate } from './dates';
import { SEED_HLC, HybridClock } from './hlc';
import { newDeviceId, newId } from './ids';
import { mergeSnapshots, type MergeResult } from './merge';
import { MAX_CENTS } from './money';
import { maxSnapshotHlc } from './snapshot';
import {
  SCHEMA_VERSION,
  ValidationError,
  type AnyRecord,
  type Budget,
  type Category,
  type CategoryKind,
  type ConflictEntry,
  type Frequency,
  type Hlc,
  type LocalState,
  type RecurringRule,
  type Settings,
  type Snapshot,
  type StorageAdapter,
  type TableName,
  type Transaction,
  type TxType,
} from './types';

const MAX_CONFLICT_LOG = 50;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export interface NewTransaction {
  type: TxType;
  amountCents: number;
  categoryId: string;
  date: string;
  note?: string;
}
export interface NewRecurring {
  type: TxType;
  amountCents: number;
  categoryId: string;
  note?: string;
  frequency: Frequency;
  startDate: string;
  endDate?: string | null;
}
export type RecurringPatch = Partial<Pick<RecurringRule, 'amountCents' | 'categoryId' | 'note' | 'endDate'>>;

export type TransactionPatch = Partial<Pick<Transaction, 'type' | 'amountCents' | 'categoryId' | 'date' | 'note'>>;

const own = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

/**
 * Registro locale: unica fonte di verità dell'app. Offline-first: ogni modifica è
 * applicata subito in memoria e salvata sul dispositivo; la rete serve solo alla sincronizzazione.
 */
export class Ledger {
  /** Incrementa a ogni modifica: usato da React (useSyncExternalStore) per rinfrescare la UI. */
  revision = 0;
  saveError: unknown = null;

  private listeners = new Set<() => void>();
  private saveChain: Promise<void> = Promise.resolve();
  private cache: { tx?: Transaction[]; cats?: Category[]; budgets?: Budget[]; rec?: RecurringRule[] } = {};

  private constructor(
    private state: LocalState,
    private readonly storage: StorageAdapter,
    readonly clock: HybridClock,
  ) {}

  static async open(storage: StorageAdapter, opts: { now?: () => number; locale?: string } = {}): Promise<Ledger> {
    let state = await storage.load();
    let migrated = false;
    if (state) {
      const v = (state.snapshot as { schema: number }).schema;
      if (v > SCHEMA_VERSION) {
        throw new Error('I dati salvati provengono da una versione più recente dell’app: aggiornare l’app.');
      }
      if (v < SCHEMA_VERSION) {
        // Migrazione 1 -> 2: nuova tabella delle ricorrenze (vuota). Nessun dato esistente cambia.
        state = { ...state, snapshot: { ...state.snapshot, schema: SCHEMA_VERSION, recurring: {} } };
        migrated = true;
      }
    }
    const created = state === null;
    if (state === null) {
      state = {
        snapshot: seedSnapshot(opts.locale),
        deviceId: newDeviceId(),
        lastSyncHlc: SEED_HLC,
        clockLast: SEED_HLC,
        dirty: false,
        conflictLog: [],
        remoteVersions: {},
      };
    }
    const ledger = new Ledger(state, storage, new HybridClock(state.deviceId, opts.now, state.clockLast));
    if (created || migrated) await storage.save(state);
    return ledger;
  }

  // ---------------------------------------------------------------- lettura

  get deviceId(): string {
    return this.state.deviceId;
  }
  getState(): Readonly<LocalState> {
    return this.state;
  }
  getSnapshot(): Snapshot {
    return this.state.snapshot;
  }
  get settings(): Settings {
    return this.state.snapshot.settings;
  }

  /** Movimenti attivi, dal più recente al più vecchio. */
  transactions(): Transaction[] {
    return (this.cache.tx ??= Object.values(this.state.snapshot.transactions)
      .filter((t) => !t.deleted)
      .sort((a, b) => (a.date === b.date ? (a.createdAt < b.createdAt ? 1 : -1) : a.date < b.date ? 1 : -1)));
  }

  /** Categorie non cancellate; per default anche quelle archiviate (servono per mostrare i vecchi movimenti). */
  categories(opts: { includeArchived?: boolean } = {}): Category[] {
    const all = (this.cache.cats ??= Object.values(this.state.snapshot.categories)
      .filter((c) => !c.deleted)
      .sort((a, b) => Number(b.builtin) - Number(a.builtin) || a.name.localeCompare(b.name, 'it')));
    return opts.includeArchived === false ? all.filter((c) => !c.archived) : all;
  }

  category(id: string): Category | undefined {
    const c = this.rec<Category>('categories', id);
    return c && !c.deleted ? c : undefined;
  }

  budgets(): Budget[] {
    return (this.cache.budgets ??= Object.values(this.state.snapshot.budgets).filter((b) => !b.deleted));
  }

  /** Regole di ricorrenza attive, in ordine di data di inizio. */
  recurring(): RecurringRule[] {
    return (this.cache.rec ??= Object.values(this.state.snapshot.recurring)
      .filter((r) => !r.deleted)
      .sort((a, b) => (a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : a.id < b.id ? -1 : 1)));
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  /** Attende il completamento dei salvataggi in corso. */
  flush(): Promise<void> {
    return this.saveChain;
  }

  // ------------------------------------------------------------ movimenti

  addTransaction(input: NewTransaction): Transaction {
    this.checkTx(input);
    const now = this.clock.tick();
    const rec: Transaction = {
      id: newId(),
      type: input.type,
      amountCents: input.amountCents,
      categoryId: input.categoryId,
      date: input.date,
      note: this.cleanNote(input.note),
      createdAt: now,
      updatedAt: now,
    };
    return this.put('transactions', rec);
  }

  updateTransaction(id: string, patch: TransactionPatch): Transaction {
    const old = this.activeTx(id);
    const next = { ...old, ...patch };
    this.checkTx(next, old);
    return this.put('transactions', {
      ...old,
      type: next.type,
      amountCents: next.amountCents,
      categoryId: next.categoryId,
      date: next.date,
      note: this.cleanNote(next.note),
      updatedAt: this.clock.tick(),
    });
  }

  deleteTransaction(id: string): void {
    const old = this.activeTx(id);
    this.put('transactions', { ...old, deleted: true, updatedAt: this.clock.tick() });
  }

  /** Annulla una cancellazione (usata dal pulsante "Annulla"). */
  restoreTransaction(id: string): Transaction {
    const old = this.rec<Transaction>('transactions', id);
    if (!old || !old.deleted) throw new ValidationError('not-found', 'Movimento non trovato.');
    const { deleted: _deleted, ...rest } = old;
    return this.put('transactions', { ...rest, updatedAt: this.clock.tick() });
  }

  // ------------------------------------------------------------ categorie

  addCategory(input: { name: string; kind: CategoryKind; icon?: string; color?: string }): Category {
    const name = this.checkCategoryName(input.name, input.kind);
    const color = input.color ?? CATEGORY_COLORS[this.categories().length % CATEGORY_COLORS.length]!;
    if (!COLOR_RE.test(color)) throw new ValidationError('color', 'Colore non valido.');
    const icon = (input.icon ?? '🏷️').trim() || '🏷️';
    if (icon.length > 16) throw new ValidationError('icon', 'Icona non valida.');
    return this.put('categories', {
      id: `cat-${newId()}`,
      name,
      kind: input.kind,
      icon,
      color,
      builtin: false,
      archived: false,
      updatedAt: this.clock.tick(),
    });
  }

  updateCategory(id: string, patch: { name?: string; icon?: string; color?: string }): Category {
    const old = this.category(id);
    if (!old) throw new ValidationError('not-found', 'Categoria non trovata.');
    const name = patch.name === undefined ? old.name : this.checkCategoryName(patch.name, old.kind, id);
    const color = patch.color ?? old.color;
    if (!COLOR_RE.test(color)) throw new ValidationError('color', 'Colore non valido.');
    const icon = patch.icon === undefined ? old.icon : patch.icon.trim() || old.icon;
    if (icon.length > 16) throw new ValidationError('icon', 'Icona non valida.');
    return this.put('categories', { ...old, name, color, icon, updatedAt: this.clock.tick() });
  }

  /** Archivia (o ripristina) una categoria. Archiviando si rimuove anche il suo budget. */
  setCategoryArchived(id: string, archived: boolean): Category {
    const old = this.category(id);
    if (!old) throw new ValidationError('not-found', 'Categoria non trovata.');
    if (archived) this.removeBudget(id);
    else this.checkCategoryName(old.name, old.kind, id);
    return this.put('categories', { ...old, archived, updatedAt: this.clock.tick() });
  }

  // --------------------------------------------------------------- budget

  /** Imposta (o aggiorna) il budget mensile di una categoria; null = budget complessivo. */
  setBudget(categoryId: string | null, amountCents: number): Budget {
    if (!Number.isInteger(amountCents) || amountCents <= 0 || amountCents > MAX_CENTS) {
      throw new ValidationError('amount', 'Importo del budget non valido.');
    }
    if (categoryId !== null) {
      const c = this.category(categoryId);
      if (!c || c.archived) throw new ValidationError('category', 'Categoria non disponibile.');
      if (c.kind === 'income') throw new ValidationError('category', 'Il budget riguarda solo le uscite.');
    }
    const id = categoryId === null ? 'budget-total' : `budget-${categoryId}`;
    return this.put('budgets', { id, categoryId, amountCents, updatedAt: this.clock.tick() });
  }

  removeBudget(categoryId: string | null): void {
    const id = categoryId === null ? 'budget-total' : `budget-${categoryId}`;
    const old = this.rec<Budget>('budgets', id);
    if (!old || old.deleted) return;
    this.put('budgets', { ...old, deleted: true, updatedAt: this.clock.tick() });
  }

  // ------------------------------------------------------------ ricorrenze

  addRecurring(input: NewRecurring): RecurringRule {
    const endDate = input.endDate ?? null;
    this.checkRule(input, endDate);
    const rule: RecurringRule = {
      id: `rule-${newId()}`,
      type: input.type,
      amountCents: input.amountCents,
      categoryId: input.categoryId,
      note: this.cleanNote(input.note),
      frequency: input.frequency,
      startDate: input.startDate,
      endDate,
      updatedAt: this.clock.tick(),
    };
    this.put('recurring', rule);
    return rule;
  }

  updateRecurring(id: string, patch: RecurringPatch): RecurringRule {
    const old = this.rec<RecurringRule>('recurring', id);
    if (!old || old.deleted) throw new ValidationError('not-found', 'Ricorrenza non trovata.');
    const next = { ...old, ...patch };
    this.checkRule(next, next.endDate, old);
    return this.put('recurring', {
      ...old,
      amountCents: next.amountCents,
      categoryId: next.categoryId,
      note: this.cleanNote(next.note),
      endDate: next.endDate,
      updatedAt: this.clock.tick(),
    });
  }

  /** Elimina la regola: i movimenti già generati restano. */
  deleteRecurring(id: string): void {
    const old = this.rec<RecurringRule>('recurring', id);
    if (!old || old.deleted) throw new ValidationError('not-found', 'Ricorrenza non trovata.');
    this.put('recurring', { ...old, deleted: true, updatedAt: this.clock.tick() });
  }

  /**
   * Crea i movimenti delle ricorrenze scaduti fino a `today` (incluso). Idempotente: un'occorrenza
   * già presente (anche se eliminata dall'utente) non viene ricreata. Restituisce quanti movimenti ha creato.
   */
  generateRecurring(today: string): number {
    const txs = this.state.snapshot.transactions;
    const fresh: Record<string, Transaction> = {};
    let count = 0;
    for (const rule of this.recurring()) {
      const cat = this.category(rule.categoryId);
      if (!cat) continue;
      for (const date of occurrenceDates(rule, today)) {
        const id = occurrenceId(rule.id, date);
        if (own(txs, id)) continue;
        const stamp = generatedHlc(date);
        fresh[id] = {
          id,
          type: rule.type,
          amountCents: rule.amountCents,
          categoryId: rule.categoryId,
          date,
          note: rule.note,
          createdAt: stamp,
          updatedAt: stamp,
          recurringId: rule.id,
        };
        count += 1;
      }
    }
    if (count > 0) {
      this.state.snapshot = { ...this.state.snapshot, transactions: { ...txs, ...fresh } };
      this.touch(true);
    }
    return count;
  }

  // ---------------------------------------------------------- importazione

  /**
   * Applica un piano di importazione: crea le categorie mancanti e aggiunge i movimenti non duplicati,
   * in un'unica operazione. Restituisce quanti movimenti sono stati aggiunti.
   */
  commitImport(plan: ImportPlan, opts: { skipDuplicates: boolean }): number {
    const created = new Map<string, string>();
    for (const nc of plan.newCategories) {
      created.set(`${nc.kind}|${nc.name.toLowerCase()}`, this.addCategory({ name: nc.name, kind: nc.kind }).id);
    }
    const inputs: NewTransaction[] = [];
    for (const it of plan.items) {
      if (opts.skipDuplicates && it.duplicate) continue;
      const categoryId = it.categoryId ?? created.get(`${it.type}|${(it.newCategory ?? '').toLowerCase()}`);
      if (!categoryId) continue;
      inputs.push({ type: it.type, amountCents: it.amountCents, categoryId, date: it.date, note: it.note });
    }
    return this.addTransactions(inputs);
  }

  /** Aggiunge molti movimenti in un'unica operazione (una sola scrittura su disco). Tutto o niente. */
  addTransactions(inputs: readonly NewTransaction[]): number {
    const added: Record<string, Transaction> = {};
    for (const input of inputs) {
      this.checkTx(input);
      const now = this.clock.tick();
      const id = newId();
      added[id] = {
        id,
        type: input.type,
        amountCents: input.amountCents,
        categoryId: input.categoryId,
        date: input.date,
        note: this.cleanNote(input.note),
        createdAt: now,
        updatedAt: now,
      };
    }
    if (inputs.length === 0) return 0;
    this.state.snapshot = { ...this.state.snapshot, transactions: { ...this.state.snapshot.transactions, ...added } };
    this.touch(true);
    return inputs.length;
  }

  // ----------------------------------------------------------- impostazioni

  updateSettings(patch: { currency?: string; locale?: string }): Settings {
    const cur = this.state.snapshot.settings;
    const currency = patch.currency ?? cur.currency;
    const locale = patch.locale ?? cur.locale;
    if (!/^[A-Z]{3}$/.test(currency)) throw new ValidationError('currency', 'Valuta non valida (codice ISO a 3 lettere).');
    try {
      new Intl.NumberFormat(locale, { style: 'currency', currency });
    } catch {
      throw new ValidationError('locale', 'Lingua o valuta non supportata.');
    }
    const settings: Settings = { currency, locale, updatedAt: this.clock.tick() };
    this.state.snapshot = { ...this.state.snapshot, settings };
    this.touch(true);
    return settings;
  }

  // -------------------------------------------------------- sincronizzazione

  /** Incorpora uno snapshot remoto già validato. Idempotente. */
  applyRemote(remote: Snapshot): MergeResult {
    const res = mergeSnapshots(this.state.snapshot, remote, this.state.lastSyncHlc);
    this.clock.observe(maxSnapshotHlc(remote));
    if (res.changedLocal) this.state.snapshot = res.snapshot;
    if (res.conflicts.length) {
      const seen = new Set(this.state.conflictLog.map((c) => `${c.table}/${c.id}/${c.remote.updatedAt}/${c.local.updatedAt}`));
      const fresh = res.conflicts.filter((c) => !seen.has(`${c.table}/${c.id}/${c.remote.updatedAt}/${c.local.updatedAt}`));
      this.state.conflictLog = [...fresh, ...this.state.conflictLog].slice(0, MAX_CONFLICT_LOG);
    }
    if (res.changedLocal || res.conflicts.length) this.touch(res.changedLocal);
    return res;
  }

  /**
   * Da chiamare a fine sincronizzazione. `atRevision` è la revisione dello snapshot caricato:
   * se nel frattempo ci sono state modifiche locali, `dirty` resta true.
   */
  markSynced(args: {
    atRevision: number;
    uploaded: boolean;
    syncedHlc?: Hlc;
    remoteVersions: Record<string, string>;
  }): void {
    if (args.uploaded && this.revision === args.atRevision) this.state.dirty = false;
    if (args.syncedHlc) this.state.lastSyncHlc = args.syncedHlc;
    this.state.remoteVersions = { ...args.remoteVersions };
    this.touch(false);
  }

  /**
   * Ripristino "sostitutivo": i dati diventano esattamente quelli dello snapshot, e la
   * scelta si propaga agli altri dispositivi (tutti i record sono ri-datati adesso, quelli
   * non presenti nello snapshot vengono cancellati).
   */
  replaceAll(incoming: Snapshot): void {
    const cur = this.state.snapshot;
    const restamp = <T extends AnyRecord>(from: Record<string, T>, to: Record<string, T>): Record<string, T> => {
      const out: Record<string, T> = {};
      for (const [id, r] of Object.entries(to)) out[id] = { ...r, updatedAt: this.clock.tick() };
      for (const [id, r] of Object.entries(from)) {
        if (!own(to, id) && !r.deleted) out[id] = { ...r, deleted: true, updatedAt: this.clock.tick() };
        else if (!own(to, id)) out[id] = r;
      }
      return out;
    };
    this.clock.observe(maxSnapshotHlc(incoming));
    this.state.snapshot = {
      schema: SCHEMA_VERSION,
      transactions: restamp(cur.transactions, incoming.transactions),
      categories: restamp(cur.categories, incoming.categories),
      budgets: restamp(cur.budgets, incoming.budgets),
      recurring: restamp(cur.recurring, incoming.recurring),
      settings: { ...incoming.settings, updatedAt: this.clock.tick() },
    };
    this.state.conflictLog = [];
    this.touch(true);
  }

  /** Ripristina la versione scartata di un conflitto (diventa una nuova modifica). */
  restoreConflict(index: number): void {
    const entry = this.state.conflictLog[index];
    if (!entry) throw new ValidationError('not-found', 'Conflitto non trovato.');
    const loser = entry.winner === 'local' ? entry.remote : entry.local;
    this.state.conflictLog = this.state.conflictLog.filter((_, i) => i !== index);
    this.put(entry.table, { ...loser, updatedAt: this.clock.tick() } as AnyRecord);
  }

  dismissConflict(index: number): void {
    this.state.conflictLog = this.state.conflictLog.filter((_, i) => i !== index);
    this.touch(false);
  }

  // ---------------------------------------------------------------- interni

  private rec<T extends AnyRecord>(table: TableName, id: string): T | undefined {
    const t = this.state.snapshot[table] as Record<string, T>;
    return own(t, id) ? t[id] : undefined;
  }

  private activeTx(id: string): Transaction {
    const t = this.rec<Transaction>('transactions', id);
    if (!t || t.deleted) throw new ValidationError('not-found', 'Movimento non trovato.');
    return t;
  }

  private cleanNote(note: string | undefined): string {
    const n = (note ?? '').trim();
    if (n.length > 200) throw new ValidationError('note', 'La nota può contenere al massimo 200 caratteri.');
    return n;
  }

  private checkTx(t: { type: TxType; amountCents: number; categoryId: string; date: string }, existing?: Transaction): void {
    if (t.type !== 'income' && t.type !== 'expense') throw new ValidationError('type', 'Tipo di movimento non valido.');
    if (!Number.isInteger(t.amountCents) || t.amountCents <= 0 || t.amountCents > MAX_CENTS) {
      throw new ValidationError('amount', 'Importo non valido.');
    }
    if (!isValidISODate(t.date)) throw new ValidationError('date', 'Data non valida.');
    const c = this.category(t.categoryId);
    if (!c) throw new ValidationError('category', 'Categoria inesistente.');
    if (c.archived && existing?.categoryId !== t.categoryId) {
      throw new ValidationError('category', 'La categoria è archiviata.');
    }
    if (c.kind !== 'both' && c.kind !== t.type) {
      throw new ValidationError('category', 'La categoria non è adatta a questo tipo di movimento.');
    }
  }

  private checkRule(
    r: { type: TxType; amountCents: number; categoryId: string; frequency: Frequency; startDate: string },
    endDate: string | null,
    existing?: RecurringRule,
  ): void {
    this.checkTx({ ...r, date: r.startDate }, existing ? { ...existing, date: existing.startDate } as unknown as Transaction : undefined);
    if (r.frequency !== 'weekly' && r.frequency !== 'monthly' && r.frequency !== 'yearly') {
      throw new ValidationError('frequency', 'Frequenza non valida.');
    }
    const bad = checkRuleDates(r.startDate, endDate);
    if (bad === 'start') throw new ValidationError('start', 'Data di inizio non valida.');
    if (bad === 'end') throw new ValidationError('end', 'Data di fine non valida.');
    if (bad === 'order') throw new ValidationError('end', 'La data di fine non può precedere quella di inizio.');
  }

  private checkCategoryName(raw: string, kind: CategoryKind, selfId?: string): string {
    const name = raw.trim();
    if (name.length < 1 || name.length > 40) {
      throw new ValidationError('name', 'Il nome della categoria deve avere da 1 a 40 caratteri.');
    }
    if (kind !== 'income' && kind !== 'expense' && kind !== 'both') {
      throw new ValidationError('kind', 'Tipo di categoria non valido.');
    }
    const lower = name.toLocaleLowerCase('it');
    const clash = this.categories({ includeArchived: false }).some(
      (c) =>
        c.id !== selfId &&
        c.name.toLocaleLowerCase('it') === lower &&
        (c.kind === 'both' || kind === 'both' || c.kind === kind),
    );
    if (clash) throw new ValidationError('name', 'Esiste già una categoria con questo nome.');
    return name;
  }

  private put<T extends AnyRecord>(table: TableName, rec: T): T {
    const snap = this.state.snapshot;
    this.state.snapshot = { ...snap, [table]: { ...snap[table], [rec.id]: rec } } as Snapshot;
    this.touch(true);
    return rec;
  }

  private touch(markDirty: boolean): void {
    if (markDirty) this.state.dirty = true;
    this.state.clockLast = this.clock.current();
    this.revision += 1;
    this.cache = {};
    this.saveChain = this.saveChain
      .then(() => this.storage.save(this.state))
      .then(
        () => {
          this.saveError = null;
        },
        (err: unknown) => {
          this.saveError = err;
        },
      );
    for (const l of this.listeners) l();
  }
}

export type { ConflictEntry };
