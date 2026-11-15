import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDemoData } from '../src/data.ts';
import { allocateIncomingPayment, buildJournalPair, buildTrialBalance, calculateGrossProfit, isJournalBalanced, isTrialBalanceBalanced, outstandingBalance, planPurchaseReceipt, weightedAverageUnitCost } from '../src/finance.ts';

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
  assert.ok(data.productionRecipes.length >= 1);
  for (const recipe of data.productionRecipes) {
    assert.ok(data.products.some(product => product.id === recipe.outputProductId));
    assert.ok(recipe.ingredients.every(item => data.products.some(product => product.id === item.productId)));
  }
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

test('sales discounts reduce gross profit and can result in a trading loss', () => {
  const lines = [{ quantity: 2, unitPrice: 150, unitCost: 100 }];
  assert.equal(calculateGrossProfit(lines), 100);
  assert.equal(calculateGrossProfit(lines, 30), 70);
  assert.equal(calculateGrossProfit(lines, 120), -20);
});


test('purchase receipt plans support part deliveries and preserve remaining quantities', () => {
  const lines = [
    { productId: 'a', name: 'Rice', quantity: 10, received: 0, unitCost: 100, lineTotal: 1000 },
    { productId: 'b', name: 'Oil', quantity: 5, received: 2, unitCost: 200, lineTotal: 1000 },
  ];
  const plan = planPurchaseReceipt(lines, [
    { productId: 'a', quantity: 4 },
    { productId: 'b', quantity: 1 },
  ]);
  assert.equal(plan.valid, true);
  assert.equal(plan.totalValue, 600);
  assert.equal(plan.status, 'partially_received');
  assert.deepEqual(plan.lines.map(line => line.received), [4, 3]);
});

test('purchase receipt plan completes only when all ordered quantities are received', () => {
  const lines = [
    { productId: 'a', name: 'Rice', quantity: 10, received: 8, unitCost: 100, lineTotal: 1000 },
    { productId: 'b', name: 'Oil', quantity: 5, received: 5, unitCost: 200, lineTotal: 1000 },
  ];
  const plan = planPurchaseReceipt(lines, [{ productId: 'a', quantity: 2 }]);
  assert.equal(plan.valid, true);
  assert.equal(plan.totalValue, 200);
  assert.equal(plan.status, 'received');
});

test('purchase receipt rejects over-receiving, unknown products and zero-value receipts', () => {
  const lines = [
    { productId: 'a', name: 'Rice', quantity: 10, received: 8, unitCost: 100, lineTotal: 1000 },
  ];
  const over = planPurchaseReceipt(lines, [{ productId: 'a', quantity: 3 }]);
  assert.equal(over.valid, false);
  assert.match(over.reason, /exceeds/);
  const unknown = planPurchaseReceipt(lines, [{ productId: 'unknown', quantity: 1 }]);
  assert.equal(unknown.valid, false);
  assert.match(unknown.reason, /not on this purchase order/);
  const zero = planPurchaseReceipt(lines, [{ productId: 'a', quantity: 0 }]);
  assert.equal(zero.valid, false);
});


test('seeded ledger trial balance ties to operational cash, stock, receivables and payables', () => {
  const data = makeDemoData();
  const trialBalance = buildTrialBalance(data.journal);
  assert.equal(isTrialBalanceBalanced(trialBalance), true);
  const balance = (account) => {
    const row = trialBalance.find(item => item.account === account);
    return (row?.debitBalance ?? 0) - (row?.creditBalance ?? 0);
  };
  const close = (left, right) => assert.ok(Math.abs(left - right) < 0.01, String(left) + ' should equal ' + String(right));
  const expectedCash = (channel) =>
    data.openingBalances[channel] +
    sum(data.payments.filter(payment => payment.status === 'succeeded' && payment.channel === channel).map(payment => payment.amount)) -
    sum(data.expenses.filter(expense => expense.channel === channel).map(expense => expense.amount)) -
    sum((data.cashMovements ?? []).filter(movement => movement.channel === channel).map(movement => movement.amount));
  close(balance('Cash on hand'), expectedCash('cash'));
  close(balance('M-Pesa clearing'), expectedCash('mpesa'));
  close(balance('Bank account'), expectedCash('bank'));
  close(balance('Inventory'), sum(data.products.map(product => product.quantity * product.costPrice)));
  close(balance('Accounts receivable'), sum(data.invoices.map(invoice => Math.max(0, invoice.total - invoice.paid))));
  close(-balance('Accounts payable'), sum(data.suppliers.map(supplier => supplier.balance)));
});

test('low stock is measurable from quantity and reorder rules', () => {
  const data = makeDemoData();
  const lowStock = data.products.filter((product) => product.quantity <= product.reorderLevel);
  assert.ok(lowStock.length >= 3);
  assert.ok(lowStock.some((product) => product.sku === 'HOM-011'));
});


test('production plans consume recipe quantities and value finished goods at material cost', async () => {
  const { planProductionRun } = await import('../src/finance.ts');
  const recipe = {
    outputProductId: 'bread',
    ingredients: [
      { productId: 'flour', quantityPerUnit: 0.5 },
      { productId: 'sugar', quantityPerUnit: 0.1 },
    ],
  };
  const products = [
    { id: 'bread', name: 'Bread loaf', quantity: 4, costPrice: 22 },
    { id: 'flour', name: 'Flour', quantity: 20, costPrice: 80 },
    { id: 'sugar', name: 'Sugar', quantity: 10, costPrice: 120 },
  ];
  const plan = planProductionRun(recipe, products, 10);
  assert.equal(plan.valid, true);
  if (!plan.valid) return;
  assert.equal(plan.materialCost, 520);
  assert.equal(plan.unitCost, 52);
  assert.deepEqual(plan.materials.map(line => line.quantity), [5, 1]);
});

test('production plans reject insufficient stock, duplicate inputs and invalid output quantities', async () => {
  const { planProductionRun } = await import('../src/finance.ts');
  const products = [
    { id: 'bread', name: 'Bread loaf', quantity: 0, costPrice: 20 },
    { id: 'flour', name: 'Flour', quantity: 2, costPrice: 80 },
  ];
  const insufficient = planProductionRun({
    outputProductId: 'bread', ingredients: [{ productId: 'flour', quantityPerUnit: 1 }],
  }, products, 3);
  assert.equal(insufficient.valid, false);
  assert.match(insufficient.reason, /Not enough Flour/);
  const duplicate = planProductionRun({
    outputProductId: 'bread', ingredients: [
      { productId: 'flour', quantityPerUnit: 0.5 },
      { productId: 'flour', quantityPerUnit: 0.2 },
    ],
  }, products, 1);
  assert.equal(duplicate.valid, false);
  const invalidQuantity = planProductionRun({
    outputProductId: 'bread', ingredients: [{ productId: 'flour', quantityPerUnit: 1 }],
  }, products, 0);
  assert.equal(invalidQuantity.valid, false);
});
