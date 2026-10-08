-- Business transactions as atomic Postgres functions (called via supabase.rpc).
-- All are SECURITY INVOKER: RLS and table grants apply to the caller, so they cannot be
-- used to bypass the owner-only access model. Row locks are taken in a stable order.

create schema if not exists private;
grant usage on schema private to authenticated;

-- Validates [{item_id, qty, rate}] and merges duplicate items (weighted-average rate).
create function private.group_lines(p_lines jsonb)
returns table (g_item_id bigint, g_qty numeric, g_rate numeric)
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Add at least one item line.' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_lines) e
    where (e ->> 'item_id') is null
       or coalesce((e ->> 'qty')::numeric, 0) <= 0
       or coalesce((e ->> 'rate')::numeric, -1) < 0
  ) then
    raise exception 'Quantity must be positive and rate cannot be negative.' using errcode = '22023';
  end if;
  return query
    select (e ->> 'item_id')::bigint,
           sum((e ->> 'qty')::numeric),
           sum((e ->> 'qty')::numeric * (e ->> 'rate')::numeric) / sum((e ->> 'qty')::numeric)
    from jsonb_array_elements(p_lines) e
    group by 1
    order by 1;
end;
$$;

-- ---------------------------------------------------------------- purchase
create function public.create_purchase(
  p_vendor_id      bigint,
  p_lines          jsonb,
  p_paid           numeric default 0,
  p_payment_method public.payment_method default 'CASH',
  p_date           timestamptz default now(),
  p_notes          text default null,
  p_invoice_no     text default null
)
returns public.purchases
language plpgsql
set search_path = ''
as $$
declare
  v_purchase public.purchases;
  v_item     public.items;
  r          record;
  v_amount   numeric;
  v_total    numeric := 0;
  v_new_qty  numeric;
  v_avg      numeric;
  v_paid     numeric := coalesce(p_paid, 0);
  v_cash     public.account_type;
begin
  perform 1 from public.vendors where id = p_vendor_id for update;
  if not found then
    raise exception 'Select a vendor.' using errcode = '22023';
  end if;

  insert into public.purchases (invoice_no, date, vendor_id, subtotal, total, paid, payment_method, notes)
  values (
    coalesce(nullif(btrim(p_invoice_no), ''), 'PUR-' || lpad(nextval('public.purchase_no_seq')::text, 6, '0')),
    coalesce(p_date, now()), p_vendor_id, 0, 0, 0, p_payment_method, nullif(btrim(p_notes), '')
  )
  returning * into v_purchase;

  for r in select * from private.group_lines(p_lines) loop
    v_amount := round(r.g_qty * r.g_rate, 2);

    select * into v_item from public.items where id = r.g_item_id for update;
    if not found then
      raise exception 'Item % does not exist.', r.g_item_id using errcode = '22023';
    end if;

    v_new_qty := v_item.qty + r.g_qty;
    v_avg := (v_item.qty * v_item.avg_cost + r.g_qty * r.g_rate) / v_new_qty;

    insert into public.purchase_lines (purchase_id, item_id, qty, rate, amount)
    values (v_purchase.id, r.g_item_id, r.g_qty, r.g_rate, v_amount);

    update public.items
       set qty = v_new_qty, avg_cost = v_avg, avg_purchase_rate = v_avg
     where id = r.g_item_id;

    insert into public.stock_moves (date, item_id, type, qty, rate, value, ref_type, ref_id)
    values (v_purchase.date, r.g_item_id, 'PURCHASE', r.g_qty, r.g_rate, v_amount, 'PURCHASE', v_purchase.id);

    v_total := v_total + v_amount;
  end loop;

  if v_paid < 0 or v_paid > v_total then
    raise exception 'Paid amount must be between zero and the invoice total.' using errcode = '22023';
  end if;

  update public.purchases
     set subtotal = v_total, total = v_total, paid = v_paid
   where id = v_purchase.id
  returning * into v_purchase;

  update public.vendors set balance = balance + (v_total - v_paid) where id = p_vendor_id;

  insert into public.ledger_entries (date, account_type, account_id, debit, credit, description, ref_type, ref_id)
  values
    (v_purchase.date, 'INVENTORY', null, v_total, 0, 'Inventory received on ' || v_purchase.invoice_no, 'PURCHASE', v_purchase.id),
    (v_purchase.date, 'VENDOR', p_vendor_id, 0, v_total, 'Purchase ' || v_purchase.invoice_no, 'PURCHASE', v_purchase.id);

  if v_paid > 0 then
    v_cash := case when p_payment_method = 'BANK' then 'BANK' else 'CASH' end;
    insert into public.ledger_entries (date, account_type, account_id, debit, credit, description, ref_type, ref_id)
    values
      (v_purchase.date, 'VENDOR', p_vendor_id, v_paid, 0, 'Payment on ' || v_purchase.invoice_no, 'PURCHASE', v_purchase.id),
      (v_purchase.date, v_cash, null, 0, v_paid, 'Payment for ' || v_purchase.invoice_no, 'PURCHASE', v_purchase.id);
  end if;

  return v_purchase;
