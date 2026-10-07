# Synopse Workspace Instructions

Synopse is an email-driven incident and alert triage application. Keep the product name, P1-P4 priority model, SLA behavior, PostgreSQL data model, and server-side secret boundaries consistent across changes.

- Use TypeScript, Next.js App Router, and the existing CSS conventions.
- Keep provider credentials server-side in environment variables; never expose tokens or raw secrets to client components.
- Treat inbound email as untrusted input and preserve the original message for auditability.
- Follow the documented main -> uat -> production promotion flow.
- Run `npm run typecheck`, `npm run lint`, and `npm run build` when Node.js dependencies are available.
