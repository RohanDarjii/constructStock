# ConstructStock

ConstructStock is a multi-company construction material inventory and waste management application. This repository is a full-stack Next.js App Router modular monolith. The product requirements and approved design live in [`docs/`](docs/); the latest v1 decisions are recorded in [`docs/ConstructStock_Architecture_Decisions_v1.md`](docs/ConstructStock_Architecture_Decisions_v1.md).

## Current status

The app includes a landing page, company/Owner registration, login, server-side sessions, and a protected dashboard. Sites, materials, suppliers, and team members have tenant-scoped management flows. Inventory provides site balances, costed batches, movement history, and audited stock adjustments. Purchase Orders support draft creation/editing, server-calculated commercial totals, submission, approval/rejection, ordering, cancellation, site access, and audit history at `/purchase-orders`. Goods receiving at `/goods-receipts` records partial or final deliveries against ordered POs, creates costed inventory batches and ledger entries, and supports audited reversal of untouched receipt stock. Consumption, wastage, transfers, password reset, and organization switching are later milestones.

## Local setup

1. Install Node.js 22 or newer and run `npm install`.
2. Copy `.env.example` to `.env.local`. Set `MONGODB_URI` to a development MongoDB Atlas replica set, `TOKEN_PEPPER` to a random secret of at least 32 characters, and `APP_URL` to the local app URL. Keep all secrets in environment variables; do not commit them.
3. Run `npm run dev` and open `http://localhost:3000`. Register a company, then sign in immediately. Restart the server after changing `.env.local`. The dashboard requires an active server-side session.

Registration uses a MongoDB transaction. The database must support transactions; a standalone MongoDB server is insufficient. Email verification is not part of the current sign-in flow.

Owners and Admins can manage staff at `/team`. Invitation links are shown once when created or reissued; copy and share them securely. Email delivery is not configured yet. Inviting an email that already has a ConstructStock account requires the future multi-organization switcher.

An Owner can record opening stock or a physical-count correction under `/inventory/adjustments/new`. Incoming adjustments require a unit cost in the organization's currency. Stock is never allowed below zero, and reserved stock cannot be removed. Purchase orders do not change inventory; confirming a goods receipt does. PO prices are tax-exclusive, with line subtotals and tax rounded half-up to two decimals before totals are summed.

## Local commands

- `npm run dev` — start the app shell at `http://localhost:3000`.
- `npm run typecheck` — check TypeScript.
- `npm run lint` — run ESLint.
- `npm run build` — verify the production build.
- `npm run test:integration` — run isolated auth, team, site, material, supplier, inventory, and purchase order, and goods receiving integration tests against a temporary MongoDB replica set; the first run may download a MongoDB test binary.

Never commit real secrets. Use separate resources for local, preview, test, and production environments.

## Code boundaries

- `src/app/`: Next.js pages and thin `/api/v1` route handlers. The dashboard layout checks the current session on the server.
- `src/components/`: UI shared across features.
- `src/modules/`: capability-owned UI, schemas, domain services, repositories, and models. See its README for the planned module map.
- `src/server/`: cross-module server infrastructure. Database and secrets stay server-only. Cookie-authenticated mutations use a same-origin check and a session-bound CSRF token available from `GET /api/v1/auth/csrf`.
- `src/shared/`: code safe to import in both server and browser modules.
- `tests/`: integration, API, and browser tests as workflows are built.
- `scripts/`: controlled migrations, index changes, and reconciliation operations.

Server-rendered pages and API handlers must use the same authenticated service layer. Domain services own business rules; repositories own tenant-scoped data access. Inventory records are changed only inside audited, idempotent transactions. Goods receiving coordinates PO, receipt, batch, balance, and ledger updates in one MongoDB transaction.
