# Capability modules

The `auth` module now owns company onboarding and core authentication. Other module folders remain boundaries for future work. As behavior is implemented, each may contain `components/` for feature UI, `schemas/` for Zod contracts, `services/` for business workflows, `repositories/` for scoped persistence, `models/` for Mongoose schemas, and `mappers/` for API/UI representations. Avoid generating empty layers.

Planned v1 modules: `auth`, `organizations`, `users`, `sites`, `materials` (including categories), `suppliers`, `purchasing`, `receiving`, `inventory`, `consumption`, `wastage`, `transfers`, `alerts`, `reports`, `files`, and `audit`.

Module services may call other module services through explicit operations. They must not write another module's collections directly. The inventory module owns all batch, balance, reservation, in-transit, and ledger movements.
