import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { FlowRow, DarkPoolRow } from './types';
import { logger } from './logger';
import { cacheFlowRows, cacheDarkPoolRows } from './redis-cache';

const BATCH_MS  = 500; // flush every 500 ms …
const BATCH_MAX = 10;  // … or when buffer hits 10 rows

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
}

let _db: SupabaseClient | null = null;

function getDb(): SupabaseClient {
  if (!_db) {
    _db = createClient(
      requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
      requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
  }
  return _db;
}

// ── Flow buffer ───────────────────────────────────────────────────────────────

let flowBuffer: FlowRow[]  = [];
let flowTimer:  ReturnType<typeof setTimeout> | null = null;
let flowWindow: FlowRow[]  = []; // rolling 50-row window for Redis

export function enqueueFlow(row: FlowRow): void {
  flowBuffer.push(row);
  flowWindow = [row, ...flowWindow].slice(0, 50);

  if (flowBuffer.length >= BATCH_MAX) {
    void flushFlow();
  } else if (!flowTimer) {
    flowTimer = setTimeout(() => void flushFlow(), BATCH_MS);
  }
}

async function flushFlow(): Promise<void> {
  if (flowTimer) { clearTimeout(flowTimer); flowTimer = null; }
  if (flowBuffer.length === 0) return;

  const rows = flowBuffer.splice(0, flowBuffer.length);

  // Redis first — hot path reads hit cache, not Supabase
  await cacheFlowRows(flowWindow);

  const { error } = await getDb()
    .from('flow_cache')
    .upsert(rows, { onConflict: 'polygon_id', ignoreDuplicates: true });

  if (error) {
    logger.error({ msg: 'flow_cache upsert failed', error: error.message });
  } else {
    logger.info({ msg: 'flushed flow batch', count: rows.length });
  }
}

// ── Dark pool buffer ──────────────────────────────────────────────────────────

let dpBuffer: DarkPoolRow[] = [];
let dpTimer:  ReturnType<typeof setTimeout> | null = null;
let dpWindow: DarkPoolRow[] = [];

export function enqueueDarkPool(row: DarkPoolRow): void {
  dpBuffer.push(row);
  dpWindow = [row, ...dpWindow].slice(0, 50);

  if (dpBuffer.length >= BATCH_MAX) {
    void flushDarkPool();
  } else if (!dpTimer) {
    dpTimer = setTimeout(() => void flushDarkPool(), BATCH_MS);
  }
}

export async function flushDarkPool(): Promise<void> {
  if (dpTimer) { clearTimeout(dpTimer); dpTimer = null; }
  if (dpBuffer.length === 0) return;

  const rows = dpBuffer.splice(0, dpBuffer.length);

  await cacheDarkPoolRows(dpWindow);

  const { error } = await getDb()
    .from('darkpool_cache')
    .upsert(rows, { onConflict: 'polygon_id', ignoreDuplicates: true });

  if (error) {
    logger.error({ msg: 'darkpool_cache upsert failed', error: error.message });
  } else {
    logger.info({ msg: 'flushed darkpool batch', count: rows.length });
  }
}

// ── Graceful drain ────────────────────────────────────────────────────────────

export async function flushAll(): Promise<void> {
  await Promise.all([flushFlow(), flushDarkPool()]);
}
