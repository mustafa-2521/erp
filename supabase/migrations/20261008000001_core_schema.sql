-- Core schema for Mustafa Inks ERP (single-owner business tracker).
-- Money: numeric(14,2). Quantities: numeric(14,3). Rates: numeric(14,4).

create type public.item_type as enum ('RAW', 'FINISHED', 'SERVICE');
create type public.tx_type as enum (
  'PURCHASE', 'PURCHASE_RETURN', 'SALE', 'SALE_RETURN',
  'PRODUCTION_CONSUME', 'PRODUCTION_OUTPUT', 'ADJUSTMENT'
);
create type public.payment_method as enum ('CASH', 'BANK', 'CREDIT');
create type public.account_type as enum (
  'INVENTORY', 'VENDOR', 'CUSTOMER', 'REVENUE', 'COGS', 'CASH', 'BANK', 'EXPENSE'
);

create sequence public.purchase_no_seq;
create sequence public.sale_no_seq;
create sequence public.batch_no_seq;

-- ---------------------------------------------------------------- parties
create table public.vendors (
  id              bigint generated always as identity primary key,
  code            text not null unique check (length(btrim(code)) > 0),
  name            text not null check (length(btrim(name)) > 0),
  phone           text,
  address         text,
  opening_balance numeric(14,2) not null default 0,
  balance         numeric(14,2) not null default 0,
  created_at      timestamptz not null default now()
);

create table public.customers (
  id              bigint generated always as identity primary key,
  code            text not null unique check (length(btrim(code)) > 0),
  name            text not null check (length(btrim(name)) > 0),
  phone           text,
  address         text,
  opening_balance numeric(14,2) not null default 0,
  balance         numeric(14,2) not null default 0,
  created_at      timestamptz not null default now()
);

