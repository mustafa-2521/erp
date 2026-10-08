-- Purchases and sales are insert-only tables, so compute totals first and insert the header once.

create or replace function public.create_purchase(
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
  v_total    numeric;
  v_new_qty  numeric;
  v_avg      numeric;
  v_paid     numeric := coalesce(p_paid, 0);
  v_cash     public.account_type;
begin
  perform 1 from public.vendors where id = p_vendor_id for update;
  if not found then
    raise exception 'Select a vendor.' using errcode = '22023';
  end if;

  select coalesce(sum(round(g_qty * g_rate, 2)), 0) into v_total from private.group_lines(p_lines);
  if v_paid < 0 or v_paid > v_total then
    raise exception 'Paid amount must be between zero and the invoice total.' using errcode = '22023';
  end if;

  insert into public.purchases (invoice_no, date, vendor_id, subtotal, total, paid, payment_method, notes)
  values (
    coalesce(nullif(btrim(p_invoice_no), ''), 'PUR-' || lpad(nextval('public.purchase_no_seq')::text, 6, '0')),
    coalesce(p_date, now()), p_vendor_id, v_total, v_total, v_paid, p_payment_method, nullif(btrim(p_notes), '')
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
  end loop;

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

create or replace function public.create_sale(
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
  v_total       numeric;
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

  select coalesce(sum(round(g_qty * g_rate, 2)), 0) into v_total from private.group_lines(p_lines);
  if v_received < 0 or v_received > v_total then
    raise exception 'Received amount must be between zero and the invoice total.' using errcode = '22023';
  end if;

  insert into public.sales (invoice_no, date, customer_id, subtotal, total, received, payment_method, notes)
  values (
    coalesce(nullif(btrim(p_invoice_no), ''), 'SAL-' || lpad(nextval('public.sale_no_seq')::text, 6, '0')),
    coalesce(p_date, now()), p_customer_id, v_total, v_total, v_received, p_payment_method, nullif(btrim(p_notes), '')
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

    v_cost := v_cost + v_cost_amount;
  end loop;

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