end;
$$;

-- -------------------------------------------------------------------- sale
create function public.create_sale(
  p_customer_id    bigint,
  p_lines          jsonb,
  p_received       numeric default 0,
  p_payment_method public.payment_method default 'CREDIT',
  p_date           timestamptz default now(),
  p_notes          text default null,
  p_invoice_no     text default null
)
returns public.sales
language plpgsql
set search_path = ''
as $$
declare
  v_sale        public.sales;
  v_item        public.items;
  r             record;
  v_amount      numeric;
  v_cost_amount numeric;
  v_total       numeric := 0;
  v_cost        numeric := 0;
  v_prior_qty   numeric;
  v_prior_amt   numeric;
  v_received    numeric := coalesce(p_received, 0);
  v_cash        public.account_type;
begin
  perform 1 from public.customers where id = p_customer_id for update;
  if not found then
    raise exception 'Select a customer.' using errcode = '22023';
  end if;

  insert into public.sales (invoice_no, date, customer_id, subtotal, total, received, payment_method, notes)
  values (
    coalesce(nullif(btrim(p_invoice_no), ''), 'SAL-' || lpad(nextval('public.sale_no_seq')::text, 6, '0')),
    coalesce(p_date, now()), p_customer_id, 0, 0, 0, p_payment_method, nullif(btrim(p_notes), '')
  )
  returning * into v_sale;

  for r in select * from private.group_lines(p_lines) loop
    select * into v_item from public.items where id = r.g_item_id for update;
    if not found then
      raise exception 'Item % does not exist.', r.g_item_id using errcode = '22023';
    end if;
    if v_item.qty < r.g_qty then
      raise exception 'Not enough stock for %. Available: %', v_item.name, v_item.qty using errcode = '22023';
    end if;

    v_amount := round(r.g_qty * r.g_rate, 2);
    v_cost_amount := round(r.g_qty * v_item.avg_cost, 2);

    select coalesce(sum(qty), 0), coalesce(sum(amount), 0)
      into v_prior_qty, v_prior_amt
      from public.sale_lines where item_id = r.g_item_id;

    insert into public.sale_lines (sale_id, item_id, qty, rate, cost_rate, amount, cost_amount)
    values (v_sale.id, r.g_item_id, r.g_qty, r.g_rate, v_item.avg_cost, v_amount, v_cost_amount);

    update public.items
       set qty = qty - r.g_qty,
           avg_selling_rate = (v_prior_amt + v_amount) / (v_prior_qty + r.g_qty)
     where id = r.g_item_id;

    insert into public.stock_moves (date, item_id, type, qty, rate, value, ref_type, ref_id)
    values (v_sale.date, r.g_item_id, 'SALE', -r.g_qty, v_item.avg_cost, -v_cost_amount, 'SALE', v_sale.id);

    v_total := v_total + v_amount;
    v_cost := v_cost + v_cost_amount;
  end loop;

  if v_received < 0 or v_received > v_total then
    raise exception 'Received amount must be between zero and the invoice total.' using errcode = '22023';
  end if;

  update public.sales
     set subtotal = v_total, total = v_total, received = v_received
   where id = v_sale.id
  returning * into v_sale;

  update public.customers set balance = balance + (v_total - v_received) where id = p_customer_id;

  insert into public.ledger_entries (date, account_type, account_id, debit, credit, description, ref_type, ref_id)
  values
    (v_sale.date, 'CUSTOMER', p_customer_id, v_total, 0, 'Sale ' || v_sale.invoice_no, 'SALE', v_sale.id),
    (v_sale.date, 'REVENUE', null, 0, v_total, 'Sales revenue ' || v_sale.invoice_no, 'SALE', v_sale.id);

  if v_received > 0 then
    v_cash := case when p_payment_method = 'BANK' then 'BANK' else 'CASH' end;
    insert into public.ledger_entries (date, account_type, account_id, debit, credit, description, ref_type, ref_id)
    values
      (v_sale.date, v_cash, null, v_received, 0, 'Receipt for ' || v_sale.invoice_no, 'SALE', v_sale.id),
      (v_sale.date, 'CUSTOMER', p_customer_id, 0, v_received, 'Receipt on ' || v_sale.invoice_no, 'SALE', v_sale.id);
  end if;

  if v_cost > 0 then
    insert into public.ledger_entries (date, account_type, account_id, debit, credit, description, ref_type, ref_id)
    values
      (v_sale.date, 'COGS', null, v_cost, 0, 'Cost of ' || v_sale.invoice_no, 'SALE', v_sale.id),
      (v_sale.date, 'INVENTORY', null, 0, v_cost, 'Stock issued for ' || v_sale.invoice_no, 'SALE', v_sale.id);
  end if;

  return v_sale;
