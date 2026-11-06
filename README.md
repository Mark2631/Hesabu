# Hesabu

Hesabu is a mobile-first, voice-friendly micro-ledger for Kenyan small shops. It is designed around the way a shopkeeper actually works: record a cash sale or goods taken on credit, keep a clear balance for each customer or supplier, notice low stock, remember bills and follow-ups, and send a daily summary without doing sums at closing time.

## Preview

Open the latest preview at https://hesabu-99jho74ke-marksanchez2631-1753s-projects.vercel.app. It is a preview deployment, not the production release.

## Run locally

Install Node.js 22 or newer, then run `npm install`, `npm run dev`, `npm test`, and `npm run build`.

## What works in this MVP

- Quick transaction entry in English or Kiswahili with confirm-before-save review.
- Browser speech recognition where supported, with English (Kenya) and Kiswahili voice-language choices and typed entry as the fallback.
- Correction of saved transaction descriptions, amounts, dates, times and credit due dates, with linked balance adjustments.
- Cash sale, credit given, expense, and debt-payment records.
- Optional Cash / M-Pesa tagging for received sales and debt repayments. This is manual bookkeeping only; it is not connected to Safaricom or an M-Pesa API.
- WhatsApp-ready sale receipts and Kiswahili debt reminders. Hesabu opens a prepared message; the user reviews and sends it.
- Customer and supplier account balances, transaction history, repayment recording, and WhatsApp debt reminders.
- Stock quantities, editable product details and reorder thresholds, restocking and quantity corrections.
- Duplicate safeguards for contacts and stock items, plus a warning when a sale exceeds the tracked shelf count.
- Bill and follow-up reminders inside the app.
- Daily, weekly and monthly report previews that can be copied or shared through WhatsApp.
- CSV export, versioned JSON backup and validated restore (legacy JSON backups are still accepted), editable shop details, and a resettable Mama Grace demo ledger.
- A seven-day backup reminder, visible local-save failure warning, and a browser persistent-storage request where supported.
- Local-first persistence, a mobile bottom navigation bar, responsive desktop layout, and a basic PWA shell.

## Accounting rules

- A credit sale is a receivable, not cash received.
- A customer repayment counts as cash in and reduces their outstanding balance.
- Supplier balances are shown separately from money customers owe the shop.
- “Net cash” means recorded cash in minus recorded cash out. It is not accounting profit and does not include cost of goods sold, tax or other accrual adjustments.
- A natural-language parse is only a suggestion. The shopkeeper reviews it before saving.

## Data and limitations

Hesabu is intentionally local-only. All ledger data stays in this browser's local storage; there is no account, cloud sync, remote backup, or automatic M-Pesa connection. Browser storage can still be cleared by the user or affected by browser storage policies, so export a JSON backup at least every seven days and keep a copy somewhere separate from the phone. Hesabu asks the browser for persistent storage where supported, but that request may be denied and does not protect against a lost phone or manually cleared browser data. Incognito/private browsing is not suitable for keeping a long-running ledger. The import flow accepts both versioned Hesabu backups and older raw AppData backup files and validates their records before replacement.

Voice capture needs microphone permission and browser support, and may require HTTPS. Browser speech recognition may mishear names or amounts; it is optional, and every draft must be checked before saving. M-Pesa tagging is a manual payment-method label, not a payment request, statement reader, or Safaricom integration. WhatsApp actions only open a prepared message; the shopkeeper reviews and sends it. The parser uses rules, not an AI model, and can make mistakes, so confirm each draft.
