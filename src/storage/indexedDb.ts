import type { LocalState, StorageAdapter } from '../core/types';

const STORE = 'kv';
const KEY = 'state';

/** Archivio persistente del browser/WebView (IndexedDB): un solo record con tutto lo stato. */
export class IndexedDbStorage implements StorageAdapter {
  private db: Promise<IDBDatabase> | null = null;

  constructor(
    private readonly name = 'quattrino',
    private readonly factory: IDBFactory = globalThis.indexedDB,
  ) {}

  private open(): Promise<IDBDatabase> {
    this.db ??= new Promise<IDBDatabase>((resolve, reject) => {
      const req = this.factory.open(this.name, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('Impossibile aprire il database locale.'));
      req.onblocked = () => reject(new Error('Database locale bloccato da un’altra scheda.'));
    });
    return this.db;
  }

  async load(): Promise<LocalState | null> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve((req.result as LocalState | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  }

  async save(state: LocalState): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(state, KEY);
      tx.oncomplete = () => resolve(); // risolve a transazione conclusa = dati durevoli
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error('Salvataggio annullato.'));
    });
  }
}
