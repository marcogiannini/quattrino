import { centsToInput } from './money';
import { DEFAULT_KDF_ITERATIONS, PassphraseCipher, CryptoError, isEncryptedBlob, utf8 } from './crypto';
import { parseSnapshot, SnapshotError } from './snapshot';
import type { Category, Snapshot, Transaction } from './types';

/**
 * Backup/ripristino su file, indipendente da qualsiasi cloud: può essere salvato in
 * una cartella sincronizzata da Drive, iCloud, OneDrive, Dropbox o Syncthing.
 */

export interface BackupOptions {
  /** Se assente il backup è JSON in chiaro (sconsigliato: contiene dati finanziari). */
  passphrase?: string;
  iterations?: number;
  now?: () => Date;
}

const activeOnly = <T extends { deleted?: true }>(r: Record<string, T>): Record<string, T> =>
  Object.fromEntries(Object.entries(r).filter(([, v]) => !v.deleted));

export async function exportBackup(snapshot: Snapshot, opts: BackupOptions = {}): Promise<Uint8Array> {
  const clean: Snapshot = {
    ...snapshot,
    transactions: activeOnly(snapshot.transactions),
    categories: activeOnly(snapshot.categories),
    budgets: activeOnly(snapshot.budgets),
  };
  const payload = utf8.enc(
    JSON.stringify({ app: 'quattrino', format: 1, exportedAt: (opts.now?.() ?? new Date()).toISOString(), snapshot: clean }),
  );
  if (!opts.passphrase) return payload;
  return new PassphraseCipher(opts.passphrase, opts.iterations ?? DEFAULT_KDF_ITERATIONS).encrypt(payload);
}

export class BackupError extends Error {
  constructor(
    readonly code: 'passphrase-required' | 'wrong-passphrase' | 'corrupt' | 'newer-schema',
    message: string,
  ) {
    super(message);
    this.name = 'BackupError';
  }
}

export async function readBackup(bytes: Uint8Array, opts: { passphrase?: string } = {}): Promise<Snapshot> {
  let plain = bytes;
  if (isEncryptedBlob(bytes)) {
    if (!opts.passphrase) throw new BackupError('passphrase-required', 'Il backup è cifrato: serve la passphrase.');
    try {
      plain = await new PassphraseCipher(opts.passphrase).decrypt(bytes);
    } catch (e) {
      if (e instanceof CryptoError && e.code === 'auth-failed') {
        throw new BackupError('wrong-passphrase', 'Passphrase errata oppure file alterato.');
      }
      throw new BackupError('corrupt', 'File di backup non valido.');
    }
  }
  try {
    const doc: unknown = JSON.parse(utf8.dec(plain));
    if (typeof doc !== 'object' || doc === null || (doc as { app?: unknown }).app !== 'quattrino') {
      throw new BackupError('corrupt', 'Il file non è un backup di Quattrino.');
    }
    return parseSnapshot((doc as { snapshot?: unknown }).snapshot);
  } catch (e) {
    if (e instanceof BackupError) throw e;
    if (e instanceof SnapshotError) {
      throw new BackupError(e.code === 'newer-schema' ? 'newer-schema' : 'corrupt', e.message);
    }
    throw new BackupError('corrupt', 'File di backup non valido.');
  }
}

// ------------------------------------------------------------------------ CSV

const quote = (v: string): string => (/[";\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/**
 * Testo scritto dall'utente (categoria, nota): neutralizza le "formule" (=, +, -, @) che i
 * fogli di calcolo eseguirebbero (CSV injection). Gli importi, generati da noi, restano numeri.
 */
const textCell = (v: string): string => quote(/^[=+\-@\t\r]/.test(v) ? `'${v}` : v);

/** CSV per Excel italiano: separatore ";", decimali con virgola, BOM UTF-8. */
export function transactionsToCsv(txs: readonly Transaction[], categories: readonly Category[]): string {
  const names = new Map(categories.map((c) => [c.id, c.name]));
  const rows = ['Data;Tipo;Categoria;Importo;Nota'];
  for (const t of [...txs].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt < b.createdAt ? -1 : 1))) {
    rows.push(
      [
        t.date,
        t.type === 'income' ? 'Entrata' : 'Uscita',
        textCell(names.get(t.categoryId) ?? '(categoria rimossa)'),
        centsToInput(t.type === 'income' ? t.amountCents : -t.amountCents),
        textCell(t.note),
      ].join(';'),
    );
  }
  return '﻿' + rows.join('\r\n') + '\r\n';
}
