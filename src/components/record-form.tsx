'use client';

import { useEffect, useRef } from 'react';
import { Plus, X } from 'lucide-react';
import { money } from '@/lib/format';
import type { Form, Row } from '@/lib/erp';

type Field = { key: string; label: string; type?: 'number' | 'select'; options?: [string | number, string][]; placeholder?: string; required?: boolean };

type Props = {
  tab: string;
  title: string;
  form: Form;
  setForm: (updater: (prev: Form) => Form) => void;
  saving: boolean;
  online: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  lookups: { items: Row[]; customers: Row[]; vendors: Row[]; recipes: Row[] };
};

const pair = (xs: string[]): [string, string][] => xs.map(x => [x, x]);

function fieldsFor(tab: string, { items, customers, vendors, recipes }: Props['lookups']): Field[] {
  switch (tab) {
    case 'Sales': return [
      { key: 'customerId', label: 'Customer', type: 'select', options: customers.map(x => [x.id, `${x.name} (${x.code})`]) },
      { key: 'received', label: 'Received amount', type: 'number' },
      { key: 'paymentMethod', label: 'Payment method', type: 'select', options: pair(['CASH', 'BANK', 'CREDIT']) },
      { key: 'notes', label: 'Notes' }];
    case 'Purchases': return [
      { key: 'vendorId', label: 'Vendor', type: 'select', options: vendors.map(x => [x.id, `${x.name} (${x.code})`]) },
      { key: 'paid', label: 'Paid amount', type: 'number' },
      { key: 'paymentMethod', label: 'Payment method', type: 'select', options: pair(['CASH', 'BANK']) },
      { key: 'notes', label: 'Notes' }];
    case 'Customers':
    case 'Vendors': {
      const noun = tab === 'Customers' ? 'Customer' : 'Vendor';
      return [{ key: 'code', label: `${noun} code`, required: true }, { key: 'name', label: `${noun} name`, required: true }, { key: 'phone', label: 'Phone' }, { key: 'address', label: 'Address' }, { key: 'openingBalance', label: 'Opening balance', type: 'number' }];
    }
    case 'Inventory': return [
      { key: 'sku', label: 'SKU / item code', required: true }, { key: 'name', label: 'Item name', required: true },
      { key: 'type', label: 'Item type', type: 'select', options: pair(['RAW', 'FINISHED', 'SERVICE']) },
      { key: 'unit', label: 'Unit', placeholder: 'KG' }, { key: 'reorderLevel', label: 'Reorder level', type: 'number' }, { key: 'avgSellingRate', label: 'Selling price', type: 'number' }];
    case 'Expenses': return [
      { key: 'category', label: 'Category', required: true }, { key: 'description', label: 'Description', required: true },
      { key: 'amount', label: 'Amount', type: 'number', required: true }, { key: 'paymentMethod', label: 'Payment method', type: 'select', options: pair(['CASH', 'BANK']) }];
    case 'Production': return [
      { key: 'recipeId', label: 'Recipe', type: 'select', options: recipes.map(x => [x.id, x.name]) },
      { key: 'plannedQty', label: 'Planned output quantity', type: 'number', required: true }, { key: 'goodQty', label: 'Good output quantity', type: 'number' }];
    case 'Recipes': return [
      { key: 'name', label: 'Recipe name', required: true },
      { key: 'outputItemId', label: 'Finished item', type: 'select', options: items.filter(x => x.type === 'FINISHED').map(x => [x.id, x.name]) },
      { key: 'outputQty', label: 'Output quantity', type: 'number', required: true }];
    default: return [];
  }
}

