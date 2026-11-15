import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { todayISO } from '../src/core/dates';
import { App } from '../src/ui/App';
import { CategoryBars, MonthlyChart } from '../src/ui/charts';
import { BudgetScreen } from '../src/ui/screens/Budget';
import { Overview } from '../src/ui/screens/Overview';
import { SettingsScreen } from '../src/ui/screens/Settings';
import { StatsScreen } from '../src/ui/screens/Stats';
import { TransactionsScreen } from '../src/ui/screens/Transactions';
import { monthlySeries, sumByCategory } from '../src/core/stats';
import { newLedger } from './helpers';

const noSync = {
  status: 'off' as const,
  message: '',
  lastAt: null,
  report: null,
  clientId: '',
  wasEnabled: false,
  connect: async () => {},
  syncNow: async () => {},
  disconnect: async () => {},
};

async function filledLedger() {
  const { ledger } = await newLedger();
  const month = todayISO().slice(0, 7);
  ledger.addTransaction({ type: 'income', amountCents: 210000, categoryId: 'cat-stipendio', date: `${month}-01` });
  ledger.addTransaction({ type: 'expense', amountCents: 12345, categoryId: 'cat-alimentari', date: `${month}-02`, note: 'spesa <b>settimanale</b>' });
  ledger.addTransaction({ type: 'expense', amountCents: 50000, categoryId: 'cat-casa', date: `${month}-03` });
  ledger.setBudget('cat-alimentari', 10000);
  ledger.setBudget(null, 120000);
  return { ledger, month };
}

// Rendering lato server: verifica che ogni schermata si costruisca con dati reali senza eccezioni
// e mostri i valori attesi. Non sostituisce una prova interattiva nel browser.
describe('interfaccia (render di fumo)', () => {
  it('App: panoramica con totali, budget e movimenti', async () => {
    const { ledger } = await filledLedger();
    const html = renderToString(<App ledger={ledger} />);
    expect(html).toContain('Panoramica');
    expect(html).toContain('Aggiungi movimento');
    expect(html).toMatch(/2100,00\s*€/); // it-IT non raggruppa i numeri a 4 cifre
    expect(html).toMatch(/623,45\s*€/); // uscite del mese
    expect(html).toContain('Superato'); // budget alimentari 100€ < 123,45€
  });

  it('esegue l’escape del testo inserito dall’utente (nessuna iniezione HTML)', async () => {
    const { ledger, month } = await filledLedger();
    const html = renderToString(<TransactionsScreen ledger={ledger} month={month} onMonth={() => {}} onEdit={() => {}} />);
    expect(html).toContain('spesa &lt;b&gt;settimanale&lt;/b&gt;');
    expect(html).not.toContain('<b>settimanale</b>');
  });

  it('tutte le schermate si costruiscono, anche senza dati', async () => {
    for (const filled of [true, false]) {
      const { ledger, month } = filled ? await filledLedger() : { ...(await newLedger()), month: todayISO().slice(0, 7) };
      const noop = () => {};
      expect(renderToString(<Overview ledger={ledger} month={month} onMonth={noop} onEdit={noop} onOpenBudget={noop} onOpenTransactions={noop} />)).toContain('Panoramica');
      expect(renderToString(<StatsScreen ledger={ledger} month={month} onMonth={noop} />)).toContain('Per categoria');
      expect(renderToString(<BudgetScreen ledger={ledger} month={month} onMonth={noop} />)).toContain('Imposta un budget mensile');
      expect(renderToString(<SettingsScreen ledger={ledger} sync={noSync} />)).toContain('Sincronizzazione con Google Drive');
    }
  });

  it('i grafici descrivono i dati anche per le tecnologie assistive', async () => {
    const { ledger, month } = await filledLedger();
    const txs = ledger.transactions();
    const bars = renderToString(<CategoryBars ledger={ledger} rows={sumByCategory(txs, 'expense', `${month}-01`, `${month}-31`)} />);
    expect(bars).toContain('Casa');
    expect(bars).toMatch(/80(<!-- -->)?%/); // 500 / 623,45 = 80,2%
    const chart = renderToString(<MonthlyChart ledger={ledger} series={monthlySeries(txs, month, month)} />);
    expect(chart).toContain('role="img"');
    expect(chart).toContain('aria-label="Entrate e uscite per mese.');
  });
});
