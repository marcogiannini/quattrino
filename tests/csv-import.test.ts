import { describe, expect, it } from 'vitest';
import { transactionsToCsv } from '../src/core/backup';
import { detectColumns, detectDelimiter, parseCsv, parseDate, parseSignedAmount, parseType, planImport, type PlanOptions } from '../src/core/csvImport';
import { builtinAliases, translator } from '../src/i18n';
import { newLedger } from './helpers';

const opts: PlanOptions = { dateOrder: 'dmy', unknownCategory: 'create', aliases: builtinAliases() };

async function plan(csv: string, o = opts) {
  const { ledger } = await newLedger();
  const parsed = parseCsv(csv);
  const cols = detectColumns(parsed.header)!;
  return { ledger, parsed, cols, plan: planImport(parsed, cols, ledger.categories(), ledger.transactions(), o) };
}

describe('lettura CSV', () => {
  it('riconosce il separatore e gestisce BOM, virgolette, a capo e virgolette doppie', () => {
    expect(detectDelimiter('a;b;c\n1;2;3')).toBe(';');
    expect(detectDelimiter('a,b,c')).toBe(',');
    expect(detectDelimiter('"a;b",c,d')).toBe(',');
    const p = parseCsv('﻿Data;Nota\r\n2026-01-01;"ciao; ""mondo""\nriga 2"\r\n\r\n2026-01-02;x');
    expect(p.header).toEqual(['Data', 'Nota']);
    expect(p.rows).toEqual([['2026-01-01', 'ciao; "mondo"\nriga 2'], ['2026-01-02', 'x']]);
  });
  it('riconosce le colonne in italiano e in inglese', () => {
    expect(detectColumns(['Data', 'Tipo', 'Categoria', 'Importo', 'Nota'])).toEqual({ date: 0, type: 1, category: 2, amount: 3, note: 4 });
    expect(detectColumns(['Description', 'Date', 'Amount'])).toEqual({ date: 1, amount: 2, type: null, category: null, note: 0 });
    expect(detectColumns(['Foo', 'Bar'])).toBeNull();
  });
  it('date: ISO, giorno/mese/anno, mese/giorno/anno; rifiuta date impossibili', () => {
    expect(parseDate('2026-11-05', 'dmy')).toBe('2026-11-05');
    expect(parseDate('05/11/2026', 'dmy')).toBe('2026-11-05');
    expect(parseDate('5.11.26', 'dmy')).toBe('2026-11-05');
    expect(parseDate('11/05/2026', 'mdy')).toBe('2026-11-05');
    expect(parseDate('31/02/2026', 'dmy')).toBeNull();
    expect(parseDate('13/13/2026', 'mdy')).toBeNull();
    expect(parseDate('ieri', 'dmy')).toBeNull();
  });
  it('importi con segno e formati diversi', () => {
    expect(parseSignedAmount('-12,50')).toEqual({ cents: 1250, negative: true });
    expect(parseSignedAmount('(1.234,56)')).toEqual({ cents: 123456, negative: true });
    expect(parseSignedAmount('12,50-')).toEqual({ cents: 1250, negative: true });
    expect(parseSignedAmount('+1,234.50')).toEqual({ cents: 123450, negative: false });
    expect(parseSignedAmount('€ 9')).toEqual({ cents: 900, negative: false });
    expect(parseSignedAmount('0')).toBeNull();
    expect(parseSignedAmount('abc')).toBeNull();
    expect(parseSignedAmount('')).toBeNull();
  });
  it('tipo: parole italiane e inglesi', () => {
    expect(parseType('Entrata')).toBe('income');
    expect(parseType(' expense ')).toBe('expense');
    expect(parseType('boh')).toBeNull();
  });
});

