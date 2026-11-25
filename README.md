# Hesabu

Hesabu is a cloud-backed business operations workspace for Kenyan small businesses. It brings sales, payments, stock, purchasing, expenses, customer balances and business reporting into one connected record.

## Current product architecture

- **Frontend:** React 18, TypeScript and Vite.
- **Identity and data:** Supabase Auth, PostgreSQL and PostgREST.
- **Access control:** business-level membership and roles, with row-level security and database posting functions.
- **Hosting:** Vercel, connected to this GitHub repository.
- **Currency and operating context:** Kenyan shillings (KSh) and East Africa business dates.

The browser client in `src/lib/supabase.ts` currently wraps Supabase Auth and PostgREST with direct `fetch` calls. It is not yet using the official Supabase JavaScript SDK. Do not describe that migration as completed.

## What the workspace currently supports

- Sales and invoices, including walk-in, credit and pay-on-delivery flows.
- Manual payment recording, payment requests in the training simulator, and an unmatched receipt queue for manual allocation.
- Product catalogue, inventory movements, stock counts and purchase orders.
- Supplier receiving and supplier payments.
- Operating expenses, journal entries, customer/supplier balances and management reports.
- Business profiles, role-based team membership and secure invitation links.
- Record-based answers from the Hesabu workspace assistant.
- A public sample workspace that lets visitors explore the interface without signing up.

A posted cloud sale is processed through database functions so the invoice, stock, payment and journal movements can be committed together. The public sample workspace is deliberately separate: it uses sanitized example data in browser memory and does not read or write any customer's cloud records.

## Try the demo

The landing page's **Try the interactive demo** entry opens a sample retail workspace without an account or password. Visitors can navigate the product and test local sample workflows. Changes exist only in that browser session and are discarded when the demo is exited or the page is refreshed.

The demo uses illustrative records, not a real business. Contact details and tax identifiers are removed. No live Safaricom request, WhatsApp message, online checkout, email or external payment is triggered from the public demo. Payment-request screens are training simulations only.

The demo is not a free anonymous tenant and must never be connected to a real customer's workspace.

## Integration boundaries

- **M-Pesa:** manual payment records are supported. Live Safaricom STK Push, callback verification and automatic reconciliation are not connected.
- **WhatsApp:** Hesabu can prepare a click-to-chat summary for an operator to review and send. Automated Business Platform delivery is not connected.
- **AI and voice:** the workspace assistant uses deterministic answers from saved records. A generative AI model and voice-to-ledger capture are not connected.
- **Online checkout:** the channel interface is illustrative; a production checkout, signed webhook and merchant integration are not connected.
- **KRA eTIMS:** Hesabu is not currently eTIMS-certified. Do not represent generated records as KRA-compliant tax invoices or claim automated iTax/VAT filing.

Keep these boundaries explicit in product copy and demonstrations.

## Operational safeguards and remaining work

The current release has cloud authentication, database-backed workspaces, role checks, row-level security and atomic posting paths. That does not by itself establish full production readiness. Before increasing real-customer reliance, continue work on:

1. End-to-end testing of signup, session refresh, two-account tenant isolation, team invitations and financial posting.
2. Operational logging and alerting for failed writes, idempotency conflicts and integration callbacks.
3. Backup and restore verification, data export and documented account deletion/retention.
4. Migration of the custom direct-fetch Supabase client to the official SDK, after session-refresh and multi-tab regression tests.
5. A deliberate business switcher for users who belong to multiple businesses.
6. Safaricom integrations only after the merchant rails, callback security, duplicate handling and reconciliation process are tested.
7. KRA eTIMS integration only after the correct route, testing and certification requirements have been met.

No Supabase secret/service-role key or Safaricom consumer secret may be placed in browser code, public documentation or a `VITE_*` variable.

## Development

- `npm ci`
- `npm run dev`
- `npm test`
- `npm run typecheck`
- `npm run build`

See [MVP/AUDIT.md](MVP/AUDIT.md) for the latest architecture and verification record.
