import type {
  AppData, BusinessProfile, CashMovement, Expense, IntegrationEvent, Invoice, JournalLine,
  Payment, PaymentChannel, PurchaseOrder, ReceiptRail, Supplier, TeamInvitation, TeamMember, TeamRole, UnmatchedReceipt,
} from '../types';

export interface SupabaseUser {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
}

export interface SupabaseSession {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  expires_at: number;
  user: SupabaseUser;
}

export interface BusinessMembership {
  business_id: string;
  role: 'owner' | 'manager' | 'sales' | 'inventory' | 'finance';
  status: 'active' | 'invited' | 'suspended';
  businesses?: {
    id: string;
    name: string;
    industry: string | null;
  } | null;
}

export interface SignUpInput {
  fullName: string;
  businessName: string;
  industry: string;
  phone: string;
  email: string;
  password: string;
  aiAssistantEnabled: boolean;
  whatsappDigestEnabled: boolean;
  whatsappRecipientPhone: string;
}

const projectUrl = (import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '');
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '';
const projectRef = projectUrl.match(/^https:\/\/([a-z0-9-]+)\.supabase\.co$/i)?.[1] ?? 'unconfigured';
const storageKey = 'hesabu:supabase:session:' + projectRef;

export const supabaseConfigured = Boolean(projectUrl && publishableKey);

let sessionCache: SupabaseSession | null | undefined;

export class SupabaseRequestError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'SupabaseRequestError';
    this.status = status;
    this.code = code;
  }
}

function readSession(): SupabaseSession | null {
  if (sessionCache !== undefined) return sessionCache;
  try {
    const raw = localStorage.getItem(storageKey);
    sessionCache = raw ? JSON.parse(raw) as SupabaseSession : null;
  } catch {
    sessionCache = null;
  }
  return sessionCache;
}

function writeSession(session: SupabaseSession | null) {
  sessionCache = session;
  try {
    if (session) localStorage.setItem(storageKey, JSON.stringify(session));
    else localStorage.removeItem(storageKey);
  } catch {
    // Authentication remains usable for this tab if browser storage is blocked.
  }
}

function normaliseSession(value: Partial<SupabaseSession>): SupabaseSession {
  if (!value.access_token || !value.refresh_token || !value.user?.id) {
    throw new SupabaseRequestError('Supabase returned an incomplete authentication session.', 502);
  }
  const expiresIn = Number(value.expires_in ?? 3600);
  return {
    access_token: value.access_token,
    refresh_token: value.refresh_token,
    token_type: value.token_type ?? 'bearer',
    expires_in: expiresIn,
    expires_at: Number(value.expires_at ?? Math.floor(Date.now() / 1000) + expiresIn),
    user: value.user,
  };
}

