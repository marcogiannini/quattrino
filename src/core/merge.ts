import type { AnyRecord, ConflictEntry, Hlc, Snapshot, Stamped, TableName } from './types';

/**
 * Unione di due snapshot: "last-writer-wins" per record, ordinato da HLC.
 * L'operazione è commutativa, associativa e idempotente (un CRDT basato su stato):
 * l'ordine e il numero di sincronizzazioni non influenzano il risultato finale.
 *
 * Un conflitto vero (da segnalare all'utente) si ha quando entrambe le parti hanno
 * modificato lo stesso record dopo l'ultima sincronizzazione con contenuto diverso.
 * Vince comunque la modifica più recente; la versione scartata resta nel registro conflitti.
 */

export function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  if (v !== null && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const keys = Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}

const sameContent = (a: Stamped, b: Stamped): boolean =>
  stableStringify({ ...a, updatedAt: '' }) === stableStringify({ ...b, updatedAt: '' });

function mergeTable<T extends AnyRecord>(
  tableName: TableName,
  local: Record<string, T>,
  remote: Record<string, T>,
  lastSync: Hlc,
  conflicts: ConflictEntry[],
): { merged: Record<string, T>; changed: boolean } {
  const merged: Record<string, T> = { ...local };
  let changed = false;
  for (const [id, r] of Object.entries(remote)) {
    const l = local[id];
    if (!l) {
      merged[id] = r;
      changed = true;
      continue;
    }
    if (l.updatedAt === r.updatedAt) continue;
    const remoteWins = r.updatedAt > l.updatedAt;
    if (l.updatedAt > lastSync && r.updatedAt > lastSync && !sameContent(l, r)) {
      conflicts.push({
        table: tableName,
        id,
        local: l,
        remote: r,
        winner: remoteWins ? 'remote' : 'local',
        detectedAt: remoteWins ? r.updatedAt : l.updatedAt,
      });
    }
    if (remoteWins) {
      merged[id] = r;
      changed = true;
    }
  }
  return { merged, changed };
}

export interface MergeResult {
  snapshot: Snapshot;
  conflicts: ConflictEntry[];
  /** true se l'unione ha modificato qualcosa rispetto alla copia locale. */
  changedLocal: boolean;
}

export function mergeSnapshots(local: Snapshot, remote: Snapshot, lastSyncHlc: Hlc): MergeResult {
  const conflicts: ConflictEntry[] = [];
  const tx = mergeTable('transactions', local.transactions, remote.transactions, lastSyncHlc, conflicts);
  const cat = mergeTable('categories', local.categories, remote.categories, lastSyncHlc, conflicts);
  const bud = mergeTable('budgets', local.budgets, remote.budgets, lastSyncHlc, conflicts);
  const rec = mergeTable('recurring', local.recurring, remote.recurring, lastSyncHlc, conflicts);
  const settingsRemoteWins = remote.settings.updatedAt > local.settings.updatedAt;
  return {
    snapshot: {
      schema: local.schema,
      transactions: tx.merged,
      categories: cat.merged,
      budgets: bud.merged,
      recurring: rec.merged,
      settings: settingsRemoteWins ? remote.settings : local.settings,
    },
    conflicts,
    changedLocal: tx.changed || cat.changed || bud.changed || rec.changed || settingsRemoteWins,
  };
}
