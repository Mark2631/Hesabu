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
  const payload = await request<Partial<SupabaseSession> & { user?: SupabaseUser }>('auth/v1/signup', {
    method: 'POST',
    body: {
      email: input.email.trim(),
      password: input.password,
      data: { display_name: input.fullName.trim() },
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

export async function restoreCloudSession(): Promise<{ user: SupabaseUser; memberships: BusinessMembership[] } | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const memberships = await listMyBusinesses();
  return { user, memberships };
}
