'use client';

import { useMemo } from 'react';
import { AlertCircle, Clock, Package, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import { formatCell, humanize, money, timeAgo, visibleKeys } from '@/lib/format';
import type { Row } from '@/lib/erp';
import type { OutboxItem } from '@/lib/offline/outbox';

type Props = {
  tab: string;
  rows: Row[];
  loading: boolean;
  search: string;
  onSearch: (v: string) => void;
  createLabel?: string;
  onCreate: () => void;
  pending: OutboxItem[];
  onRetry: (id: string) => void;
  onDiscard: (id: string) => void;
  savedAt: number | null;
  fromCache: boolean;
};

export function RecordsView({ tab, rows, loading, search, onSearch, createLabel, onCreate, pending, onRetry, onDiscard, savedAt, fromCache }: Props) {
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? rows.filter(r => JSON.stringify(r).toLowerCase().includes(q)) : rows;
  }, [rows, search]);
  const keys = filtered.length ? visibleKeys(filtered[0]) : [];

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold md:text-2xl">{tab}</h1>
          <p className="mt-1 text-sm text-muted">{fromCache && savedAt ? `Saved copy from ${timeAgo(savedAt)}` : `Manage your ${tab.toLowerCase()}.`}</p>
        </div>
        {createLabel && <button onClick={onCreate} className="btn-primary hidden shrink-0 md:inline-flex"><Plus size={17} aria-hidden />{createLabel}</button>}
      </div>

      {pending.length > 0 && (
        <section className="card mb-4 border-warn/40 bg-warn-soft/40 p-3 md:p-4" aria-label="Waiting to sync">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-warn"><Clock size={16} aria-hidden />Waiting to sync ({pending.length})</h2>
          <ul className="space-y-2">
            {pending.map(p => (
              <li key={p.id} className="flex items-center justify-between gap-3 rounded-lg bg-surface p-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{p.label}</div>
                  <div className={`text-xs ${p.status === 'failed' || p.status === 'review' ? 'text-danger' : 'text-muted'}`}>
                    {p.status === 'failed' || p.status === 'review' ? <span className="inline-flex items-start gap-1"><AlertCircle size={13} className="mt-0.5 shrink-0" aria-hidden />{p.error}</span>
                      : p.status === 'sending' ? 'Sending…' : `Saved on this device ${timeAgo(p.createdAt)}`}
                  </div>
                </div>
                <div className="flex shrink-0">
                  {(p.status === 'failed' || p.status === 'review') && <button className="icon-btn" onClick={() => onRetry(p.id)} aria-label={`Retry ${p.label}`}><RefreshCw size={17} aria-hidden /></button>}
                  {p.status !== 'sending' && <button className="icon-btn" onClick={() => onDiscard(p.id)} aria-label={`Discard ${p.label}`}><Trash2 size={17} aria-hidden /></button>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-line p-3 md:p-4">
          <div className="relative min-w-0 flex-1 md:max-w-sm">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
            <input type="search" value={search} onChange={e => onSearch(e.target.value)} placeholder={`Search ${tab.toLowerCase()}`} aria-label={`Search ${tab}`} className="field pl-9" />
          </div>
          <span className="num shrink-0 text-xs text-muted" aria-live="polite">{filtered.length} records</span>
        </div>

        {loading && !rows.length ? (
          <div className="space-y-3 p-4" aria-busy="true">{[0, 1, 2, 3].map(i => <div key={i} className="skeleton h-12" />)}</div>
        ) : filtered.length ? (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface2 text-xs uppercase tracking-wider text-muted">
                  <tr>{keys.map(k => <th scope="col" className="px-4 py-3 font-semibold" key={k}>{humanize(k)}</th>)}</tr>
                </thead>
                <tbody>
                  {filtered.map((row, i) => (
                    <tr key={row.id ?? i} className="border-t border-line hover:bg-surface2/60">
                      {keys.map((k, n) => <td className={`num px-4 py-3 ${n === 0 ? 'font-semibold' : 'text-muted'}`} key={k}>{formatCell(k, row[k])}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-line md:hidden">
              {filtered.map((row, i) => (
                <li key={row.id ?? i} className="p-4">
                  <div className="font-semibold">{formatCell(keys[0], row[keys[0]])}</div>
                  <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2">
                    {keys.slice(1, 7).map(k => (
                      <div key={k} className="min-w-0"><dt className="text-[11px] uppercase tracking-wide text-muted">{humanize(k)}</dt><dd className="num truncate text-sm">{formatCell(k, row[k])}</dd></div>
                    ))}
                  </dl>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <div className="grid min-h-[260px] place-items-center px-5 py-10 text-center">
            <div>
              <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-surface2 text-muted"><Package size={22} aria-hidden /></div>
              <div className="font-semibold">{search ? 'No matches' : `No ${tab.toLowerCase()} yet`}</div>
              <p className="mt-1 max-w-sm text-sm text-muted">{search ? 'Try a different search.' : 'Create your first record to start seeing it here.'}</p>
              {createLabel && !search && <button onClick={onCreate} className="btn-primary mt-4">{createLabel}</button>}
            </div>
          </div>
        )}
      </div>

      {createLabel && (
        <button onClick={onCreate} aria-label={createLabel}
          className="btn-primary fixed bottom-[calc(72px+env(safe-area-inset-bottom))] right-4 z-10 h-14 w-14 rounded-full p-0 shadow-lg md:hidden lg:bottom-6">
          <Plus size={24} aria-hidden />
        </button>
      )}
    </div>
  );
}

export function ReportsView({ data }: { data: Row }) {
  const cards: [string, string | number][] = [
    ['Revenue', money(data.sales)], ['Purchases', money(data.purchases)], ['Cost of goods sold', money(data.cogs)], ['Gross profit', money(data.gross_profit)],
    ['Operating expenses', money(data.expenses)], ['Inventory value', money(data.stock_value)], ['Customers', data.customers || 0], ['Vendors', data.vendors || 0],
  ];
  return (
    <div>
      <h1 className="mb-4 text-xl font-bold md:text-2xl">Reports</h1>
      <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
        {cards.map(([label, value]) => <div key={label} className="card p-4 md:p-5"><div className="text-sm text-muted">{label}</div><div className="num mt-2 truncate text-xl font-bold md:text-2xl">{value}</div></div>)}
      </div>
    </div>
  );
}
