/**
 * Modello dati. Tutti i record sincronizzabili hanno `id` stabile e `updatedAt`
 * (Hybrid Logical Clock, vedi hlc.ts). La cancellazione è logica (tombstone).
 * Gli importi sono interi in centesimi: niente numeri in virgola mobile.
 */

export const SCHEMA_VERSION = 1 as const;

export type Hlc = string;
export type TxType = 'income' | 'expense';
export type CategoryKind = TxType | 'both';

export interface Stamped {
  id: string;
  updatedAt: Hlc;
  /** Tombstone: il record è cancellato ma resta per propagare la cancellazione. */
  deleted?: true;
}

export interface Transaction extends Stamped {
  type: TxType;
  /** Intero > 0, in centesimi della valuta delle impostazioni. */
  amountCents: number;
  categoryId: string;
  /** Data di calendario locale, formato YYYY-MM-DD (nessun fuso orario). */
  date: string;
  note: string;
  /** HLC di creazione, usato solo per ordinare movimenti dello stesso giorno. */
  createdAt: Hlc;
}

export interface Category extends Stamped {
  name: string;
  kind: CategoryKind;
  icon: string;
  color: string;
  /** Categoria predefinita (id stabile identico su tutti i dispositivi). */
  builtin: boolean;
  /** Archiviata: non selezionabile per nuovi movimenti, ma i vecchi restano validi. */
  archived: boolean;
}

export interface Budget extends Stamped {
  /** null = budget complessivo mensile (tutte le uscite). */
  categoryId: string | null;
  /** Limite mensile ricorrente, in centesimi. */
  amountCents: number;
}

export interface Settings {
  currency: string;
  locale: string;
  updatedAt: Hlc;
}

export interface Snapshot {
  schema: typeof SCHEMA_VERSION;
  transactions: Record<string, Transaction>;
  categories: Record<string, Category>;
  budgets: Record<string, Budget>;
  settings: Settings;
}

export type TableName = 'transactions' | 'categories' | 'budgets';
export type AnyRecord = Transaction | Category | Budget;

export interface ConflictEntry {
  table: TableName;
  id: string;
  local: AnyRecord;
  remote: AnyRecord;
  /** Quale versione è stata mantenuta dalla regola "l'ultima modifica vince". */
  winner: 'local' | 'remote';
  detectedAt: Hlc;
}

/** Stato persistito localmente: dati + metadati di sincronizzazione. */
export interface LocalState {
  snapshot: Snapshot;
  deviceId: string;
  /** Orologio al termine dell'ultima sincronizzazione completata. */
  lastSyncHlc: Hlc;
  clockLast: Hlc;
  /** Ci sono modifiche locali non ancora caricate. */
  dirty: boolean;
  conflictLog: ConflictEntry[];
  /** Versione (checksum/modifiedTime) dei file remoti già incorporati. */
  remoteVersions: Record<string, string>;
}

export interface StorageAdapter {
  load(): Promise<LocalState | null>;
  save(state: LocalState): Promise<void>;
}

export class ValidationError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}
