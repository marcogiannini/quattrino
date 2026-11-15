import { useMemo, useState } from 'react';
import { addMonths, monthLabel } from '../../core/dates';
import type { Ledger } from '../../core/ledger';
import { monthlySeries, sumByCategory, totals } from '../../core/stats';
import type { TxType } from '../../core/types';
import { MonthNav, money, useT } from '../common';
import { CategoryBars, MonthlyChart } from '../charts';

type Period = 'month' | 'last3' | 'last6' | 'last12' | 'year';

function bounds(period: Period, month: string): { from: string; to: string } {
  switch (period) {
    case 'month': return { from: month, to: month };
    case 'last3': return { from: addMonths(month, -2), to: month };
    case 'last6': return { from: addMonths(month, -5), to: month };
    case 'last12': return { from: addMonths(month, -11), to: month };
    case 'year': return { from: `${month.slice(0, 4)}-01`, to: `${month.slice(0, 4)}-12` };
  }
}

export function StatsScreen({ ledger, month, onMonth }: { ledger: Ledger; month: string; onMonth: (m: string) => void }) {
  const t = useT(ledger);
  const [period, setPeriod] = useState<Period>('month');
  const [type, setType] = useState<TxType>('expense');
  const txs = ledger.transactions();
  const { from, to } = bounds(period, month);

  const data = useMemo(() => {
    const range = { from: `${from}-01`, to: `${to}-31` };
    // Con un solo mese il confronto mensile mostra comunque gli ultimi sei mesi.
    const series = period === 'month' ? monthlySeries(txs, addMonths(month, -5), month) : monthlySeries(txs, from, to);
    return {
      tot: totals(txs, range.from, range.to),
      rows: sumByCategory(txs, type, range.from, range.to),
      series,
    };
  }, [txs, period, type, month, from, to]);

  const loc = ledger.settings.locale;
  const label = from === to ? monthLabel(from, loc) : `${monthLabel(from, loc)} – ${monthLabel(to, loc)}`;

  return (
    <>
      <h1>{t('st.title')}</h1>
      <MonthNav month={month} onChange={onMonth} locale={loc} />
      <label>
        {t('st.period')}
        <select value={period} onChange={(e) => setPeriod(e.target.value as Period)}>
          <option value="month">{t('st.p.month')}</option>
          <option value="last3">{t('st.p.last3')}</option>
          <option value="last6">{t('st.p.last6')}</option>
          <option value="last12">{t('st.p.last12')}</option>
          <option value="year">{t('st.p.year')}</option>
        </select>
      </label>
      <p className="muted small" style={{ textTransform: 'capitalize' }}>{label}</p>

      <div className="grid3">
        <div className="stat"><div className="label">{t('common.income')}</div><div className="value num inc">{money(ledger, data.tot.incomeCents)}</div></div>
        <div className="stat"><div className="label">{t('common.expenses')}</div><div className="value num exp">{money(ledger, data.tot.expenseCents)}</div></div>
        <div className="stat"><div className="label">{t('st.diff')}</div><div className="value num">{money(ledger, data.tot.netCents)}</div></div>
      </div>

      <div className="card">
        <h2>{t('st.monthly')}</h2>
        <MonthlyChart ledger={ledger} series={data.series} />
      </div>

      <div className="card">
        <h2>{t('st.byCategory')}</h2>
        <div className="seg" role="group" aria-label={t('sheet.kind')}>
          <button aria-pressed={type === 'expense'} onClick={() => setType('expense')}>{t('common.expenses')}</button>
          <button aria-pressed={type === 'income'} onClick={() => setType('income')}>{t('common.income')}</button>
        </div>
        <CategoryBars ledger={ledger} rows={data.rows} />
      </div>
    </>
  );
}
