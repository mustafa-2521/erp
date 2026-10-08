import type { PostgrestError } from '@supabase/supabase-js';
import { createClient } from './supabase/client';
import { cacheClear, cacheGet, cachePut } from './offline/db';
import { enqueue, isNetworkError, NetworkError, syncOutbox } from './offline/outbox';

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
  // supabase-js reports transport failures as an error without a Postgres code.
  if (!error.code && /fetch|network|load failed|offline/i.test(error.message)) throw new NetworkError();
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

export type Cached<T> = T & { fromCache: boolean; savedAt: number | null };

// Network first; if the network is unreachable fall back to the last copy saved on this device.
async function withCache<T>(key: string, fetcher: () => Promise<T>): Promise<{ value: T; fromCache: boolean; savedAt: number | null }> {
  try {
    if (typeof navigator !== 'undefined' && !navigator.onLine) throw new NetworkError();
    const value = await fetcher();
    void cachePut(key, value);
    return { value, fromCache: false, savedAt: Date.now() };
  } catch (e) {
    if (!isNetworkError(e)) throw e;
    const hit = await cacheGet<T>(key);
    if (!hit) throw new NetworkError('You are offline and this screen has not been saved on this device yet.');
    return { value: hit.value, fromCache: true, savedAt: hit.savedAt };
  }
}

export async function listRecords(tab: Tab) {
  const { value, fromCache, savedAt } = await withCache(`list:${tab}`, () => unwrap<Row[]>(LIST[tab]()).then(r => r ?? []));
  return { rows: value, fromCache, savedAt };
}

export async function loadLookups() {
  const { value, fromCache, savedAt } = await withCache('lookups', async () => {
    const [dashboard, items, customers, vendors, recipes] = await Promise.all([
      unwrap<Row>(supabase().rpc('dashboard_summary')),
      unwrap<Row[]>(supabase().from('items').select('*').eq('active', true).order('name')),
      unwrap<Row[]>(supabase().from('customers').select('*').order('name')),
      unwrap<Row[]>(supabase().from('vendors').select('*').order('name')),
      unwrap<Row[]>(supabase().from('recipes').select('id, name').eq('active', true).order('name')),
    ]);
    return { dashboard, items, customers, vendors, recipes };
  });
  return { ...value, fromCache, savedAt };
}

const lines = (form: Form, withRate: boolean) =>
  (form.lines as Form[]).map(l => ({ item_id: Number(l.itemId), qty: num(l.qty), ...(withRate ? { rate: num(l.rate) } : {}) }));

export async function createRecordOnline(tab: Tab, form: Form): Promise<void> {
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

const describe = (tab: Tab, form: Form) => {
  const verb: Record<Tab, string> = {
    Sales: 'Sale', Purchases: 'Purchase', Recipes: 'Recipe', Production: 'Production batch', Inventory: 'Item',
    Customers: 'Customer', Vendors: 'Vendor', Expenses: 'Expense', Accounts: 'Entry',
  };
  const total = Array.isArray(form.lines)
    ? (form.lines as Form[]).reduce((sum, l) => sum + num(l.qty) * num(l.rate), 0) : 0;
  const hint = form.name || form.description || (total ? `Rs. ${total.toLocaleString('en-PK')}` : form.amount ? `Rs. ${num(form.amount).toLocaleString('en-PK')}` : '');
  return hint ? `${verb[tab]} · ${hint}` : verb[tab];
};

/** Saves immediately when online, otherwise queues the record on this device to be sent later. */
export async function createRecord(tab: Tab, form: Form): Promise<{ queued: boolean }> {
  if (typeof navigator !== 'undefined' && navigator.onLine) {
    try { await createRecordOnline(tab, form); return { queued: false }; }
    catch (e) { if (!isNetworkError(e)) throw e; }
  }
  await enqueue(tab, form, describe(tab, form));
  return { queued: true };
}

export const syncPending = () => syncOutbox((tab, form) => createRecordOnline(tab as Tab, form));

export async function signOut() {
  await cacheClear();
  try {
    // getRegistration resolves even when no worker is registered (dev); `ready` would wait forever.
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
    reg?.active?.postMessage({ type: 'CLEAR_PAGES' });
  } catch { /* cache clearing is best-effort */ }
  // Offline, the server call fails but scope 'local' still removes the session from this device.
  try { await supabase().auth.signOut({ scope: 'local' }); } catch { /* ignore */ }
}
