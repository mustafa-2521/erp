# Mustafa Inks ERP

Single-owner manufacturing & inventory tracker. Next.js (App Router) + Supabase (Postgres, Auth, RLS).

## Architecture

- **Database** (`supabase/migrations/`): tables, constraints, indexes, RLS and business logic.
- **Business transactions** are atomic Postgres functions called with `supabase.rpc`:
  `create_purchase`, `create_sale`, `create_production`, `create_expense`, `create_recipe`, `dashboard_summary`.
  They update stock (weighted-average cost), party balances, stock moves and the double-entry ledger in one transaction.
- **Security**: RLS on every table. Only the owner (auth user with `app_metadata.erp_owner = true`) has access.
  Transaction/ledger tables are insert-only. Public signups must stay disabled.
- **Web** (`src/`): Next.js app uses the publishable key; middleware gates all routes behind login.

## Setup

1. Copy `.env.example` to `.env.local` and fill in the project URL and publishable key.
2. In the Supabase dashboard: Authentication → Sign In / Providers → disable "Allow new users to sign up".
3. Create the owner user (Authentication → Users → Add user, auto-confirm), then run once in the SQL editor:
   ```sql
   update auth.users
   set raw_app_meta_data = raw_app_meta_data || '{"erp_owner": true}'
   where email = 'you@example.com';
   ```
4. `npm install && npm run dev` → http://localhost:3000

Schema changes: add a new file in `supabase/migrations/` and apply it (never edit applied migrations).
