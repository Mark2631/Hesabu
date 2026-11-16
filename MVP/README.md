# Hesabu MVP workspace

This folder is the implementation brief for the cloud-backed Hesabu MVP. It is intentionally separate from the existing preview application so the current demo and its local records are not replaced while the production backend is being connected.

## Current status

- Repository: `Mark2631/Hesabu`
- Baseline: `main`
- Working branch: `build/hesabu-mvp-cloud-foundation`
- Frontend: React 18, TypeScript and Vite
- Existing app: a local-first product preview, not a connected production workspace
- Supabase: **not connected in this branch yet**. The requested Spike Digital organisation is not visible in the Supabase connection currently available to this workspace. Do not apply the draft migration until the correct project is visible and its project reference is confirmed.

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

## Folder guide

- `AUDIT.md` — evidence-based audit of the current code.
- `UI-SPEC.md` — product and visual direction for the redesigned web experience.
- `DATABASE.md` — proposed tenant model and migration order.
- `INTEGRATIONS.md` — actual versus simulated integrations and their completion criteria.
- `.env.example` — browser-safe environment variable names only.
- `supabase/migrations/202611160001_mvp_foundation.sql` — draft identity/business/preferences migration. It has **not** been applied to any database.

## Build sequence

### Gate 0 — confirm the correct Supabase project
Connect the Supabase account/organisation named **Spike Digital** to the project integration. Confirm the project reference, region and status. Read the existing tables, migrations and advisors before applying anything.

### Stage 1 — identity and business tenancy
Apply the reviewed foundation migration to the confirmed project. Connect Supabase Auth, create a business atomically, add the owner membership, load the user's businesses and persist onboarding preferences. Every business-owned record must carry a `business_id` and be protected by RLS.

### Stage 2 — core business records
Migrate products, sales, sale items, payments, expenses and suppliers. Move sale posting into a database transaction/RPC so invoice, stock movement, payment and journal effects cannot partially save. Keep the local demo data as preview-only seed data.

### Stage 3 — dashboard and integrations
Replace local storage as the source of truth with Supabase queries. Add live WhatsApp click-to-chat digest preparation first. Add scheduled WhatsApp delivery only after an official WhatsApp Business Platform sender, server-side secrets, verified webhook and opt-in handling are ready. Add generative AI through a server-side Edge Function, never a browser-held provider key.

### Stage 4 — production hardening
Run security, performance and health advisors; verify tenant isolation with two test businesses; test failed/duplicate callbacks; check backups, audit trails, observability and mobile accessibility.

## Safety boundaries

- Never place a Supabase secret/service-role key, WhatsApp token or AI provider key in Vite variables or browser code.
- A Supabase publishable key may be present in the browser only when RLS and least-privilege grants are correctly configured.
- Do not treat preview/sample records as real books of account.
- Do not describe a WhatsApp click-to-chat link as an automatically delivered message.
- Do not describe the simulated Daraja flow as a live M-Pesa integration.
- Do not claim KRA eTIMS compliance or certification.
- Do not deploy this branch to production without a separate review and explicit approval.
