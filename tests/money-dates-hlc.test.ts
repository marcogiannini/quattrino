import { describe, expect, it } from 'vitest';
import { addMonths, isValidISODate, monthRange, monthsBetween, todayISO } from '../src/core/dates';
import { HybridClock, MAX_DRIFT_MS, SEED_HLC, maxHlc, parseHlc } from '../src/core/hlc';
import { centsToInput, formatCents, parseAmountToCents } from '../src/core/money';

describe('parseAmountToCents', () => {
  it.each([
    ['12', 1200],
    ['12,5', 1250],
    ['12.50', 1250],
    ['0,99', 99],
    ['1.234,56', 123456],
    ['1,234.56', 123456],
    ['1.234', 123400], // separatore delle migliaia all'italiana
    ['1.234.567', 123456700],
    [' 7,00 € ', 700],
    ['19.9', 1990],
  ])('accetta %s', (input, cents) => {
    expect(parseAmountToCents(input)).toBe(cents);
  });

  it.each(['', 'abc', '-5', '0', '0,00', '12,345', '1,2,3', '12..5', '1e3', '99999999999999'])(
    'rifiuta "%s"',
    (input) => {
      expect(parseAmountToCents(input)).toBeNull();
    },
  );

  it('evita gli errori di virgola mobile', () => {
    expect(parseAmountToCents('0,29')).toBe(29);
    expect(parseAmountToCents('1.15')).toBe(115);
  });

  it('formatta e rilegge gli importi', () => {
    expect(centsToInput(1250)).toBe('12,50');
    expect(centsToInput(5)).toBe('0,05');
    expect(formatCents(1234567, 'EUR', 'it-IT').replace(/\s/g, ' ')).toBe('12.345,67 €');
    expect(formatCents(5, 'EUR', 'it-IT').replace(/\s/g, ' ')).toBe('0,05 €');
    expect(parseAmountToCents(centsToInput(987654))).toBe(987654);
  });
});

describe('date', () => {
  it('valida le date di calendario reali', () => {
    expect(isValidISODate('2026-02-28')).toBe(true);
    expect(isValidISODate('2028-02-29')).toBe(true);
    expect(isValidISODate('2026-02-29')).toBe(false);
    expect(isValidISODate('2026-13-01')).toBe(false);
    expect(isValidISODate('26-01-01')).toBe(false);
  });
  it('calcola mesi e intervalli', () => {
    expect(addMonths('2026-11', 2)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(monthsBetween('2026-10', '2027-01')).toEqual(['2026-10', '2026-11', '2026-12', '2027-01']);
    expect(monthRange('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-31' });
    expect(todayISO(new Date(2026, 10, 5))).toBe('2026-11-05');
  });
});

describe('HybridClock', () => {
  it('emette timestamp strettamente crescenti anche con orologio fermo o che torna indietro', () => {
    let t = 1_800_000_000_000;
    const c = new HybridClock('aaaaaaaa', () => t);
    const a = c.tick();
    const b = c.tick();
    t -= 5000;
    const d = c.tick();
    expect(a < b).toBe(true);
    expect(b < d).toBe(true);
  });

  it('osserva i timestamp remoti e li supera', () => {
    const t = 1_800_000_000_000;
    const c1 = new HybridClock('aaaaaaaa', () => t);
    const c2 = new HybridClock('bbbbbbbb', () => t);
    const remote = c1.tick();
    c2.observe(remote);
    expect(c2.tick() > remote).toBe(true);
  });

  it('ignora timestamp remoti troppo nel futuro', () => {
    const t = 1_800_000_000_000;
    const c = new HybridClock('aaaaaaaa', () => t);
    const far = new HybridClock('bbbbbbbb', () => t + MAX_DRIFT_MS * 10).tick();
    c.observe(far);
    expect(c.tick() < far).toBe(true);
  });

  it('serializza in modo ordinabile e rilegge i campi', () => {
    const c = new HybridClock('0a1b2c3d', () => 1_800_000_000_123);
    const h = c.tick();
    expect(parseHlc(h)).toEqual({ wall: 1_800_000_000_123, counter: 0, node: '0a1b2c3d' });
    expect(h > SEED_HLC).toBe(true);
    expect(maxHlc([SEED_HLC, h])).toBe(h);
    expect(parseHlc('non-un-hlc')).toBeNull();
  });
});
