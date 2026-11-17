import test from 'node:test';
import assert from 'node:assert/strict';
import { addBusinessDays, businessDate, formatBusinessDate, formatBusinessDateTime, formatBusinessDay } from '../src/business-time.ts';

test('business calendar date follows Africa/Nairobi across UTC midnight boundaries', () => {
  assert.equal(businessDate(new Date('2026-11-16T21:30:00.000Z')), '2026-11-17');
  assert.equal(businessDate(new Date('2026-11-17T20:59:00.000Z')), '2026-11-17');
  assert.equal(businessDate(new Date('2026-11-17T21:00:00.000Z')), '2026-11-18');
});

test('date arithmetic is independent of the device timezone', () => {
  assert.equal(addBusinessDays('2026-11-17', -1), '2026-11-16');
  assert.equal(addBusinessDays('2026-11-17', 7), '2026-11-24');
  assert.throws(() => addBusinessDays('17/11/2026', 1), /valid ISO date/);
});

test('date-only formatting does not shift the displayed calendar day', () => {
  assert.equal(formatBusinessDate('2026-11-17'), formatBusinessDay('2026-11-17', { day: 'numeric', month: 'short', year: 'numeric' }));
});

test('timestamp labels are formatted in Kenya time', () => {
  assert.match(formatBusinessDateTime('2026-11-16T21:30:00.000Z'), /17/);
});
