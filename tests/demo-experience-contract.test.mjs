import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { makePublicDemoData } from '../src/demo-data.ts';
import { buildTrialBalance, isTrialBalanceBalanced } from '../src/finance.ts';

const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');

test('public demo opens without sign-in and is visibly separated from account workspaces', () => {
  assert.match(app, /onTryDemo=\{startDemo\}/);
  assert.match(app, /if \(!demoMode && !showAuthScreen && !cloudAccount\) return <PublicLandingPage/);
  assert.match(app, /Sample workspace/);
  assert.match(app, /discarded when you exit/);
});

test('public demo uses its own sanitized copy of the Kenyan sample data', () => {
  const data = makePublicDemoData();
  assert.equal(data.profile.name, 'Northstar Market · Sample');
  assert.equal(data.profile.taxPin, '');
  assert.equal(data.profile.phone, '');
  assert.ok(data.products.length >= 10);
  assert.ok(data.invoices.length >= 5);
  assert.ok(data.suppliers.length >= 3);
  assert.ok(data.invoices.every(invoice => invoice.phone === ''));
  assert.ok(data.payments.every(payment => payment.phone === ''));
  assert.ok(data.unmatchedReceipts.every(receipt => receipt.phone === ''));
  assert.ok(data.suppliers.every(supplier => supplier.phone === '' && supplier.email === ''));
  assert.ok(data.teamMembers.every(member => member.email.endsWith('@demo.invalid')));
  assert.ok(data.invoices.every(invoice => invoice.customer === 'Walk-in customer' || invoice.customer.startsWith('Sample customer ')));
  assert.equal(isTrialBalanceBalanced(buildTrialBalance(data.journal)), true);
});

test('public demo instances do not share mutable transaction collections', () => {
  const first = makePublicDemoData();
  const second = makePublicDemoData();
  first.invoices[0].customer = 'Changed in first demo';
  first.products[0].quantity = -999;
  assert.notEqual(second.invoices[0].customer, 'Changed in first demo');
  assert.notEqual(second.products[0].quantity, -999);
});
