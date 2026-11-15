import { CryptoError, utf8, type PassphraseCipher } from '../crypto';
import type { Ledger } from '../ledger';
import { parseSnapshot, SnapshotError } from '../snapshot';
import type { RemoteStore } from './remote';

/**
 * Sincronizzazione "un file per dispositivo".
 *
 * Ogni dispositivo scrive SOLO il proprio file (snap-<deviceId>.quattrino, cifrato) e legge
 * quelli degli altri. Nessun file ha due scrittori, quindi non servono lock né
 * compare-and-swap sul cloud (che Drive non offre in modo affidabile): la convergenza
 * è garantita dall'unione commutativa degli snapshot (merge.ts).
 */

export const ownFileName = (deviceId: string): string => `snap-${deviceId}.quattrino`;
const DEVICE_FILE_RE = /^snap-[0-9a-f]{8}\.quattrino$/;

export type SyncFileErrorReason = 'wrong-passphrase' | 'corrupt' | 'newer-schema';

export interface SyncReport {
  at: number;
  downloaded: number;
  skipped: number;
  uploaded: boolean;
  newConflicts: number;
  errors: { file: string; reason: SyncFileErrorReason }[];
}

function classify(e: unknown): SyncFileErrorReason {
  if (e instanceof CryptoError) return e.code === 'auth-failed' ? 'wrong-passphrase' : 'corrupt';
  if (e instanceof SnapshotError) return e.code === 'newer-schema' ? 'newer-schema' : 'corrupt';
  return 'corrupt';
}

export class SyncEngine {
  private inflight: Promise<SyncReport> | null = null;

  constructor(
    private readonly ledger: Ledger,
    private readonly remote: RemoteStore,
    private readonly cipher: PassphraseCipher,
    private readonly now: () => number = Date.now,
  ) {}

  /** Una sola sincronizzazione alla volta: chiamate concorrenti condividono lo stesso risultato. */
  sync(): Promise<SyncReport> {
    this.inflight ??= this.run().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private async run(): Promise<SyncReport> {
    const own = ownFileName(this.ledger.deviceId);
    const files = await this.remote.list();
    const versions = { ...this.ledger.getState().remoteVersions };
    const errors: SyncReport['errors'] = [];
    let downloaded = 0;
    let skipped = 0;
    let newConflicts = 0;

    for (const f of files) {
      if (f.name === own || !DEVICE_FILE_RE.test(f.name)) continue;
      if (versions[f.name] === f.version) {
        skipped += 1;
        continue;
      }
      const bytes = await this.remote.read(f.name);
      try {
        const doc: unknown = JSON.parse(utf8.dec(await this.cipher.decrypt(bytes)));
        const snapshot = parseSnapshot((doc as { snapshot?: unknown } | null)?.snapshot);
        newConflicts += this.ledger.applyRemote(snapshot).conflicts.length;
        versions[f.name] = f.version;
        downloaded += 1;
      } catch (e) {
        errors.push({ file: f.name, reason: classify(e) });
      }
    }

    // Se non riusciamo a leggere i dati degli altri dispositivi con questa passphrase,
    // NON pubblichiamo il nostro file: si creerebbero due "mondi" cifrati con chiavi diverse.
    const blocked = errors.some((e) => e.reason === 'wrong-passphrase');
    const state = this.ledger.getState();
    const needUpload = !blocked && (state.dirty || !files.some((f) => f.name === own));

    // Nessun await tra queste tre righe: revisione, orologio e snapshot devono essere coerenti.
    const atRevision = this.ledger.revision;
    const syncedHlc = this.ledger.clock.current();
    const snapshot = this.ledger.getSnapshot();

    let uploaded = false;
    if (needUpload) {
      const blob = await this.cipher.encrypt(utf8.enc(JSON.stringify({ v: 1, snapshot })));
      await this.remote.write(own, blob);
      uploaded = true;
    }

    this.ledger.markSynced({
      atRevision,
      uploaded,
      syncedHlc: errors.length === 0 ? syncedHlc : undefined,
      remoteVersions: versions,
    });
    return { at: this.now(), downloaded, skipped, uploaded, newConflicts, errors };
  }
}
