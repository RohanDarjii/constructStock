# Server infrastructure

This folder holds infrastructure shared by modules. The scaffold includes environment validation, a MongoDB connection helper, HTTP envelopes and errors, a session-context type, and structured logging. Session verification, permission and site-scope checks, idempotency, private Blob storage, and email delivery will be added with their corresponding milestones.

Server files must import `server-only` where they contain secrets, database access, or authentication state. Keep request-specific tenant context explicit; never place it in global mutable state.
