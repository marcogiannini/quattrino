import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { GoogleDriveRemote } from '../src/core/sync/googleDrive';
import { buildAuthUrl, codeChallengeS256, exchangeCode, generateCodeVerifier, refreshAccessToken } from '../src/core/sync/pkce';
import { Ledger } from '../src/core/ledger';
import { IndexedDbStorage } from '../src/storage/indexedDb';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const noSleep = async () => {};

function drive(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return handler(String(url), init ?? {});
  }) as unknown as typeof fetch;
  const remote = new GoogleDriveRemote({ getToken: async () => 'tok', fetchImpl, sleep: noSleep });
  return { remote, calls };
}

describe('GoogleDriveRemote', () => {
  it('elenca i file di appDataFolder seguendo la paginazione', async () => {
    const { remote, calls } = drive((url) =>
      url.includes('pageToken=P2')
        ? json({ files: [{ id: '2', name: 'snap-bbbbbbbb.quattrino', md5Checksum: 'm2' }] })
        : json({ files: [{ id: '1', name: 'snap-aaaaaaaa.quattrino', md5Checksum: 'm1' }], nextPageToken: 'P2' }),
    );
    expect(await remote.list()).toEqual([
      { name: 'snap-aaaaaaaa.quattrino', version: 'm1' },
      { name: 'snap-bbbbbbbb.quattrino', version: 'm2' },
    ]);
    expect(calls[0]!.url).toContain('spaces=appDataFolder');
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it('crea il file con upload multipart nella cartella appDataFolder', async () => {
    const { remote, calls } = drive((url) =>
      url.includes('/upload/') ? json({ id: 'new1', name: 'x' }) : json({ files: [] }),
    );
    await remote.write('snap-aaaaaaaa.quattrino', new Uint8Array([1, 2, 3]));
    const up = calls.find((c) => c.url.includes('uploadType=multipart'))!;
    expect(up.init.method).toBe('POST');
    expect((up.init.headers as Record<string, string>)['Content-Type']).toMatch(/^multipart\/related; boundary=/);
    const text = await (up.init.body as Blob).text();
    expect(text).toContain('"parents":["appDataFolder"]');
    expect(text).toContain('"name":"snap-aaaaaaaa.quattrino"');
  });

  it('aggiorna un file esistente con PATCH e legge il contenuto', async () => {
    const { remote, calls } = drive((url, init) => {
      if (url.includes('alt=media')) return new Response(new Uint8Array([7, 8, 9]));
      if (init.method === 'PATCH') return json({ id: 'f1' });
      return json({ files: [{ id: 'f1', name: 'snap-aaaaaaaa.quattrino', modifiedTime: '2026-11-01T10:00:00Z' }] });
    });
    expect(Array.from(await remote.read('snap-aaaaaaaa.quattrino'))).toEqual([7, 8, 9]);
    await remote.write('snap-aaaaaaaa.quattrino', new Uint8Array([1]));
    expect(calls.some((c) => c.init.method === 'PATCH' && c.url.includes('/upload/drive/v3/files/f1'))).toBe(true);
  });

  it('riprova con backoff su 503 e su limite di frequenza 403, poi riesce', async () => {
    let n = 0;
    const { remote, calls } = drive(() => {
      n += 1;
      if (n === 1) return json({}, 503);
      if (n === 2) return json({ error: { errors: [{ reason: 'userRateLimitExceeded' }] } }, 403);
      return json({ files: [] });
    });
    expect(await remote.list()).toEqual([]);
    expect(calls).toHaveLength(3);
  });

  it('si arrende dopo i tentativi massimi', async () => {
    const { remote, calls } = drive(() => json({}, 500));
    await expect(remote.list()).rejects.toMatchObject({ kind: 'remote' });
    expect(calls).toHaveLength(5); // 1 + 4 ritentativi
  });

  it('mappa 401 -> auth, quota piena -> quota, rete assente -> offline', async () => {
    await expect(drive(() => json({}, 401)).remote.list()).rejects.toMatchObject({ kind: 'auth' });
    await expect(
      drive(() => json({ error: { errors: [{ reason: 'storageQuotaExceeded' }] } }, 403)).remote.list(),
    ).rejects.toMatchObject({ kind: 'quota' });
    await expect(
      drive(() => {
        throw new TypeError('Failed to fetch');
      }).remote.list(),
    ).rejects.toMatchObject({ kind: 'offline' });
  });

  it('non ritenta su errori non transitori (404, 403 di permessi)', async () => {
    const { remote, calls } = drive(() => json({ error: { errors: [{ reason: 'forbidden' }] } }, 403));
    await expect(remote.list()).rejects.toMatchObject({ kind: 'remote' });
    expect(calls).toHaveLength(1);
  });
});

describe('PKCE', () => {
  it('produce il challenge atteso per il vettore di test dell’RFC 7636', async () => {
    expect(await codeChallengeS256('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });

  it('genera verifier validi (43 caratteri, alfabeto url-safe) e diversi tra loro', () => {
    const a = generateCodeVerifier();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generateCodeVerifier()).not.toBe(a);
  });

  it('costruisce l’URL di autorizzazione con S256, offline e scope appdata', () => {
    const u = new URL(
      buildAuthUrl({
        clientId: 'cid',
        redirectUri: 'http://127.0.0.1:5555',
        scope: 'https://www.googleapis.com/auth/drive.appdata',
        codeChallenge: 'CH',
        state: 'ST',
      }),
    );
    expect(u.origin + u.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(Object.fromEntries(u.searchParams)).toMatchObject({
      response_type: 'code',
      code_challenge: 'CH',
      code_challenge_method: 'S256',
      access_type: 'offline',
      state: 'ST',
    });
    expect(u.searchParams.has('prompt')).toBe(false);
  });

  it('scambia il codice e rinnova il token; invalid_grant diventa errore di autenticazione', async () => {
    const seen: URLSearchParams[] = [];
    const ok = (async (_u: unknown, init?: RequestInit) => {
      seen.push(init!.body as URLSearchParams);
      return json({ access_token: 'AT', expires_in: 3600, refresh_token: 'RT' });
    }) as unknown as typeof fetch;
    const t = await exchangeCode(
      { code: 'c', codeVerifier: 'v', redirectUri: 'r' },
      { clientId: 'cid', fetchImpl: ok, now: () => 1000 },
    );
    expect(t).toEqual({ accessToken: 'AT', expiresAt: 1000 + 3_600_000, refreshToken: 'RT' });
    expect(seen[0]!.get('grant_type')).toBe('authorization_code');
    expect(seen[0]!.get('code_verifier')).toBe('v');

    const revoked = (async () => json({ error: 'invalid_grant' }, 400)) as unknown as typeof fetch;
    await expect(refreshAccessToken('RT', { clientId: 'cid', fetchImpl: revoked })).rejects.toMatchObject({ kind: 'auth' });
  });
});

describe('IndexedDbStorage', () => {
  it('salva e ricarica lo stato; il Ledger sopravvive a un riavvio', async () => {
    const storage = new IndexedDbStorage('test-db-1');
    expect(await storage.load()).toBeNull();
    const l1 = await Ledger.open(storage);
    l1.addTransaction({ type: 'expense', amountCents: 999, categoryId: 'cat-casa', date: '2026-11-03' });
    await l1.flush();

    const l2 = await Ledger.open(new IndexedDbStorage('test-db-1')); // "riapertura" dell'app
    expect(l2.transactions().map((t) => t.amountCents)).toEqual([999]);
    expect(l2.deviceId).toBe(l1.deviceId);
  });
});