end;
$$;

-- -------------------------------------------------------------- production
create function public.create_production(
  p_recipe_id   bigint,
  p_planned_qty numeric,
  p_good_qty    numeric default null,
  p_actual_qty  numeric default null,
  p_date        timestamptz default now(),
  p_batch_no    text default null
)
returns public.production_batches
language plpgsql
set search_path = ''
as $$
declare
  v_recipe public.recipes;
  v_batch  public.production_batches;
  v_item   public.items;
  v_out    public.items;
  r        record;
  v_good   numeric := coalesce(p_good_qty, p_planned_qty);
  v_actual numeric := coalesce(p_actual_qty, p_planned_qty);
  v_scale  numeric;
  v_qty    numeric;
  v_value  numeric;
  v_total  numeric := 0;
  v_out_qty numeric;
begin
  if coalesce(p_planned_qty, 0) <= 0 or v_good <= 0 or v_actual <= 0 then
    raise exception 'Production quantities must be positive.' using errcode = '22023';
  end if;

  select * into v_recipe from public.recipes where id = p_recipe_id and active;
  if not found then
    raise exception 'Select an active recipe.' using errcode = '22023';
  end if;
  v_scale := p_planned_qty / v_recipe.output_qty;

  -- Pass 1: lock inputs (stable order), validate stock, cost the batch.
  for r in select item_id, qty from public.recipe_lines where recipe_id = p_recipe_id order by item_id loop
    select * into v_item from public.items where id = r.item_id for update;
    v_qty := round(r.qty * v_scale, 3);
    if v_item.qty < v_qty then
      raise exception 'Not enough stock for %. Available: %, needed: %', v_item.name, v_item.qty, v_qty using errcode = '22023';
    end if;
    v_total := v_total + round(v_qty * v_item.avg_cost, 2);
  end loop;

  insert into public.production_batches (
    batch_no, recipe_id, output_item_id, planned_qty, actual_qty, good_qty,
    wastage_qty, total_cost, cost_per_kg, date
  ) values (
    coalesce(nullif(btrim(p_batch_no), ''), 'BATCH-' || lpad(nextval('public.batch_no_seq')::text, 6, '0')),
    p_recipe_id, v_recipe.output_item_id, p_planned_qty, v_actual, v_good,
    greatest(0, v_actual - v_good), v_total, v_total / v_good, coalesce(p_date, now())
  )
  returning * into v_batch;

  -- Pass 2: consume inputs.
  for r in select item_id, qty from public.recipe_lines where recipe_id = p_recipe_id order by item_id loop
    select * into v_item from public.items where id = r.item_id;
    v_qty := round(r.qty * v_scale, 3);
    v_value := round(v_qty * v_item.avg_cost, 2);
    update public.items set qty = qty - v_qty where id = r.item_id;
    insert into public.stock_moves (date, item_id, type, qty, rate, value, ref_type, ref_id)
    values (v_batch.date, r.item_id, 'PRODUCTION_CONSUME', -v_qty, v_item.avg_cost, -v_value, 'PRODUCTION', v_batch.id);
  end loop;

  -- Output: weighted-average the finished item's cost.
  select * into v_out from public.items where id = v_recipe.output_item_id for update;
  v_out_qty := v_out.qty + v_good;
  update public.items
     set qty = v_out_qty,
         avg_cost = (v_out.qty * v_out.avg_cost + v_total) / v_out_qty,
         avg_purchase_rate = (v_out.qty * v_out.avg_cost + v_total) / v_out_qty
   where id = v_out.id;
  insert into public.stock_moves (date, item_id, type, qty, rate, value, ref_type, ref_id)
  values (v_batch.date, v_out.id, 'PRODUCTION_OUTPUT', v_good, v_total / v_good, v_total, 'PRODUCTION', v_batch.id);

  return v_batch;
end;
$$;

