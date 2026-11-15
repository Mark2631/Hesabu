import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDemoData } from '../src/data.ts';
import { allocateIncomingPayment, buildJournalPair, isJournalBalanced, outstandingBalance, weightedAverageUnitCost } from '../src/finance.ts';

const sum = (values) => values.reduce((total, value) => total + value, 0);

test('demo workspace has a complete operating record', () => {
  const data = makeDemoData();
  assert.equal(data.profile.name, 'Northstar Market');
  assert.ok(data.products.length >= 10);
  assert.ok(data.suppliers.length >= 3);
  assert.ok(data.invoices.length >= 5);
  assert.ok(data.payments.length >= 5);
  assert.ok(data.unmatchedReceipts.length >= 1);
  assert.ok(data.unmatchedReceipts.every((receipt) => receipt.amount > 0 && receipt.reference.length > 0));
  assert.ok(data.purchaseOrders.length >= 2);
  assert.ok(Array.isArray(data.cashMovements));
});

test('invoice totals reconcile to the underlying item lines', () => {
  const data = makeDemoData();
  for (const invoice of data.invoices) {
    const lineTotal = sum(invoice.lines.map((line) => line.quantity * line.unitPrice));
    assert.equal(invoice.subtotal, lineTotal);
    assert.equal(invoice.total, invoice.subtotal - invoice.discount);
    assert.ok(invoice.paid >= 0);
    assert.ok(invoice.paid <= invoice.total);
  }
});

test('purchase order totals reconcile to supplier order lines', () => {
  const data = makeDemoData();
  for (const order of data.purchaseOrders) {
    assert.equal(order.total, sum(order.lines.map((line) => line.lineTotal)));
    assert.ok(order.lines.every((line) => line.received <= line.quantity));
  }
});

test('seed journal transactions are individually balanced', () => {
  const data = makeDemoData();
  const groups = new Map();
  for (const line of data.journal) {
    const group = groups.get(line.journalId) ?? { debit: 0, credit: 0 };
    group.debit += line.debit;
    group.credit += line.credit;
    groups.set(line.journalId, group);
  }
  assert.ok(groups.size >= 10);
  for (const group of groups.values()) assert.equal(group.debit, group.credit);
});

test('confirmed payment records reconcile to invoice paid totals', () => {
  const data = makeDemoData();
  const paidOnInvoices = sum(data.invoices.map((invoice) => invoice.paid));
  const recordedPayments = sum(data.payments.filter((payment) => payment.status === 'succeeded').map((payment) => payment.amount));
  assert.equal(recordedPayments, paidOnInvoices);
});

test('unmatched receipts remain separate from invoice payments until allocated', () => {
  const data = makeDemoData();
  const unmatchedTotal = sum(data.unmatchedReceipts.map((receipt) => receipt.amount));
  const recordedPayments = sum(data.payments.map((payment) => payment.amount));
  assert.ok(unmatchedTotal > 0);
  assert.ok(data.payments.every((payment) => payment.status !== 'pending' || !payment.confirmedAt));
  assert.ok(recordedPayments > 0);
});

test('a journal entry is balanced before it can be posted', () => {
  const pair = buildJournalPair({
    journalId: 'test-journal', date: '2026-11-15',
    debitAccount: 'Cash on hand', creditAccount: 'Sales revenue',
    amount: 1250, description: 'Test cash sale', reference: 'TEST-001',
  });
  assert.equal(pair.length, 2);
  assert.equal(pair[0].debit, 1250);
  assert.equal(pair[1].credit, 1250);
  assert.equal(isJournalBalanced(pair), true);
  assert.equal(isJournalBalanced([pair[0]]), false);
});

test('zero-value journal entries are not posted', () => {
  const pair = buildJournalPair({
    journalId: 'test-zero', date: '2026-11-15',
    debitAccount: 'Cash on hand', creditAccount: 'Sales revenue',
    amount: 0, description: 'Zero sale', reference: 'TEST-000',
  });
  assert.deepEqual(pair, []);
});

test('an incoming receipt is split between invoice balance and customer credit', () => {
  const allocation = allocateIncomingPayment(1000, 700, 500);
  assert.deepEqual(allocation, {
    appliedAmount: 300, unappliedAmount: 200, newPaid: 1000, outstandingAfter: 0,
  });
  const normal = allocateIncomingPayment(1000, 200, 300);
  assert.deepEqual(normal, {
    appliedAmount: 300, unappliedAmount: 0, newPaid: 500, outstandingAfter: 500,
  });
});

test('outstanding balance never falls below zero', () => {
  assert.equal(outstandingBalance(1000, 250), 750);
  assert.equal(outstandingBalance(1000, 1000), 0);
  assert.equal(outstandingBalance(1000, 1200), 0);
});

test('weighted average cost includes existing and incoming stock', () => {
  assert.equal(weightedAverageUnitCost(10, 10, 10, 20), 15);
  assert.equal(weightedAverageUnitCost(5, 100, 15, 140), 130);
  assert.equal(weightedAverageUnitCost(0, 0, 7, 85), 85);
  assert.equal(weightedAverageUnitCost(7, 85, 0, 120), 85);
});

test('low stock is measurable from quantity and reorder rules', () => {
  const data = makeDemoData();
  const lowStock = data.products.filter((product) => product.quantity <= product.reorderLevel);
  assert.ok(lowStock.length >= 3);
  assert.ok(lowStock.some((product) => product.sku === 'HOM-011'));
});
