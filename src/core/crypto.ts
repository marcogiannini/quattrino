/**
 * Cifratura end-to-end con passphrase: PBKDF2-HMAC-SHA256 -> AES-256-GCM (WebCrypto).
 * Il cloud vede solo byte cifrati. Formato del blob:
 *   "QTR1" (4) | iterazioni u32 BE (4) | salt (16) | iv (12) | ciphertext+tag
 * Magic, iterazioni e salt sono autenticati come AAD: modificare l'intestazione fa fallire la decifratura.
 */

export const DEFAULT_KDF_ITERATIONS = 600_000;
const MIN_ITERATIONS = 1_000;
const MAX_ITERATIONS = 5_000_000; // difesa contro file ostili che bloccherebbero il dispositivo
const MAGIC = [0x51, 0x54, 0x52, 0x31]; // "QTR1"
const AAD_LEN = 4 + 4 + 16;
const HEADER_LEN = AAD_LEN + 12;

export class CryptoError extends Error {
  constructor(
    readonly code: 'bad-format' | 'bad-params' | 'auth-failed',
    message: string,
  ) {
    super(message);
    this.name = 'CryptoError';
  }
}

const subtle = (): SubtleCrypto => globalThis.crypto.subtle;
const random = (n: number): Uint8Array => globalThis.crypto.getRandomValues(new Uint8Array(n));
const hex = (b: Uint8Array): string => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');

export function isEncryptedBlob(bytes: Uint8Array): boolean {
  return bytes.length > HEADER_LEN && MAGIC.every((m, i) => bytes[i] === m);
}

async function deriveKey(passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const material = await subtle().importKey(
    'raw',
    new TextEncoder().encode(passphrase.normalize('NFKC')),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return subtle().deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export class PassphraseCipher {
  private readonly keys = new Map<string, Promise<CryptoKey>>();
  private readonly ownSalt = random(16);

  constructor(
    private readonly passphrase: string,
    private readonly iterations = DEFAULT_KDF_ITERATIONS,
  ) {
    if (passphrase.length === 0) throw new CryptoError('bad-params', 'La passphrase non può essere vuota.');
    if (iterations < MIN_ITERATIONS || iterations > MAX_ITERATIONS) {
      throw new CryptoError('bad-params', 'Numero di iterazioni non valido.');
    }
  }

  private key(salt: Uint8Array, iterations: number): Promise<CryptoKey> {
    const k = `${iterations}:${hex(salt)}`;
    let p = this.keys.get(k);
    if (!p) {
      p = deriveKey(this.passphrase, salt, iterations);
      this.keys.set(k, p);
    }
    return p;
  }

  async encrypt(plain: Uint8Array): Promise<Uint8Array> {
    const header = new Uint8Array(HEADER_LEN);
    header.set(MAGIC, 0);
    new DataView(header.buffer).setUint32(4, this.iterations, false);
    header.set(this.ownSalt, 8);
    header.set(random(12), AAD_LEN); // IV nuovo a ogni cifratura
    const key = await this.key(this.ownSalt, this.iterations);
    const ct = new Uint8Array(
      await subtle().encrypt(
        { name: 'AES-GCM', iv: header.slice(AAD_LEN) as BufferSource, additionalData: header.slice(0, AAD_LEN) as BufferSource },
        key,
        plain as BufferSource,
      ),
    );
    const out = new Uint8Array(HEADER_LEN + ct.length);
    out.set(header, 0);
    out.set(ct, HEADER_LEN);
    return out;
  }

  async decrypt(blob: Uint8Array): Promise<Uint8Array> {
    if (!isEncryptedBlob(blob)) throw new CryptoError('bad-format', 'Formato del file non riconosciuto.');
    const iterations = new DataView(blob.buffer, blob.byteOffset, blob.byteLength).getUint32(4, false);
    if (iterations < MIN_ITERATIONS || iterations > MAX_ITERATIONS) {
      throw new CryptoError('bad-params', 'Parametri di cifratura non validi.');
    }
    const salt = blob.slice(8, 24);
    const iv = blob.slice(AAD_LEN, HEADER_LEN);
    const key = await this.key(salt, iterations);
    try {
      return new Uint8Array(
        await subtle().decrypt(
          { name: 'AES-GCM', iv: iv as BufferSource, additionalData: blob.slice(0, AAD_LEN) as BufferSource },
          key,
          blob.slice(HEADER_LEN) as BufferSource,
        ),
      );
    } catch {
      throw new CryptoError('auth-failed', 'Passphrase errata oppure dati alterati.');
    }
  }
}

export const utf8 = {
  enc: (s: string): Uint8Array => new TextEncoder().encode(s),
  dec: (b: Uint8Array): string => new TextDecoder('utf-8', { fatal: true }).decode(b),
};
