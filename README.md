# Mustafa Inks ERP

Responsive manufacturing and inventory ERP built with Next.js, NestJS, Prisma and MySQL.

## Start locally with WAMP

1. Start MySQL in WAMP and create a database named `mustafa_inks_erp` using `utf8mb4`.
2. Copy `.env.example` to `.env` in the project root. Set the MySQL username and password in `DATABASE_URL` if your WAMP credentials differ from the example.
3. Copy `packages/database/.env.example` to `packages/database/.env` and use the same `DATABASE_URL`.
4. From the project root run:

   ```sh
   npm install
   npm run db:generate
   npm run db:push
   npm run dev
   ```

5. Open `http://localhost:3000`.

The application has a dashboard, item inventory, customer and vendor records, purchases, sales, recipes, production batches, expenses, account ledger and summary reports. Purchases increase stock and update weighted-average cost. Sales reduce stock, reject insufficient inventory, record cost of goods sold and update customer balances. Production consumes recipe ingredients and adds finished stock.

If your MySQL password contains reserved URL characters, URL-encode them in `DATABASE_URL`.
# erp
