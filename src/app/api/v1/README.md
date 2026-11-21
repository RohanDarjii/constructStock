# Versioned REST API

Create App Router `route.ts` files here as the `/api/v1` contract is implemented. Handlers parse and validate HTTP input, resolve the authenticated session context, enforce permission and site scope, invoke one domain service operation, and map the result to the standard response envelope. Keep Mongoose queries, inventory allocation, and state transitions out of handlers.

Route directories use plural kebab-case resource names and dynamic segments such as `[poId]`. Workflow changes use explicit action paths such as `[poId]/approve`.
