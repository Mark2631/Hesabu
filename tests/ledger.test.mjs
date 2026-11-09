import test from 'node:test';
import assert from 'node:assert/strict';
import { createBackupEnvelope, makeDemoData, parseBackupPayload } from '../src/data.ts';
import { buildOwnerBrief, buildReport, cashIn, cashOut, cashReceived, creditGiven, mpesaReceived, normalizeKenyanWhatsAppNumber, parseTransaction } from '../src/utils.ts';

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


test('linked customer and stock reminders survive backup export and restore', () => {
  const linked = structuredClone(data);
  const customerId = linked.customers[0].id;
  const stockItemId = linked.stock[0].id;
  linked.reminders = [
    ...linked.reminders,
    { id: 'rem-debt-link', title: 'Follow up with customer', dueDate: '2026-11-08', kind: 'customer', customerId, done: false },
    { id: 'rem-stock-link', title: 'Reorder flour', dueDate: '2026-11-08', kind: 'other', stockItemId, done: false },
  ];
  const restored = parseBackupPayload(createBackupEnvelope(linked, '2026-11-07T19:00:00.000Z'));
  assert.equal(restored?.reminders.find(reminder => reminder.id === 'rem-debt-link')?.customerId, customerId);
  assert.equal(restored?.reminders.find(reminder => reminder.id === 'rem-stock-link')?.stockItemId, stockItemId);
  const malformed = structuredClone(linked);
  malformed.reminders[0].stockItemId = 42;
  assert.equal(parseBackupPayload(malformed), null);
});

test('daily till closes survive backup export and are validated on restore', () => {
  const withClose = {
    ...data,
    dailyCloses: [{
      id: 'close-2026-11-06',
      date: '2026-11-06',
      openingCash: 500,
      expectedCash: 2400,
      countedCash: 2350,
      difference: -50,
      closedAt: '2026-11-06T21:00:00.000Z',
    }],
  };
  const restored = parseBackupPayload(createBackupEnvelope(withClose, '2026-11-07T19:00:00.000Z'));
  assert.equal(restored?.dailyCloses?.[0]?.countedCash, 2350);
  assert.equal(restored?.dailyCloses?.[0]?.difference, -50);
  assert.deepEqual(parseBackupPayload({ ...data, dailyCloses: [] })?.dailyCloses, []);
  const malformed = structuredClone(withClose);
  malformed.dailyCloses[0].closedAt = 'not-a-date';
  assert.equal(parseBackupPayload(malformed), null);
});


test('owner check-in prioritises an overdue customer and keeps collected money separate from credit', () => {
  const sample = {
    ...makeDemoData(),
    customers: [{ id: 'c1', kind: 'customer', name: 'Kamau', phone: '', balance: 600, dueDate: '2026-11-08' }],
    stock: [],
    transactions: [
      { id: 'sale-1', type: 'sale', description: 'Shop sales', amount: 1000, date: '2026-11-09', tradingDay: '2026-11-09', time: '10:00', paymentMethod: 'cash' },
      { id: 'credit-1', type: 'credit', description: 'Goods on credit', amount: 300, date: '2026-11-09', tradingDay: '2026-11-09', time: '10:05', customerName: 'Kamau' },
      { id: 'expense-1', type: 'expense', description: 'Transport', amount: 200, date: '2026-11-09', tradingDay: '2026-11-09', time: '10:10', paymentMethod: 'cash' },
    ],
  };
  const brief = buildOwnerBrief(sample, '2026-11-09');
  assert.equal(brief.action, 'debts');
  assert.equal(brief.overdueCount, 1);
  assert.equal(brief.outstanding, 600);
  assert.equal(brief.collected, 1000);
  assert.equal(brief.expenses, 200);
  assert.equal(brief.netMovement, 800);
  assert.match(brief.title, /Kamau/);
});

test('the owner’s stock-growth goal changes the next-step priority', () => {
  const sample = {
    ...makeDemoData(),
    shopGoal: { title: 'Grow my stock', targetAmount: 15000, progressAmount: 2500, updatedAt: '2026-11-09T08:00:00.000Z' },
    customers: [{ id: 'c1', kind: 'customer', name: 'Kamau', phone: '', balance: 600, dueDate: '2026-11-08' }],
    stock: [{ id: 's1', name: 'Unga', quantity: 2, unit: 'packets', lowStockAt: 8, lastRestocked: '2026-11-01' }],
    transactions: [],
  };
  const brief = buildOwnerBrief(sample, '2026-11-09');
  assert.equal(brief.action, 'stock');
  assert.equal(brief.lowStockCount, 1);
  assert.match(brief.title, /stock|customers/i);
});

test('owner check-in does not call net cash movement profit', () => {
  const sample = {
    ...makeDemoData(),
    shopGoal: null,
    customers: [],
    stock: [],
    transactions: [
      { id: 'sale-1', type: 'sale', description: 'Sales', amount: 100, date: '2026-11-09', tradingDay: '2026-11-09', time: '10:00' },
      { id: 'expense-1', type: 'expense', description: 'Stock purchase', amount: 250, date: '2026-11-09', tradingDay: '2026-11-09', time: '10:10' },
    ],
  };
  const brief = buildOwnerBrief(sample, '2026-11-09');
  assert.equal(brief.netMovement, -150);
  assert.match(brief.detail, /not profit/);
});

test('business milestone is included in backups and malformed milestones are rejected', () => {
  const withGoal = {
    ...makeDemoData(),
    shopGoal: {
      title: 'Open another branch',
      targetAmount: 50000,
      progressAmount: 12500,
      updatedAt: '2026-11-09T08:00:00.000Z',
    },
  };
  const restored = parseBackupPayload(createBackupEnvelope(withGoal, '2026-11-09T09:00:00.000Z'));
  assert.equal(restored?.shopGoal?.title, 'Open another branch');
  assert.equal(restored?.shopGoal?.progressAmount, 12500);
  const invalid = structuredClone(withGoal);
  invalid.shopGoal.progressAmount = 60000;
  assert.equal(parseBackupPayload(invalid), null);
});


test('supplier-debt goal points to payables instead of customer receivables', () => {
  const sample = {
    ...makeDemoData(),
    shopGoal: { title: 'Clear supplier debt', targetAmount: 12000, progressAmount: 3000, updatedAt: '2026-11-09T08:00:00.000Z' },
    customers: [
      { id: 'supplier-1', kind: 'supplier', name: 'Meru Wholesalers', phone: '', balance: -4800, dueDate: '2026-11-08' },
    ],
    stock: [],
    transactions: [],
  };
  const brief = buildOwnerBrief(sample, '2026-11-09');
  assert.equal(brief.action, 'supplier-debts');
  assert.equal(brief.supplierPayables, 4800);
  assert.match(brief.title, /Meru Wholesalers/);
});
