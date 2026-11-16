import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const foundation = await readFile(resolve(root, 'MVP/supabase/migrations/202611160001_mvp_foundation.sql'), 'utf8');
const ledger = await readFile(resolve(root, 'MVP/supabase/migrations/202611160002_operational_ledger.sql'), 'utf8');

test('foundation migration creates cloud identity and tenant boundaries', () => {
  for (const table of ['profiles', 'businesses', 'business_members', 'business_settings']) {
    assert.ok(foundation.includes('create table public.' + table), table + ' table');
    assert.ok(foundation.includes('alter table public.' + table + ' enable row level security'), table + ' RLS');
  }
  assert.ok(foundation.includes('create or replace function public.create_business('));
  assert.ok(foundation.includes('create or replace function public.is_business_member('));
  assert.ok(foundation.includes('create or replace function public.has_business_role('));
  assert.ok(foundation.includes("set search_path = ''"));
  assert.ok(foundation.includes('ai_assistant_enabled boolean'));
  assert.ok(foundation.includes('whatsapp_digest_enabled boolean'));
  assert.ok(!foundation.includes('grant select, delete on public.businesses'));
});

test('operational migration creates the records used by Hesabu', () => {
  const tables = [
    'products', 'suppliers', 'invoices', 'invoice_items', 'payments',
    'unmatched_receipts', 'expenses', 'purchase_orders', 'purchase_order_items',
    'inventory_movements', 'cash_movements', 'journal_entries', 'journal_lines',
    'integration_events', 'digest_delivery_logs',
  ];
  for (const table of tables) {
    assert.ok(ledger.includes('create table public.' + table), table + ' table');
    assert.ok(ledger.includes("'" + table + "'"), table + ' is included in RLS setup');
  }
});

test('ledger writes go through server-side posting functions', () => {
  for (const fn of [
    'post_sale', 'post_payment', 'post_expense', 'create_purchase_order',
    'post_purchase_receipt', 'post_supplier_payment', 'post_stock_adjustment',
    'get_daily_digest',
  ]) {
    assert.ok(ledger.includes('create or replace function public.' + fn + '('), fn + ' definition');
    assert.ok(ledger.includes('grant execute on function public.' + fn + '('), fn + ' grant');
    assert.ok(ledger.includes('revoke all on function public.' + fn + '('), fn + ' revoke');
  }
  assert.ok(ledger.includes('public.has_business_role(p_business_id'));
  assert.ok(ledger.includes('pg_advisory_xact_lock'));
  assert.ok(ledger.includes('constraint trigger journal_lines_balanced_check'));
});

test('direct stock updates cannot bypass the stock movement ledger', () => {
  const productGrantBlock = ledger.slice(
    ledger.indexOf('-- Product stock quantity is deliberately excluded'),
    ledger.indexOf('create policy products_insert_inventory'),
  );
  assert.ok(productGrantBlock.includes('grant update'));
  assert.ok(productGrantBlock.includes('reorder_level'));
  assert.ok(!productGrantBlock.includes('quantity_on_hand'));
  assert.ok(ledger.includes('insert into public.inventory_movements'));
});

test('sensitive finance tables have role-specific read policies', () => {
  for (const name of [
    'expenses_select_finance', 'payments_select_finance_sales',
    'journal_entries_select_finance', 'journal_lines_select_finance',
    'cash_movements_select_finance', 'integration_events_select_management',
  ]) {
    assert.ok(ledger.includes('create policy ' + name), name);
  }
  assert.ok(ledger.includes('revoke insert, update, delete on public.journal_entries'));
});
