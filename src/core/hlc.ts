import type { Hlc } from './types';

/**
 * Hybrid Logical Clock serializzato come stringa ordinabile lessicograficamente:
 *   <ms 13 cifre>-<contatore 5 cifre>-<deviceId>
 * Garantisce un ordine totale e deterministico tra dispositivi anche con orologi
 * leggermente sfasati: serve alla regola "l'ultima modifica vince".
 */

export const SEED_HLC: Hlc = '0000000000000-00000-seed';
/** Un orologio remoto più avanti di così rispetto al nostro viene ignorato. */
export const MAX_DRIFT_MS = 24 * 60 * 60 * 1000;

const HLC_RE = /^(\d{13})-(\d{5})-([A-Za-z0-9]+)$/;

export function parseHlc(h: Hlc): { wall: number; counter: number; node: string } | null {
  const m = HLC_RE.exec(h);
  if (!m) return null;
  return { wall: Number(m[1]), counter: Number(m[2]), node: m[3]! };
}

export function formatHlc(wall: number, counter: number, node: string): Hlc {
  if (counter > 99999) throw new Error('HLC counter overflow');
  return `${String(wall).padStart(13, '0')}-${String(counter).padStart(5, '0')}-${node}`;
}

export function maxHlc(values: Iterable<Hlc>): Hlc {
  let best: Hlc = SEED_HLC;
  for (const v of values) if (v > best) best = v;
  return best;
}

export class HybridClock {
  private wall = 0;
  private counter = 0;

  constructor(
    readonly deviceId: string,
    private readonly now: () => number = Date.now,
    last?: Hlc,
  ) {
    const p = last ? parseHlc(last) : null;
    if (p) {
      this.wall = p.wall;
      this.counter = p.counter;
    }
  }

  /** Nuovo timestamp, strettamente maggiore di tutti quelli emessi/osservati. */
  tick(): Hlc {
    const t = this.now();
    if (t > this.wall) {
      this.wall = t;
      this.counter = 0;
    } else {
      this.counter += 1;
    }
    return formatHlc(this.wall, this.counter, this.deviceId);
  }

  current(): Hlc {
    return formatHlc(this.wall, this.counter, this.deviceId);
  }

  /** Incorpora un timestamp remoto, ignorando valori palesemente nel futuro. */
  observe(remote: Hlc): void {
    const p = parseHlc(remote);
    if (!p) return;
    if (p.wall > this.now() + MAX_DRIFT_MS) return;
    if (p.wall > this.wall || (p.wall === this.wall && p.counter > this.counter)) {
      this.wall = p.wall;
      this.counter = p.counter;
    }
  }
}
