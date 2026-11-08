# Hesabu

Hesabu is a mobile-first shop ledger for small Kenyan retailers. It is designed to replace the handwritten day book without asking a shopkeeper to learn accounting software.

## The everyday workflow

- **Today:** record a sale, expense, or credit sale; see money in, money out, cash, M-Pesa, outstanding balances and recent activity.
- **Book:** search and review the transaction ledger, including payment method and date.
- **People:** manage customer balances, supplier balances and repayments.
- **More:** see daily, weekly and monthly reports, reminders, stock, and backup/restore tools.

A sale starts as cash by default. The shopkeeper can change it to M-Pesa before saving. Expenses also record whether they were paid from cash or M-Pesa. Credit is recorded separately and is not treated as cash received.

## Voice and assisted entry

The shopkeeper can choose English (Kenya) or Kiswahili and dictate a phrase such as “two kilos of sugar, two hundred and fifty, cash”. The parser can recognise common spoken quantities, English number words and common Kiswahili number words. The result remains a draft: the amount, item, payment method and customer must be checked before the entry is saved.

Speech recognition is provided by the browser. It needs microphone permission and, in browsers that use a network speech service, an internet connection. Browser speech recognition is not consistently available and is not a guaranteed offline feature. When it is unavailable, the shopkeeper can type or use the phone keyboard's own microphone where the phone supports it.

## Trading hours and till close

Each shop can set its trading day, including overnight shifts such as 6:00 a.m.–9:00 p.m. or 9:00 p.m.–6:00 a.m. Entries keep their actual date and time while also being grouped under the shop's trading date. The daily report follows that trading date.

After the configured closing time, Hesabu marks the latest unclosed trading date and shows a close-of-day prompt. If the browser was shut at closing time, the prompt is recovered the next time the owner opens the app. The shopkeeper can enter the opening cash float and physically count the cash in the drawer. Hesabu calculates expected till cash from cash sales and repayments, less cash-paid expenses, and shows any shortage or surplus. M-Pesa transactions are excluded from the physical till count. The previous closing count is suggested as the next opening float, but it can be edited. Editing, moving or deleting a transaction reopens that day's till count.

A daily report is queued for sharing when a trading date needs closing. When the phone reconnects, the saved report date is restored in the report screen. Hesabu does not open WhatsApp or send a message without the shopkeeper's action; the owner reviews the report, taps Share, then taps Send in WhatsApp. This version does not run a guaranteed background alarm or close the till while the browser is shut.

## Offline use and data protection

Hesabu is local-first. After the first successful online load and service-worker installation, the app shell and built assets are cached so the app can reopen without a data connection. Sales, expenses, debts, reminders, stock and close records are stored in the browser on that device and remain available offline while browser storage is retained.

When offline, the shopkeeper can continue recording transactions and preparing the daily report. A report date can be kept on the device for sharing after the connection returns. Connecting to the internet does **not** upload the ledger to a cloud account in this version, and the app does not synchronise records between phones. Download a JSON backup regularly and keep a copy somewhere separate from the device. Avoid private/incognito browsing for a long-running shop ledger.

## Payments and WhatsApp — current boundaries

- **M-Pesa:** cash versus M-Pesa is a manual bookkeeping choice. There is no automatic Safaricom payment import, STK Push, Paybill/Till callback or reconciliation in this version. Real payment confirmation requires a secured backend, a configured Safaricom Daraja application and the shop's approved payment details. Provider secrets must never be placed in the browser.
- **WhatsApp:** Hesabu opens WhatsApp with a prepared report or customer message. The shopkeeper reviews it and taps Send. The app cannot silently or automatically send WhatsApp messages from a normal PWA. Background delivery would require an approved business messaging integration and its credentials.
- **Cloud access:** there is no sign-in or cross-device cloud copy in this branch. Local backup and restore are available, but the shop owner is responsible for keeping a separate backup.

These boundaries are intentional: the app must not show a payment as confirmed or a report as sent unless the relevant provider has actually confirmed it.

## Accounting rules

- A credit sale increases the customer's receivable; it is not cash received.
- A customer repayment reduces the amount owed and is recorded using its selected payment method.
- Supplier balances are separate from customer debts.
- Net cash is recorded money in minus recorded expenses. It is not accounting profit and does not calculate the cost of goods sold, tax or every accrual adjustment.
- Expected till cash is a physical drawer estimate, not the same as total sales, M-Pesa balance or profit.
- Voice parsing is a suggestion. The shopkeeper confirms every draft before saving.

## Run and verify

Use Node.js 22.6 or newer:

```bash
npm install
npm run dev
npm test
npm run build
```

The app is deployed from the feature branch for review; production has not been changed. See [PR #4](https://github.com/Mark2631/Hesabu/pull/4) for the current work and preview context.
