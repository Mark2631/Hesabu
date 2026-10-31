import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppData } from '../types';

export interface CloudLedgerSnapshot {
  data: AppData;
  revision: number;
  updatedAt: string;
}

export type CloudLedgerResult =
  | { ok: true; snapshot: CloudLedgerSnapshot | null }
  | { ok: false; kind: 'signed-out' | 'conflict' | 'invalid-data' | 'service'; message: string };

type CloudLedgerRow = { data: unknown; revision: number; updated_at: string };
const LEDGER_COLUMNS = 'data, revision, updated_at';

export function isCloudLedgerData(value: unknown): value is AppData {
  if (!value || typeof value !== 'object') return false;
  const ledger = value as Partial<AppData>;
  const shop = ledger.shopInfo;
  return Boolean(
    shop && typeof shop === 'object'
    && typeof shop.name === 'string' && typeof shop.owner === 'string'
    && typeof shop.phone === 'string' && typeof shop.businessType === 'string'
    && Array.isArray(ledger.transactions) && Array.isArray(ledger.customers)
    && Array.isArray(ledger.stock) && Array.isArray(ledger.reminders),
  );
}

function snapshotFrom(row: CloudLedgerRow): CloudLedgerSnapshot | null {
  if (!isCloudLedgerData(row.data) || !Number.isSafeInteger(Number(row.revision)) || !row.updated_at) return null;
  return { data: row.data, revision: Number(row.revision), updatedAt: row.updated_at };
}

async function ownerId(client: SupabaseClient): Promise<string | null> {
  const { data, error } = await client.auth.getUser();
  return error ? null : data.user?.id ?? null;
}

export async function loadCloudLedger(client: SupabaseClient): Promise<CloudLedgerResult> {
  const id = await ownerId(client);
  if (!id) return { ok: false, kind: 'signed-out', message: 'Sign in to access this account’s cloud backup.' };
  const { data, error } = await client.from('owner_ledgers').select(LEDGER_COLUMNS).eq('owner_id', id).maybeSingle();
  if (error) return { ok: false, kind: 'service', message: 'We could not check the cloud backup. Your device ledger is unchanged.' };
  if (!data) return { ok: true, snapshot: null };
  const snapshot = snapshotFrom(data as CloudLedgerRow);
  return snapshot
    ? { ok: true, snapshot }
    : { ok: false, kind: 'invalid-data', message: 'The cloud copy could not be read safely. Your device ledger is unchanged.' };
}

export async function saveCloudLedger(
  client: SupabaseClient,
  ledger: AppData,
  expectedRevision: number | null,
): Promise<CloudLedgerResult> {
  if (!isCloudLedgerData(ledger)) return { ok: false, kind: 'invalid-data', message: 'The ledger is incomplete and was not uploaded.' };
  const id = await ownerId(client);
  if (!id) return { ok: false, kind: 'signed-out', message: 'Sign in before saving a cloud backup.' };

  if (expectedRevision === null) {
    const { data, error } = await client.from('owner_ledgers')
      .insert({ owner_id: id, data: ledger, revision: 1 })
      .select(LEDGER_COLUMNS).single();
    if (error?.code === '23505') return { ok: false, kind: 'conflict', message: 'A cloud copy was created on another device. Check its status before saving.' };
    if (error) return { ok: false, kind: 'service', message: 'The cloud backup could not be saved. Your device ledger is unchanged.' };
    const snapshot = snapshotFrom(data as CloudLedgerRow);
    return snapshot ? { ok: true, snapshot } : { ok: false, kind: 'invalid-data', message: 'The saved cloud copy could not be verified.' };
  }

  const { data, error } = await client.from('owner_ledgers')
    .update({ data: ledger, revision: expectedRevision + 1 })
    .eq('owner_id', id).eq('revision', expectedRevision)
    .select(LEDGER_COLUMNS).maybeSingle();
  if (error) return { ok: false, kind: 'service', message: 'The cloud backup could not be saved. Your device ledger is unchanged.' };
  if (!data) return { ok: false, kind: 'conflict', message: 'The cloud copy changed on another device. Check its latest status before trying again.' };
  const snapshot = snapshotFrom(data as CloudLedgerRow);
  return snapshot ? { ok: true, snapshot } : { ok: false, kind: 'invalid-data', message: 'The saved cloud copy could not be verified.' };
}