export function RecordForm({ tab, title, form, setForm, saving, online, onClose, onSubmit, lookups }: Props) {
  const ref = useRef<HTMLFormElement>(null);
  const fields = fieldsFor(tab, lookups);
  const hasLines = ['Sales', 'Purchases', 'Recipes'].includes(tab);
  const recipe = tab === 'Recipes';
  const lineItems = lookups.items.filter(i => !recipe || i.type !== 'FINISHED');
  const lines: Form[] = form.lines ?? [];

  const setField = (key: string, value: string) => setForm(p => ({ ...p, [key]: value }));
  const setLine = (i: number, key: string, value: string) => setForm(p => ({ ...p, lines: p.lines.map((l: Form, n: number) => (n === i ? { ...l, [key]: value } : l)) }));

  useEffect(() => {
    const prevFocus = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.querySelector<HTMLElement>('input, select')?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prevOverflow; document.removeEventListener('keydown', onKey); prevFocus?.focus(); };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-slate-950/50 sm:items-center sm:justify-center sm:p-4" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <form ref={ref} onSubmit={onSubmit} role="dialog" aria-modal="true" aria-labelledby="form-title"
        className="sheet-enter flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-surface shadow-2xl sm:max-w-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-line px-4 py-3 sm:px-6">
          <div><h2 id="form-title" className="text-lg font-bold">{title}</h2><p className="text-xs text-muted">{online ? 'Fill in the details below' : 'Offline: this will be saved on your device and sent later'}</p></div>
          <button type="button" onClick={onClose} className="icon-btn" aria-label="Close"><X size={20} aria-hidden /></button>
        </div>

        <div className="grid flex-1 gap-4 overflow-y-auto p-4 sm:grid-cols-2 sm:p-6">
          {fields.map(f => (
            <label key={f.key} className="block space-y-1.5">
              <span className="text-sm font-medium">{f.label}{f.required && <span className="text-danger" aria-hidden> *</span>}</span>
              {f.type === 'select' ? (
                <select required={f.key !== 'paymentMethod'} value={form[f.key] ?? ''} onChange={e => setField(f.key, e.target.value)} className="field">
                  <option value="">Select {f.label.toLowerCase()}</option>
                  {f.options?.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              ) : (
                <input required={f.required} type={f.type === 'number' ? 'number' : 'text'} inputMode={f.type === 'number' ? 'decimal' : undefined}
                  min={f.type === 'number' ? 0 : undefined} step={f.type === 'number' ? 'any' : undefined} placeholder={f.placeholder}
                  value={form[f.key] ?? ''} onChange={e => setField(f.key, e.target.value)} className="field" />
              )}
            </label>
          ))}

          {hasLines && (
            <fieldset className="min-w-0 sm:col-span-2">
              <legend className="mb-2 flex w-full items-center justify-between">
                <span className="text-sm font-medium">{recipe ? 'Recipe ingredients' : 'Items and quantities'}</span>
                <button type="button" onClick={() => setForm(p => ({ ...p, lines: [...p.lines, { itemId: '', qty: '', rate: '' }] }))} className="inline-flex min-h-[44px] items-center gap-1 px-1 text-sm font-semibold text-accent"><Plus size={16} aria-hidden />Add line</button>
              </legend>
              <div className="space-y-3">
                {lines.map((line, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_44px] items-end gap-2 rounded-xl border border-line bg-surface2 p-3 sm:grid-cols-[1fr_96px_112px_44px] sm:border-0 sm:bg-transparent sm:p-0">
                    <label className="col-span-3 space-y-1 sm:col-span-1"><span className="text-xs text-muted sm:sr-only">Item</span>
                      <select required value={line.itemId} onChange={e => setLine(i, 'itemId', e.target.value)} className="field">
                        <option value="">Select item</option>
                        {lineItems.map(item => <option key={item.id} value={item.id}>{item.name} · stock {item.qty} {item.unit}</option>)}
                      </select>
                    </label>
                    <label className="space-y-1"><span className="text-xs text-muted sm:sr-only">Quantity</span>
                      <input required type="number" inputMode="decimal" min="0.001" step="any" placeholder="Qty" value={line.qty} onChange={e => setLine(i, 'qty', e.target.value)} className="field" />
                    </label>
                    {!recipe ? (
                      <label className="space-y-1"><span className="text-xs text-muted sm:sr-only">Rate</span>
                        <input required type="number" inputMode="decimal" min="0" step="any" placeholder="Rate" value={line.rate} onChange={e => setLine(i, 'rate', e.target.value)} className="field" />
                      </label>
                    ) : <span className="sm:hidden" />}
                    <button type="button" disabled={lines.length === 1} onClick={() => setForm(p => ({ ...p, lines: p.lines.filter((_: Form, n: number) => n !== i) }))} className="icon-btn disabled:opacity-30" aria-label={`Remove line ${i + 1}`}><X size={18} aria-hidden /></button>
                  </div>
                ))}
              </div>
              {!recipe && <p className="num mt-3 text-right text-base font-bold">Total: {money(lines.reduce((sum, l) => sum + Number(l.qty || 0) * Number(l.rate || 0), 0))}</p>}
            </fieldset>
          )}
        </div>

        <div className="flex gap-2 border-t border-line bg-surface2 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:justify-end sm:px-6">
          <button type="button" onClick={onClose} className="btn-ghost flex-1 sm:flex-none">Cancel</button>
          <button disabled={saving} className="btn-primary flex-1 sm:flex-none">{saving ? 'Saving…' : online ? 'Save record' : 'Save offline'}</button>
        </div>
      </form>
    </div>
  );
}
