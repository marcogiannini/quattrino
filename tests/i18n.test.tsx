import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { todayISO } from '../src/core/dates';
import { builtinAliases, categoryName, coreMessage, detectLocale, langOf, translator } from '../src/i18n';
import { App } from '../src/ui/App';
import { SettingsScreen } from '../src/ui/screens/Settings';
import { newLedger } from './helpers';

const noSync = { status: 'off' as const, message: '', lastAt: null, report: null, clientId: '', wasEnabled: false, connect: async () => {}, syncNow: async () => {}, disconnect: async () => {} };

describe('traduzioni', () => {
  it('lingua dal locale e dal browser', () => {
    expect(langOf('en-GB')).toBe('en');
    expect(langOf('en-US')).toBe('en');
    expect(langOf('it-IT')).toBe('it');
    expect(langOf('de-DE')).toBe('it');
    expect(detectLocale('en-US')).toBe('en-GB');
    expect(detectLocale('it-CH')).toBe('it-IT');
    expect(detectLocale('fr-FR')).toBe('en-GB');
  });
  it('sostituisce i parametri e lascia visibili quelli mancanti', () => {
    expect(translator('en')('bu.left', { amount: '€5' })).toBe('€5 left');
    expect(translator('it')('bu.left')).toBe('restano {amount}');
  });
  it('nessuna chiave inglese è vuota o identica per errore a quella italiana nelle sezioni principali', () => {
    const it = translator('it');
    const en = translator('en');
    for (const k of ['nav.home', 'app.add', 'bu.over', 'se.title', 'rc.title', 'im.title'] as const) {
      expect(en(k)).not.toBe('');
      expect(en(k)).not.toBe(it(k));
    }
  });
  it('categorie predefinite tradotte solo se non rinominate', async () => {
    const { ledger } = await newLedger();
    const en = translator('en');
    expect(categoryName(en, ledger.category('cat-alimentari'))).toBe('Groceries');
    ledger.updateCategory('cat-alimentari', { name: 'Spesa' });
    expect(categoryName(en, ledger.category('cat-alimentari'))).toBe('Spesa');
    const mine = ledger.addCategory({ name: 'Casa mia', kind: 'expense' });
    expect(categoryName(en, mine)).toBe('Casa mia');
    expect(builtinAliases().get('Groceries')).toBe('cat-alimentari');
  });
  it('messaggi d’errore del nucleo tradotti, sconosciuti invariati', async () => {
    const { ledger } = await newLedger();
    try {
      ledger.addTransaction({ type: 'expense', amountCents: 0, categoryId: 'cat-casa', date: '2026-01-01' });
    } catch (e) {
      expect(coreMessage('en', (e as Error).message)).toBe('Invalid amount.');
      expect(coreMessage('it', (e as Error).message)).toBe('Importo non valido.');
    }
    expect(coreMessage('en', 'qualcosa di nuovo')).toBe('qualcosa di nuovo');
  });
  it('tutti i messaggi di ValidationError del nucleo hanno una traduzione', async () => {
    const files = import.meta.glob('../src/core/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
    const src = Object.values(files).join('\n');
    const msgs = [...src.matchAll(/new ValidationError\('[a-z-]+',\s*'([^']+)'/g)].map((m) => m[1]!);
    expect(msgs.length).toBeGreaterThan(15);
    for (const m of msgs) expect(coreMessage('en', m), m).not.toBe(m);
  });
});

describe('interfaccia in inglese', () => {
  it('l’app si mostra in inglese con formati inglesi, e torna in italiano cambiando lingua', async () => {
    const { ledger } = await newLedger();
    const month = todayISO().slice(0, 7);
    ledger.addTransaction({ type: 'expense', amountCents: 123456, categoryId: 'cat-alimentari', date: `${month}-02` });
    ledger.updateSettings({ locale: 'en-GB' });
    const html = renderToString(<App ledger={ledger} />);
    expect(html).toContain('Overview');
    expect(html).toContain('Add transaction');
    expect(html).toContain('Groceries');
    expect(html).toContain('€1,234.56');
    expect(html).not.toContain('Panoramica');
    ledger.updateSettings({ locale: 'it-IT' });
    expect(renderToString(<App ledger={ledger} />)).toContain('Panoramica');
  });
  it('impostazioni: lingua, ricorrenze e importazione CSV (in entrambe le lingue)', async () => {
    const { ledger } = await newLedger();
    ledger.addRecurring({ type: 'expense', amountCents: 65000, categoryId: 'cat-casa', frequency: 'monthly', startDate: '2026-12-03', note: 'Affitto' });
    const itHtml = renderToString(<SettingsScreen ledger={ledger} sync={noSync} />);
    for (const s of ['Spese ricorrenti', 'Importa da CSV', 'Ogni mese', 'Affitto', 'Italiano', 'English']) expect(itHtml).toContain(s);
    ledger.updateSettings({ locale: 'en-GB' });
    const enHtml = renderToString(<SettingsScreen ledger={ledger} sync={noSync} />);
    for (const s of ['Recurring expenses', 'Import from CSV', 'Every month', 'Home', 'Language']) expect(enHtml).toContain(s);
  });
  it('la lingua scelta si propaga con la sincronizzazione (è un dato sincronizzato)', async () => {
    const a = (await newLedger()).ledger;
    const b = (await newLedger()).ledger;
    a.updateSettings({ locale: 'en-GB' });
    b.applyRemote(a.getSnapshot());
    expect(b.settings.locale).toBe('en-GB');
  });
  it('una nuova installazione parte nella lingua del browser', async () => {
    const { Ledger } = await import('../src/core/ledger');
    const { MemoryStorage } = await import('../src/storage/memory');
    expect((await Ledger.open(new MemoryStorage(), { locale: 'en-GB' })).settings.locale).toBe('en-GB');
  });
});
