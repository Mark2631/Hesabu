# Supabase database plan

This is a proposed model, not a description of the live database. The target project is `waadpyucxpgvbkpzbnju` in the Mark Sanchez account. The dashboard screenshot shows Healthy and no migrations, but the connected Supabase API cannot currently read the project; existing tables, policies and row counts have not been verified.

## Tenant boundary

A business is the tenant. Every business-owned table must contain a non-null `business_id`. A user can belong to one or more businesses through `business_members`. A user must never be able to read or mutate another business's records by changing an ID in a request.

RLS is the enforcement layer. Application-side filters are useful for query clarity but are not security controls.

## Foundation migration

The draft migration in `MVP/supabase/migrations/202611160001_mvp_foundation.sql` creates:

| Table | Purpose |
| --- | --- |
| `profiles` | Non-authoritative display/contact data tied to `auth.users`. |
| `businesses` | Business identity, owner, currency and timezone. |
| `business_members` | User-to-business membership and workspace role. |
| `business_settings` | Independent AI and WhatsApp digest preferences. |

The migration includes RLS, tenant membership helper functions, restricted grants, updated-at triggers and an atomic `create_business` function. It must be reviewed against the confirmed project before application.

## Operational migration

The draft migration `MVP/supabase/migrations/202611160002_operational_ledger.sql` adds `products`, `suppliers`, `invoices`, `invoice_items`, `payments`, `unmatched_receipts`, `expenses`, `purchase_orders`, `purchase_order_items`, `inventory_movements`, `cash_movements`, `journal_entries`, `journal_lines`, `integration_events` and `digest_delivery_logs`.

It adds tenant RLS policies and role-specific read/write rules. Direct changes to financial records are blocked; the intended posting path uses database functions. The draft atomic RPCs include `post_sale`, `post_payment`, `post_expense`, `create_purchase_order`, `post_purchase_receipt`, `post_supplier_payment`, `post_stock_adjustment` and `get_daily_digest`. A deferred constraint trigger checks journal balance at transaction commit.

These are design and migration files only. They have not been run against the live Supabase project or a local PostgreSQL instance.

## Further domain tables to consider

| Table | Core fields / rules |
| --- | --- |
| `products` | business_id, sku, name, unit, on_hand, reorder_level, cost_price, selling_price; unique SKU per business. |
| `invoices` | business_id, invoice number, customer, issue/due dates, source, subtotal, discount, total, paid amount, status. |
| `invoice_items` | business_id, invoice_id, product_id, product name/SKU snapshots, quantity, unit price and cost. |
| `payments` | business_id, invoice_id, amount, channel, status, provider reference, idempotency key and origin. |
| `expenses` | business_id, category, description, amount, channel, date and reference. |
| `suppliers` | business_id, name, contacts, payment terms. |
| `purchase_orders` / `purchase_order_items` | business_id, supplier, expected date, line quantities, received quantities and unit cost. |
| `inventory_movements` | Append-only stock movement records with source, quantity delta, cost and reference. |
| `journal_entries` / `journal_lines` | Posted accounting records with balanced debits/credits and immutable posting history. |
| `integration_events` | Webhook/event status, source, unique event id, retry and error metadata. |
| `digest_delivery_logs` | Business, recipient, channel, delivery status, timestamp and provider message reference. |

## Critical data rules

- Money should use `numeric(14,2)`, not floating-point columns.
- Quantities should use a suitable `numeric` scale for the unit; do not assume every product is counted as whole pieces.
- Use `timestamptz` for event timestamps and store each business timezone explicitly.
- Add composite foreign keys where practical so a child row cannot point at a parent from another business.
- Use unique constraints for business invoice numbers and provider event/payment references.
- Store provider payloads only when necessary; redact credentials and unnecessary personal data.
- Keep posted journal lines append-only. Correct mistakes with reversing entries, not silent edits.
- Keep the stock movement register as the audit record. Update the on-hand balance only through an atomic transaction or database function.
- Never trust client-submitted totals, unit cost or role. Recompute or validate values on the server/database.
- Do not expose service-role/secret keys to the frontend.

## Atomic operations

A sale must be posted atomically. A database function/RPC should:
1. Verify the caller is an active member of the target business and has a suitable role.
2. Validate products and available quantities.
3. Calculate line totals and invoice totals server-side.
4. Insert the invoice and line snapshots.
5. Insert stock movements and update stock balances.
6. Record payments only when the selected method represents money actually received.
7. Create balanced journal entries when accounting mappings are ready.
8. Return the committed invoice id and reference.

Payment callbacks must verify their provider signature, use a unique idempotency/event key and never post the same receipt twice.

## Onboarding preferences

The foundation stores `ai_assistant_enabled` and `whatsapp_digest_enabled` as independent booleans. Both can be true. Manual record entry is the base experience and is not an exclusive mode. The business WhatsApp recipient and digest time are stored with the business settings, with an explicit opt-in before any automated messaging is enabled.

## Verification before rollout

- Confirm project reference and region.
- Inspect current tables, constraints, RLS policies and migration history.
- Run security, performance and health advisors.
- Apply the reviewed migration to a non-production project first.
- Test with two users in separate businesses; attempt cross-tenant SELECT, INSERT, UPDATE and DELETE.
- Test owner/manager/staff access separately.
- Confirm the Auth signup trigger works and does not grant roles from user-editable metadata.
