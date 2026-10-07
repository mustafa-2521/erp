'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Activity, ArrowDownToLine, Boxes, BriefcaseBusiness, BookOpen, CircleHelp, Factory, FileBarChart, LayoutDashboard, Menu, Package, Plus, Receipt, Search, ShoppingCart, Truck, Users, Wallet, X } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
const money = (v: any) => `Rs. ${Number(v || 0).toLocaleString('en-PK', { maximumFractionDigits: 0 })}`;
const nav = [
  { name: 'Dashboard', icon: LayoutDashboard }, { name: 'Sales', icon: ShoppingCart },
  { name: 'Purchases', icon: Receipt }, { name: 'Recipes', icon: BookOpen }, { name: 'Production', icon: Factory },
  { name: 'Inventory', icon: Boxes }, { name: 'Customers', icon: Users },
  { name: 'Vendors', icon: Truck }, { name: 'Expenses', icon: Wallet },
  { name: 'Accounts', icon: BriefcaseBusiness }, { name: 'Reports', icon: FileBarChart },
];
const endpoint: Record<string, string> = { Sales: 'sales', Purchases: 'purchases', Recipes: 'recipes', Production: 'production', Inventory: 'items', Customers: 'customers', Vendors: 'vendors', Expenses: 'expenses', Accounts: 'ledger' };

