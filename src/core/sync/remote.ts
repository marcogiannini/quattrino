/**
 * Astrazione del servizio cloud. Il motore di sincronizzazione conosce solo questa
 * interfaccia: Google Drive, WebDAV/Nextcloud, S3 o una cartella locale sono intercambiabili.
 */

export interface RemoteFile {
  name: string;
  /** Valore che cambia a ogni modifica del file (checksum o modifiedTime). */
  version: string;
}

export interface RemoteStore {
  list(): Promise<RemoteFile[]>;
  read(name: string): Promise<Uint8Array>;
  write(name: string, data: Uint8Array): Promise<void>;
  remove(name: string): Promise<void>;
}

export type SyncErrorKind = 'offline' | 'auth' | 'quota' | 'remote';

export class SyncError extends Error {
  constructor(
    readonly kind: SyncErrorKind,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'SyncError';
  }
}

/** Implementazione in memoria: per test e sviluppo senza rete. */
export class MemoryRemote implements RemoteStore {
  readonly files = new Map<string, { data: Uint8Array; version: number }>();
  reads = 0;
  writes = 0;
  /** Se impostato, ogni chiamata fallisce con questo errore (simula offline, token scaduto...). */
  failWith: SyncError | null = null;
  private counter = 0;

  async list(): Promise<RemoteFile[]> {
    this.check();
    return [...this.files.entries()].map(([name, f]) => ({ name, version: String(f.version) }));
  }
  async read(name: string): Promise<Uint8Array> {
    this.check();
    const f = this.files.get(name);
    if (!f) throw new SyncError('remote', `File non trovato: ${name}`);
    this.reads += 1;
    return f.data.slice();
  }
  async write(name: string, data: Uint8Array): Promise<void> {
    this.check();
    this.writes += 1;
    this.files.set(name, { data: data.slice(), version: ++this.counter });
  }
  async remove(name: string): Promise<void> {
    this.check();
    this.files.delete(name);
  }
  private check(): void {
    if (this.failWith) throw this.failWith;
  }
}
