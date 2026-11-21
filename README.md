# ConstructStock

ConstructStock is a multi-company construction material inventory and waste management application. This repository is the initial full-stack Next.js App Router scaffold. The product requirements and approved design live in [`docs/`](docs/); the latest v1 decisions are recorded in [`docs/ConstructStock_Architecture_Decisions_v1.md`](docs/ConstructStock_Architecture_Decisions_v1.md).

## Current status

The scaffold supplies the app shell, placeholder dashboard and authentication pages, TypeScript and Tailwind configuration, validated server environment access, a cached Mongoose connection, shared HTTP errors/responses, logging, and empty capability boundaries. Authentication, business API endpoints, and inventory workflows are planned modules; they are not yet operational.

## Local setup

1. Install Node.js 22 or newer and run `npm install`.
2. Run `npm run dev` and open `http://localhost:3000`.
3. When database connectivity is needed, copy `.env.example` to `.env.local` and set `MONGODB_URI` for a development MongoDB Atlas database. The placeholder pages do not connect to MongoDB.

## Local commands

- `npm run dev` — start the app shell at `http://localhost:3000`.
- `npm run typecheck` — check TypeScript.
- `npm run lint` — run ESLint.
- `npm run build` — verify the production build.

Never commit real secrets. Use separate resources for local, preview, test, and production environments.

## Code boundaries

- `src/app/`: Next.js pages and, as features arrive, thin `/api/v1` route handlers. The current authentication and dashboard pages are placeholders without access control.
- `src/components/`: UI shared across features.
- `src/modules/`: capability-owned UI, schemas, domain services, repositories, and models. See its README for the planned module map.
- `src/server/`: cross-module server infrastructure. Database and secrets stay server-only.
- `src/shared/`: code safe to import in both server and browser modules.
- `tests/`: integration, API, and browser tests as workflows are built.
- `scripts/`: controlled migrations, index changes, and reconciliation operations.

Server-rendered pages and API handlers must use the same authenticated service layer. Domain services own business rules; repositories own tenant-scoped data access. Inventory is the only module allowed to apply stock movements to batches, balances, and ledger records.
