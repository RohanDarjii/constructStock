# ConstructStock v1 architecture decisions

These decisions were approved after the PRD, System Design Architecture, Database Design, and API Design documents. Where earlier wording differs, these decisions control the v1 implementation.

## 1. Active organization

- Each opaque server-side session has one active `organizationId`.
- If the user has exactly one active organization membership, it is selected automatically.
- A future organization switcher updates the session only after the backend verifies an active membership in the target organization.
- Every business request derives `organizationId` from the authenticated session. A client-supplied tenant ID is never trusted as request context.

## 2. Attachments

- Add a tenant-scoped `file_attachments` collection with Blob key, file metadata, upload state, owner, and linked entity information.
- Use private Vercel Blob storage and authorize file reads and downloads through the files API.
- Database state is committed before a Blob operation. Uploads therefore start with a committed pending metadata record; a successful Blob upload is followed by metadata finalization. Failed or abandoned pending records need a retry/cleanup path.
- Finalized evidence attached to immutable transactions is not silently removed.

## 3. Transfers and in-transit inventory

- The only v1 state path is `REQUESTED → APPROVED → DISPATCHED → RECEIVED`; `DISPATCHED` means in transit.
- Approval reserves source batch/balance quantity without reducing source on-hand.
- Dispatch removes source on-hand and releases the corresponding reservation.
- Receipt creates destination batch lineage and increases destination on-hand.
- A v1 transfer contains exactly one material.
- A dispatched transfer retains its in-transit quantity, source batch allocations, unit-cost snapshots, and value separately from both sites' on-hand balances. Organization-owned quantity while in transit is `sum(site on-hand) + sum(dispatched in-transit quantity)`. The in-transit representation and ledger entries change in the same transaction as the transfer transition.

## 4. Stock and receiving

- Available stock may not become negative. There is no over-issue override in v1.
- Goods receiving is permitted only for `ORDERED` or `PARTIALLY_RECEIVED` purchase orders.
- Confirmed stock history is corrected with adjustment or reversal transactions, never deletion or direct ledger editing.

## 5. Decimal and commercial policy

- Persist quantity and money using MongoDB `Decimal128`; calculate in application code with `decimal.js`.
- Each organization has one currency. Store its ISO 4217 currency code on the organization.
- Money supports two decimal places. `BAG` and `PIECE` quantities are whole numbers; measurement units support up to three decimal places. Tax rates support up to four decimal places. Monetary totals are rounded to two decimal places.
- A material's unit is immutable after its first inventory transaction.
- Purchase order prices are tax-exclusive. For each line, round `quantity × unitPrice` to two decimals using decimal.js `ROUND_HALF_UP`, then round that line's `subtotal × taxRate / 100` to two decimals using the same mode. Sum the rounded line subtotals and tax amounts for the PO totals. The organization currency is snapshotted on each PO; changing it after the first PO remains unsupported.

## 6. Critical mutations and external effects

- Require an idempotency key for receiving, consumption, wastage, transfer approval, transfer dispatch, transfer receipt, adjustments, and reversals.
- Transfer approval, reservation, audit event, and idempotency record commit in one MongoDB transaction.
- Email and Blob operations happen only after the related database commit. Workflows must retain a recoverable pending state if an external operation fails after commit.
- All critical stock workflows keep the business document, affected batches/balances, ledger records, audit event, and idempotency outcome consistent in one transaction.
