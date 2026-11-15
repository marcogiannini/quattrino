import type { LocalState, StorageAdapter } from '../core/types';

/** Archivio volatile: per test e anteprime. */
export class MemoryStorage implements StorageAdapter {
  private data: LocalState | null;
  saves = 0;

  constructor(initial: LocalState | null = null) {
    this.data = initial ? structuredClone(initial) : null;
  }
  async load(): Promise<LocalState | null> {
    return this.data ? structuredClone(this.data) : null;
  }
  async save(state: LocalState): Promise<void> {
    this.saves += 1;
    this.data = structuredClone(state);
  }
}
