# Integration status and completion criteria

## Supabase Auth and database

**Current status:** not connected. There is no Supabase SDK/client in the current frontend package and the target Spike Digital organisation/project is not visible through the linked Supabase account.

**MVP implementation:** use Supabase Auth for sign-up/sign-in, a public publishable key in the frontend, and RLS-protected tenant tables. Create the business and owner membership through a restricted database function. Store the browser session using the supported Supabase client defaults. Query records through the signed-in user's JWT and tenant RLS.

Before implementation, connect the Spike Digital Supabase account/organisation so the project can be identified and inspected. Do not paste a secret or service-role key into source code or chat.

## WhatsApp daily digest

**Current status:** click-to-chat preparation works in the local preview. It derives a digest from local browser data, fills a WhatsApp message and opens the destination chat. The user still has to press Send.

**MVP first release:** retain click-to-chat. Generate the digest from cloud-backed records, show a preview, validate the recipient and open the prepared message. This gives the business owner control and does not require an always-on WhatsApp sender.

**Later scheduled delivery:** integrate the official WhatsApp Business Platform Cloud API from a Supabase Edge Function or another trusted server. Store access tokens as server-side secrets. Record recipient opt-in, approved template requirements, message IDs, delivery status and retry outcomes. Add disable/unsubscribe controls. Do not send from client JavaScript.

## AI assistant

**Current status:** deterministic record-based responses only. No generative AI model is connected.

**MVP implementation:** create a server-side Edge Function. It should validate the caller's JWT, resolve the active business membership, fetch only permitted business data, redact unnecessary personal data, enforce rate/cost limits and call the selected model using a server-side secret. Return a response with date range and data scope so the user can tell what the answer is based on.

Manual records and the AI assistant should coexist. A business can enable the assistant and WhatsApp digest together. The assistant must not post a sale, payment or stock change without an explicit user confirmation and a normal validated posting flow.

## M-Pesa / Daraja

**Current status:** the payment UI is a simulation. It does not send a real STK request or receive a real Safaricom callback.

**Completion requirements:** confirm the business's merchant shortcode and supported product, implement server-side request signing, persist the request before sending, verify callbacks, add idempotency and a transaction-status reconciliation path, map accepted payments to invoices, and log unmatched receipts. Do not use Hesabu as a funds custodian in the initial release.

## Website checkout and API

**Current status:** the embedded checkout is a local demonstration.

**Completion requirements:** authenticated merchant API or signed checkout session, per-business API credentials, replay protection, webhook signing, idempotency, order state transitions, inventory reservation rules and server-side posting. Document the contract for external storefronts before exposing a production integration.

## Email and reporting

Exporting a workbook/PDF and opening a prepared WhatsApp message are useful first-release functions. Scheduled email or WhatsApp summaries require a server-side scheduler, delivery log, timezone handling, opt-in and retry controls. The report must be derived from persisted records, not only the current browser session.