-- ----------------------------------------------------------------- expense
create function public.create_expense(
  p_category       text,
  p_description    text,
  p_amount         numeric,
  p_payment_method public.payment_method default 'CASH',
  p_date           timestamptz default now()
)
returns public.expenses
language plpgsql
set search_path = ''
as $$
declare
  v_expense public.expenses;
  v_cash    public.account_type;
begin
  if coalesce(p_amount, 0) <= 0 then
    raise exception 'Expense amount must be greater than zero.' using errcode = '22023';
  end if;
  if p_payment_method = 'CREDIT' then
    raise exception 'Expenses must be paid by cash or bank.' using errcode = '22023';
  end if;

  insert into public.expenses (date, category, description, amount, payment_method)
  values (coalesce(p_date, now()), btrim(p_category), btrim(p_description), p_amount, p_payment_method)
  returning * into v_expense;

  v_cash := case when p_payment_method = 'BANK' then 'BANK' else 'CASH' end;
  insert into public.ledger_entries (date, account_type, account_id, debit, credit, description, ref_type, ref_id)
  values
    (v_expense.date, 'EXPENSE', v_expense.id, v_expense.amount, 0, v_expense.category || ': ' || v_expense.description, 'EXPENSE', v_expense.id),
    (v_expense.date, v_cash, null, 0, v_expense.amount, 'Payment for ' || v_expense.category, 'EXPENSE', v_expense.id);

  return v_expense;
end;
$$;

-- ------------------------------------------------------------------ recipe
create function public.create_recipe(
  p_name           text,
  p_output_item_id bigint,
  p_output_qty     numeric,
  p_lines          jsonb
)
returns public.recipes
language plpgsql
set search_path = ''
as $$
declare
  v_recipe public.recipes;
  v_sum    numeric;
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Add recipe ingredients.' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_lines) e
    where (e ->> 'item_id') is null or coalesce((e ->> 'qty')::numeric, 0) <= 0
  ) then
    raise exception 'Each ingredient needs an item and a positive quantity.' using errcode = '22023';
  end if;

  insert into public.recipes (name, output_item_id, output_qty)
  values (btrim(p_name), p_output_item_id, p_output_qty)
  returning * into v_recipe;

  select sum((e ->> 'qty')::numeric) into v_sum from jsonb_array_elements(p_lines) e;

  insert into public.recipe_lines (recipe_id, item_id, qty, percentage)
  select v_recipe.id, (e ->> 'item_id')::bigint, sum((e ->> 'qty')::numeric),
         round(sum((e ->> 'qty')::numeric) / v_sum * 100, 3)
  from jsonb_array_elements(p_lines) e
  group by 2;

  return v_recipe;
end;
$$;

-- --------------------------------------------------------------- dashboard
create function public.dashboard_summary()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'sales',        coalesce((select sum(total) from public.sales), 0),
    'purchases',    coalesce((select sum(total) from public.purchases), 0),
    'expenses',     coalesce((select sum(amount) from public.expenses), 0),
    'gross_sales',  coalesce((select sum(amount) from public.sale_lines), 0),
    'cogs',         coalesce((select sum(cost_amount) from public.sale_lines), 0),
    'gross_profit', coalesce((select sum(amount - cost_amount) from public.sale_lines), 0),
    'stock_value',  coalesce((select sum(qty * avg_cost) from public.items where active), 0),
    'customers',    (select count(*) from public.customers),
    'vendors',      (select count(*) from public.vendors)
  );
$$;

-- -------------------------------------------------------------- privileges
revoke all on function public.set_updated_at(), public.init_party_balance() from public, anon, authenticated;
revoke all on function private.group_lines(jsonb) from public, anon;
grant execute on function private.group_lines(jsonb) to authenticated;

revoke all on function
  public.create_purchase(bigint, jsonb, numeric, public.payment_method, timestamptz, text, text),
  public.create_sale(bigint, jsonb, numeric, public.payment_method, timestamptz, text, text),
  public.create_production(bigint, numeric, numeric, numeric, timestamptz, text),
  public.create_expense(text, text, numeric, public.payment_method, timestamptz),
  public.create_recipe(text, bigint, numeric, jsonb),
  public.dashboard_summary()
from public, anon;

grant execute on function
  public.create_purchase(bigint, jsonb, numeric, public.payment_method, timestamptz, text, text),
  public.create_sale(bigint, jsonb, numeric, public.payment_method, timestamptz, text, text),
  public.create_production(bigint, numeric, numeric, numeric, timestamptz, text),
  public.create_expense(text, text, numeric, public.payment_method, timestamptz),
  public.create_recipe(text, bigint, numeric, jsonb),
  public.dashboard_summary()
to authenticated;
