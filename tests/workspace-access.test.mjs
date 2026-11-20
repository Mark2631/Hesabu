import test from 'node:test';
import assert from 'node:assert/strict';
import { getWorkspaceReadPlan } from '../src/workspace-access.ts';

test('owner and manager can load the complete business workspace', () => {
  for (const role of ['owner', 'manager']) {
    assert.deepEqual(getWorkspaceReadPlan(role), {
      sales: true, finance: true, inventory: true, purchasing: true, management: true,
    });
  }
});

test('sales members only request sales and receipt records they can read', () => {
  assert.deepEqual(getWorkspaceReadPlan('sales'), {
    sales: true, finance: false, inventory: false, purchasing: false, management: false,
  });
});

test('inventory members load stock and purchasing without finance-only records', () => {
  assert.deepEqual(getWorkspaceReadPlan('inventory'), {
    sales: false, finance: false, inventory: true, purchasing: true, management: false,
  });
});

test('finance members load sales, financial and supplier records but not restricted inventory movements', () => {
  assert.deepEqual(getWorkspaceReadPlan('finance'), {
    sales: true, finance: true, inventory: false, purchasing: true, management: false,
  });
});

test('unknown roles fail closed instead of loading the owner workspace', () => {
  assert.throws(() => getWorkspaceReadPlan('guest'), /valid business role/);
  assert.throws(() => getWorkspaceReadPlan(''), /valid business role/);
});
