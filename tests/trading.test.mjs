import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildReport,
  expectedDrawerCash,
  makeDailyClose,
  suggestedOpeningCash,
  isWithinTradingHours,
  normalizeSpokenNumbers,
  parseTransaction,
  tradingDayFor,
} from '../src/utils.ts';

const emptyShop = {
  shopInfo: { name: 'Mama Asha Shop', owner: '', phone: '', businessType: 'Kiosk' },
  transactions: [],
  customers: [],
  stock: [],
  reminders: [],
};

test('day trading hours use the previous business date before opening', () => {
  assert.equal(tradingDayFor(new Date(2026, 10, 7, 4, 59), '06:00', '21:00'), '2026-11-06');
  assert.equal(tradingDayFor(new Date(2026, 10, 7, 6, 0), '06:00', '21:00'), '2026-11-07');
  assert.equal(tradingDayFor(new Date(2026, 10, 7, 20, 59), '06:00', '21:00'), '2026-11-07');
});

test('overnight trading hours group the early morning with the prior evening', () => {
  assert.equal(tradingDayFor(new Date(2026, 10, 7, 22, 0), '21:00', '06:00'), '2026-11-07');
  assert.equal(tradingDayFor(new Date(2026, 10, 7, 3, 0), '21:00', '06:00'), '2026-11-06');
  assert.equal(tradingDayFor(new Date(2026, 10, 7, 12, 0), '21:00', '06:00'), '2026-11-06');
  assert.equal(isWithinTradingHours(new Date(2026, 10, 7, 3, 0), '21:00', '06:00'), true);
  assert.equal(isWithinTradingHours(new Date(2026, 10, 7, 12, 0), '21:00', '06:00'), false);
});

test('spoken English and Kiswahili amounts normalize without losing unrelated words', () => {
  assert.equal(normalizeSpokenNumbers('two kilos of sugar, two hundred and fifty, cash'), '2 kilos of sugar, 250, cash');
  assert.equal(normalizeSpokenNumbers('mia mbili na hamsini'), '250');
  assert.equal(normalizeSpokenNumbers('elfu mbili na mia tano'), '2500');
  assert.equal(normalizeSpokenNumbers('two hundred and fifty shillings'), '250 shillings');
});

test('spoken sale with quantity reduces the matching stock item', () => {
  const data = {
    ...emptyShop,
    stock: [{ id: 'sugar', name: 'Sukari', quantity: 10, unit: 'kg', lowStockAt: 2, lastRestocked: '2026-11-01' }],
  };
  const draft = parseTransaction('two kg of sugar, two hundred and fifty, cash', data);
  assert.ok(draft);
  assert.equal(draft.type, 'sale');
  assert.equal(draft.amount, 250);
  assert.equal(draft.stockItemName, 'Sukari');
  assert.equal(draft.stockQuantityDelta, -2);
});

test('a spoken customer repayment is recognized and associated with the customer', () => {
  const draft = parseTransaction('Njeri paid five hundred cash', emptyShop);
  assert.ok(draft);
  assert.equal(draft.type, 'payment');
  assert.equal(draft.amount, 500);
  assert.equal(draft.customerName, 'Njeri');
});

test('daily report includes transactions by trading date, not only calendar date', () => {
  const data = {
    ...emptyShop,
    transactions: [
      { id: 'evening', type: 'sale', description: 'Evening sale', amount: 300, date: '2026-11-06', tradingDay: '2026-11-06', time: '22:00' },
      { id: 'night', type: 'sale', description: 'Night sale', amount: 200, date: '2026-11-07', tradingDay: '2026-11-06', time: '03:00' },
      { id: 'nextday', type: 'sale', description: 'Next day sale', amount: 100, date: '2026-11-07', tradingDay: '2026-11-07', time: '22:00' },
    ],
  };
  const report = buildReport(data, 'daily', '2026-11-06');
  assert.equal(report.transactions.length, 2);
  assert.equal(report.cashIn, 500);
  data.dailyCloses = [{ id: 'close-2026-11-06', date: '2026-11-06', openingCash: 100, expectedCash: 600, countedCash: 550, difference: -50, closedAt: '2026-11-07T06:00:00.000Z' }];
  const closedReport = buildReport(data, 'daily', '2026-11-06');
  assert.equal(closedReport.dailyClose?.difference, -50);
  assert.match(closedReport.text, /Till difference: −/);
});

test('till close separates physical cash from M-Pesa', () => {
  const data = {
    ...emptyShop,
    transactions: [
      { id: 'cash-sale', type: 'sale', description: 'Shop sale', amount: 1000, paymentMethod: 'cash', date: '2026-11-07', tradingDay: '2026-11-07', time: '12:00' },
      { id: 'mpesa-sale', type: 'sale', description: 'M-Pesa sale', amount: 500, paymentMethod: 'mpesa', date: '2026-11-07', tradingDay: '2026-11-07', time: '13:00' },
      { id: 'cash-expense', type: 'expense', description: 'Transport', amount: 200, paymentMethod: 'cash', date: '2026-11-07', tradingDay: '2026-11-07', time: '14:00' },
      { id: 'mpesa-expense', type: 'expense', description: 'Electricity', amount: 100, paymentMethod: 'mpesa', date: '2026-11-07', tradingDay: '2026-11-07', time: '15:00' },
    ],
  };
  assert.equal(expectedDrawerCash(data, '2026-11-07', 300), 1100);
  const close = makeDailyClose(data, '2026-11-07', 300, 1050, new Date('2026-11-07T21:00:00'));
  assert.equal(close.expectedCash, 1100);
  assert.equal(close.countedCash, 1050);
  assert.equal(close.difference, -50);
});

test('next opening float defaults to the last physical closing count', () => {
  const closes = [
    { id: 'older', date: '2026-11-05', openingCash: 100, expectedCash: 400, countedCash: 380, difference: -20, closedAt: '2026-11-05T21:00:00.000Z' },
    { id: 'latest', date: '2026-11-06', openingCash: 380, expectedCash: 600, countedCash: 550, difference: -50, closedAt: '2026-11-06T21:00:00.000Z' },
  ];
  assert.equal(suggestedOpeningCash(closes, '2026-11-07'), 550);
});
