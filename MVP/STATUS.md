# Hesabu release status

Last updated: 17 November 2026

## Release target

- Repository: `Mark2631/Hesabu`
- Production release branch: `main` (merged and deployed)
- Production application: [https://hesabu-seven.vercel.app](https://hesabu-seven.vercel.app)
- Production release commit: `273f3b1ef0f45acb037547da05aaa12786168ac0`
- Supabase project: `waadpyucxpgvbkpzbnju` (Mark Sanchez Supabase account)
- Currency and timezone defaults: KES and `Africa/Nairobi`

The production `main` release already contains the finance-first mobile UI, responsive auth page, light/dark appearance, and Google Material Symbols bottom navigation. The current release branch adds atomic point-of-sale posting and database-backed team invitations. It must pass both the Vite production build and PostgreSQL integration job before promotion.

## Verified live backend

The live Supabase project is active. The following migrations were confirmed as applied before this release branch:

1. `202611160001_mvp_foundation`
2. `202611160002_operational_ledger`
3. `performance_indexes_and_policy_initplan`
4. `atomic_sales_team_invitations`
5. `business_invitation_fk_indexes`

The public schema includes the business, team membership, settings, products, suppliers, invoices, invoice lines, payments, receipts, expenses, purchasing, inventory movements, cash movements, journals, integration events and digest delivery logs. RLS is enabled on the business tables. The security advisor returned no lints at the last check.

The application reads and writes persisted cloud records for the core operational workflows: sales, payments, products, suppliers, expenses, purchase orders, receipts, supplier settlement and stock adjustments. The database posting functions enforce business membership and role checks. The release migration adds:

- One transaction for invoice, stock, point-of-sale payment and journal posting.
- Seven-day, single-use invitation links.
- Verified-email matching before a team invitation can be redeemed.
- Database-enforced role changes and invitation revocation.
- Roster visibility for business members while invitation tokens remain restricted to owners and managers.

The atomic sales/team invitation migration and its foreign-key index migration have both been applied to the live Supabase project. The CI PostgreSQL job also passed the full migration, tenant-isolation, invitation, membership-write and ledger rollback suite.

## Current product behaviour

- New business owners can register and create an isolated business workspace.
- Team members use their own Hesabu account and are attached to a business through an invitation.
- Sales, payments, inventory, supplier purchasing, expenses and finance views use cloud-backed business records.
- The interface starts from an empty workspace for a new business; it does not preload fabricated sales.
- A team invitation is shared as a secure link. The current release does not send invitation emails itself.
- The browser client uses direct authenticated Auth/PostgREST requests in `src/lib/supabase.ts`. It is not yet the official `@supabase/supabase-js` SDK.

## Verification boundaries

The merged `main` release has passed the TypeScript and Vite production build, standard JavaScript tests, PostgreSQL migration suite, tenant isolation tests, invitation/role permission tests, atomic sale rollback tests and database exposure checks. The Vercel production deployment is marked READY.

A successful migration test in disposable PostgreSQL is not the same as an end-to-end test with a real email account, real business staff or a live merchant payment. No business data was present in the live project during the last schema inspection.

## Integrations not connected

- Safaricom Daraja STK Push and callback processing.
- Automatic WhatsApp Business Platform delivery or scheduled messaging.
- Generative AI and voice capture.
- Production website checkout, merchant API keys and webhooks.
- Google OAuth or other social sign-in providers.

The application must not label these as active until their server-side integrations, secrets, provider configuration and end-to-end tests exist.


## Cloud receipts and preview release

- Manual M-Pesa/bank receipt capture is available in the cloud Payments workspace.
- Receipt allocation uses an idempotent database posting function; duplicate retries cannot create a second payment.
- Provider statement import, verified M-Pesa callbacks and automatic receipt ingestion remain separate provider integrations.
- Preview branch: `preview`; production `main` remains unchanged by this release.
