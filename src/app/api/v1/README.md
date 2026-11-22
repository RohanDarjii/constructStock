# Versioned REST API

App Router `route.ts` files implement the `/api/v1` contract. The auth routes are available under `auth/`. Handlers parse and validate HTTP input, resolve the authenticated session context, enforce permission and site scope where applicable, invoke one domain service operation, and map the result to the standard response envelope. Keep Mongoose queries, inventory allocation, and state transitions out of handlers.

Route directories use plural kebab-case resource names and dynamic segments such as `[poId]`. Workflow changes use explicit action paths such as `[poId]/approve`.
