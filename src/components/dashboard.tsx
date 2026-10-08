'use client';

import dynamic from 'next/dynamic';
import { Activity, AlertTriangle, ArrowDownToLine, Package, ShoppingCart, Users, Wallet } from 'lucide-react';
import { money } from '@/lib/format';
import type { Row } from '@/lib/erp';

const StockChart = dynamic(() => import('./stock-chart'), { ssr: false, loading: () => <div className="skeleton h-full w-full" /> });

type Props = { data: Row; items: Row[]; loading: boolean; onGo: (tab: string, create?: boolean) => void };

export function Dashboard({ data, items, loading, onGo }: Props) {
  const kpis = [
    { label: 'Total sales', value: data.sales, icon: ShoppingCart },
    { label: 'Purchases', value: data.purchases, icon: ArrowDownToLine },
    { label: 'Gross profit', value: data.gross_profit, icon: Activity },
    { label: 'Expenses', value: data.expenses, icon: Wallet },
  ];
  const lowStock = items.filter(i => Number(i.reorder_level) > 0 && Number(i.qty) <= Number(i.reorder_level));
  const margin = data.gross_sales ? Math.max(0, Math.min(100, (Number(data.gross_profit) / Number(data.gross_sales)) * 100)) : 0;
  const chart = items.slice(0, 8).map(x => ({ name: String(x.name), qty: Number(x.qty) }));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold md:text-2xl">Business overview</h1>
        <p className="mt-1 text-sm text-muted">{new Date().toLocaleDateString('en-PK', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4 md:gap-4">
        {kpis.map(({ label, value, icon: Icon }) => (
          <div className="card p-4 md:p-5" key={label}>
            <div className="flex items-center justify-between gap-2"><span className="text-sm text-muted">{label}</span><Icon size={18} className="shrink-0 text-accent" aria-hidden /></div>
            {loading ? <div className="skeleton mt-3 h-8 w-3/4" /> : <div className="num mt-3 truncate text-xl font-bold md:text-2xl">{money(value)}</div>}
            <div className="mt-1 text-xs text-muted">All time</div>
          </div>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <section className="card p-4 md:p-5 xl:col-span-2" aria-labelledby="stock-h">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div><h2 id="stock-h" className="font-semibold">Inventory snapshot</h2><p className="mt-1 text-xs text-muted">Stock quantity by item</p></div>
            <button onClick={() => onGo('Inventory')} className="min-h-[44px] shrink-0 px-1 text-sm font-semibold text-accent">View all</button>
          </div>
          <div className="h-[240px] text-muted md:h-[290px]" role="img" aria-label="Bar chart of stock quantity by item">
            {chart.length ? <StockChart data={chart} /> : <div className="grid h-full place-items-center text-sm">{loading ? <div className="skeleton h-full w-full" /> : 'Add inventory items to see your stock'}</div>}
          </div>
        </section>

        <section className="card p-4 md:p-5" aria-labelledby="glance-h">
          <h2 id="glance-h" className="font-semibold">At a glance</h2>
          <dl className="mt-3">
            {[['Inventory value', money(data.stock_value)], ['Active products', items.length], ['Customers', data.customers || 0], ['Vendors', data.vendors || 0]].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between border-b border-line py-3 last:border-0"><dt className="text-sm text-muted">{k}</dt><dd className="num text-sm font-semibold">{v}</dd></div>
            ))}
          </dl>
        </section>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <section className="card p-4 md:p-5" aria-labelledby="quick-h">
          <h2 id="quick-h" className="mb-3 font-semibold">Quick actions</h2>
          <div className="grid grid-cols-2 gap-3">
            {([['New sale', 'Sales', ShoppingCart], ['New purchase', 'Purchases', ArrowDownToLine], ['Add item', 'Inventory', Package], ['Add customer', 'Customers', Users]] as const).map(([label, page, Icon]) => (
              <button key={label} onClick={() => onGo(page, true)} className="flex min-h-[56px] items-center gap-3 rounded-xl border border-line bg-surface2 p-3 text-left transition-colors hover:border-accent">
                <Icon size={18} className="shrink-0 text-accent" aria-hidden /><span className="text-sm font-semibold">{label}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="card p-4 md:p-5" aria-labelledby="low-h">
          <h2 id="low-h" className="flex items-center gap-2 font-semibold">{lowStock.length > 0 && <AlertTriangle size={17} className="text-warn" aria-hidden />}Low stock</h2>
          {lowStock.length ? (
            <ul className="mt-2">
              {lowStock.slice(0, 5).map(i => (
                <li key={i.id} className="flex items-center justify-between border-b border-line py-2.5 text-sm last:border-0"><span className="truncate pr-3">{i.name}</span><span className="num badge bg-warn-soft text-warn">{i.qty} {i.unit}</span></li>
              ))}
            </ul>
          ) : <p className="mt-2 text-sm text-muted">Nothing is below its reorder level.</p>}
          <div className="mt-4 border-t border-line pt-4">
            <div className="flex items-baseline justify-between text-sm"><span className="text-muted">Gross margin</span><span className="num font-semibold">{margin.toFixed(1)}%</span></div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface2" role="presentation"><div className="h-full rounded-full bg-accent" style={{ width: `${margin}%` }} /></div>
          </div>
        </section>
      </div>
    </div>
  );
}
