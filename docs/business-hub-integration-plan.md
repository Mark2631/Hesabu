# Hesabu Business Hub and commerce integration plan

## Product contract
Hesabu owns the canonical business record: products/SKUs, stock, customers, orders, invoices, payments, supplier purchases and fulfilment state. External channels are sources of events and destinations for approved actions. A channel must never create a second independent catalogue or ledger.

## Preview scope
- Business Hub with Overview, Customers, Online store and Connections views.
- Customer list is derived from existing invoice history and balances; no duplicate CRM database is created.
- Product catalogue preview reads existing product records and quantities.
- Promotion composer uses existing product name, selling price, unit, stock and business contact. It copies text; it does not claim to publish.
- Connection states distinguish connected core records, basic WhatsApp click-to-chat and providers not yet authorized.
- Storefront is explicitly a private catalogue preview, not a public checkout or payment endpoint.

## Integration architecture
All provider credentials and webhook secrets belong in server-side Supabase Edge Function secrets or a trusted server environment. Never expose Meta tokens, WhatsApp tokens, Daraja consumer secrets, passkeys, webhook signing secrets or service-role keys in Vite/browser variables.

Every inbound provider event must verify the provider signature, resolve the Hesabu business using a server-owned connection record, validate account ownership, enforce idempotency, persist an audit event, map products by stable SKU or explicit mapping, apply stock reservation and ledger posting transactionally, and record processing outcome. Outbound actions require owner-approved scopes, business opt-in, rate limits, audit events and provider-specific template/publishing rules. Disconnecting a provider must revoke credentials and stop queued sends.

## Provider checklist

### WhatsApp Business Platform
Required: Meta Business Portfolio, WhatsApp Business Account, business-owned verified phone number, phone-number ID, app ID, system-user/permanent access token, webhook verify token, app secret for signature validation, callback URL, approved templates where applicable and recipient opt-in. Implement outbound messaging, inbound message webhook, delivery/read status webhook, retry queue and unsubscribe handling. Current click-to-chat is not API delivery.

### Facebook Pages and Instagram
Required: Meta developer app, business verification where required, Page and Instagram professional account, OAuth redirect, app secret, long-lived authorized tokens, subscribed webhooks, permission approval/app review for production use. Scope initial release to Page identity, supported publishing and supported messaging events. Do not promise personal-profile publishing or unsupported inbox access.

### M-Pesa Daraja
Required: Safaricom developer app, consumer key and secret, shortcode, passkey, callback URL, account/business onboarding and production approval. Implement STK Push initiation, persist request before sending, callback verification, idempotent receipt creation, reconciliation and clear pending/failed/success states. Manual M-Pesa entry is not proof of payment.

### Online storefront
Required: public business slug/domain, server-served catalogue, customer order submission endpoint, rate limiting, stock reservation, signed order events, payment state and owner order-management UI. Checkout must not post a paid sale until payment is verified. Keep cash-on-delivery/collection as distinct payment states.

### Delivery
Required: provider account and API credentials, shipment creation, label/waybill, tracking webhooks, proof of delivery and cancellation/return handling. Start with a manual rider workflow and adapter interface; add providers one at a time.

## Data model additions before production integrations
- business_integrations: business_id, provider, external_account_id, encrypted credential reference, granted scopes, status, connected_by, connected_at, disconnected_at.
- integration_events: business_id, provider, external_event_id, event_type, received_at, signature_valid, processing_status, attempts, payload_reference, error_code.
- external_product_mappings: business_id, provider, external_product_id, product_id, external_sku, sync_state.
- sales_orders: business_id, channel, external_order_id, customer_id, status, payment_status, fulfilment_status, totals, idempotency_key.
- order_fulfilments: order_id, method, courier, tracking_reference, status, dispatched_at, delivered_at, proof_reference.
- marketing_campaigns: business_id, channel, content, scheduled_at, provider_post_id, status, metrics_snapshot.

Every table needs tenant RLS, role-specific permissions, indexes on business_id and provider identifiers, and audited mutations. Credentials must be stored encrypted or referenced through a secrets manager, never exposed as readable client fields.

## Release gates
- Provider sandbox test passes.
- Duplicate webhook replay creates no duplicate order, payment or stock movement.
- Cross-business credential and event access is denied.
- Expired/revoked tokens stop outbound operations and surface actionable errors.
- Failed provider calls retry with bounded backoff and remain visible to the owner.
- Disconnecting a provider leaves existing Hesabu ledger records intact.
- Financial totals reconcile with existing invoice/payment/journal posting functions.
- Human confirmation is required before sending bulk marketing or changing live stock/catalogue sync rules.
