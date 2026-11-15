import { monthLabel } from '../core/dates';
import type { Ledger } from '../core/ledger';
import type { CategoryTotal, MonthPoint } from '../core/stats';
import { money } from './common';

/** Ripartizione per categoria: barre orizzontali in HTML (leggibili da screen reader, con valori in chiaro). */
export function CategoryBars({ ledger, rows }: { ledger: Ledger; rows: CategoryTotal[] }) {
  if (rows.length === 0) return <p className="empty">Nessun movimento nel periodo.</p>;
  return (
    <ul className="bars">
      {rows.map((r) => {
        const c = ledger.category(r.categoryId);
        return (
          <li key={r.categoryId}>
            <div className="head">
              <span>
                {c?.icon ?? '❔'} {c?.name ?? 'Categoria rimossa'}
              </span>
              <span className="num">
                <strong>{money(ledger, r.totalCents)}</strong> <span className="muted">· {Math.round(r.share * 100)}%</span>
              </span>
            </div>
            <div className="track" aria-hidden="true">
              <div className="fill" style={{ width: `${Math.max(2, r.share * 100)}%`, background: c?.color ?? '#868e96' }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Entrate e uscite per mese: barre affiancate in SVG con legenda testuale. */
export function MonthlyChart({ ledger, series }: { ledger: Ledger; series: MonthPoint[] }) {
  const W = 640;
  const H = 220;
  const pad = { l: 8, r: 8, t: 12, b: 26 };
  const max = Math.max(1, ...series.flatMap((p) => [p.incomeCents, p.expenseCents]));
  const gw = (W - pad.l - pad.r) / Math.max(1, series.length);
  const bw = Math.min(28, gw / 2.6);
  const y = (v: number) => H - pad.b - (v / max) * (H - pad.t - pad.b);
  const summary = series
    .map((p) => `${monthLabel(p.month, ledger.settings.locale, 'short')}: entrate ${money(ledger, p.incomeCents)}, uscite ${money(ledger, p.expenseCents)}`)
    .join('; ');
  return (
    <figure style={{ margin: 0 }}>
      <div className="legend">
        <span><i style={{ background: 'var(--inc)' }} />Entrate</span>
        <span><i style={{ background: 'var(--exp)' }} />Uscite</span>
      </div>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Entrate e uscite per mese. ${summary}`}>
        {[0.5, 1].map((f) => (
          <line key={f} x1={pad.l} x2={W - pad.r} y1={y(max * f)} y2={y(max * f)} stroke="var(--line)" />
        ))}
        <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} stroke="var(--line)" />
        {series.map((p, i) => {
          const cx = pad.l + gw * i + gw / 2;
          return (
            <g key={p.month}>
              <rect x={cx - bw - 1} y={y(p.incomeCents)} width={bw} height={y(0) - y(p.incomeCents)} rx={3} fill="var(--inc)" />
              <rect x={cx + 1} y={y(p.expenseCents)} width={bw} height={y(0) - y(p.expenseCents)} rx={3} fill="var(--exp)" />
              <text x={cx} y={H - 8} textAnchor="middle">{monthLabel(p.month, ledger.settings.locale, 'short')}</text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