export default function Home() {
  const [tab, setTab] = useState('Dashboard');
  const [data, setData] = useState<any>({});
  const [items, setItems] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [recipes, setRecipes] = useState<any[]>([]);
  const [records, setRecords] = useState<any[]>([]);
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>({ lines: [{ itemId: '', qty: '', rate: '' }] });

  const load = useCallback(async () => {
    setError('');
    try {
      const [d, i, c, v, r] = await Promise.all(['dashboard', 'items', 'customers', 'vendors', 'recipes'].map(async path => {
        const res = await fetch(`${API}/${path}`);
        if (!res.ok) throw new Error(`API error (${res.status})`);
        return res.json();
      }));
      setData(d); setItems(i); setCustomers(c); setVendors(v); setRecipes(r);
    } catch (e: any) { setError(e.message || 'Cannot connect to the API. Start the database and run npm run dev.'); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (tab === 'Dashboard' || tab === 'Reports') { setRecords([]); return; }
    fetch(`${API}/${endpoint[tab]}`).then(async response => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || 'Could not load records.');
      setRecords(Array.isArray(body) ? body : []);
    }).catch(e => setError(e.message || 'Could not load records.'));
  }, [tab]);

  const rows = records;
  const filtered = useMemo(() => rows.filter((row: any) => JSON.stringify(row).toLowerCase().includes(search.toLowerCase())), [rows, search]);
  const startCreate = () => { setForm({ lines: [{ itemId: '', qty: '', rate: '' }], paymentMethod: 'CASH' }); setModal(true); };
  const setField = (key: string, value: any) => setForm((prev: any) => ({ ...prev, [key]: value }));
  const updateLine = (index: number, key: string, value: any) => setForm((prev: any) => ({ ...prev, lines: prev.lines.map((line: any, n: number) => n === index ? { ...line, [key]: value } : line) }));
  const submit = async (event: any) => {
    event.preventDefault(); setSaving(true); setError('');
    try {
      let url = endpoint[tab];
      if (tab === 'Inventory') url = 'items';
      const payload = { ...form };
      if (['Sales', 'Purchases'].includes(tab)) payload.lines = payload.lines.map((l: any) => ({ ...l, itemId: Number(l.itemId), qty: Number(l.qty), rate: Number(l.rate) }));
      if (tab === 'Recipes') payload.lines = payload.lines.map((l: any) => ({ ...l, itemId: Number(l.itemId), qty: Number(l.qty) }));
      if (['Sales', 'Purchases', 'Recipes'].includes(tab)) { if (payload.customerId) payload.customerId = Number(payload.customerId); if (payload.vendorId) payload.vendorId = Number(payload.vendorId); if (payload.outputItemId) payload.outputItemId = Number(payload.outputItemId); if (payload.recipeId) payload.recipeId = Number(payload.recipeId); }
      const response = await fetch(`${API}/${url}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || 'Could not save this record.');
      setModal(false); setToast(`${tab === 'Inventory' ? 'Item' : tab === 'Recipes' ? 'Recipe' : tab.slice(0, -1)} saved successfully`); setTimeout(() => setToast(''), 3500); await load();
      if (endpoint[tab]) { const refreshed = await fetch(`${API}/${endpoint[tab]}`).then(res => res.json()); setRecords(Array.isArray(refreshed) ? refreshed : []); }
    } catch (e: any) { setError(e.message || 'Could not save this record.'); }
    finally { setSaving(false); }
  };
  const formatCell = (key: string, value: any) => {
    if (value === null || value === undefined || value === '') return '—';
    if (typeof value === 'object') return value.name || value.invoiceNo || `${value.length} lines`;
    if (/total|amount|balance|paid|received|cost|rate|debit|credit|value|profit/i.test(key) && !['costPerKg'].includes(key)) return money(value);
    if (/date|createdAt/i.test(key)) return new Date(value).toLocaleDateString('en-PK');
    if (typeof value === 'number' && Number.isInteger(value)) return value;
    return String(value);
  };
  const keys = (row: any) => Object.keys(row || {}).filter(k => !['id', 'vendorId', 'customerId', 'recipeId', 'outputItemId', 'itemId', 'createdAt', 'updatedAt', 'passwordHash'].includes(k)).slice(0, 7);

  const fields: Record<string, any[]> = {
    Sales: [{ key: 'customerId', label: 'Customer', type: 'select', options: customers.map(x => [x.id, `${x.name} (${x.code})`]) }, { key: 'received', label: 'Received amount', type: 'number' }, { key: 'paymentMethod', label: 'Payment method', type: 'select', options: ['CASH', 'BANK', 'CREDIT'].map(x => [x, x]) }, { key: 'notes', label: 'Notes' }],
    Purchases: [{ key: 'vendorId', label: 'Vendor', type: 'select', options: vendors.map(x => [x.id, `${x.name} (${x.code})`]) }, { key: 'paid', label: 'Paid amount', type: 'number' }, { key: 'notes', label: 'Notes' }],
    Customers: [{ key: 'code', label: 'Customer code' }, { key: 'name', label: 'Customer name' }, { key: 'phone', label: 'Phone' }, { key: 'address', label: 'Address' }, { key: 'openingBalance', label: 'Opening balance', type: 'number' }],
    Vendors: [{ key: 'code', label: 'Vendor code' }, { key: 'name', label: 'Vendor name' }, { key: 'phone', label: 'Phone' }, { key: 'address', label: 'Address' }, { key: 'openingBalance', label: 'Opening balance', type: 'number' }],
    Inventory: [{ key: 'sku', label: 'SKU / item code' }, { key: 'name', label: 'Item name' }, { key: 'type', label: 'Item type', type: 'select', options: ['RAW', 'FINISHED', 'SERVICE'].map(x => [x, x]) }, { key: 'unit', label: 'Unit', placeholder: 'KG' }, { key: 'reorderLevel', label: 'Reorder level', type: 'number' }, { key: 'avgSellingRate', label: 'Selling price', type: 'number' }],
    Expenses: [{ key: 'category', label: 'Category' }, { key: 'description', label: 'Description' }, { key: 'amount', label: 'Amount', type: 'number' }, { key: 'paymentMethod', label: 'Payment method', type: 'select', options: ['CASH', 'BANK'].map(x => [x, x]) }],
    Production: [{ key: 'recipeId', label: 'Recipe', type: 'select', options: recipes.map(x => [x.id, x.name]) }, { key: 'plannedQty', label: 'Planned output quantity', type: 'number' }, { key: 'goodQty', label: 'Good output quantity', type: 'number' }],
    Recipes: [{ key: 'name', label: 'Recipe name' }, { key: 'outputItemId', label: 'Finished item', type: 'select', options: items.filter(x => x.type === 'FINISHED').map(x => [x.id, x.name]) }, { key: 'outputQty', label: 'Output quantity', type: 'number' }],
  };
  const createLabel: Record<string, string> = { Sales: 'New sale', Purchases: 'New purchase', Recipes: 'Add recipe', Production: 'Start batch', Inventory: 'Add item', Customers: 'Add customer', Vendors: 'Add vendor', Expenses: 'Add expense' };

  return <div className="min-h-screen bg-[#f6f7fb] text-slate-900">
    <aside className="sidebar fixed inset-y-0 left-0 z-20 hidden w-[250px] flex-col bg-[#111827] px-4 py-6 text-white lg:flex">
      <div className="mb-9 flex items-center gap-3 px-2"><div className="grid h-10 w-10 place-items-center rounded-xl bg-orange-500"><Package size={21}/></div><div><div className="font-bold tracking-wide">MUSTAFA INKS</div><div className="text-[10px] tracking-[.22em] text-slate-400">MANUFACTURING ERP</div></div></div>
      <div className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[.2em] text-slate-500">Workspace</div>
      <nav className="space-y-1">{nav.map(({ name, icon: Icon }) => <button key={name} onClick={() => { setTab(name); setSearch(''); setError(''); }} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm transition ${tab === name ? 'bg-orange-500 text-white shadow-lg shadow-orange-950/30' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}><Icon size={17}/>{name}</button>)}</nav>
      <div className="mt-auto rounded-2xl border border-slate-700 bg-slate-800/70 p-4"><div className="mb-2 flex items-center gap-2 text-sm font-semibold"><CircleHelp size={16} className="text-orange-400"/>Need help?</div><p className="text-xs leading-5 text-slate-400">Keep your inventory, sales and accounts up to date in one place.</p></div>
    </aside>
    <main className="lg:pl-[250px]">
      <header className="sticky top-0 z-10 flex h-[76px] items-center justify-between border-b border-slate-200 bg-white/95 px-5 backdrop-blur md:px-8">
        <div className="flex items-center gap-3"><button className="rounded-lg p-2 hover:bg-slate-100 lg:hidden" onClick={() => document.querySelector('.sidebar')?.classList.toggle('mobile-open')}><Menu size={20}/></button><div><div className="text-xs text-slate-400">Mustafa Inks <span className="mx-1">/</span> <span className="text-slate-600">{tab}</span></div><div className="text-lg font-bold">{tab === 'Dashboard' ? 'Business overview' : tab}</div></div></div>
        <div className="flex items-center gap-3"><div className="hidden text-right sm:block"><div className="text-sm font-semibold">Administrator</div><div className="text-xs text-slate-400">Workspace</div></div><div className="grid h-10 w-10 place-items-center rounded-full bg-orange-100 font-bold text-orange-700">MI</div></div>
      </header>
      <div className="mx-auto max-w-[1500px] p-5 md:p-8">
        {error && <div className="mb-5 flex items-start justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><span>{error}</span><button onClick={() => setError('')}><X size={17}/></button></div>}
        {tab === 'Dashboard' ? <>
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl font-bold">Good day 👋</h1><p className="mt-1 text-sm text-slate-500">Here’s what’s happening with your business.</p></div><div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">{new Date().toLocaleDateString('en-PK', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div></div>
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">{[['Total sales', data.sales, ShoppingCart, 'text-blue-600 bg-blue-50'], ['Purchases', data.purchases, ArrowDownToLine, 'text-violet-600 bg-violet-50'], ['Gross profit', data.grossProfit, Activity, 'text-emerald-600 bg-emerald-50'], ['Expenses', data.expenses, Wallet, 'text-amber-600 bg-amber-50']].map(([label, val, Icon, color]: any) => <div className="card p-5" key={label}><div className="flex items-center justify-between"><span className="text-sm text-slate-500">{label}</span><span className={`grid h-10 w-10 place-items-center rounded-xl ${color}`}><Icon size={19}/></span></div><div className="mt-4 text-2xl font-bold">{money(val)}</div><div className="mt-1 text-xs text-slate-400">All time</div></div>)}</div>
          <div className="mt-5 grid gap-5 xl:grid-cols-3"><div className="card p-5 xl:col-span-2"><div className="mb-5 flex items-start justify-between"><div><h2 className="font-bold">Inventory snapshot</h2><p className="mt-1 text-xs text-slate-500">Stock quantity and current valuation by item</p></div><button onClick={() => setTab('Inventory')} className="text-xs font-semibold text-orange-600">View inventory →</button></div><div className="h-[290px]">{items.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={items.slice(0, 8).map(x => ({ name: x.name, qty: Number(x.qty), value: Number(x.qty) * Number(x.avgCost) }))}><CartesianGrid stroke="#eef0f4" vertical={false}/><XAxis dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false}/><YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false}/><Tooltip/><Bar dataKey="qty" name="Quantity" fill="#f97316" radius={[5, 5, 0, 0]}/></BarChart></ResponsiveContainer> : <div className="grid h-full place-items-center text-sm text-slate-400">Add inventory items to see your stock</div>}</div></div>
            <div className="card p-5"><h2 className="font-bold">Business at a glance</h2><p className="mt-1 text-xs text-slate-500">Live account and stock totals</p><div className="mt-5 space-y-4">{[['Inventory value', money(data.stockValue)], ['Active products', items.length], ['Customers', data.customers || 0], ['Vendors', data.vendors || 0]].map(([k,v])=><div key={k} className="flex items-center justify-between border-b border-slate-100 pb-3 last:border-0"><span className="text-sm text-slate-500">{k}</span><span className="text-sm font-bold">{v}</span></div>)}</div><div className="mt-3 rounded-xl bg-orange-50 p-4"><div className="text-sm font-semibold text-orange-900">Keep operations moving</div><p className="mt-1 text-xs leading-5 text-orange-800/75">Record purchases to increase stock, then create sales to track customer balances and profit.</p></div></div>
          </div>
          <div className="mt-5 grid gap-5 md:grid-cols-2"><div className="card p-5"><div className="mb-4 flex justify-between"><h2 className="font-bold">Quick actions</h2></div><div className="grid grid-cols-2 gap-3">{[['New sale', 'Sales', ShoppingCart], ['New purchase', 'Purchases', ArrowDownToLine], ['Add item', 'Inventory', Package], ['Add customer', 'Customers', Users]].map(([label, page, Icon]: any) => <button key={label} onClick={() => { setTab(page); startCreate(); }} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 text-left hover:border-orange-300 hover:bg-orange-50"><span className="grid h-9 w-9 place-items-center rounded-lg bg-slate-100 text-slate-600"><Icon size={17}/></span><span className="text-sm font-semibold">{label}</span></button>)}</div></div><div className="card p-5"><h2 className="font-bold">Profitability</h2><div className="mt-4 text-3xl font-bold text-emerald-700">{money(data.grossProfit)}</div><p className="mt-1 text-sm text-slate-500">Sales less the cost of goods sold</p><div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.max(0, Math.min(100, data.grossSales ? Number(data.grossProfit) / Number(data.grossSales) * 100 : 0))}%` }}/></div></div></div>
        </> : <>
          <div className="mb-5 flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-2xl font-bold">{tab}</h1><p className="mt-1 text-sm text-slate-500">Manage your {tab.toLowerCase()} and keep records current.</p></div><div className="flex gap-2">{createLabel[tab] && <button onClick={startCreate} className="flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-orange-600"><Plus size={17}/>{createLabel[tab]}</button>}</div></div>
          {tab === 'Reports' ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{[['Revenue', money(data.sales)], ['Purchases', money(data.purchases)], ['Cost of goods sold', money(data.cogs)], ['Gross profit', money(data.grossProfit)], ['Operating expenses', money(data.expenses)], ['Inventory value', money(data.stockValue)], ['Customers', data.customers || 0], ['Vendors', data.vendors || 0]].map(([label, value]) => <div key={label} className="card p-5"><div className="text-sm text-slate-500">{label}</div><div className="mt-3 text-2xl font-bold">{value}</div></div>)}</div> : <div className="card overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4"><div className="relative min-w-[220px] flex-1 md:max-w-sm"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input value={search} onChange={e => setSearch(e.target.value)} placeholder={`Search ${tab.toLowerCase()}...`} className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-orange-400"/></div><span className="text-xs text-slate-400">{filtered.length} records</span></div>
            {filtered.length ? <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500"><tr>{keys(filtered[0]).map((key: string) => <th className="px-4 py-3 font-semibold" key={key}>{key.replace(/([A-Z])/g, ' $1')}</th>)}</tr></thead><tbody>{filtered.map((row: any, i: number) => <tr key={row.id || i} className="border-t border-slate-100 hover:bg-slate-50/70">{keys(row).map((key: string, n: number) => <td className={`px-4 py-3 ${n === 0 ? 'font-semibold text-slate-800' : 'text-slate-600'}`} key={key}>{formatCell(key, row[key])}</td>)}</tr>)}</tbody></table></div> : <div className="grid min-h-[300px] place-items-center px-5 py-10 text-center"><div><div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-400"><Package size={22}/></div><div className="font-semibold">No {tab.toLowerCase()} yet</div><p className="mt-1 max-w-sm text-sm text-slate-500">Create your first record to start seeing it here.</p>{createLabel[tab] && <button onClick={startCreate} className="mt-4 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white">{createLabel[tab]}</button>}</div></div>}
          </div>}
        </>}
      </div>
    </main>
    {modal && <div className="fixed inset-0 z-30 grid place-items-center bg-slate-950/50 p-4" onMouseDown={e => { if (e.target === e.currentTarget) setModal(false); }}><form onSubmit={submit} className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl"><div className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-white px-6 py-4"><div><div className="text-lg font-bold">{createLabel[tab]}</div><div className="text-xs text-slate-500">Fill in the details below</div></div><button type="button" onClick={() => setModal(false)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={18}/></button></div><div className="grid gap-4 p-6 sm:grid-cols-2">{(fields[tab] || []).map(field => <label key={field.key} className="space-y-1.5"><span className="text-xs font-semibold text-slate-600">{field.label}</span>{field.type === 'select' ? <select required value={form[field.key] || ''} onChange={e => setField(field.key, e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-orange-400"><option value="">Select {field.label.toLowerCase()}</option>{field.options?.map(([value, label]: any) => <option key={value} value={value}>{label}</option>)}</select> : <input required={['code','name','sku','category','description','amount','plannedQty'].includes(field.key)} type={field.type || 'text'} min={field.type === 'number' ? 0 : undefined} step={field.type === 'number' ? 'any' : undefined} placeholder={field.placeholder || ''} value={form[field.key] || ''} onChange={e => setField(field.key, e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-orange-400"/>}</label>)}
              {['Sales', 'Purchases', 'Recipes'].includes(tab) && <div className="sm:col-span-2"><div className="mb-2 flex items-center justify-between"><span className="text-xs font-semibold text-slate-600">{tab === 'Recipes' ? 'Recipe ingredients' : 'Items and quantities'}</span><button type="button" onClick={() => setForm((p: any) => ({ ...p, lines: [...p.lines, { itemId: '', qty: '', rate: '' }] }))} className="text-xs font-semibold text-orange-600">+ Add line</button></div>{form.lines.map((line: any, index: number) => <div key={index} className={`mb-2 grid gap-2 ${tab === 'Recipes' ? 'grid-cols-[1fr_110px_30px]' : 'grid-cols-[1fr_90px_110px_30px]'}`}><select required value={line.itemId} onChange={e => updateLine(index, 'itemId', e.target.value)} className="min-w-0 rounded-lg border border-slate-200 px-2 py-2 text-sm"><option value="">Select item</option>{items.filter(item => tab !== 'Recipes' || item.type !== 'FINISHED').map(item => <option key={item.id} value={item.id}>{item.name} · Stock {item.qty} {item.unit}</option>)}</select><input required type="number" min="0.001" step="any" placeholder={tab === 'Recipes' ? 'Qty per batch' : 'Qty'} value={line.qty} onChange={e => updateLine(index, 'qty', e.target.value)} className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"/>{tab !== 'Recipes' && <input required type="number" min="0" step="any" placeholder="Rate" value={line.rate} onChange={e => updateLine(index, 'rate', e.target.value)} className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"/>}<button type="button" disabled={form.lines.length === 1} onClick={() => setForm((p: any) => ({ ...p, lines: p.lines.filter((_: any, n: number) => n !== index) }))} className="text-slate-400 disabled:opacity-30"><X size={16}/></button></div>)}{tab !== 'Recipes' && <div className="mt-3 text-right text-sm font-bold">Total: {money(form.lines.reduce((sum: number, line: any) => sum + Number(line.qty || 0) * Number(line.rate || 0), 0))}</div>}</div>}
            </div><div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-6 py-4"><button type="button" onClick={() => setModal(false)} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold">Cancel</button><button disabled={saving} className="rounded-lg bg-orange-500 px-5 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60">{saving ? 'Saving…' : 'Save record'}</button></div></form></div>}
    {toast && <div className="fixed bottom-5 right-5 z-40 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white shadow-lg">✓ {toast}</div>}
  </div>;
}
