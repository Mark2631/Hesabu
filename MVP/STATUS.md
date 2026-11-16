# Hesabu MVP branch status

Last updated: 16 November 2026

## Working branch

- Repository: `Mark2631/Hesabu`
- Branch: `build/hesabu-mvp-cloud-foundation`
- Production `main` has not been changed.
- No production deployment has been requested or triggered.

## Implemented on this branch

- Public Hesabu product page with responsive navigation, service explanation, business workflow, audience section, trust information and structured footer.
- Separate sign-in and create-account screen.
- Browser-side Supabase Auth/PostgREST integration for sign-up, sign-in, token refresh, session restore and sign-out.
- Atomic business creation call, owner membership setup and business onboarding-preference persistence.
- Email-confirmation recovery using non-secret onboarding information; passwords are not stored in the pending onboarding draft.
- Signup choices for manual entry, optional AI assistant and optional WhatsApp digest. Manual entry is always available; AI and WhatsApp can both be enabled.
- Cloud account screen that reads business settings and the daily-digest RPC and prepares a WhatsApp share from cloud figures. The user reviews the message and presses Send.
- Floating Daily digest / Ask Hesabu dock in the local preview workspace; only one panel is open at a time.
- Compact dashboard quick actions and revised responsive typography/spacing. Inter is retained.
- Foundation and operational migrations with business tenancy, RLS, role permissions, private SECURITY DEFINER implementations and public SECURITY INVOKER RPC wrappers.
- Atomic product creation/opening stock, sale posting, payment allocation, expense posting, purchase-order creation, partial goods receipt, supplier settlement, stock adjustment and daily-digest functions.
- SQL contract checks and PostgreSQL 17 CI validation with end-to-end tenant and ledger tests.
- Supabase URL and publishable key configured in the Vercel Preview environment for this branch only. Production environment was not changed.

The current frontend client in `src/lib/supabase.ts` uses direct `fetch` calls to Supabase Auth/PostgREST. It is not yet the official `@supabase/supabase-js` SDK and should be migrated before production.

## Verification

<badge>CI passed</badge> Latest verified branch commit: `a3fd78b258507e42dc5e73ca0ee9c89541c94e84`.

GitHub Actions passed:
- Existing ledger tests and migration-contract tests.
- TypeScript check and Vite production build.
- Both migrations applied to a temporary PostgreSQL 17 database using a minimal Supabase Auth test schema.
- Sale, payment idempotency, expense, purchase-order receipt, supplier settlement, stock-adjustment and daily-digest runtime checks.
- Two-business tenant isolation tests.
- RLS-enabled table and public/private function privilege checks.

This is CI verification in a disposable PostgreSQL database. It is not a live migration or live Auth test against the user's Supabase project.

## Live Supabase project status

Target project: `waadpyucxpgvbkpzbnju` at `https://waadpyucxpgvbkpzbnju.supabase.co`, under the Mark Sanchez account.

The supplied Supabase dashboard screenshot showed Healthy, no migrations, no branches and no backups. However, the Supabase connector available in this workspace does not list this project and returns a permission error when its project/tables are requested.

Therefore:
- Neither migration has been applied to the live project.
- Existing live tables, RLS policies, Auth settings, extensions and advisor reports have not been inspected.
- The branch's Auth and cloud digest flows have not been verified against the live project.
- No live business data has been written.

## Remaining before the cloud workspace is production-usable

1. Restore connector access to project `waadpyucxpgvbkpzbnju`.
2. Inspect its current schema, Auth settings, migrations, RLS and security/performance advisors.
3. Reconcile and apply the migrations to a non-production branch/project, preserving any existing objects and data.
4. Verify Auth and cloud digest flows against the real project.
5. Replace the custom browser REST/Auth client with the official Supabase JS SDK.
6. Connect the operational React screens to persisted products, sales, payments, expenses, suppliers, purchasing, inventory and reports. The main ledger screens still use local preview data.
7. Inspect the Vercel Preview deployment after the team access approval. Production remains untouched.

## Integrations not live yet

- Generative AI: signup preference is stored, but no model or server-side Edge Function is connected.
- WhatsApp scheduled delivery: not connected to WhatsApp Business Platform. Click-to-chat preparation requires the user to press Send.
- M-Pesa/Daraja: existing payment request UI is a simulation, not a real STK push/callback.
- Website checkout/webhooks: demonstration-only.

