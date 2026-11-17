# Hesabu product and engineering audit

Audit date: 17 November 2026

The verified release is merged into `main` and its Vercel production deployment is READY.

## Current architecture

Hesabu is a React/Vite business workspace backed by Supabase Auth, Postgres and PostgREST. The business data model separates sales, invoice lines, payments, unmatched receipts, expenses, products, suppliers, purchase orders, stock movements, cash movements and accounting journals.

The production UI uses a mobile-first finance hierarchy, a restrained green/lime palette, DM Sans, Google Material Symbols navigation, a bottom tab bar and a light/dark appearance mode.

The browser client in `src/lib/supabase.ts` currently wraps Auth and PostgREST using direct `fetch` calls. It works with the current Supabase configuration, but it is not the official Supabase JS SDK.

## Areas verified

- Live Supabase project exists and is active.
- Business tables have RLS enabled; the latest security advisor check returned no findings.
- Core cloud read/write flows exist for the operational ledger.
- Business operations post through database functions with server-side role checks.
- Sales, payments, purchasing and journal entries use database posting functions rather than direct browser-side table mutations.
- The finance-first mobile dashboard and redesigned authentication shell are deployed to production.
- The live database now commits cash sales, stock movements, payment and journal entries through one transaction.
- The live database now has database-backed team invitations and role management, with verified-email matching, seven-day expiry, revocation and direct membership table writes blocked.
- Standard JavaScript tests, the Vite production build, PostgreSQL migrations, invitation acceptance/role tests, atomic transaction rollback, tenant isolation and database exposure checks all passed in CI. The feature branch preview is READY.

## Known integration boundaries

1. **M-Pesa:** manual payment records only; no Safaricom STK Push, callback or reconciliation.
2. **WhatsApp:** operator-reviewed click-to-chat only; no automatic Business Platform delivery.
3. **AI and voice:** no generative model, transcription service or voice-to-ledger flow is connected.
4. **Online checkout:** illustrative interface only; no production checkout, API credential or signed webhook.
5. **Google OAuth:** not configured; email/password is the current authentication method.
6. **Invitation email:** the owner/manager shares a secure invitation link; Hesabu does not send invitation email.

These are deliberate integration boundaries, not working features. The product copy must continue to state them clearly.

## Remaining engineering priorities

1. Complete and apply the atomic sale/team invitation migration only after PostgreSQL CI passes.
2. Test signup, email confirmation, sign-in, team invitation acceptance, suspension and role changes with two real verified accounts.
3. Migrate the direct-fetch Auth/PostgREST client to the official Supabase JS SDK and test refresh, redirect and multi-business session handling.
4. Add a deliberate business/workspace switcher for users who belong to more than one business.
5. Add operational observability for failed writes, idempotency conflicts and provider callbacks before connecting payment integrations.
6. Add backup/restore verification, data export and documented account deletion/retention flows.
7. Connect integrations one at a time, keeping all provider secrets server-side and requiring end-to-end provider testing before enabling their UI.

## Release rule

Do not promote a branch solely because the frontend builds. Require JavaScript tests, PostgreSQL migration and tenant-isolation tests, production build, live migration verification, and a production deployment marked READY.