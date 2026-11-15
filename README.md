# Hesabu

Hesabu is being built as a connected financial operations platform for Kenyan retailers and service businesses. It is designed to sit behind an existing storefront or website as well as operate as a business workspace in its own right.

## Product model

A single operational record connects:

- **Sales and invoicing** — counter, website, Hesabu checkout and manual sales.
- **Payments and reconciliation** — cash, M-Pesa, bank and card collection records; payment requests; an unmatched-receipt queue for Till/PayBill, Pochi, Send Money and bank receipts; invoice allocation and exception review.
- **Inventory** — SKU-level quantities, reorder points, cost and selling prices, stock adjustments and valuation.
- **Procurement** — suppliers, purchase orders, receiving and accounts payable.
- **Accounts** — receivables, payables, cash accounts, account balances and a journal-style record.
- **Reports** — sales, gross margin, cash position and working-capital views.
- **Integrations** — a planned developer API, website embed and webhook event model.

A posted sale is intended to flow through invoice, collection, stock and accounting records rather than requiring the operator to update four disconnected screens.

## Current preview implementation

The build/platform-foundation branch contains a front-end product preview built on the existing React 18, TypeScript and Vite application.

- Seeded mini-mart workspace with products, suppliers, invoices, payment records and purchase orders.
- Local interactions for recording sales, creating invoices, requesting and resolving simulated STK payments, adding unmatched receipts, matching receipts to open invoices, recording expenses, stock counts, purchase orders and supplier payments.
- Derived dashboard and report values.
- Browser-local persistence under hesabu:platform:v2.
- Responsive desktop, tablet and mobile navigation.

The preview is deliberately local-first while the production database is not connected. Data only persists in the current browser. It is not yet multi-user, multi-branch, cloud-synchronised or suitable for real financial operations.

## Daraja and settlement design

The payment UI is a **local simulation**. It does not call Safaricom, send an STK prompt, verify a callback, read live statements or move funds. The unmatched-receipt queue demonstrates a manual reconciliation workflow only.

The intended production pattern is to initiate a supported payment request for the merchant's own registered payment destination, receive and authenticate asynchronous payment results on the server, match the receipt to the invoice idempotently, and update the business ledger. A transaction-status query is a secondary reconciliation path where a callback has not arrived.

Hesabu should not take custody of or pool merchant funds in the first implementation. A model where Hesabu collects funds into its own account and subsequently pays merchants is a materially different payments business and must be assessed with licensed payment partners and qualified regulatory advice before it is built.

Pochi la Biashara, Send Money and Till/PayBill are not interchangeable rails. Their supported integration and reconciliation methods must be verified individually; an STK-capable merchant shortcode should not be assumed to provide a feed for every other channel.

## Kenya tax integration

KRA documents system-to-system eTIMS integration through OSCU and VSCU and requires integrators to undergo testing, vetting and certification. Hesabu is not currently eTIMS-certified and must not represent invoices from this preview as KRA-compliant tax invoices. Certification and the correct integration route belong on the production roadmap.

## Production work still required

1. Connect a secure multi-tenant database and enforce business-level authorization.
2. Replace browser-only state with server-side posting and immutable, balanced journal transactions.
3. Add idempotency, webhook signature verification, retries, reconciliation exceptions and audit logs.
4. Complete inventory costing, returns, credit notes, tax handling, period close and accountant-reviewed reports.
5. Connect and test supported Daraja merchant flows with production credentials and callback infrastructure.
6. Evaluate KRA eTIMS certification, supported bank feeds and other third-party integrations.
7. Add staff roles, branch/location permissions, backups, observability and security review.

## Development

- npm install
- npm run dev
- npm run typecheck
- npm test
- npm run build

No secrets or payment credentials should be placed in the browser application.
