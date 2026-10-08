import type { PostgrestError } from '@supabase/supabase-js';
import { createClient } from './supabase/client';

export type Tab =
  | 'Sales' | 'Purchases' | 'Recipes' | 'Production' | 'Inventory'
  | 'Customers' | 'Vendors' | 'Expenses' | 'Accounts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Form = Record<string, any>;

const supabase = () => createClient();
const num = (v: unknown) => (v === '' || v === null || v === undefined ? 0 : Number(v));
const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

function fail(error: PostgrestError): never {
  if (error.code === '23505') throw new Error('That code / SKU / invoice number already exists.');
  if (error.code === '23503') throw new Error('This record is still referenced by other records.');
  throw new Error(error.message);
}

async function unwrap<T>(query: PromiseLike<{ data: T | null; error: PostgrestError | null }>): Promise<T> {
  const { data, error } = await query;
  if (error) fail(error);
  return data as T;
}

const LIST: Record<Tab, () => PromiseLike<{ data: Row[] | null; error: PostgrestError | null }>> = {
  Sales: () => supabase().from('sales').select('*, customer:customers(name), lines:sale_lines(id)').order('date', { ascending: false }),
  Purchases: () => supabase().from('purchases').select('*, vendor:vendors(name), lines:purchase_lines(id)').order('date', { ascending: false }),
  Recipes: () => supabase().from('recipes').select('*, output_item:items(name), lines:recipe_lines(id)').order('name'),
  Production: () => supabase().from('production_batches').select('*, recipe:recipes(name), output_item:items(name)').order('date', { ascending: false }),
  Inventory: () => supabase().from('items').select('*').order('name'),
  Customers: () => supabase().from('customers').select('*').order('name'),
  Vendors: () => supabase().from('vendors').select('*').order('name'),
  Expenses: () => supabase().from('expenses').select('*').order('date', { ascending: false }),
  Accounts: () => supabase().from('ledger_entries').select('*').order('date', { ascending: false }).order('id', { ascending: false }).limit(200),
};

export const listRecords = (tab: Tab) => unwrap<Row[]>(LIST[tab]()).then(rows => rows ?? []);

export async function loadLookups() {
  const [dashboard, items, customers, vendors, recipes] = await Promise.all([
    unwrap<Row>(supabase().rpc('dashboard_summary')),
    unwrap<Row[]>(supabase().from('items').select('*').eq('active', true).order('name')),
    unwrap<Row[]>(supabase().from('customers').select('*').order('name')),
    unwrap<Row[]>(supabase().from('vendors').select('*').order('name')),
    unwrap<Row[]>(supabase().from('recipes').select('id, name').eq('active', true).order('name')),
  ]);
  return { dashboard, items, customers, vendors, recipes };
}

const lines = (form: Form, withRate: boolean) =>
  (form.lines as Form[]).map(l => ({ item_id: Number(l.itemId), qty: num(l.qty), ...(withRate ? { rate: num(l.rate) } : {}) }));

export async function createRecord(tab: Tab, form: Form): Promise<void> {
  const db = supabase();
  switch (tab) {
    case 'Sales':
      return void await unwrap(db.rpc('create_sale', {
        p_customer_id: Number(form.customerId), p_lines: lines(form, true), p_received: num(form.received),
        p_payment_method: form.paymentMethod || 'CREDIT', p_notes: text(form.notes),
      }));
    case 'Purchases':
      return void await unwrap(db.rpc('create_purchase', {
        p_vendor_id: Number(form.vendorId), p_lines: lines(form, true), p_paid: num(form.paid),
        p_payment_method: form.paymentMethod === 'BANK' ? 'BANK' : 'CASH', p_notes: text(form.notes),
      }));
    case 'Recipes':
      return void await unwrap(db.rpc('create_recipe', {
        p_name: form.name, p_output_item_id: Number(form.outputItemId), p_output_qty: num(form.outputQty), p_lines: lines(form, false),
      }));
    case 'Production':
      return void await unwrap(db.rpc('create_production', {
        p_recipe_id: Number(form.recipeId), p_planned_qty: num(form.plannedQty),
        p_good_qty: form.goodQty ? num(form.goodQty) : null,
      }));
    case 'Expenses':
      return void await unwrap(db.rpc('create_expense', {
        p_category: form.category, p_description: form.description, p_amount: num(form.amount),
        p_payment_method: form.paymentMethod === 'BANK' ? 'BANK' : 'CASH',
      }));
    case 'Customers':
    case 'Vendors':
      return void await unwrap(db.from(tab === 'Customers' ? 'customers' : 'vendors').insert({
        code: String(form.code ?? '').trim(), name: String(form.name ?? '').trim(),
        phone: text(form.phone), address: text(form.address), opening_balance: num(form.openingBalance),
      }));
    case 'Inventory':
      return void await unwrap(db.from('items').insert({
        sku: String(form.sku ?? '').trim(), name: String(form.name ?? '').trim(), type: form.type || 'RAW',
        unit: text(form.unit) ?? 'KG', reorder_level: num(form.reorderLevel), avg_selling_rate: num(form.avgSellingRate),
      }));
    case 'Accounts':
      throw new Error('Ledger entries are created automatically.');
  }
}

export const signOut = () => supabase().auth.signOut();
