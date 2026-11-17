# Integration status and completion requirements

Last reviewed: 17 November 2026

## Supabase Auth and business data

**Connected:** email/password sign-up, sign-in, session restore and sign-out use the live Supabase project. Business workspace creation, membership checks and the operational read/write flows use authenticated PostgREST requests and database RPCs. Public RPC wrappers are SECURITY INVOKER; privileged implementations are isolated in the `app_private` schema and check the caller's business role.

**Client limitation:** `src/lib/supabase.ts` is a small direct-fetch Auth/PostgREST client. It is not the official `@supabase/supabase-js` SDK. Migrate to the supported SDK before expanding auth providers, realtime subscriptions, storage or offline handling.

**Release work:** the new atomic sale and team invitation functions are validated in the PostgreSQL CI job before their migration is applied to production. A complete real-user onboarding test still needs a verified email inbox and a second test user.

## Team invitations

**Current design:** an owner or manager creates a seven-day invitation link and shares it with the recipient. The token is stored as a single-use UUID. The recipient must sign in or create an account using the invited email address, verify that email through Supabase Auth, then redeem the token. The database checks role permissions, expiry, revocation, email match and previous acceptance.

**Access boundaries:** only owners/managers can create or revoke invitations or change staff roles. Managers may manage Sales, Inventory and Finance staff; only owners may assign the Manager role. All active business members can view the team roster, but only owners/managers receive invitation tokens.

**Not included:** Hesabu does not send team invitation emails. The application copies a shareable link; email delivery can be added later through a verified email provider and server-side function.

## Sales, payments and accounting

**Connected:** the database posting functions validate stock, create invoice lines, update inventory, record payments, allocate invoice balances and post journal entries. The new `post_sale_with_payment` RPC groups a completed cash/card/bank/M-Pesa-recorded sale into a single database transaction. Credit sales remain unpaid invoices.

**Important distinction:** selecting M-Pesa as a manual payment channel records a payment in Hesabu. It does not contact Safaricom or prove that funds arrived.

**Not connected:** Daraja STK Push initiation, signed callback verification, callback idempotency, reconciliation and automatic receipt matching. Before activation, add secure server-side credentials, persist requests before sending, verify callback signatures/metadata, and reconcile unmatched receipts without double-posting.

## WhatsApp daily digest

**Current behaviour:** Hesabu prepares a digest from saved business records and opens a WhatsApp chat for the operator to review and send. This is click-to-chat only.

**Not connected:** WhatsApp Business Platform Cloud API delivery, automatic scheduled sending, media attachments, template approval, delivery callbacks and retries. Automatic sending must run from a trusted server or Edge Function with secrets stored server-side and explicit recipient opt-in.

## Generative AI and voice

**Current status:** no generative AI model or voice capture service is connected. Rule-based financial summaries are calculated from persisted business records. They must not be presented as AI-generated answers.

**Completion requirements:** use a server-side function, validate the caller's JWT and business membership, restrict data scope, remove unnecessary personal data, rate-limit usage, set spend limits and make clear which period and records support each response. Voice capture requires a separate permission, transcription and review flow; recognised text must never post a financial transaction without the normal validation step.

## Website checkout and merchant API

**Current status:** the embedded checkout is illustrative, not a production storefront or live order webhook.

**Completion requirements:** signed checkout sessions or merchant API credentials, per-business authorisation, replay protection, webhook signing, idempotency, order lifecycle states, stock reservation and server-side sale posting.

## Google sign-in

**Current status:** email/password only. Google OAuth is not configured. Add it only after the Supabase provider, redirect URLs, allowed origins and account-linking behaviour are configured and tested.
