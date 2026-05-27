import 'dotenv/config';

import { PolygonWebSocket }                       from './lib/polygon-ws';
import { fetchDarkPoolPrints }                    from './lib/polygon-rest';
import { enqueueFlow, enqueueDarkPool, flushAll } from './lib/supabase-writer';
import { getMarketSession, shouldConnectWebSocket } from './lib/market-hours';
import { logger }                                 from './lib/logger';
import type { PolygonOptionsTrade }               from './lib/types';

// ── Env validation (fail fast at startup) ────────────────────────────────────
function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
}

const POLYGON_API_KEY = requireEnv('POLYGON_API_KEY');
requireEnv('NEXT_PUBLIC_SUPABASE_URL');
requireEnv('SUPABASE_SERVICE_ROLE_KEY');
requireEnv('UPSTASH_REDIS_REST_URL');
requireEnv('UPSTASH_REDIS_REST_TOKEN');

// ── Option symbol parser ──────────────────────────────────────────────────────
// Format: O:AAPL230120C00150000
function parseOptionSymbol(sym: string): {
  ticker: string; expiry: string; dte: number;
  flow_type: 'CALL' | 'PUT'; strike: number;
} | null {
  try {
    const s     = sym.startsWith('O:') ? sym.slice(2) : sym;
    const match = s.match(/^([A-Z]+)(\d{6})([CP])(\d{8})$/);
    if (!match) return null;

    const [, ticker, dateStr, typeChar, strikeStr] = match;
    const yy     = parseInt(dateStr.slice(0, 2), 10);
    const mm     = parseInt(dateStr.slice(2, 4), 10) - 1;
    const dd     = parseInt(dateStr.slice(4, 6), 10);
    const expiry = new Date(2000 + yy, mm, dd);
    const dte    = Math.max(0, Math.ceil((expiry.getTime() - Date.now()) / 86_400_000));

    return {
      ticker,
      expiry:    expiry.toISOString().split('T')[0],
      dte,
      flow_type: typeChar === 'C' ? 'CALL' : 'PUT',
      strike:    parseInt(strikeStr, 10) / 1_000,
    };
  } catch {
    return null;
  }
}

// ── Classifiers ───────────────────────────────────────────────────────────────
const SWEEP_CONDITIONS = new Set([41, 14]);
const MIN_PREMIUM_OPEN      = 10_000;
const MIN_PREMIUM_PREMARKET = 100_000;

function classifyOrderType(t: PolygonOptionsTrade, totalPrem: number): 'SWEEP' | 'BLOCK' | 'SPLIT' {
  if (t.c?.some((c) => SWEEP_CONDITIONS.has(c))) return 'SWEEP';
  if (totalPrem >= 500_000 && t.s >= 100)         return 'BLOCK';
  return 'SPLIT';
}

function classifySentiment(
  flow_type: 'CALL' | 'PUT',
  orderType: 'SWEEP' | 'BLOCK' | 'SPLIT',
  dte: number,
): 'BULLISH' | 'BEARISH' | 'NEUTRAL' {
  if (orderType === 'SWEEP' && dte <= 30) return flow_type === 'CALL' ? 'BULLISH' : 'BEARISH';
  if (orderType === 'BLOCK')              return flow_type === 'CALL' ? 'BULLISH' : 'BEARISH';
  if (dte > 90 && flow_type === 'PUT')   return 'NEUTRAL';
  return flow_type === 'CALL' ? 'BULLISH' : 'BEARISH';
}

function isUnusual(size: number, totalPrem: number, dte: number): boolean {
  return totalPrem >= 250_000 && dte <= 45 && size >= 50;
}

// ── Trade processor ───────────────────────────────────────────────────────────
function processTrade(raw: PolygonOptionsTrade): void {
  const parsed = parseOptionSymbol(raw.sym);
  if (!parsed) return;

  const { ticker, expiry, dte, flow_type, strike } = parsed;
  const totalPremium = raw.p * raw.s * 100;

  const session    = getMarketSession();
  const minPremium = session === 'premarket' ? MIN_PREMIUM_PREMARKET : MIN_PREMIUM_OPEN;
  if (totalPremium < minPremium) return;

  const orderType = classifyOrderType(raw, totalPremium);
  const sentiment = classifySentiment(flow_type, orderType, dte);
  const unusual   = isUnusual(raw.s, totalPremium, dte);

  if (totalPremium >= 500_000) {
    logger.info({ msg: 'whale', ticker, flow_type, strike, expiry, totalPremium, orderType });
  }

  enqueueFlow({
    polygon_id:    raw.i || `${raw.sym}-${raw.t}`,
    ticker,
    strike,
    expiry,
    dte,
    flow_type,
    order_type:    orderType,
    sentiment,
    premium:       raw.p,
    total_premium: totalPremium,
    price:         raw.p,
    size:          raw.s,
    open_interest: null,
    iv:            null,
    is_sweep:      orderType === 'SWEEP',
    is_unusual:    unusual,
    traded_at:     new Date(raw.t).toISOString(),
  });
}

// ── Dark pool polling ─────────────────────────────────────────────────────────
let dpInterval: ReturnType<typeof setInterval> | null = null;

async function pollDarkPool(): Promise<void> {
  const rows = await fetchDarkPoolPrints(POLYGON_API_KEY);
  for (const row of rows) enqueueDarkPool(row);
  if (rows.length > 0) logger.info({ msg: 'dark pool poll', count: rows.length });
}

function startDarkPoolPolling(): void {
  void pollDarkPool();
  dpInterval = setInterval(() => void pollDarkPool(), 5_000);
}

// ── WebSocket lifecycle ───────────────────────────────────────────────────────
let wsClient: PolygonWebSocket | null = null;

function syncWebSocket(): void {
  if (shouldConnectWebSocket()) {
    if (!wsClient) {
      wsClient = new PolygonWebSocket(POLYGON_API_KEY, processTrade);
      wsClient.connect();
    }
  } else {
    if (wsClient) {
      logger.info({ msg: 'market closed — pausing WebSocket', session: getMarketSession() });
      wsClient.destroy();
      wsClient = null;
    }
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  logger.info({
    msg:      'Fathom ingest pipeline starting',
    session:  getMarketSession(),
    supabase: process.env.NEXT_PUBLIC_SUPABASE_URL,
  });

  syncWebSocket();
  setInterval(syncWebSocket, 60_000); // re-check market hours every minute

  startDarkPoolPolling();

  const shutdown = async (sig: string): Promise<void> => {
    logger.info({ msg: `${sig} received — shutting down` });
    wsClient?.destroy();
    if (dpInterval) clearInterval(dpInterval);
    await flushAll();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT',  () => void shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error({ msg: 'fatal startup error', err: String(err) });
  process.exit(1);
});
