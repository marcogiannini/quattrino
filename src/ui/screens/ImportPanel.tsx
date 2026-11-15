import { useMemo, useRef, useState } from 'react';
import {
  detectColumns,
  MAX_IMPORT_BYTES,
  parseCsv,
  planImport,
  type DateOrder,
  type ParsedCsv,
  type UnknownCategoryPolicy,
  type ColumnMap,
} from '../../core/csvImport';
import { dateLabel } from '../../core/dates';
import type { Ledger } from '../../core/ledger';
import { builtinAliases } from '../../i18n';
import { categoryName, errorText, money, useT } from '../common';

/** UTF-8 se valido, altrimenti Windows-1252 (tipico degli estratti conto esportati da Excel o dalle banche). */
function decode(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

export function ImportPanel({ ledger }: { ledger: Ledger }) {
  const t = useT(ledger);
  const file = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<{ csv: ParsedCsv; cols: ColumnMap } | null>(null);
  const [dateOrder, setDateOrder] = useState<DateOrder>('dmy');
  const [unknown, setUnknown] = useState<UnknownCategoryPolicy>('create');
  const [skipDup, setSkipDup] = useState(true);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const plan = useMemo(
    () =>
      parsed
        ? planImport(parsed.csv, parsed.cols, ledger.categories(), ledger.transactions(), {
            dateOrder,
            unknownCategory: unknown,
            aliases: builtinAliases(),
          })
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [parsed, dateOrder, unknown, ledger.revision],
  );

  const analyze = async () => {
    setParsed(null);
    const f = file.current?.files?.[0];
    if (!f) return setMsg({ ok: false, text: t('bk.pickFile') });
    if (f.size > MAX_IMPORT_BYTES) return setMsg({ ok: false, text: t('im.tooBig') });
    try {
      const csv = parseCsv(decode(new Uint8Array(await f.arrayBuffer())));
      const cols = detectColumns(csv.header);
      if (!cols) return setMsg({ ok: false, text: t('im.noColumns') });
      if (csv.rows.length === 0) return setMsg({ ok: false, text: t('im.empty') });
      setMsg(null);
      setParsed({ csv, cols });
    } catch (e) {
      setMsg({ ok: false, text: errorText(e, ledger) });
    }
  };

  const toImport = plan ? plan.items.filter((i) => !(skipDup && i.duplicate)) : [];
  const dups = plan ? plan.items.filter((i) => i.duplicate).length : 0;
  const lc = ledger.settings.locale;

  const commit = () => {
    if (!plan) return;
    try {
      const n = ledger.commitImport(plan, { skipDuplicates: skipDup });
      setParsed(null);
      if (file.current) file.current.value = '';
      setMsg({ ok: true, text: n === 0 ? t('im.nothing') : t('im.done', { n }) });
    } catch (e) {
      setMsg({ ok: false, text: errorText(e, ledger) });
    }
  };

  return (
    <div className="card">
      <h2>{t('im.title')}</h2>
      <p className="muted small">{t('im.help')}</p>
      <label>
        {t('im.file')}
        <input ref={file} type="file" accept=".csv,.txt,text/csv,text/plain" onChange={() => void analyze()} />
      </label>
      {parsed && plan && (
        <>
          <label>
            {t('im.dateOrder')}
            <select value={dateOrder} onChange={(e) => setDateOrder(e.target.value as DateOrder)}>
              <option value="dmy">{t('im.dmy')}</option>
              <option value="mdy">{t('im.mdy')}</option>
            </select>
          </label>
          <label>
            {t('im.unknown')}
            <select value={unknown} onChange={(e) => setUnknown(e.target.value as UnknownCategoryPolicy)}>
              <option value="create">{t('im.u.create')}</option>
              <option value="fallback">{t('im.u.fallback')}</option>
            </select>
          </label>
          <label style={{ flexDirection: 'row', display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={skipDup} onChange={(e) => setSkipDup(e.target.checked)} />
            {t('im.skipDup')}
          </label>

          <p role="status">
            <strong>{t('im.summary', { n: toImport.length })}</strong>
            {skipDup && dups > 0 ? t('im.summaryDup', { d: dups }) : ''}
            {plan.newCategories.length === 1 ? t('im.summaryNew1') : plan.newCategories.length > 1 ? t('im.summaryNew', { c: plan.newCategories.length }) : ''}
          </p>
          {plan.truncated && <p className="error">{t('im.truncated')}</p>}
          {plan.errors.length > 0 && (
            <div>
              <p className="error">{(plan.errors.length === 1 ? t('im.errors1') : t('im.errors', { n: plan.errors.length }))}</p>
              <ul className="small">
                {plan.errors.slice(0, 8).map((e) => (
                  <li key={`${e.line}-${e.code}`}>{t('im.line', { line: e.line, reason: t(`im.e.${e.code}`) })}</li>
                ))}
              </ul>
              {plan.errors.length > 8 && <p className="muted small">{t('im.moreErrors', { n: plan.errors.length - 8 })}</p>}
            </div>
          )}
          {toImport.length > 0 && (
            <>
              <h3>{t('im.sample')}</h3>
              <ul className="list small">
                {toImport.slice(0, 5).map((i) => (
                  <li key={i.line}>
                    <span className="grow">
                      {dateLabel(i.date, lc)} · {i.categoryId ? categoryName(t, ledger.category(i.categoryId)) : `${i.newCategory} (${t('im.new')})`}
                      {i.note ? ` · ${i.note}` : ''}
                    </span>
                    <span className={`num ${i.type === 'income' ? 'inc' : 'exp'}`}>
                      {i.type === 'income' ? '+' : '−'}
                      {money(ledger, i.amountCents)}
                    </span>
                  </li>
                ))}
              </ul>
              <button className="btn primary" onClick={commit}>{t('im.confirm', { n: toImport.length })}</button>
            </>
          )}
        </>
      )}
      {msg && <p className={msg.ok ? 'small' : 'error'} role="status">{msg.text}</p>}
    </div>
  );
}