async function request<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    accessToken?: string;
    prefer?: string;
  } = {},
): Promise<T> {
  if (!supabaseConfigured) {
    throw new SupabaseRequestError(
      'Supabase is not configured for this build. Add the project URL and publishable key to the environment.',
      503,
    );
  }

  const headers: Record<string, string> = {
    apikey: publishableKey,
    Authorization: 'Bearer ' + (options.accessToken ?? readSession()?.access_token ?? publishableKey),
    Accept: 'application/json',
  };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.prefer) headers.Prefer = options.prefer;

  let response: Response;
  try {
    response = await fetch(projectUrl + '/' + path.replace(/^\//, ''), {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new SupabaseRequestError('Could not reach Hesabu cloud services. Check your internet connection and try again.', 0);
  }

  const raw = await response.text();
  let payload: unknown = null;
  if (raw) {
    try { payload = JSON.parse(raw); }
    catch { payload = raw; }
  }

  if (!response.ok) {
    const detail = typeof payload === 'object' && payload !== null
      ? String((payload as Record<string, unknown>).msg ?? (payload as Record<string, unknown>).message ?? (payload as Record<string, unknown>).error_description ?? '')
      : '';
    const code = typeof payload === 'object' && payload !== null
      ? String((payload as Record<string, unknown>).code ?? '')
      : undefined;
    throw new SupabaseRequestError(detail || 'Cloud request failed (' + response.status + ').', response.status, code);
  }

  return payload as T;
}

async function refreshSession(session: SupabaseSession): Promise<SupabaseSession> {
  const payload = await request<Partial<SupabaseSession>>('auth/v1/token?grant_type=refresh_token', {
    method: 'POST',
    body: { refresh_token: session.refresh_token },
    accessToken: publishableKey,
  });
  const next = normaliseSession(payload);
  writeSession(next);
  return next;
}

async function validSession(): Promise<SupabaseSession | null> {
  const current = readSession();
  if (!current) return null;
  if (current.expires_at * 1000 > Date.now() + 60_000) return current;
  try {
    return await refreshSession(current);
  } catch {
    writeSession(null);
    return null;
  }
}

export async function signInWithPassword(email: string, password: string): Promise<SupabaseSession> {
  const payload = await request<Partial<SupabaseSession>>('auth/v1/token?grant_type=password', {
    method: 'POST',
    body: { email: email.trim(), password },
    accessToken: publishableKey,
  });
  const session = normaliseSession(payload);
  writeSession(session);
  return session;
}

export async function signUpWithPassword(input: SignUpInput): Promise<{ session: SupabaseSession | null; user: SupabaseUser | null }> {
  const payload = await request<Partial<SupabaseSession> & { user?: SupabaseUser }>(
    'auth/v1/signup?redirect_to=' + encodeURIComponent(window.location.origin),
    {
    method: 'POST',
    body: {
      email: input.email.trim(),
      password: input.password,
      // This metadata contains only user-entered onboarding information. It is
      // never used to authorize access; business roles are assigned in the DB.
      data: {
        display_name: input.fullName.trim(),
        business_onboarding: {
          business_name: input.businessName.trim(),
          industry: input.industry.trim() || null,
          phone: input.phone.trim() || null,
          email: input.email.trim(),
          ai_assistant_enabled: input.aiAssistantEnabled,
          whatsapp_digest_enabled: input.whatsappDigestEnabled,
          whatsapp_recipient_phone: input.whatsappDigestEnabled ? input.whatsappRecipientPhone.trim() : null,
        },
      },
    },
    accessToken: publishableKey,
  });

  const session = payload.access_token ? normaliseSession(payload) : null;
  if (session) writeSession(session);
  return { session, user: payload.user ?? session?.user ?? null };
}

export async function signOut(): Promise<void> {
  const current = await validSession();
  if (current) {
    try {
      await request<unknown>('auth/v1/logout', { method: 'POST', accessToken: current.access_token });
    } finally {
      writeSession(null);
    }
  } else {
    writeSession(null);
  }
}

export async function getCurrentUser(): Promise<SupabaseUser | null> {
  const current = await validSession();
  if (!current) return null;
  try {
    return await request<SupabaseUser>('auth/v1/user', { accessToken: current.access_token });
  } catch {
    writeSession(null);
    return null;
  }
}

export async function createBusiness(input: Pick<SignUpInput, 'businessName' | 'industry' | 'phone' | 'email'>): Promise<string> {
  const current = await validSession();
  if (!current) throw new SupabaseRequestError('Sign in again to finish setting up the business.', 401);
  return request<string>('rest/v1/rpc/create_business', {
    method: 'POST',
    accessToken: current.access_token,
    body: {
      p_name: input.businessName.trim(),
      p_industry: input.industry.trim() || null,
      p_phone: input.phone.trim() || null,
      p_email: input.email.trim() || null,
      p_county: null,
    },
  });
}

export async function saveBusinessPreferences(input: {
  businessId: string;
  aiAssistantEnabled: boolean;
  whatsappDigestEnabled: boolean;
  whatsappRecipientPhone: string;
}): Promise<void> {
  const current = await validSession();
  if (!current) throw new SupabaseRequestError('Sign in again to save business preferences.', 401);
  await request<unknown>(
    'rest/v1/business_settings?business_id=eq.' + encodeURIComponent(input.businessId),
    {
      method: 'PATCH',
      accessToken: current.access_token,
      prefer: 'return=minimal',
      body: {
        ai_assistant_enabled: input.aiAssistantEnabled,
        whatsapp_digest_enabled: input.whatsappDigestEnabled,
        whatsapp_recipient_phone: input.whatsappDigestEnabled ? input.whatsappRecipientPhone.trim() : null,
      },
    },
  );
}

export interface CloudBusinessSettings {
  business_id: string;
  ai_assistant_enabled: boolean;
  whatsapp_digest_enabled: boolean;
  whatsapp_recipient_phone: string | null;
  digest_time: string;
  timezone: string;
}

export interface CloudDailyDigest {
  business_id: string;
  date: string;
  currency: 'KES';
  sales_total: number;
  payments_received: number;
  expenses_total: number;
  gross_profit: number;
  invoice_count: number;
  units_sold: number;
  low_stock_count: number;
  generated_at: string;
}

export async function getBusinessSettings(businessId: string): Promise<CloudBusinessSettings> {
  const current = await validSession();
  if (!current) throw new SupabaseRequestError('Sign in again to load business preferences.', 401);
  const query = new URLSearchParams({
    select: 'business_id,ai_assistant_enabled,whatsapp_digest_enabled,whatsapp_recipient_phone,digest_time,timezone',
    business_id: 'eq.' + businessId,
    limit: '1',
  });
  const rows = await request<CloudBusinessSettings[]>('rest/v1/business_settings?' + query.toString(), {
    accessToken: current.access_token,
  });
  if (!rows?.[0]) {
    throw new SupabaseRequestError('Business preferences are not available yet. Apply the Hesabu foundation migration first.', 404);
  }
  return rows[0];
}

export async function getCloudDailyDigest(businessId: string, date?: string): Promise<CloudDailyDigest> {
  const current = await validSession();
  if (!current) throw new SupabaseRequestError('Sign in again to load the daily digest.', 401);
  const digest = await request<CloudDailyDigest>('rest/v1/rpc/get_daily_digest', {
    method: 'POST',
    accessToken: current.access_token,
    body: { p_business_id: businessId, p_date: date ?? null },
  });
  if (!digest || !digest.date || digest.business_id !== businessId) {
    throw new SupabaseRequestError('The cloud daily digest returned an incomplete response.', 502);
  }
  return digest;
}

export async function listMyBusinesses(): Promise<BusinessMembership[]> {
  const current = await validSession();
  if (!current) return [];
  const query = new URLSearchParams({
    select: 'business_id,role,status,businesses(id,name,industry)',
    user_id: 'eq.' + current.user.id,
    status: 'eq.active',
    order: 'created_at.asc',
  });
  return request<BusinessMembership[]>('rest/v1/business_members?' + query.toString(), {
    accessToken: current.access_token,
  });
}

export async function completeAuthCallback(): Promise<boolean> {
  if (!supabaseConfigured) return false;
  const url = new URL(window.location.href);
  const query = new URLSearchParams(url.search);
  const fragment = new URLSearchParams(url.hash.replace(/^#/, ''));
  const errorDescription = query.get('error_description') || fragment.get('error_description');
  const callbackType = query.get('type') || fragment.get('type') || 'signup';

  const cleanCallbackUrl = () => {
    ['token_hash', 'type', 'code', 'error', 'error_code', 'error_description', 'provider_token', 'provider_refresh_token']
      .forEach(key => query.delete(key));
    const search = query.toString();
    window.history.replaceState({}, document.title, url.pathname + (search ? '?' + search : ''));
  };

  if (errorDescription) {
    cleanCallbackUrl();
    throw new SupabaseRequestError(decodeURIComponent(errorDescription.replace(/\+/g, ' ')), 401);
  }

  const tokenHash = query.get('token_hash');
  if (tokenHash) {
    const payload = await request<Partial<SupabaseSession>>('auth/v1/verify', {
      method: 'POST',
      accessToken: publishableKey,
      body: { token_hash: tokenHash, type: callbackType },
    });
    const session = normaliseSession(payload);
    writeSession(session);
    cleanCallbackUrl();
    return true;
  }

  const accessToken = fragment.get('access_token');
  const refreshToken = fragment.get('refresh_token');
  if (accessToken && refreshToken) {
    const user = await request<SupabaseUser>('auth/v1/user', { accessToken });
    const expiresIn = Number(fragment.get('expires_in') ?? 3600);
    const session = normaliseSession({
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: fragment.get('token_type') || 'bearer',
      expires_in: expiresIn,
      expires_at: fragment.get('expires_at')
        ? Number(fragment.get('expires_at'))
        : Math.floor(Date.now() / 1000) + expiresIn,
      user,
    });
    writeSession(session);
    cleanCallbackUrl();
    return true;
  }

  if (query.has('code')) {
    cleanCallbackUrl();
    throw new SupabaseRequestError(
      'This email link used a PKCE callback that the current browser client cannot complete. Request a new verification email and use the confirmation link generated for Hesabu.',
      400,
    );
  }

  return false;
}

export async function restoreCloudSession(): Promise<{ user: SupabaseUser; memberships: BusinessMembership[] } | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const memberships = await listMyBusinesses();
  return { user, memberships };
}


type DbRow = Record<string, unknown>;

const asNumber = (value: unknown) => {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
};

const asText = (value: unknown, fallback = '') => typeof value === 'string' ? value : fallback;

async function businessRows<T extends DbRow>(
  table: string,
  businessId: string,
  select: string,
  order?: string,
): Promise<T[]> {
  const query = new URLSearchParams({ select, business_id: 'eq.' + businessId });
  if (order) query.set('order', order);
  return request<T[]>('rest/v1/' + table + '?' + query.toString());
}

async function rpc<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const current = await validSession();
  if (!current) throw new SupabaseRequestError('Your session has expired. Sign in again to continue.', 401);
  return request<T>('rest/v1/rpc/' + name, {
    method: 'POST',
    accessToken: current.access_token,
    body,
  });
}

export interface CloudSupplierInput {
  name: string;
  phone: string;
  email: string;
  terms: string;
}

export async function createCloudSupplier(businessId: string, input: CloudSupplierInput): Promise<void> {
  const current = await validSession();
  if (!current) throw new SupabaseRequestError('Sign in again to add a supplier.', 401);
  await request<unknown>('rest/v1/suppliers', {
    method: 'POST',
    accessToken: current.access_token,
    prefer: 'return=minimal',
    body: {
      business_id: businessId,
      name: input.name.trim(),
      phone: input.phone.trim() || null,
      email: input.email.trim() || null,
      payment_terms: input.terms.trim() || null,
      opening_balance: 0,
      is_active: true,
    },
  });
}

export async function createCloudProduct(businessId: string, input: {
  sku: string; name: string; category: string; unit: string; quantity: number;
  reorderLevel: number; costPrice: number; sellingPrice: number; supplierId?: string;
}): Promise<string> {
  return rpc<string>('create_product', {
    p_business_id: businessId,
    p_sku: input.sku.trim(),
    p_name: input.name.trim(),
    p_category: input.category.trim() || null,
    p_unit: input.unit.trim(),
    p_initial_quantity: input.quantity,
    p_reorder_level: input.reorderLevel,
    p_cost_price: input.costPrice,
    p_selling_price: input.sellingPrice,
    p_supplier_id: input.supplierId || null,
  });
}

export async function postCloudSale(businessId: string, input: {
  customer: string; phone: string; dueDate: string; discount: number;
  channel: PaymentChannel; source: Invoice['source'];
  items: Array<{ productId: string; quantity: number }>;
}): Promise<string> {
  return rpc<string>('post_sale_with_payment', {
    p_business_id: businessId,
    p_customer_name: input.customer.trim(),
    p_customer_phone: input.phone.trim() || null,
    p_due_date: input.channel === 'credit' ? input.dueDate : null,
    p_discount: input.discount,
    p_payment_channel: input.channel,
    p_source: input.source === 'website' || input.source === 'hesabu' ? 'manual' : input.source,
    p_items: input.items.map(item => ({ product_id: item.productId, quantity: item.quantity })),
  });
}

export async function postCloudPayment(businessId: string, input: {
  invoiceId: string; amount: number; channel: Exclude<PaymentChannel, 'credit'>;
  phone: string; reference: string; idempotencyKey: string; note: string;
}): Promise<string> {
  return rpc<string>('post_payment', {
    p_business_id: businessId,
    p_invoice_id: input.invoiceId,
    p_amount: input.amount,
    p_channel: input.channel,
    p_provider_reference: input.reference.trim() || null,
    p_origin: 'manual',
    p_phone: input.phone.trim() || null,
    p_idempotency_key: input.idempotencyKey,
    p_note: input.note.trim() || null,
  });
}

const receiptRailToDatabase: Record<ReceiptRail, string> = {
  'Till / PayBill': 'till_paybill',
  'Pochi la Biashara': 'pochi',
  'Send Money to business': 'send_money',
  'Bank transfer': 'bank_transfer',
  'Manual M-Pesa receipt': 'manual_mpesa',
};

export async function postCloudUnmatchedReceipt(businessId: string, input: {
  reference: string; payer: string; phone: string; amount: number; rail: ReceiptRail;
}): Promise<string> {
  return rpc<string>('post_unmatched_receipt', {
    p_business_id: businessId,
    p_reference: input.reference.trim().toUpperCase(),
    p_payer_name: input.payer.trim() || null,
    p_payer_phone: input.phone.trim() || null,
    p_amount: input.amount,
    p_rail: receiptRailToDatabase[input.rail],
  });
}

export async function matchCloudUnmatchedReceipt(businessId: string, receiptId: string, invoiceId: string): Promise<string> {
  return rpc<string>('match_unmatched_receipt', {
    p_business_id: businessId,
    p_receipt_id: receiptId,
    p_invoice_id: invoiceId,
  });
}
export async function postCloudExpense(businessId: string, input: {
  category: string; description: string; amount: number; channel: Exclude<PaymentChannel, 'credit'>;
  date?: string;
}): Promise<string> {
  return rpc<string>('post_expense', {
    p_business_id: businessId,
    p_category: input.category,
    p_description: input.description.trim(),
    p_amount: input.amount,
    p_channel: input.channel,
    p_expense_date: input.date ?? null,
    p_reference: null,
  });
}

export async function createCloudPurchaseOrder(businessId: string, input: {
  supplierId: string; expectedDate: string; note?: string;
  items: Array<{ productId: string; quantity: number; unitCost: number }>;
}): Promise<string> {
  return rpc<string>('create_purchase_order', {
    p_business_id: businessId,
    p_supplier_id: input.supplierId,
    p_expected_date: input.expectedDate || null,
    p_items: input.items.map(item => ({
      product_id: item.productId, quantity: item.quantity, unit_cost: item.unitCost,
    })),
    p_note: input.note ?? null,
  });
}

export async function receiveCloudPurchaseOrder(businessId: string, input: {
  purchaseOrderId: string; items: Array<{ productId: string; quantity: number }>; note?: string;
}): Promise<string> {
  return rpc<string>('post_purchase_receipt', {
    p_business_id: businessId,
    p_purchase_order_id: input.purchaseOrderId,
    p_items: input.items.map(item => ({ product_id: item.productId, quantity: item.quantity })),
    p_note: input.note ?? null,
  });
}

export async function postCloudSupplierPayment(businessId: string, input: {
  supplierId: string; amount: number; channel: Exclude<PaymentChannel, 'credit'>; reference?: string;
}): Promise<string> {
  return rpc<string>('post_supplier_payment', {
    p_business_id: businessId,
    p_supplier_id: input.supplierId,
    p_amount: input.amount,
    p_channel: input.channel,
    p_reference: input.reference ?? null,
    p_note: null,
  });
}

export async function adjustCloudStock(businessId: string, input: {
  productId: string; quantityDelta: number; reason: string;
}): Promise<string> {
  return rpc<string>('post_stock_adjustment', {
    p_business_id: businessId,
    p_product_id: input.productId,
    p_quantity_delta: input.quantityDelta,
    p_reason: input.reason,
  });
}

export async function createCloudBusinessInvitation(businessId: string, input: {
  name: string; email: string; role: Exclude<TeamRole, 'Owner'>;
}): Promise<string> {
  return rpc<string>('create_business_invitation', {
    p_business_id: businessId, p_invitee_name: input.name.trim(),
    p_invitee_email: input.email.trim().toLowerCase(), p_role: input.role.toLowerCase(),
  });
}
export async function acceptCloudBusinessInvitation(token: string): Promise<string> {
  return rpc<string>('accept_business_invitation', { p_invite_token: token });
}
export async function updateCloudBusinessMember(businessId: string, userId: string, input: {
  role: Exclude<TeamRole, 'Owner'>; status: 'active' | 'suspended';
}): Promise<void> {
  await rpc<null>('update_business_member', {
    p_business_id: businessId, p_user_id: userId,
    p_role: input.role.toLowerCase(), p_status: input.status,
  });
}
export async function revokeCloudBusinessInvitation(businessId: string, invitationId: string): Promise<void> {
  await rpc<null>('revoke_business_invitation', { p_business_id: businessId, p_invitation_id: invitationId });
}

export async function saveCloudBusinessProfile(
  businessId: string,
  profile: BusinessProfile,
  userId: string,
): Promise<void> {
  const current = await validSession();
  if (!current) throw new SupabaseRequestError('Sign in again to save business details.', 401);
  const businessQuery = new URLSearchParams({ id: 'eq.' + businessId });
  await request<unknown>('rest/v1/businesses?' + businessQuery.toString(), {
    method: 'PATCH',
    accessToken: current.access_token,
    prefer: 'return=minimal',
    body: {
      name: profile.name.trim(),
      legal_name: profile.legalName.trim() || null,
      industry: profile.industry.trim() || null,
      phone: profile.phone.trim() || null,
      email: profile.email.trim() || null,
      county: profile.location.trim() || null,
    },
  });
  const profileQuery = new URLSearchParams({ id: 'eq.' + userId });
  await request<unknown>('rest/v1/profiles?' + profileQuery.toString(), {
    method: 'PATCH',
    accessToken: current.access_token,
    prefer: 'return=minimal',
    body: { display_name: profile.owner.trim() || null, phone: profile.phone.trim() || null },
  });
}

export async function getCloudWorkspace(businessId: string, user: SupabaseUser): Promise<AppData> {
  const current = await validSession();
  if (!current) throw new SupabaseRequestError('Your session has expired. Sign in again to load this business.', 401);
  const [
    businesses, productsRows, suppliersRows, invoiceRows, invoiceItemRows, paymentRows,
    receiptRows, expenseRows, purchaseRows, purchaseItemRows, movementRows,
    journalEntryRows, journalLineRows, eventRows, teamRows, invitationRows, profileRows,
  ] = await Promise.all([
    request<DbRow[]>('rest/v1/businesses?select=id,name,legal_name,industry,phone,email,county,currency,next_invoice_number,next_purchase_order_number&id=eq.' + businessId, {
      accessToken: current.access_token,
    }),
    businessRows('products', businessId, 'id,sku,name,category,unit,quantity_on_hand,reorder_level,cost_price,selling_price,supplier_id,updated_at,created_at', 'name.asc'),
    businessRows('suppliers', businessId, 'id,name,phone,email,payment_terms,opening_balance,current_balance,is_active', 'name.asc'),
    businessRows('invoices', businessId, 'id,invoice_number,customer_name,customer_phone,issue_date,due_date,subtotal,discount_amount,total_amount,amount_paid,payment_channel,status,source', 'issue_date.desc'),
    businessRows('invoice_items', businessId, 'id,invoice_id,product_id,product_name,sku_snapshot,quantity,unit_price,unit_cost,line_total'),
    businessRows('payments', businessId, 'id,invoice_id,amount,applied_amount,unapplied_amount,channel,status,origin,provider_reference,phone,note,received_at,confirmed_at', 'received_at.desc'),
    businessRows('unmatched_receipts', businessId, 'id,reference,payer_name,payer_phone,amount,rail,source,status,received_at,matched_invoice_id', 'received_at.desc'),
    businessRows('expenses', businessId, 'id,expense_date,category,description,amount,channel,reference', 'expense_date.desc'),
    businessRows('purchase_orders', businessId, 'id,supplier_id,order_number,order_date,expected_date,status,subtotal,note', 'order_date.desc'),
    businessRows('purchase_order_items', businessId, 'id,purchase_order_id,product_id,product_name,quantity_ordered,quantity_received,unit_cost,line_total'),
    businessRows('cash_movements', businessId, 'id,movement_date,channel,direction,amount,description,reference,source_type', 'movement_date.desc'),
    businessRows('journal_entries', businessId, 'id,journal_number,entry_date,description,reference,status', 'entry_date.desc'),
    businessRows('journal_lines', businessId, 'id,journal_entry_id,account_name,debit,credit,description'),
    businessRows('integration_events', businessId, 'id,event_type,source,status,reference,detail,occurred_at', 'occurred_at.desc'),
    request<DbRow[]>('rest/v1/rpc/get_business_team', {
      method: 'POST', accessToken: current.access_token, body: { p_business_id: businessId },
    }),
    request<DbRow[]>('rest/v1/rpc/list_business_invitations', {
      method: 'POST', accessToken: current.access_token, body: { p_business_id: businessId },
    }),
    request<DbRow[]>('rest/v1/profiles?select=id,display_name&id=eq.' + user.id, {
      accessToken: current.access_token,
    }),
  ]);

  const business = businesses[0];
  if (!business) throw new SupabaseRequestError('This business workspace could not be found or you no longer have access.', 404);
  const profileRow = profileRows[0];
  const profile: BusinessProfile = {
    name: asText(business.name, 'My business'),
    legalName: asText(business.legal_name),
    owner: asText(profileRow?.display_name, asText(user.user_metadata?.display_name, user.email || 'Business owner')),
    email: asText(business.email, user.email || ''),
    phone: asText(business.phone, ''),
    location: asText(business.county, ''),
    currency: 'KES',
    taxPin: '',
    industry: asText(business.industry, 'Other'),
  };

  const products = productsRows.map((row): AppData['products'][number] => ({
    id: asText(row.id), sku: asText(row.sku), name: asText(row.name),
    category: asText(row.category, 'Uncategorised'), unit: asText(row.unit, 'unit'),
    quantity: asNumber(row.quantity_on_hand), reorderLevel: asNumber(row.reorder_level),
    costPrice: asNumber(row.cost_price), sellingPrice: asNumber(row.selling_price),
    supplierId: asText(row.supplier_id) || undefined,
    updatedAt: asText(row.updated_at, asText(row.created_at)).slice(0, 10),
  }));

  const suppliers: Supplier[] = suppliersRows.filter(row => row.is_active !== false).map(row => ({
    id: asText(row.id), name: asText(row.name), phone: asText(row.phone),
    email: asText(row.email), terms: asText(row.payment_terms, '—'),
    balance: asNumber(row.current_balance),
  }));

  const itemsByInvoice = new Map<string, DbRow[]>();
  invoiceItemRows.forEach(row => {
    const id = asText(row.invoice_id);
    itemsByInvoice.set(id, [...(itemsByInvoice.get(id) ?? []), row]);
  });
  const invoices: Invoice[] = invoiceRows.filter(row => row.status !== 'void').map(row => ({
    id: asText(row.id), number: asText(row.invoice_number),
    customer: asText(row.customer_name, 'Walk-in customer'), phone: asText(row.customer_phone),
    date: asText(row.issue_date), dueDate: asText(row.due_date, asText(row.issue_date)),
    lines: (itemsByInvoice.get(asText(row.id)) ?? []).map(item => ({
      productId: asText(item.product_id), name: asText(item.product_name),
      sku: asText(item.sku_snapshot), quantity: asNumber(item.quantity),
      unitPrice: asNumber(item.unit_price), unitCost: asNumber(item.unit_cost),
      lineTotal: asNumber(item.line_total),
    })),
    subtotal: asNumber(row.subtotal), discount: asNumber(row.discount_amount),
    total: asNumber(row.total_amount), paid: asNumber(row.amount_paid),
    channel: asText(row.payment_channel, 'credit') as PaymentChannel,
    status: asText(row.status, 'sent') as Invoice['status'],
    source: (['website', 'pos', 'hesabu', 'manual'].includes(asText(row.source))
      ? asText(row.source) : 'manual') as Invoice['source'],
  }));

  const invoiceById = new Map(invoices.map(item => [item.id, item]));
  const payments: Payment[] = paymentRows.map(row => {
    const invoice = invoiceById.get(asText(row.invoice_id));
    const rawOrigin = asText(row.origin);
    return {
      id: asText(row.id), invoiceId: asText(row.invoice_id),
      invoiceNumber: invoice?.number ?? 'Unlinked invoice',
      customer: invoice?.customer ?? 'Customer', phone: asText(row.phone, invoice?.phone ?? ''),
      amount: asNumber(row.amount), channel: asText(row.channel, 'cash') as PaymentChannel,
      status: asText(row.status, 'succeeded') as Payment['status'],
      reference: asText(row.provider_reference, '—'),
      createdAt: asText(row.received_at, asText(row.created_at)),
      confirmedAt: asText(row.confirmed_at) || undefined,
      note: asText(row.note), appliedAmount: asNumber(row.applied_amount),
      unappliedAmount: asNumber(row.unapplied_amount),
      origin: (rawOrigin === 'daraja' ? 'daraja_demo' : rawOrigin) as Payment['origin'],
    };
  });

  const unmatchedReceipts: UnmatchedReceipt[] = receiptRows
    .filter(row => row.status !== 'matched' && row.status !== 'void')
    .map(row => ({
      id: asText(row.id), reference: asText(row.reference),
      payer: asText(row.payer_name), phone: asText(row.payer_phone),
      amount: asNumber(row.amount), rail: asText(row.rail, 'Manual M-Pesa receipt') as UnmatchedReceipt['rail'],
      receivedAt: asText(row.received_at), source: asText(row.source, 'manual') as UnmatchedReceipt['source'],
    }));

  const expenses: Expense[] = expenseRows.map(row => ({
    id: asText(row.id), date: asText(row.expense_date), category: asText(row.category),
    description: asText(row.description), amount: asNumber(row.amount),
    channel: asText(row.channel, 'cash') as Expense['channel'], reference: asText(row.reference),
  }));

  const purchaseItemsByOrder = new Map<string, DbRow[]>();
  purchaseItemRows.forEach(row => {
    const id = asText(row.purchase_order_id);
    purchaseItemsByOrder.set(id, [...(purchaseItemsByOrder.get(id) ?? []), row]);
  });
  const supplierById = new Map(suppliers.map(supplier => [supplier.id, supplier]));
  const purchaseOrders: PurchaseOrder[] = purchaseRows.map(row => ({
    id: asText(row.id), number: asText(row.order_number),
    supplierId: asText(row.supplier_id),
    supplierName: supplierById.get(asText(row.supplier_id))?.name ?? 'Supplier',
    createdAt: asText(row.order_date), expectedAt: asText(row.expected_date, asText(row.order_date)),
    lines: (purchaseItemsByOrder.get(asText(row.id)) ?? []).map(item => ({
      productId: asText(item.product_id), name: asText(item.product_name),
      quantity: asNumber(item.quantity_ordered), received: asNumber(item.quantity_received),
      unitCost: asNumber(item.unit_cost), lineTotal: asNumber(item.line_total),
    })),
    total: asNumber(row.subtotal), status: asText(row.status, 'sent') as PurchaseOrder['status'],
  }));

  const entryById = new Map(journalEntryRows.map(row => [asText(row.id), row]));
  const journal: JournalLine[] = journalLineRows.flatMap(row => {
    const entry = entryById.get(asText(row.journal_entry_id));
    if (!entry) return [];
    return [{
      id: asText(row.id), journalId: asText(row.journal_entry_id),
      date: asText(entry.entry_date), account: asText(row.account_name),
      debit: asNumber(row.debit), credit: asNumber(row.credit),
      description: asText(row.description, asText(entry.description)),
      reference: asText(entry.reference, asText(entry.journal_number)),
    }];
  });

  const events: IntegrationEvent[] = eventRows.map(row => ({
    id: asText(row.id), time: asText(row.occurred_at),
    type: asText(row.event_type), source: asText(row.source),
    status: asText(row.status, 'pending') as IntegrationEvent['status'],
    reference: asText(row.reference), detail: asText(row.detail),
  }));

  const memberRoles: Record<string, TeamRole> = {
    owner: 'Owner', manager: 'Manager', sales: 'Sales', inventory: 'Inventory', finance: 'Finance',
  };
  const teamMembers: TeamMember[] = teamRows.map(row => ({
    id: asText(row.user_id), name: asText(row.display_name, 'Team member'),
    email: asText(row.email), role: memberRoles[asText(row.role)] ?? 'Sales',
    status: asText(row.status) === 'active' ? 'active' : 'suspended',
  }));
  const teamInvitations: TeamInvitation[] = invitationRows.map(row => ({
    id: asText(row.id), name: asText(row.invitee_name, 'Team member'),
    email: asText(row.invitee_email),
    role: (memberRoles[asText(row.role)] ?? 'Sales') as Exclude<TeamRole, 'Owner'>,
    status: asText(row.invitation_status, 'pending') as TeamInvitation['status'],
    token: asText(row.invite_token), createdAt: asText(row.created_at), expiresAt: asText(row.expires_at),
  }));

  const cashMovements: AppData['cashMovements'] = movementRows
    .filter(row => row.direction === 'out' && row.source_type === 'supplier_payment')
    .map(row => ({
      id: asText(row.id), date: asText(row.movement_date),
      channel: asText(row.channel, 'cash') as CashMovement['channel'],
      direction: 'out', amount: asNumber(row.amount), description: asText(row.description),
      reference: asText(row.reference),
      source: asText(row.source_type, 'other') === 'supplier_payment' ? 'supplier_payment' : 'other',
    }));

  return {
    profile, products, invoices, payments, unmatchedReceipts, expenses, suppliers,
    purchaseOrders, teamMembers, teamInvitations, journal, events, cashMovements,
    openingBalances: { cash: 0, mpesa: 0, bank: 0, inventory: 0 },
    nextInvoice: asNumber(business.next_invoice_number) || 1001,
    nextPurchaseOrder: asNumber(business.next_purchase_order_number) || 1,
  };
}


export async function saveCloudWhatsAppDestination(businessId: string, phone: string): Promise<void> {
  const current = await validSession();
  if (!current) throw new SupabaseRequestError('Sign in again to save the WhatsApp destination.', 401);
  const query = new URLSearchParams({ business_id: 'eq.' + businessId });
  const normalized = phone.trim();
  await request<unknown>('rest/v1/business_settings?' + query.toString(), {
    method: 'PATCH',
    accessToken: current.access_token,
    prefer: 'return=minimal',
    body: {
      whatsapp_recipient_phone: normalized || null,
      whatsapp_digest_enabled: Boolean(normalized),
    },
  });
}
