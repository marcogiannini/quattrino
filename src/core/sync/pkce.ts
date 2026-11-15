import { SyncError } from './remote';

/**
 * Autorizzazione OAuth 2.0 con PKCE per app installate (desktop con redirect loopback,
 * mobile con redirect su schema personalizzato). Serve alle app "guscio" (Tauri/Capacitor):
 * nella versione web si usa invece Google Identity Services (googleAuth.ts).
 * Qui c'è solo la logica pura e testabile; l'apertura del browser di sistema e l'ascolto
 * sul redirect dipendono dalla piattaforma e vanno collegati nel guscio nativo.
 */

export function base64Url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Verifier di 43 caratteri (32 byte casuali), come da RFC 7636. */
export function generateCodeVerifier(byteLength = 32): string {
  return base64Url(globalThis.crypto.getRandomValues(new Uint8Array(byteLength)));
}

export async function codeChallengeS256(verifier: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

export function buildAuthUrl(p: {
  clientId: string;
  redirectUri: string;
  scope: string;
  codeChallenge: string;
  state: string;
  /** true solo se serve un nuovo refresh token (primo accesso o cambio di scope). */
  forceConsent?: boolean;
}): string {
  const q = new URLSearchParams({
    client_id: p.clientId,
    redirect_uri: p.redirectUri,
    response_type: 'code',
    scope: p.scope,
    code_challenge: p.codeChallenge,
    code_challenge_method: 'S256',
    state: p.state,
    access_type: 'offline',
  });
  if (p.forceConsent) q.set('prompt', 'consent');
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

export interface TokenSet {
  accessToken: string;
  expiresAt: number;
  refreshToken?: string;
}

interface TokenOpts {
  clientId: string;
  /** Per i client "Desktop" Google fornisce un client secret che non è confidenziale. */
  clientSecret?: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

async function tokenRequest(body: Record<string, string>, o: TokenOpts): Promise<TokenSet> {
  const params = new URLSearchParams({ client_id: o.clientId, ...body });
  if (o.clientSecret) params.set('client_secret', o.clientSecret);
  let res: Response;
  try {
    res = await (o.fetchImpl ?? ((...a) => globalThis.fetch(...a)))('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    });
  } catch (e) {
    throw new SyncError('offline', 'Rete non raggiungibile.', { cause: e });
  }
  const json = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    refresh_token?: string;
    error?: string;
  };
  if (!res.ok || !json.access_token) {
    // invalid_grant = refresh token revocato/scaduto: serve un nuovo consenso dell'utente.
    throw new SyncError(json.error === 'invalid_grant' ? 'auth' : 'remote', `Autorizzazione Google non riuscita (${json.error ?? res.status}).`);
  }
  return {
    accessToken: json.access_token,
    expiresAt: (o.now ?? Date.now)() + (json.expires_in ?? 3600) * 1000,
    refreshToken: json.refresh_token,
  };
}

export const exchangeCode = (
  p: { code: string; codeVerifier: string; redirectUri: string },
  o: TokenOpts,
): Promise<TokenSet> =>
  tokenRequest(
    { grant_type: 'authorization_code', code: p.code, code_verifier: p.codeVerifier, redirect_uri: p.redirectUri },
    o,
  );

export const refreshAccessToken = (refreshToken: string, o: TokenOpts): Promise<TokenSet> =>
  tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken }, o);
