# Hesabu MVP verification plan

## Current branch checks

The existing GitHub Actions workflow was extended to run on `build/hesabu-mvp-cloud-foundation`.

- [ ] Verify the latest branch CI run after the SQL draft update.
- [x] Existing frontend build and ledger test suite passed on the branch's first CI run (16 November 2026).
- [ ] Validate the SQL migration on a temporary Supabase project.
- [ ] Run Supabase security, performance and health advisors after migration.
- [ ] Inspect browser network traffic to confirm no privileged credentials are shipped.

The successful CI run tests the existing React/TypeScript application and ledger unit tests. It does **not** parse or apply the SQL migration and does not prove RLS or live Supabase connectivity.

## Auth and onboarding

- [ ] Create a user with email/password.
- [ ] Confirm a profile row is created without using user-editable metadata for authorization.
- [ ] Create a business through `create_business()`.
- [ ] Confirm owner membership and default settings are created atomically.
- [ ] Sign out and sign in again; restore the user's active business.
- [ ] Confirm a user with no membership cannot open the workspace.
- [ ] Confirm the AI and WhatsApp flags are independently saved.
- [ ] Confirm both flags can be enabled at once.
- [ ] Confirm manual entry remains available regardless of either optional flag.

## Tenant isolation

Create two test businesses with separate owners and at least one staff account.

- [ ] Business A cannot SELECT Business B records.
- [ ] Business A cannot INSERT, UPDATE or DELETE Business B rows by changing `business_id`.
- [ ] Sales staff cannot alter business settings or staff memberships.
- [ ] Inventory staff cannot post payments.
- [ ] Finance staff cannot change stock quantities unless their role explicitly grants it.
- [ ] Managers cannot add or remove an owner.
- [ ] A business owner cannot accidentally remove their own owner membership.
- [ ] Anonymous requests cannot access any private business table.

## Operational records

- [ ] Sale, line items, stock movement and payment save atomically.
- [ ] A rejected sale leaves no partial invoice, stock or journal rows.
- [ ] Quantity and money totals are recomputed/validated server-side.
- [ ] Duplicate provider callbacks do not create duplicate payments.
- [ ] Unmatched receipts remain separate until an authorised allocation is made.
- [ ] Journal entries balance and posted lines cannot be silently overwritten.
- [ ] A reversal is represented by a reversing entry and an audit event.

## WhatsApp and AI

- [ ] Digest is derived from persisted records for the correct business timezone.
- [ ] Recipient number is validated and the preview is editable.
- [ ] Click-to-chat opens the right number with a readable message.
- [ ] UI tells the user to press Send; it does not claim automatic delivery.
- [ ] Scheduled sends require explicit opt-in and have delivery logs/retries.
- [ ] AI runs server-side, verifies JWT and business membership, and applies rate/cost limits.
- [ ] AI has no path to post financial changes without an explicit confirmed operation.

## UI and device coverage

- [ ] Public landing page has a clear header, value proposition, product explanation, trust section and complete footer.
- [ ] Sign-up includes independent AI and WhatsApp preferences.
- [ ] The dashboard first screen shows concise quick actions and today's key figures.
- [ ] Floating Daily digest and Ask Hesabu controls do not overlap each other or mobile navigation.
- [ ] 360px Android viewport remains readable without horizontal overflow.
- [ ] Form fields are comfortable to tap; focus and validation states are visible.
- [ ] Reduced-motion preference is respected.
- [ ] Empty, loading, error and offline states are tested.

## Release gate

Do not merge or deploy until the correct Spike Digital project is connected, its schema has been inspected, the migration has been reviewed/applied to a non-production environment, tenant-isolation checks pass, and the UI has been verified against the agreed reference design.
