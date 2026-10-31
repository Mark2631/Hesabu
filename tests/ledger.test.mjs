import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDemoData } from '../src/data.ts';
import { buildReport, cashIn, cashOut, creditGiven, makePaymentReference, parseTransaction, reconcileDemoPayment } from '../src/utils.ts';

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

test('pending and failed demo payments never count as cash received', () => {
  const base = { id: 'demo-1', type: 'sale', description: 'Samosas', amount: 60, date: '2026-10-31', time: '10:00', paymentMethod: 'mpesa-demo', paymentReference: 'HES-ONE' };
  assert.equal(cashIn([{ ...base, paymentStatus: 'pending' }]), 0);
  assert.equal(cashIn([{ ...base, paymentStatus: 'failed' }]), 0);
  assert.equal(cashIn([{ ...base, paymentStatus: 'confirmed' }]), 60);
});

test('demo reconciliation is reference-specific and cannot change a terminal status', () => {
  const first = { id: 'first', type: 'sale', description: 'Samosas', amount: 60, date: '2026-10-31', time: '10:00', paymentMethod: 'mpesa-demo', paymentReference: 'HES-FIRST', paymentStatus: 'pending' };
  const second = { ...first, id: 'second', paymentReference: 'HES-SECOND' };
  const confirmed = reconcileDemoPayment([first, second], 'first', 'confirmed');
  assert.equal(confirmed[0].paymentStatus, 'confirmed');
  assert.equal(confirmed[1].paymentStatus, 'pending');
  assert.equal(reconcileDemoPayment(confirmed, 'first', 'failed')[0].paymentStatus, 'confirmed');
  assert.equal(reconcileDemoPayment([first], 'missing', 'confirmed')[0].paymentStatus, 'pending');
});

test('payment references are unique for distinct random values', () => {
  assert.notEqual(makePaymentReference(1_700_000_000_000, 'first'), makePaymentReference(1_700_000_000_000, 'second'));
});