-- ------------------------------------------------------------------ items
create table public.items (
  id                bigint generated always as identity primary key,
  sku               text not null unique check (length(btrim(sku)) > 0),
  name              text not null check (length(btrim(name)) > 0),
  type              public.item_type not null,
  unit              text not null default 'KG',
  avg_cost          numeric(14,4) not null default 0 check (avg_cost >= 0),
  avg_purchase_rate numeric(14,4) not null default 0 check (avg_purchase_rate >= 0),
  avg_selling_rate  numeric(14,4) not null default 0 check (avg_selling_rate >= 0),
  qty               numeric(14,3) not null default 0 check (qty >= 0),
  reorder_level     numeric(14,3) not null default 0 check (reorder_level >= 0),
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- -------------------------------------------------------------- purchases
create table public.purchases (
  id             bigint generated always as identity primary key,
  invoice_no     text not null unique
                 default ('PUR-' || lpad(nextval('public.purchase_no_seq')::text, 6, '0')),
  date           timestamptz not null default now(),
  vendor_id      bigint not null references public.vendors (id) on delete restrict,
  subtotal       numeric(14,2) not null check (subtotal >= 0),
  total          numeric(14,2) not null check (total >= 0),
  paid           numeric(14,2) not null default 0,
  payment_method public.payment_method not null default 'CASH',
  notes          text,
  created_at     timestamptz not null default now(),
  constraint purchases_paid_range check (paid >= 0 and paid <= total)
);

create table public.purchase_lines (
  id          bigint generated always as identity primary key,
  purchase_id bigint not null references public.purchases (id) on delete cascade,
  item_id     bigint not null references public.items (id) on delete restrict,
  qty         numeric(14,3) not null check (qty > 0),
  rate        numeric(14,4) not null check (rate >= 0),
  amount      numeric(14,2) not null check (amount >= 0)
);

-- ------------------------------------------------------ recipes/production
create table public.recipes (
  id             bigint generated always as identity primary key,
  name           text not null check (length(btrim(name)) > 0),
  version        integer not null default 1,
  output_item_id bigint not null references public.items (id) on delete restrict,
  output_qty     numeric(14,3) not null check (output_qty > 0),
  active         boolean not null default true,
  created_at     timestamptz not null default now()
);

create table public.recipe_lines (
  id         bigint generated always as identity primary key,
  recipe_id  bigint not null references public.recipes (id) on delete cascade,
  item_id    bigint not null references public.items (id) on delete restrict,
  qty        numeric(14,3) not null check (qty > 0),
  percentage numeric(7,3) not null default 0,
  unique (recipe_id, item_id)
);

create table public.production_batches (
  id             bigint generated always as identity primary key,
  batch_no       text not null unique
                 default ('BATCH-' || lpad(nextval('public.batch_no_seq')::text, 6, '0')),
  recipe_id      bigint not null references public.recipes (id) on delete restrict,
  output_item_id bigint not null references public.items (id) on delete restrict,
  planned_qty    numeric(14,3) not null check (planned_qty > 0),
  actual_qty     numeric(14,3) not null check (actual_qty > 0),
  good_qty       numeric(14,3) not null check (good_qty > 0),
  wastage_qty    numeric(14,3) not null check (wastage_qty >= 0),
  total_cost     numeric(14,2) not null check (total_cost >= 0),
  cost_per_kg    numeric(14,4) not null check (cost_per_kg >= 0),
  date           timestamptz not null default now(),
  created_at     timestamptz not null default now()
);

-- ------------------------------------------------------------------ sales
create table public.sales (
  id             bigint generated always as identity primary key,
  invoice_no     text not null unique
                 default ('SAL-' || lpad(nextval('public.sale_no_seq')::text, 6, '0')),
  date           timestamptz not null default now(),
  customer_id    bigint not null references public.customers (id) on delete restrict,
  subtotal       numeric(14,2) not null check (subtotal >= 0),
  total          numeric(14,2) not null check (total >= 0),
  received       numeric(14,2) not null default 0,
  payment_method public.payment_method not null default 'CREDIT',
  notes          text,
  created_at     timestamptz not null default now(),
  constraint sales_received_range check (received >= 0 and received <= total)
);

create table public.sale_lines (
  id          bigint generated always as identity primary key,
  sale_id     bigint not null references public.sales (id) on delete cascade,
  item_id     bigint not null references public.items (id) on delete restrict,
  qty         numeric(14,3) not null check (qty > 0),
  rate        numeric(14,4) not null check (rate >= 0),
  cost_rate   numeric(14,4) not null check (cost_rate >= 0),
  amount      numeric(14,2) not null check (amount >= 0),
  cost_amount numeric(14,2) not null check (cost_amount >= 0)
);

-- --------------------------------------------------- expenses / ledgers
create table public.expenses (
  id             bigint generated always as identity primary key,
  date           timestamptz not null default now(),
  category       text not null check (length(btrim(category)) > 0),
  description    text not null check (length(btrim(description)) > 0),
  amount         numeric(14,2) not null check (amount > 0),
  payment_method public.payment_method not null default 'CASH'
                 check (payment_method <> 'CREDIT'),
  created_at     timestamptz not null default now()
);

create table public.stock_moves (
  id         bigint generated always as identity primary key,
  date       timestamptz not null default now(),
  item_id    bigint not null references public.items (id) on delete restrict,
  type       public.tx_type not null,
  qty        numeric(14,3) not null,
  rate       numeric(14,4) not null,
  value      numeric(14,2) not null,
  ref_type   text,
  ref_id     bigint,
  created_at timestamptz not null default now()
);

create table public.ledger_entries (
  id           bigint generated always as identity primary key,
  date         timestamptz not null default now(),
  account_type public.account_type not null,
  account_id   bigint,
  debit        numeric(14,2) not null default 0 check (debit >= 0),
  credit       numeric(14,2) not null default 0 check (credit >= 0),
  description  text not null,
  ref_type     text,
  ref_id       bigint,
  created_at   timestamptz not null default now()
);

-- Foreign-key and query indexes
create index purchases_vendor_id_idx        on public.purchases (vendor_id);
create index purchases_date_idx             on public.purchases (date desc);
create index purchase_lines_purchase_id_idx on public.purchase_lines (purchase_id);
create index purchase_lines_item_id_idx     on public.purchase_lines (item_id);
create index recipes_output_item_id_idx     on public.recipes (output_item_id);
create index recipe_lines_item_id_idx       on public.recipe_lines (item_id);
create index production_batches_recipe_idx  on public.production_batches (recipe_id);
create index production_batches_output_idx  on public.production_batches (output_item_id);
create index production_batches_date_idx    on public.production_batches (date desc);
create index sales_customer_id_idx          on public.sales (customer_id);
create index sales_date_idx                 on public.sales (date desc);
create index sale_lines_sale_id_idx         on public.sale_lines (sale_id);
create index sale_lines_item_id_idx         on public.sale_lines (item_id);
create index expenses_date_idx              on public.expenses (date desc);
create index stock_moves_item_date_idx      on public.stock_moves (item_id, date desc);
create index stock_moves_date_idx           on public.stock_moves (date desc);
create index ledger_entries_date_idx        on public.ledger_entries (date desc);
create index ledger_entries_account_idx     on public.ledger_entries (account_type, account_id);
create index ledger_entries_ref_idx         on public.ledger_entries (ref_type, ref_id);

-- ---------------------------------------------------------------- triggers
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger items_set_updated_at
  before update on public.items
  for each row execute function public.set_updated_at();

-- A new party starts with balance = opening balance (balance is system-managed afterwards).
create function public.init_party_balance()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.balance := new.opening_balance;
  return new;
end;
$$;

create trigger vendors_init_balance
  before insert on public.vendors
  for each row execute function public.init_party_balance();

create trigger customers_init_balance
  before insert on public.customers
  for each row execute function public.init_party_balance();
