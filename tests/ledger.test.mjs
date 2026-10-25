import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDemoData } from '../src/data.ts';
import { buildReport, cashIn, cashOut, creditGiven, parseTransaction } from '../src/utils.ts';

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
