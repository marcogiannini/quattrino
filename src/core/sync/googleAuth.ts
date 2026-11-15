import { SyncError } from './remote';
import { DRIVE_APPDATA_SCOPE } from './googleDrive';

/**
 * Accesso a Google per la versione web/PWA tramite Google Identity Services (token model).
 * Restituisce solo access token di breve durata (~1 ora) e nessun refresh token: il rinnovo
 * silenzioso funziona finché la sessione Google del browser è attiva; altrimenti l'utente
 * deve premere di nuovo "Connetti". Il token resta in memoria, mai su disco.
 * Richiede un Client ID OAuth di tipo "Web application" con l'origine dell'app autorizzata.
 */

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
}
interface TokenClient {
  requestAccessToken(overrides?: { prompt?: string }): void;
}
interface GoogleOAuth2 {
  initTokenClient(config: {
    client_id: string;
    scope: string;
    callback: (r: TokenResponse) => void;
    error_callback?: (e: { type: string }) => void;
  }): TokenClient;
  revoke(token: string, done?: () => void): void;
}
declare global {
  interface Window {
    google?: { accounts: { oauth2: GoogleOAuth2 } };
  }
}

let gisLoading: Promise<void> | null = null;

function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  gisLoading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      gisLoading = null;
      reject(new SyncError('offline', 'Impossibile caricare il servizio di accesso Google.'));
    };
    document.head.appendChild(s);
  });
  return gisLoading;
}

export class GisTokenProvider {
  private token: { value: string; expiresAt: number } | null = null;

  constructor(
    private readonly clientId: string,
    private readonly now: () => number = Date.now,
  ) {}

  get connected(): boolean {
    return this.token !== null && this.token.expiresAt > this.now();
  }

  /** Da chiamare in risposta a un clic dell'utente (il popup altrimenti viene bloccato). */
  connect(): Promise<void> {
    return this.request('').then(() => undefined);
  }

  /** Token valido; se scaduto tenta un rinnovo silenzioso. */
  getToken = async (): Promise<string> => {
    if (this.token && this.token.expiresAt - 60_000 > this.now()) return this.token.value;
    return this.request('none'); // 'none' = nessuna interfaccia: fallisce se serve l'utente
  };

  async disconnect(): Promise<void> {
    const t = this.token?.value;
    this.token = null;
    if (t) {
      await loadGis().catch(() => undefined);
      window.google?.accounts.oauth2.revoke(t);
    }
  }

  private async request(prompt: string): Promise<string> {
    await loadGis();
    const oauth2 = window.google?.accounts.oauth2;
    if (!oauth2) throw new SyncError('auth', 'Servizio di accesso Google non disponibile.');
    return new Promise<string>((resolve, reject) => {
      const client = oauth2.initTokenClient({
        client_id: this.clientId,
        scope: DRIVE_APPDATA_SCOPE,
        callback: (r) => {
          if (!r.access_token) {
            reject(new SyncError('auth', `Accesso a Google non riuscito${r.error ? ` (${r.error})` : ''}.`));
            return;
          }
          this.token = { value: r.access_token, expiresAt: this.now() + (r.expires_in ?? 3600) * 1000 };
          resolve(r.access_token);
        },
        error_callback: (e) => reject(new SyncError('auth', `Accesso a Google annullato o bloccato (${e.type}).`)),
      });
      client.requestAccessToken({ prompt });
    });
  }
}
