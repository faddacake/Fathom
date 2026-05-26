import { createClient } from '@supabase/supabase-js';
import type { FathomUser, OptionsFlow, DarkPoolPrint, CongressTrade, AlertRule, AlertLog, ApiUsage } from '@/types';

// ─── DATABASE TYPE MAP ────────────────────────────────────────────────────────
export type Database = {
  public: {
    Tables: {
      users:       { Row: FathomUser;     Insert: Omit<FathomUser, 'id' | 'createdAt' | 'updatedAt'>; Update: Partial<FathomUser> };
      flow_cache:  { Row: OptionsFlow;    Insert: Omit<OptionsFlow, 'id'>;     Update: Partial<OptionsFlow> };
      dark_pool:   { Row: DarkPoolPrint;  Insert: Omit<DarkPoolPrint, 'id'>;   Update: Partial<DarkPoolPrint> };
      congress:    { Row: CongressTrade;  Insert: Omit<CongressTrade, 'id'>;   Update: Partial<CongressTrade> };
      alert_rules: { Row: AlertRule;      Insert: Omit<AlertRule, 'id' | 'createdAt'>; Update: Partial<AlertRule> };
      alert_log:   { Row: AlertLog;       Insert: Omit<AlertLog, 'id'>;        Update: Partial<FathomUser> };
      api_usage:   { Row: ApiUsage;       Insert: ApiUsage;                    Update: Partial<ApiUsage> };
    };
  };
};

// ─── CLIENT (browser / RSC) ───────────────────────────────────────────────────
const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnon) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnon);

// ─── ADMIN CLIENT (server-only, never ship to browser) ────────────────────────
export function getSupabaseAdmin() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  return createClient<Database>(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ─── USER HELPERS ─────────────────────────────────────────────────────────────
export async function getUserByClerkId(clerkId: string): Promise<FathomUser | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from('users')
    .select('*')
    .eq('clerkId', clerkId)
    .single();
  if (error) return null;
  return data;
}

export async function upsertUser(user: Database['public']['Tables']['users']['Insert']): Promise<FathomUser> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from('users')
    .upsert({ ...user, updatedAt: new Date().toISOString() }, { onConflict: 'clerkId' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateUserTier(
  clerkId: string,
  update: Pick<Partial<FathomUser>, 'platformTier' | 'apiTier' | 'botTier' | 'stripeCustomerId'>
): Promise<void> {
  const db = getSupabaseAdmin();
  const { error } = await db
    .from('users')
    .update({ ...update, updatedAt: new Date().toISOString() })
    .eq('clerkId', clerkId);
  if (error) throw error;
}

// ─── FLOW CACHE HELPERS ───────────────────────────────────────────────────────
export async function getLatestFlow(limit = 50, ticker?: string): Promise<OptionsFlow[]> {
  const db = getSupabaseAdmin();
  let query = db
    .from('flow_cache')
    .select('*')
    .order('timestamp', { ascending: false })
    .limit(limit);
  if (ticker) query = query.eq('ticker', ticker.toUpperCase());
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function insertFlow(rows: Array<Database['public']['Tables']['flow_cache']['Insert']>): Promise<void> {
  const db = getSupabaseAdmin();
  const { error } = await db.from('flow_cache').insert(rows);
  if (error) throw error;
}

// ─── DARK POOL HELPERS ────────────────────────────────────────────────────────
export async function getLatestDarkPool(limit = 50, ticker?: string): Promise<DarkPoolPrint[]> {
  const db = getSupabaseAdmin();
  let query = db
    .from('dark_pool')
    .select('*')
    .order('timestamp', { ascending: false })
    .limit(limit);
  if (ticker) query = query.eq('ticker', ticker.toUpperCase());
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

// ─── CONGRESS HELPERS ─────────────────────────────────────────────────────────
export async function getCongressTrades(limit = 50, politician?: string): Promise<CongressTrade[]> {
  const db = getSupabaseAdmin();
  let query = db
    .from('congress')
    .select('*')
    .order('disclosureDate', { ascending: false })
    .limit(limit);
  if (politician) query = query.ilike('politician', `%${politician}%`);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

// ─── ALERT HELPERS ────────────────────────────────────────────────────────────
export async function getActiveAlerts(userId: string): Promise<AlertRule[]> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from('alert_rules')
    .select('*')
    .eq('userId', userId)
    .eq('isActive', true);
  if (error) throw error;
  return data ?? [];
}

export async function logAlert(log: Database['public']['Tables']['alert_log']['Insert']): Promise<void> {
  const db = getSupabaseAdmin();
  const { error } = await db.from('alert_log').insert(log);
  if (error) throw error;
}
