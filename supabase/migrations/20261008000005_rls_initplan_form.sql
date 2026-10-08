-- Recreate owner policies using the (select auth.jwt()) form so the planner evaluates it once per query.

do $$
declare
  t text;
  owner_check constant text :=
    $c$(((select auth.jwt()) -> 'app_metadata' ->> 'erp_owner') = 'true')$c$;
begin
  foreach t in array array['vendors', 'customers', 'items', 'recipes', 'recipe_lines'] loop
    execute format('drop policy "owner select" on public.%I', t);
    execute format('drop policy "owner insert" on public.%I', t);
    execute format('drop policy "owner update" on public.%I', t);
    execute format('drop policy "owner delete" on public.%I', t);
    execute format('create policy "owner select" on public.%I for select to authenticated using (%s)', t, owner_check);
    execute format('create policy "owner insert" on public.%I for insert to authenticated with check (%s)', t, owner_check);
    execute format('create policy "owner update" on public.%I for update to authenticated using (%s) with check (%s)', t, owner_check, owner_check);
    execute format('create policy "owner delete" on public.%I for delete to authenticated using (%s)', t, owner_check);
  end loop;

  foreach t in array array[
    'purchases', 'purchase_lines', 'sales', 'sale_lines',
    'production_batches', 'expenses', 'stock_moves', 'ledger_entries'
  ] loop
    execute format('drop policy "owner select" on public.%I', t);
    execute format('drop policy "owner insert" on public.%I', t);
    execute format('create policy "owner select" on public.%I for select to authenticated using (%s)', t, owner_check);
    execute format('create policy "owner insert" on public.%I for insert to authenticated with check (%s)', t, owner_check);
  end loop;
end
$$;