describe('piano di importazione', () => {
  it('importa con colonna tipo, categorie esistenti e nuove', async () => {
    const { plan: p } = await plan('Data;Tipo;Categoria;Importo;Nota\n01/11/2026;Uscita;Alimentari;12,50;spesa\n02/11/2026;Entrata;Stipendio;2.000,00;\n03/11/2026;Uscita;Cani;30;crocchette');
    expect(p.errors).toEqual([]);
    expect(p.items.map((i) => [i.date, i.type, i.amountCents, i.categoryId])).toEqual([
      ['2026-11-01', 'expense', 1250, 'cat-alimentari'],
      ['2026-11-02', 'income', 200000, 'cat-stipendio'],
      ['2026-11-03', 'expense', 3000, null],
    ]);
    expect(p.newCategories).toEqual([{ name: 'Cani', kind: 'expense' }]);
  });

  it('senza colonna tipo il segno decide; nomi inglesi delle categorie predefinite', async () => {
    const { plan: p } = await plan('Date,Amount,Category\n2026-11-01,-5.20,Groceries\n2026-11-02,100,Salary');
    expect(p.items.map((i) => [i.type, i.categoryId])).toEqual([['expense', 'cat-alimentari'], ['income', 'cat-stipendio']]);
  });

  it('segnala le righe non valide con numero di riga e importa le altre', async () => {
    const { plan: p } = await plan('Data;Importo\n01/11/2026;10\nxx;10\n02/11/2026;abc\n03/11/2026;\n04/11/2026;5');
    expect(p.items.map((i) => i.line)).toEqual([2, 6]);
    expect(p.errors).toEqual([{ line: 3, code: 'date' }, { line: 4, code: 'amount' }, { line: 5, code: 'missing' }]);
  });

  it('categorie sconosciute: crea oppure usa "Altre spese/entrate"', async () => {
    const { plan: p } = await plan('Data;Importo;Categoria\n01/11/2026;-5;Boh\n02/11/2026;7;Boh', { ...opts, unknownCategory: 'fallback' });
    expect(p.items.map((i) => i.categoryId)).toEqual(['cat-altro-spese', 'cat-altre-entrate']);
    expect(p.newCategories).toEqual([]);
  });

  it('formule neutralizzate in esportazione tornano normali in importazione', async () => {
    const { plan: p } = await plan("Data;Importo;Nota\n01/11/2026;-5;'=SOMMA(A1)");
    expect(p.items[0]!.note).toBe('=SOMMA(A1)');
  });

  it('note troppo lunghe vengono scartate', async () => {
    const { plan: p } = await plan(`Data;Importo;Nota\n01/11/2026;-5;${'x'.repeat(201)}`);
    expect(p.errors).toEqual([{ line: 2, code: 'note-too-long' }]);
  });

  it('commit: aggiunge movimenti e categorie in un solo passaggio, e un secondo import non duplica', async () => {
    const csv = 'Data;Tipo;Categoria;Importo;Nota\n01/11/2026;Uscita;Cani;30;crocchette\n01/11/2026;Uscita;Alimentari;3;caffè\n01/11/2026;Uscita;Alimentari;3;caffè';
    const { ledger, plan: p } = await plan(csv);
    const before = ledger.revision;
    expect(ledger.commitImport(p, { skipDuplicates: true })).toBe(3);
    expect(ledger.revision).toBe(before + 2); // categoria + movimenti (una sola scrittura)
    expect(ledger.transactions()).toHaveLength(3);
    const again = planImport(parseCsv(csv), detectColumns(parseCsv(csv).header)!, ledger.categories(), ledger.transactions(), opts);
    expect(again.items.every((i) => i.duplicate)).toBe(true);
    expect(ledger.commitImport(again, { skipDuplicates: true })).toBe(0);
    expect(ledger.transactions()).toHaveLength(3);
  });

  it('due righe identiche nel file sono legittime, ma la terza copia dopo due già presenti è nuova', async () => {
    const { ledger } = await newLedger();
    const csv = 'Data;Importo;Categoria\n01/11/2026;-3;Alimentari\n01/11/2026;-3;Alimentari\n01/11/2026;-3;Alimentari';
    const parsed = parseCsv(csv);
    const cols = detectColumns(parsed.header)!;
    ledger.addTransaction({ type: 'expense', amountCents: 300, categoryId: 'cat-alimentari', date: '2026-11-01' });
    ledger.addTransaction({ type: 'expense', amountCents: 300, categoryId: 'cat-alimentari', date: '2026-11-01' });
    const p = planImport(parsed, cols, ledger.categories(), ledger.transactions(), opts);
    expect(p.items.map((i) => i.duplicate)).toEqual([true, true, false]);
  });

  it('round trip: ciò che esporta Quattrino si reimporta identico (italiano e inglese)', async () => {
    for (const lang of ['it', 'en'] as const) {
      const { ledger } = await newLedger();
      ledger.addTransaction({ type: 'expense', amountCents: 1999, categoryId: 'cat-casa', date: '2026-11-01', note: '=cmd; "x"' });
      ledger.addTransaction({ type: 'income', amountCents: 250000, categoryId: 'cat-stipendio', date: '2026-11-02' });
      const csv = transactionsToCsv(ledger.transactions(), ledger.categories(), translator(lang));
      const fresh = (await newLedger()).ledger;
      const parsed = parseCsv(csv);
      const p = planImport(parsed, detectColumns(parsed.header)!, fresh.categories(), [], opts);
      expect(p.errors).toEqual([]);
      fresh.commitImport(p, { skipDuplicates: false });
      expect(fresh.transactions().map((t) => [t.date, t.type, t.amountCents, t.categoryId, t.note]).sort()).toEqual(
        ledger.transactions().map((t) => [t.date, t.type, t.amountCents, t.categoryId, t.note]).sort(),
      );
    }
  });

  it('non va in crash con input ostili', async () => {
    for (const bad of ['', '\0\0\0', '"""', 'Data;Importo\n"unclosed;5', 'Data;Importo\n;;;;;;;\n\n\n']) {
      const parsed = parseCsv(bad);
      const cols = detectColumns(parsed.header);
      if (cols) {
        const { ledger } = await newLedger();
        planImport(parsed, cols, ledger.categories(), [], opts);
      }
    }
    const { plan: p } = await plan('Data;Importo;Nota\n01/11/2026;99999999999999;x\n01/11/2026;-5;<script>alert(1)</script>');
    expect(p.errors).toEqual([{ line: 2, code: 'amount' }]);
    expect(p.items[0]!.note).toBe('<script>alert(1)</script>');
  });
});
