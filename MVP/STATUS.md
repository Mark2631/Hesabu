# Hesabu MVP branch status

Last updated: 16 November 2026

## Working branch

- Repository: `Mark2631/Hesabu`
- Branch: `build/hesabu-mvp-cloud-foundation`
- Production `main` has not been changed.
- No production deployment has been requested or triggered.

## Completed in this branch

- Hand-audited the existing React/Vite application and documented findings.
- Added a separate public service page with a compact header, product explanation, business workflow, audience section, trust explanation and structured footer.
- Routed public landing-page actions into a separate sign-in/create-account screen.
- Added Supabase Auth sign-up/sign-in, token refresh, sign-out, session restoration, business creation and onboarding preference calls in `src/lib/supabase.ts`.
- Added email-confirmation recovery for onboarding details. The pending draft excludes the password.
- Added always-available manual entry plus independent optional AI and WhatsApp onboarding preferences. Both optional choices can be enabled together.
- Added a coordinated floating Daily digest / Ask Hesabu dock in the preview workspace. Only one panel opens at a time.
- Added an editable WhatsApp destination and click-to-chat digest preparation. The user still presses Send in WhatsApp.
- Reduced the dashboard quick-action panel height and tightened type and spacing without shrinking normal body text.
- Drafted tenant foundation and operational database migrations with role-based RLS and server-side transaction functions.
- Added migration contract tests to the GitHub Actions test suite.
- Added browser-safe Vite environment examples. The project URL and publishable key are configured in Vercel for the MVP Preview branch only.

## Supabase project status

The supplied project reference is `waadpyucxpgvbkpzbnju` at `https://waadpyucxpgvbkpzbnju.supabase.co`, in the Mark Sanchez account. The dashboard screenshot supplied on 16 November showed Healthy, no migrations, no branches and no backups.

The current Supabase connector does not list this project and returns a permission error when its tables/advisors are requested. Therefore:
- No migration has been applied.
- Existing tables, policies and database backups have not been independently inspected.
- Auth and PostgREST calls have been prepared in the frontend, but live sign-up and business creation have not been verified against the project.

## Remaining before the cloud workspace is usable

1. Restore Supabase connector access to project `waadpyucxpgvbkpzbnju`.
2. Inspect its actual tables, extensions, Auth settings, RLS, migrations and advisors.
3. Review and apply the two migration drafts in a non-production branch/project.
4. Run real tenant-isolation tests with at least two users and two businesses.
5. Replace the current lightweight REST/Auth client with the official `@supabase/supabase-js` SDK before production.
6. Connect the operational React screens to persisted products, sales, payments, expenses, suppliers and reports. The existing ledger workspace remains local preview data for now.
7. Deploy and test the branch Preview after the Vercel Nexus team access approval is completed.

## Integrations not live yet

- Generative AI: not connected to a model or server-side Edge Function.
- WhatsApp scheduled delivery: not connected to WhatsApp Business Platform. The prepared click-to-chat flow requires the user to press Send.
- M-Pesa/Daraja: existing payment request UI remains a simulation, not a real STK push/callback.
- Website checkout/webhooks: still demonstration-only.

## Verification

The existing business-ledger unit tests and GitHub Actions TypeScript build have passed on recent commits. The migration contract tests check that the draft schema retains expected tables, RLS, role policies and posting functions; they are static source checks and do not parse or execute SQL. No database migration or live Auth request has been validated yet.
