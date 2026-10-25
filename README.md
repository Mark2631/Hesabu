# Hesabu

Hesabu is a mobile-first micro-ledger for informal retailers in Kenya. It replaces the daily A4 notebook with a short, confirmable workflow for recording sales, credit, payments, expenses, stock and reminders.

## Run locally

\`\`\`sh
npm install
npm run dev
\`\`\`

Build with \`npm run build\`.

## Product rules

- Credit given increases the customer's balance. It is not counted as cash received.
- Customer repayments reduce the balance and count as cash in.
- Payments to suppliers count as cash out and reduce the amount owed to the supplier.
- Reports label the result as net cash, not profit. Cost of goods sold and other accounting adjustments are not calculated.
- Voice input uses the browser Web Speech API when available. A rules-based parser is the fallback; every entry must be confirmed before saving.
- The MVP saves in the current browser using localStorage. It has no account system, cloud backup, scheduled WhatsApp delivery or backend.
- Reports and debt reminders open WhatsApp with pre-filled text; the user still presses Send.

## Included

- Daily overview and quick transaction entry.
- Customer and supplier balances, repayment recording and WhatsApp debt reminders.
- Stock quantity, reorder threshold, restocking and quantity correction.
- Bill and follow-up reminders.
- Daily, weekly and monthly report previews, copy and WhatsApp share.
- Responsive navigation, PWA manifest and basic service-worker shell caching.

## Limitations

Voice recognition depends on browser support and microphone permission and may need HTTPS. The transaction parser is rules-based, not an AI model; review every entry. Stock updates inferred from a short phrase are suggestions. Browser storage is not a backup, and this prototype must not be treated as accounting or tax software.