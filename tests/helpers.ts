import { Ledger } from '../src/core/ledger';
import { MemoryStorage } from '../src/storage/memory';

/** Orologio controllabile per test deterministici. */
export function fakeClock(start = Date.UTC(2026, 10, 1, 10, 0, 0)) {
  let t = start;
  return { now: () => t, advance: (ms = 1000) => (t += ms) };
}

export async function newLedger(now?: () => number): Promise<{ ledger: Ledger; storage: MemoryStorage }> {
  const storage = new MemoryStorage();
  const ledger = await Ledger.open(storage, { now });
  return { ledger, storage };
}

export function containsText(bytes: Uint8Array, text: string): boolean {
  const needle = new TextEncoder().encode(text);
  outer: for (let i = 0; i + needle.length <= bytes.length; i++) {
    for (let j = 0; j < needle.length; j++) if (bytes[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
}

export const bytesEqual = (a: Uint8Array, b: Uint8Array): boolean =>
  a.length === b.length && a.every((x, i) => x === b[i]);

/** Passphrase e iterazioni ridotte: i test non devono aspettare 600.000 giri di PBKDF2. */
export const TEST_ITER = 1_000;
