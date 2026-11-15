/** Importo massimo accettato: 999.999.999,99 */
export const MAX_CENTS = 99_999_999_999;

/**
 * Converte testo digitato dall'utente in centesimi interi.
 * Accetta "12", "12,5", "12.50", "1.234,56", "1,234.56", "1.234" (= mille duecento trentaquattro).
 * Restituisce null se il testo non è un importo valido e positivo.
 */
export function parseAmountToCents(input: string): number | null {
  let s = input.trim().replace(/\s/g, '').replace(/[€$£]/g, '');
  if (!/^\d[\d.,]*$/.test(s)) return null;

  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  let intPart: string;
  let decPart = '';

  if (lastComma !== -1 && lastDot !== -1) {
    // Entrambi presenti: l'ultimo è il separatore decimale.
    const decIdx = Math.max(lastComma, lastDot);
    intPart = s.slice(0, decIdx).replace(/[.,]/g, '');
    decPart = s.slice(decIdx + 1);
  } else if (lastComma !== -1) {
    if ((s.match(/,/g) ?? []).length > 1) return null;
    intPart = s.slice(0, lastComma);
    decPart = s.slice(lastComma + 1);
  } else if (lastDot !== -1) {
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
      intPart = s.replace(/\./g, ''); // separatore delle migliaia
    } else {
      if ((s.match(/\./g) ?? []).length > 1) return null;
      intPart = s.slice(0, lastDot);
      decPart = s.slice(lastDot + 1);
    }
  } else {
    intPart = s;
  }

  if (!/^\d+$/.test(intPart) || (decPart !== '' && !/^\d{1,2}$/.test(decPart))) return null;
  const cents = Number(intPart) * 100 + Number(decPart.padEnd(2, '0') || '0');
  if (!Number.isSafeInteger(cents) || cents <= 0 || cents > MAX_CENTS) return null;
  return cents;
}

export function formatCents(cents: number, currency = 'EUR', locale = 'it-IT'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(cents / 100);
}

/** Testo per un campo di input (senza simbolo di valuta): 1250 -> "12,50". */
export function centsToInput(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`;
}
