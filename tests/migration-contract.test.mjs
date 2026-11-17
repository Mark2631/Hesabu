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
  assert.ok(foundation.includes('create or replace function app_private.create_business('));
  assert.ok(foundation.includes('create or replace function public.create_business('));
  assert.ok(foundation.includes('security invoker'));
  assert.ok(foundation.includes('create schema if not exists app_private'));
  assert.ok(!/create or replace function public\\.[\\s\\S]*?security definer/i.test(foundation));
  assert.ok(!foundation.includes('public.is_business_member('));
  assert.ok(!foundation.includes('public.has_business_role('));
  assert.ok(foundation.includes('create or replace function app_private.is_business_member('));
  assert.ok(foundation.includes('create or replace function app_private.has_business_role('));
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
    'create_product', 'post_sale', 'post_payment', 'post_expense', 'create_purchase_order',
    'post_purchase_receipt', 'post_supplier_payment', 'post_stock_adjustment',
    'get_daily_digest',
  ]) {
    assert.ok(ledger.includes('create or replace function app_private.' + fn + '('), fn + ' private definition');
    assert.ok(ledger.includes('create or replace function public.' + fn + '('), fn + ' public wrapper');
    assert.ok(ledger.includes('grant execute on function public.' + fn + '('), fn + ' public wrapper grant');
    assert.ok(ledger.includes('revoke all on function public.' + fn + '('), fn + ' public wrapper revoke');
    assert.ok(ledger.includes('grant execute on function app_private.' + fn + '('), fn + ' private grant');
  }
  assert.ok(ledger.includes('app_private.has_business_role(p_business_id'));
  assert.ok(!/create or replace function public\\.[\\s\\S]*?security definer/i.test(ledger));
  assert.ok(!ledger.includes('public.has_business_role('));
  assert.ok(!ledger.includes('public.is_business_member('));
  assert.ok(ledger.includes('pg_advisory_xact_lock'));
  assert.ok(ledger.includes('constraint trigger journal_lines_balanced_check'));
});

test('direct stock updates cannot bypass the stock movement ledger', () => {
  const productGrantBlock = ledger.slice(
    ledger.indexOf('-- Product creation and opening stock are posted through create_product().'),
    ledger.indexOf('create policy products_update_inventory'),
  );
  assert.ok(productGrantBlock.includes('grant update'));
  assert.ok(productGrantBlock.includes('reorder_level'));
  assert.ok(!productGrantBlock.includes('grant insert'));
  assert.ok(!productGrantBlock.includes('quantity_on_hand'));
  assert.ok(ledger.includes('create or replace function app_private.create_product('));
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


const team = await readFile(resolve(root, 'MVP/supabase/migrations/202611170002_atomic_sales_team_invitations.sql'), 'utf8');

test('cash sales post invoice, stock, payment and journal as one database transaction', () => {
  assert.ok(team.includes('create or replace function app_private.post_sale_with_payment('));
  assert.ok(team.includes('app_private.post_sale('));
  assert.ok(team.includes('app_private.post_payment('));
  assert.ok(team.includes("if p_payment_channel <> 'credit' then"));
  assert.ok(team.includes('create or replace function public.post_sale_with_payment('));
  assert.ok(team.includes('security invoker'));
  assert.ok(team.includes("raise exception 'A completed cash sale must have a positive total'"));
});

test('team invitations are email-bound, single-use, expiring and protected by RLS', () => {
  assert.ok(team.includes('create table public.business_invitations'));
  assert.ok(team.includes('alter table public.business_invitations enable row level security'));
  assert.ok(team.includes('create policy business_invitations_select_management'));
  assert.ok(team.includes("email_confirmed_at is not null"));
  assert.ok(team.includes('v_invitation.invitee_email <> v_user_email'));
  assert.ok(team.includes("now() + interval '7 days'"));
  assert.ok(team.includes('pg_advisory_xact_lock'));
  assert.ok(team.includes('create or replace function app_private.accept_business_invitation('));
  assert.ok(team.includes('create or replace function public.accept_business_invitation('));
  assert.ok(team.includes('create or replace function app_private.update_business_member('));
  assert.ok(team.includes('create or replace function app_private.get_business_team('));
  assert.ok(team.includes('create or replace function app_private.list_business_invitations('));
  assert.ok(!/create or replace function public\.[\s\S]*?security definer/i.test(team));
  assert.ok(team.includes('revoke all on function public.accept_business_invitation(uuid) from public, anon'));
});

test('membership rows cannot be written directly from PostgREST', () => {
  assert.ok(team.includes('revoke insert, update, delete on public.business_members from public, anon, authenticated'));
  assert.ok(team.includes('grant select on public.business_members to authenticated'));
  assert.ok(team.includes('create or replace function app_private.update_business_member('));
  assert.ok(team.includes('create or replace function app_private.accept_business_invitation('));
});


const invitationIndexes = await readFile(resolve(root, 'MVP/supabase/migrations/202611170003_business_invitation_fk_indexes.sql'), 'utf8');
test('team invitation foreign keys are indexed for business growth', () => {
  assert.ok(invitationIndexes.includes('business_invitations_accepted_user_id_idx'));
  assert.ok(invitationIndexes.includes('business_invitations_created_by_idx'));
});
