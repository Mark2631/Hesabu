# Hesabu

Hesabu is a mobile-first, voice-friendly micro-ledger for Kenyan small shops. It is designed around the way a shopkeeper actually works: record a cash sale or goods taken on credit, keep a clear balance for each customer or supplier, notice low stock, remember bills and follow-ups, and send a daily summary without doing sums at closing time.

## Preview

Open the latest preview at https://hesabu-49eiugo2b-marksanchez2631-1753s-projects.vercel.app. It is a preview deployment, not the production release.

## Run locally

Install Node.js 22 or newer, then run `npm install`, `npm run dev`, `npm test`, and `npm run build`.

## What works in this MVP

- Quick transaction entry in English or Kiswahili with confirm-before-save review.
- Browser speech recognition where supported, with English (Kenya) and Kiswahili voice-language choices and typed entry as the fallback.
- Correction of saved transaction descriptions, amounts, dates, times and credit due dates, with linked balance adjustments.
- Cash sale, credit given, expense, and debt-payment records.
- Customer and supplier account balances, transaction history, repayment recording, and WhatsApp debt reminders.
- Stock quantities, editable product details and reorder thresholds, restocking and quantity corrections.
- Duplicate safeguards for contacts and stock items, plus a warning when a sale exceeds the tracked shelf count.
- Bill and follow-up reminders inside the app.
- Daily, weekly and monthly report previews that can be copied or shared through WhatsApp.
- CSV export, JSON backup and restore, editable shop details, and a resettable Mama Grace demo ledger.
- Local-first persistence, a mobile bottom navigation bar, responsive desktop layout, and a basic PWA shell.

## Accounting rules

- A credit sale is a receivable, not cash received.
- A customer repayment counts as cash in and reduces their outstanding balance.
- Supplier balances are shown separately from money customers owe the shop.
- “Net cash” means recorded cash in minus recorded cash out. It is not accounting profit and does not include cost of goods sold, tax or other accrual adjustments.
- A natural-language parse is only a suggestion. The shopkeeper reviews it before saving.

## Data and limitations

This is an MVP, not a hosted multi-user product. All ledger data stays in the current browser's local storage. It is not synced across devices; downloading backups regularly is important. Voice capture needs microphone permission and support from the current browser, and may require HTTPS. Report sharing opens WhatsApp with a prepared message; scheduled WhatsApp or email delivery is not connected. The parser uses rules, not an AI model. It can make mistakes, so confirm each draft.
