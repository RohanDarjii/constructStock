# Server infrastructure

This folder holds infrastructure shared by modules. It includes environment validation, a MongoDB connection helper, HTTP envelopes and errors, cookie handling, a session-context type, and structured logging. Auth session verification lives in `modules/auth/`. Permission and site-scope checks, inventory idempotency, and private Blob storage will be added with their corresponding milestones.

Server files must import `server-only` where they contain secrets, database access, or authentication state. Keep request-specific tenant context explicit; never place it in global mutable state.
