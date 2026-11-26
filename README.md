# ConstructStock

ConstructStock is a multi-company construction material inventory and waste management application. This repository is a full-stack Next.js App Router modular monolith. The product requirements and approved design live in [`docs/`](docs/); the latest v1 decisions are recorded in [`docs/ConstructStock_Architecture_Decisions_v1.md`](docs/ConstructStock_Architecture_Decisions_v1.md).

## Current status

The app includes a landing page, company/Owner registration, login, password recovery, server-side sessions, and a protected dashboard. Sites, materials, suppliers, and team members have tenant-scoped management flows. Inventory provides site balances, costed batches, movement history, and audited stock adjustments. Purchase Orders support draft creation/editing, server-calculated commercial totals, submission, approval/rejection, ordering, cancellation, site access, and audit history at `/purchase-orders`. Goods receiving at `/goods-receipts` records partial or final deliveries against ordered POs, creates costed inventory batches and ledger entries, supports private invoice/challan attachments, and permits audited reversal of untouched receipt stock. Material consumption at `/consumptions` issues available stock by FIFO, records recipients and activities, and supports governed reversal. Material wastage at `/wastages` records available on-hand stock losses with FIFO allocation, optional private photos, reporting by reason and site, and governed reversal. Inter-site transfers at `/transfers` support request, approval with FIFO reservation, dispatch into in-transit stock, and destination receipt with linked batches. Inventory alerts at `/alerts` track low and depleted available stock, with acknowledgment and automatic recovery. The dashboard, `/reports`, `/audit-logs`, and `/settings` provide authorized operational views and organization administration. Organization switching is a later milestone.

## Local setup

1. Install Node.js 22 or newer and run `npm install`.
2. Copy `.env.example` to `.env.local`. Set `MONGODB_URI` to a development MongoDB Atlas replica set, `TOKEN_PEPPER` to a random secret of at least 32 characters, and `APP_URL` to the local app URL. Keep all secrets in environment variables; do not commit them.
3. Run `npm run dev` and open `http://localhost:3000`. Register a company, then sign in immediately. Restart the server after changing `.env.local`. The dashboard requires an active server-side session.

Password recovery requires a verified sending domain in Resend, `RESEND_API_KEY`, and `EMAIL_FROM` (for example, `ConstructStock <security@your-verified-domain.com>`). The domain after `@` must be the exact verified domain; verifying the root domain does not verify a sending subdomain. Configure the same values in Vercel for deployed environments. Reset links expire after 30 minutes; a successful reset revokes existing sessions.

Optional wastage photos and receipt invoice/challan files need a **private** Vercel Blob store connected to this project and its `BLOB_READ_WRITE_TOKEN` in `.env.local`. Photos accept JPEG, PNG, or WebP up to 10 MB; receipt documents accept PDF or those image types up to 15 MB each. File creation, linking, metadata reads, and content access check the active organization and site assignment. Receipts and wastage can still be recorded without files. In production, set a random `CRON_SECRET` (at least 32 characters) so the daily Vercel cron can remove unlinked uploads older than 48 hours. Linked evidence remains with its business record, including after reversal.

Reports at `/reports` cover current inventory, purchases, consumption, wastage, suppliers, and site activity. Owners and Admins can see company-wide data; Site Managers see assigned sites. PDF and Excel exports use the same filters and access checks. Reports are bounded to 2,000 rows, and PDF exports to 500 rows; narrow filters for larger datasets. Inventory values reflect current balances, while dated reports use the selected UTC range. Owners and Admins can search audit history at `/audit-logs`. Owners can update the organization name at `/settings`; the currency and workspace identifier remain read-only.

Registration uses a MongoDB transaction. The database must support transactions; a standalone MongoDB server is insufficient. Email verification is not part of the current sign-in flow.

Owners and Admins can manage staff at `/team`. Invitation links are shown once when created or reissued; copy and share them securely. Email delivery is not configured yet. Inviting an email that already has a ConstructStock account requires the future multi-organization switcher.

An Owner can record opening stock or a physical-count correction under `/inventory/adjustments/new`. Incoming adjustments require a unit cost in the organization's currency. Stock is never allowed below zero, and reserved stock cannot be removed. Purchase orders do not change inventory; confirming a goods receipt does. PO prices are tax-exclusive, with line subtotals and tax rounded half-up to two decimals before totals are summed.

Stock alerts are generated during inventory mutations when available quantity (on hand minus reserved) reaches or falls below the material minimum. They escalate when available stock reaches zero and resolve automatically when it rises above the minimum. Acknowledgment records the reviewer and optional note without changing stock. Alert pages and APIs show only sites within the signed-in member's access scope. The first alert read for an organization reconciles balances that predate this feature.

## Local commands

- `npm run dev` — start the app shell at `http://localhost:3000`.
- `npm run typecheck` — check TypeScript.
- `npm run lint` — run ESLint.
- `npm run build` — verify the production build.
- `npm run test:integration` — run isolated auth, team, site, material, supplier, inventory, purchase order, goods receiving, consumption, wastage, transfer, alert, dashboard, report, file-link, audit, and settings integration tests against a temporary MongoDB replica set; the first run may download a MongoDB test binary.

Never commit real secrets. Use separate resources for local, preview, test, and production environments.

## Code boundaries

- `src/app/`: Next.js pages and thin `/api/v1` route handlers. The dashboard layout checks the current session on the server.
- `src/components/`: UI shared across features.
- `src/modules/`: capability-owned UI, schemas, domain services, repositories, and models. See its README for the planned module map.
- `src/server/`: cross-module server infrastructure. Database and secrets stay server-only. Cookie-authenticated mutations use a same-origin check and a session-bound CSRF token available from `GET /api/v1/auth/csrf`.
- `src/shared/`: code safe to import in both server and browser modules.
- `tests/`: integration, API, and browser tests as workflows are built.
- `scripts/`: controlled migrations, index changes, and reconciliation operations.

Server-rendered pages and API handlers must use the same authenticated service layer. Domain services own business rules; repositories own tenant-scoped data access. Inventory records are changed only inside audited, idempotent transactions. Goods receiving coordinates PO, receipt, batch, balance, ledger, attachment links, audit, and idempotency updates in one MongoDB transaction. Consumption and wastage coordinate the business document, FIFO batch depletion, balance, ledger, audit, and idempotency record in one MongoDB transaction. Transfers coordinate request state, FIFO reservation, source dispatch, in-transit value, destination receipt, audit, and idempotency records in MongoDB transactions. File metadata is committed before private Blob upload and linked to the business record inside its transaction.
