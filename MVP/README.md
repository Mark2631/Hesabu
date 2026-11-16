# Hesabu MVP workspace

This folder is the implementation brief for the cloud-backed Hesabu MVP. It is intentionally separate from the existing preview application so the current demo and its local records are not replaced while the production backend is being connected.

## Current status

- Repository: `Mark2631/Hesabu`
- Baseline: `main`
- Working branch: `build/hesabu-mvp-cloud-foundation`
- Frontend: React 18, TypeScript and Vite
- Existing app: a local-first product preview, not a connected production workspace
- Supabase target: `waadpyucxpgvbkpzbnju` (`https://waadpyucxpgvbkpzbnju.supabase.co`) in the Mark Sanchez account. The owner dashboard screenshot supplied on 16 November 2026 shows the project as Healthy, with no migrations, no branches and no backups. The connected Supabase API in this workspace still does not expose this project or permit schema inspection; no migration has been applied.

## Product definition

Hesabu is a business operations workspace for Kenyan small and growing businesses. The first useful release should make everyday records reliable before adding complex automation.

The core record flow is:

1. Record a sale and its line items.
2. Reduce stock in the same database transaction.
3. Record the payment or leave the invoice outstanding.
4. Record expenses and supplier activity.
5. Derive the dashboard and daily digest from saved records.
6. Let an owner review and share the digest, with optional AI assistance.

Manual entry remains available to every account. AI assistance and WhatsApp summaries are independent preferences: a business can enable either one, both, or neither. They must not be mutually exclusive radio choices.

## Work already applied on this branch

- Added a paired floating Daily digest / Ask Hesabu dock. Its two panels are mutually exclusive so they cannot overlap.
- Added a WhatsApp digest preview with today's totals, an editable destination and a pre-filled click-to-chat action. The user still presses Send in WhatsApp; the data source is still the local preview until Supabase is connected.
- Reduced the dashboard quick-action card padding and tile height.
- Kept the existing Inter font family and set a legible scale in the UI specification rather than shrinking every label.

These are branch changes, not production changes. The sign-in flow, AI generation, multi-user data and scheduled WhatsApp delivery remain blocked on the backend and provider integrations described below.

## Folder guide

- `AUDIT.md` — evidence-based audit of the current code.
- `UI-SPEC.md` — product and visual direction for the redesigned web experience.
- `DATABASE.md` — proposed tenant model and migration order.
- `INTEGRATIONS.md` — actual versus simulated integrations and their completion criteria.
- `.env.example` — browser-safe environment variable names only.
- `supabase/migrations/202611160001_mvp_foundation.sql` — draft identity/business/preferences migration.
- `supabase/migrations/202611160002_operational_ledger.sql` — draft operations tables, tenant RLS, atomic posting RPCs and daily digest query.

Both migrations remain **drafts** and have not been applied to the Supabase project.

## Build sequence

### Gate 0 — obtain live project access
The correct project reference is `waadpyucxpgvbkpzbnju`. Connect the Supabase integration to the Mark Sanchez account/project so that the actual schema, region, policies and advisors can be inspected. The dashboard currently reports no migrations and no backups, but the project API could not be read from this workspace. Do not apply the draft migrations until live access is verified.

### Stage 1 — identity and business tenancy
Review and apply the foundation migration to the confirmed project. Connect Supabase Auth, create a business atomically, add the owner membership, load the user's businesses and persist onboarding preferences. Every business-owned record must carry a `business_id` and be protected by RLS.

### Stage 2 — core business records
Migrate products, sales, sale items, payments, expenses and suppliers. Move sale posting into a database transaction/RPC so invoice, stock movement, payment and journal effects cannot partially save. Keep the local demo data as preview-only seed data.

### Stage 3 — dashboard and integrations
Replace local storage as the source of truth with Supabase queries. Add live WhatsApp click-to-chat digest preparation first. Add scheduled WhatsApp delivery only after an official WhatsApp Business Platform sender, server-side secrets, verified webhook and opt-in handling are ready. Add generative AI through a server-side Edge Function, never a browser-held provider key.

### Stage 4 — production hardening
Run security, performance and health advisors; verify tenant isolation with two test businesses; test failed/duplicate callbacks; check backups, audit trails, observability and mobile accessibility.

## Current environment configuration

The two browser-safe Supabase values have been configured in Vercel for the `build/hesabu-mvp-cloud-foundation` **Preview** branch only. Production environment variables were not changed, and no manual production deployment was triggered. The app's `src/lib/supabase.ts` currently calls Supabase Auth and PostgREST directly; it is a small browser client, not the official `@supabase/supabase-js` SDK.

## Safety boundaries

- Never place a Supabase secret/service-role key, WhatsApp token or AI provider key in Vite variables or browser code.
- A Supabase publishable key may be present in the browser only when RLS and least-privilege grants are correctly configured.
- Do not treat preview/sample records as real books of account.
- Do not describe a WhatsApp click-to-chat link as an automatically delivered message.
- Do not describe the simulated Daraja flow as a live M-Pesa integration.
- Do not claim KRA eTIMS compliance or certification.
- Do not deploy this branch to production without a separate review and explicit approval.
