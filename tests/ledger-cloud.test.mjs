import test from 'node:test';
import assert from 'node:assert/strict';
import { isCloudLedgerData, loadCloudLedger, saveCloudLedger } from '../src/lib/ledger-cloud.ts';

const ledger = {
  shopInfo: { name: 'Duka la Amina', owner: 'Amina', phone: '0712345678', businessType: 'Kiosk' },
  transactions: [], customers: [], stock: [], reminders: [],
};

function mockClient({ row = null, updateRow = row, userId = 'owner-1' } = {}) {
  const calls = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: userId ? { id: userId } : null }, error: null }) },
    from(table) {
      calls.push(['from', table]);
      const query = {
        select(columns) { calls.push(['select', columns]); return query; },
        eq(key, value) { calls.push(['eq', key, value]); return query; },
        insert(value) { calls.push(['insert', value]); return query; },
        update(value) { calls.push(['update', value]); return query; },
        maybeSingle: async () => ({ data: updateRow, error: null }),
        single: async () => ({ data: row, error: null }),
      };
      return query;
    },
  };
  return { client, calls };
}

test('cloud backup accepts a complete ledger and rejects incomplete payloads', () => {
  assert.equal(isCloudLedgerData(ledger), true);
  assert.equal(isCloudLedgerData({ ...ledger, transactions: undefined }), false);
  assert.equal(isCloudLedgerData(null), false);
});

test('cloud reads request only the current authenticated owner record', async () => {
  const { client, calls } = mockClient({ row: { data: ledger, revision: 4, updated_at: '2026-10-31T08:00:00Z' } });
  const result = await loadCloudLedger(client);
  assert.equal(result.ok, true);
  assert.equal(result.snapshot.revision, 4);
  assert.ok(calls.some(call => call[0] === 'eq' && call[1] === 'owner_id' && call[2] === 'owner-1'));
});

test('cloud saves use the expected revision as an optimistic concurrency guard', async () => {
  const { client, calls } = mockClient({ updateRow: { data: ledger, revision: 5, updated_at: '2026-10-31T08:01:00Z' } });
  const result = await saveCloudLedger(client, ledger, 4);
  assert.equal(result.ok, true);
  assert.equal(result.snapshot.revision, 5);
  assert.ok(calls.some(call => call[0] === 'eq' && call[1] === 'revision' && call[2] === 4));
});

test('a changed cloud revision is reported as a conflict instead of overwritten', async () => {
  const { client } = mockClient({ updateRow: null });
  const result = await saveCloudLedger(client, ledger, 4);
  assert.equal(result.ok, false);
  assert.equal(result.kind, 'conflict');
});

test('signed-out users cannot load or save a cloud backup', async () => {
  const { client } = mockClient({ userId: null });
  assert.equal((await loadCloudLedger(client)).kind, 'signed-out');
  assert.equal((await saveCloudLedger(client, ledger, null)).kind, 'signed-out');
});
