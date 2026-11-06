import test from 'node:test';
import assert from 'node:assert/strict';
import { createBackupEnvelope, makeDemoData, parseBackupPayload } from '../src/data.ts';
import { buildReport, cashIn, cashOut, cashReceived, creditGiven, mpesaReceived, normalizeKenyanWhatsAppNumber, parseTransaction } from '../src/utils.ts';

const data = makeDemoData();

test('Kiswahili credit entry becomes a receivable and reduces tracked stock', () => {
  const draft = parseTransaction('Kamau alichukua sukari ya 120', data);
  assert.equal(draft.type, 'credit');
  assert.equal(draft.amount, 120);
  assert.equal(draft.customerName, 'Kamau');
  assert.equal(draft.stockItemName, 'Sukari');
  assert.equal(draft.stockQuantityDelta, -1);
  assert.ok(draft.dueDate);
});

test('English credit phrase with a payment promise parses the due weekday', () => {
  const draft = parseTransaction('Kamau took 1 kg sugar 120 bob, pays Friday', data);
  assert.equal(draft.type, 'credit');
  assert.equal(draft.amount, 120);
  assert.equal(draft.customerName, 'Kamau');
  assert.equal(draft.stockQuantityDelta, -1);
  assert.match(draft.summary, /on credit/);
});

test('multi-unit bread credit reduces stock by the spoken quantity', () => {
  const draft = parseTransaction('Kamau took 2 loaves bread for 120 bob, pays Friday', data);
  assert.equal(draft.type, 'credit');
  assert.equal(draft.amount, 120);
  assert.equal(draft.stockItemName, 'Mkate');
  assert.equal(draft.stockQuantityDelta, -2);
  assert.ok(draft.dueDate);
});

test('supplier restock is cash out and increases stock', () => {
  const draft = parseTransaction('Supplier alileta mafuta, nililipa 3000', data);
  assert.equal(draft.type, 'expense');
  assert.equal(draft.amount, 3000);
  assert.equal(draft.stockItemName, 'Mafuta');
  assert.equal(draft.stockQuantityDelta, 1);
});

test('customer debt repayment is cash in, not a new sale', () => {
  const draft = parseTransaction('Njeri alilipa deni yake ya 500', data);
  assert.equal(draft.type, 'payment');
  assert.equal(draft.amount, 500);
  assert.equal(draft.customerName, 'Njeri');
});

test('untracked item purchase is an expense and keeps amount intact', () => {
  const draft = parseTransaction('Nilinunua mkaa kwa 800', data);
  assert.equal(draft.type, 'expense');
  assert.equal(draft.amount, 800);
  assert.equal(draft.stockItemName, undefined);
});

test('daily cash summary excludes credit sales', () => {
  const tx = data.transactions.filter(t => t.date === new Date().toLocaleDateString('en-CA'));
  assert.equal(cashIn(tx), tx.filter(t => t.type === 'sale' || t.type === 'payment').reduce((a, t) => a + t.amount, 0));
  assert.equal(cashOut(tx), tx.filter(t => t.type === 'expense').reduce((a, t) => a + t.amount, 0));
  assert.equal(creditGiven(tx), tx.filter(t => t.type === 'credit').reduce((a, t) => a + t.amount, 0));
  assert.equal(buildReport(data, 'daily', tx[0]?.date ?? new Date().toLocaleDateString('en-CA')).credit, creditGiven(tx));
});


test('M-Pesa sale is tagged separately from cash without changing total receipts', () => {
  const draft = parseTransaction('M-Pesa sale for KES 450', data);
  assert.equal(draft.type, 'sale');
  assert.equal(draft.paymentMethod, 'mpesa');
  const tx = [
    { id: 'cash', type: 'sale', amount: 200, date: '2026-11-06', time: '09:00', paymentMethod: 'cash' },
    { id: 'mpesa', type: 'sale', amount: 450, date: '2026-11-06', time: '09:05', paymentMethod: 'mpesa' },
    { id: 'cash-payment', type: 'payment', amount: 50, date: '2026-11-06', time: '09:10' },
  ];
  assert.equal(cashIn(tx), 700);
  assert.equal(cashReceived(tx), 250);
  assert.equal(mpesaReceived(tx), 450);
  const report = buildReport({ ...data, transactions: tx }, 'daily', '2026-11-06');
  assert.equal(report.cashReceived, 250);
  assert.equal(report.mpesaReceived, 450);
  assert.match(report.text, /M-Pesa received: KES 450/);
});

test('Kenyan WhatsApp numbers are normalized without accepting malformed numbers', () => {
  assert.equal(normalizeKenyanWhatsAppNumber('0712 345 678'), '254712345678');
  assert.equal(normalizeKenyanWhatsAppNumber('+254 112 345 678'), '254112345678');
  assert.equal(normalizeKenyanWhatsAppNumber('0112-345-678'), '254112345678');
  assert.equal(normalizeKenyanWhatsAppNumber('12345'), null);
  assert.equal(normalizeKenyanWhatsAppNumber('254999123456'), null);
});

test('versioned backups and legacy local data are accepted, malformed rows are rejected', () => {
  const envelope = createBackupEnvelope(data, '2026-11-06T10:00:00.000Z');
  const restored = parseBackupPayload(envelope);
  assert.equal(restored?.shopInfo.name, data.shopInfo.name);
  assert.equal(restored?.transactions.length, data.transactions.length);
  assert.ok(parseBackupPayload(data), 'legacy raw AppData backups remain supported');
  const malformed = structuredClone(data);
  malformed.transactions[0].amount = Number.NaN;
  assert.equal(parseBackupPayload(malformed), null);
  assert.equal(parseBackupPayload({ format: 'hesabu-backup', version: 99, data }), null);
});
