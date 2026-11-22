# Test layout

- Unit tests live beside pure domain code or under `tests/unit/`.
- `tests/integration/` exercises authentication against a transaction-capable MongoDB test database and will also cover tenant-scoped repositories and atomic stock workflows.
- `tests/api/` will check `/api/v1` envelopes, validation, auth, permissions, site scope, idempotency, and cross-tenant access.
- `tests/e2e/` will cover the key browser journeys once the pages exist.

Prioritize inventory invariants, FIFO, reservations, in-transit accounting, concurrent deductions, rollback, reversals, and ledger reconciliation. Use isolated test data; do not point tests at production Atlas.
