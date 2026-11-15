import { newId } from '../ids';
import { SyncError, type RemoteFile, type RemoteStore } from './remote';

/**
 * Adattatore Google Drive v3 sulla cartella nascosta `appDataFolder`.
 * Scope necessario: https://www.googleapis.com/auth/drive.appdata (non sensibile).
 * L'app non vede né modifica altri file dell'utente su Drive.
 */

export const DRIVE_APPDATA_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const API = 'https://www.googleapis.com';

export interface DriveOptions {
  /** Restituisce un access token valido (lo rinnova se serve). */
  getToken: () => Promise<string>;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  maxRetries?: number;
}

interface DriveFile {
  id: string;
  name: string;
  modifiedTime?: string;
  md5Checksum?: string;
}

const RATE_LIMIT_REASONS = new Set(['rateLimitExceeded', 'userRateLimitExceeded', 'backendError']);

export class GoogleDriveRemote implements RemoteStore {
  private readonly ids = new Map<string, string>();
  private readonly f: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly maxRetries: number;

  constructor(private readonly opts: DriveOptions) {
    this.f = opts.fetchImpl ?? ((...a) => globalThis.fetch(...a));
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.maxRetries = opts.maxRetries ?? 4;
  }

  async list(): Promise<RemoteFile[]> {
    const found = new Map<string, DriveFile>();
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({
        spaces: 'appDataFolder',
        pageSize: '100',
        fields: 'nextPageToken,files(id,name,modifiedTime,md5Checksum)',
      });
      if (pageToken) params.set('pageToken', pageToken);
      const res = await this.request(`${API}/drive/v3/files?${params}`);
      const body = (await res.json()) as { files?: DriveFile[]; nextPageToken?: string };
      for (const file of body.files ?? []) {
        const prev = found.get(file.name);
        // Duplicati dello stesso nome (es. due schede aperte): vale il più recente.
        if (!prev || (file.modifiedTime ?? '') > (prev.modifiedTime ?? '')) found.set(file.name, file);
      }
      pageToken = body.nextPageToken;
    } while (pageToken);

    this.ids.clear();
    for (const file of found.values()) this.ids.set(file.name, file.id);
    return [...found.values()].map((file) => ({
      name: file.name,
      version: file.md5Checksum ?? file.modifiedTime ?? file.id,
    }));
  }

  async read(name: string): Promise<Uint8Array> {
    const id = await this.idOf(name);
    if (!id) throw new SyncError('remote', `File non trovato su Drive: ${name}`);
    const res = await this.request(`${API}/drive/v3/files/${encodeURIComponent(id)}?alt=media`);
    return new Uint8Array(await res.arrayBuffer());
  }

  async write(name: string, data: Uint8Array): Promise<void> {
    const id = await this.idOf(name);
    if (id) {
      await this.request(`${API}/upload/drive/v3/files/${encodeURIComponent(id)}?uploadType=media`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: data as BlobPart,
      });
      return;
    }
    const boundary = `quattrino-${newId()}`;
    const meta = JSON.stringify({ name, parents: ['appDataFolder'] });
    const body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`,
      `--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`,
      data as BlobPart,
      `\r\n--${boundary}--`,
    ]);
    const res = await this.request(`${API}/upload/drive/v3/files?uploadType=multipart&fields=id,name`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    });
    const created = (await res.json()) as { id?: string };
    if (created.id) this.ids.set(name, created.id);
  }

  async remove(name: string): Promise<void> {
    const id = await this.idOf(name);
    if (!id) return;
    await this.request(`${API}/drive/v3/files/${encodeURIComponent(id)}`, { method: 'DELETE' }, [404]);
    this.ids.delete(name);
  }

  private async idOf(name: string): Promise<string | undefined> {
    if (!this.ids.has(name)) await this.list();
    return this.ids.get(name);
  }

  /** Richiesta con token, gestione errori e retry con backoff esponenziale + jitter. */
  private async request(url: string, init: RequestInit = {}, okStatuses: number[] = []): Promise<Response> {
    for (let attempt = 0; ; attempt += 1) {
      let res: Response;
      try {
        const token = await this.opts.getToken();
        res = await this.f(url, { ...init, headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${token}` } });
      } catch (e) {
        if (e instanceof SyncError) throw e;
        throw new SyncError('offline', 'Rete non raggiungibile.', { cause: e });
      }
      if (res.ok || okStatuses.includes(res.status)) return res;
      if (res.status === 401) throw new SyncError('auth', 'Accesso a Google scaduto o revocato: riconnettersi.');

      const reason = await errorReason(res);
      if (reason === 'storageQuotaExceeded') throw new SyncError('quota', 'Spazio insufficiente su Google Drive.');
      const retryable = res.status === 429 || res.status >= 500 || (res.status === 403 && RATE_LIMIT_REASONS.has(reason));
      if (!retryable || attempt >= this.maxRetries) {
        throw new SyncError('remote', `Errore di Google Drive (HTTP ${res.status}${reason ? `, ${reason}` : ''}).`);
      }
      const delay = Math.min(30_000, 500 * 2 ** attempt) + Math.random() * 250;
      await this.sleep(delay);
    }
  }
}

async function errorReason(res: Response): Promise<string> {
  try {
    const body = (await res.clone().json()) as { error?: { errors?: { reason?: string }[]; status?: string } };
    return body.error?.errors?.[0]?.reason ?? body.error?.status ?? '';
  } catch {
    return '';
  }
}
