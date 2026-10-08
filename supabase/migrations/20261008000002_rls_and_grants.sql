-- Access model: one owner. Signups are disabled; the owner's auth user carries
-- app_metadata.erp_owner = true (app_metadata is NOT user-editable, unlike user_metadata).
-- Master data is fully editable; transactional/audit tables are insert-only (no update/delete),
-- so history cannot be silently rewritten.

do $$
declare
  t text;
  owner_check constant text :=
    $c$((select auth.jwt() -> 'app_metadata' ->> 'erp_owner') = 'true')$c$;
begin
  -- Master data: full CRUD for the owner
  foreach t in array array['vendors', 'customers', 'items', 'recipes', 'recipe_lines'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('create policy "owner select" on public.%I for select to authenticated using (%s)', t, owner_check);
    execute format('create policy "owner insert" on public.%I for insert to authenticated with check (%s)', t, owner_check);
    execute format('create policy "owner update" on public.%I for update to authenticated using (%s) with check (%s)', t, owner_check, owner_check);
    execute format('create policy "owner delete" on public.%I for delete to authenticated using (%s)', t, owner_check);
  end loop;

  -- Transactions & ledgers: read + insert only
  foreach t in array array[
    'purchases', 'purchase_lines', 'sales', 'sale_lines',
    'production_batches', 'expenses', 'stock_moves', 'ledger_entries'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert on public.%I to authenticated', t);
    execute format('create policy "owner select" on public.%I for select to authenticated using (%s)', t, owner_check);
    execute format('create policy "owner insert" on public.%I for insert to authenticated with check (%s)', t, owner_check);
  end loop;
end
$$;

-- Document-number sequences are used by column defaults under the caller's privileges.
revoke all on sequence public.purchase_no_seq, public.sale_no_seq, public.batch_no_seq from anon, authenticated;
grant usage on sequence public.purchase_no_seq, public.sale_no_seq, public.batch_no_seq to authenticated;
