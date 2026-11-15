import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDemoData } from '../src/data.ts';

const sum = (values) => values.reduce((total, value) => total + value, 0);

test('demo workspace has a complete operating record', () => {
  const data = makeDemoData();
  assert.equal(data.profile.name, 'Northstar Market');
  assert.ok(data.products.length >= 10);
  assert.ok(data.suppliers.length >= 3);
  assert.ok(data.invoices.length >= 5);
  assert.ok(data.payments.length >= 5);
  assert.ok(data.purchaseOrders.length >= 2);
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

test('seed journal entries are balanced', () => {
  const data = makeDemoData();
  const debits = sum(data.journal.map((line) => line.debit));
  const credits = sum(data.journal.map((line) => line.credit));
  assert.equal(debits, credits);
});

test('low stock is measurable from quantity and reorder rules', () => {
  const data = makeDemoData();
  const lowStock = data.products.filter((product) => product.quantity <= product.reorderLevel);
  assert.ok(lowStock.length >= 3);
  assert.ok(lowStock.some((product) => product.sku === 'HOM-011'));
});
