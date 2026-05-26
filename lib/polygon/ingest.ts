// lib/polygon/ingest.ts
// ─────────────────────────────────────────────────────────────
// Polygon.io Options Flow Ingest Pipeline
//
// Connects to Polygon WebSocket, filters options trades,
// enriches with sentiment/classification, and upserts to
// Supabase flow_cache in real-time.
//
// Run as a standalone process on Railway (separate from Next.js).
// Start: npx ts-node lib/polygon/ingest.ts
// ─────────────────────────────────────────────────────────────
 
import { createClient } from '@supabase/supabase-js';
import * as https from 'https';
import * as dotenv from 'dotenv';
import WebSocketLib from 'ws';
 
dotenv.config({ path: '.env.local' });
 
// ── Supabase client ───────────────────────────────────────────
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: { persistSession: false },
    realtime: { transport: WebSocketLib as any },
  }
);
 
// ── Config ────────────────────────────────────────────────────
const POLYGON_API_KEY = process.env.POLYGON_API_KEY!;
const WS_URL         = 'wss://socket.polygon.io/options';
 
// Minimum total premium to ingest (filter noise)
const MIN_PREMIUM = 10_000; // $10K minimum
 
// Batch upsert every N ms to avoid hammering Supabase
const BATCH_INTERVAL_MS = 500;
const MAX_BATCH_SIZE     = 50;
 
// ── Types ─────────────────────────────────────────────────────
 
interface PolygonOptionsTrade {
  ev:   string;   // event type: 'T' for trade
  sym:  string;   // option symbol e.g. O:AAPL230120C00150000
  p:    number;   // price per contract
  s:    number;   // size (contracts)
  t:    number;   // timestamp (ms)
  c:    number[]; // conditions
  x:    number;   // exchange ID
  i:    string;   // trade ID
}
 
interface FlowRow {
  polygon_id:    string;
  ticker:        string;
  strike:        number;
  expiry:        string;
  dte:           number;
  flow_type:     'CALL' | 'PUT';
  order_type:    'SWEEP' | 'BLOCK' | 'SPLIT';
  sentiment:     'BULLISH' | 'BEARISH' | 'NEUTRAL';
  premium:       number;
  total_premium: number;
  price:         number;
  size:          number;
  open_interest: number | null;
  iv:            number | null;
  is_sweep:      boolean;
  is_unusual:    boolean;
  traded_at:     string;
}
 
// ── Option symbol parser ──────────────────────────────────────
// Polygon option symbol format: O:AAPL230120C00150000
// = O : {TICKER} {YY} {MM} {DD} {C/P} {8-digit strike * 1000}
 
function parseOptionSymbol(sym: string): {
  ticker: string;
  expiry: string;
  dte: number;
  flow_type: 'CALL' | 'PUT';
  strike: number;
} | null {
  try {
    // Remove "O:" prefix
    const s = sym.startsWith('O:') ? sym.slice(2) : sym;
 
    // Find where the date starts (6 consecutive digits after the ticker)
    const match = s.match(/^([A-Z]+)(\d{6})([CP])(\d{8})$/);
    if (!match) return null;
 
    const [, ticker, dateStr, typeChar, strikeStr] = match;
 
    // Parse date: YYMMDD
    const yy = parseInt(dateStr.slice(0, 2));
    const mm = parseInt(dateStr.slice(2, 4)) - 1; // 0-indexed
    const dd = parseInt(dateStr.slice(4, 6));
    const year = 2000 + yy;
    const expiry = new Date(year, mm, dd);
    const expiryStr = expiry.toISOString().split('T')[0];
 
    // DTE
    const now = new Date();
    const dte = Math.max(0, Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
 
    // Strike: 8 digits, last 3 are decimal
    const strike = parseInt(strikeStr) / 1000;
 
    // Type
    const flow_type: 'CALL' | 'PUT' = typeChar === 'C' ? 'CALL' : 'PUT';
 
    return { ticker, expiry: expiryStr, dte, flow_type, strike };
  } catch {
    return null;
  }
}
 
// ── Trade classifier ──────────────────────────────────────────
 
// Polygon condition codes for sweeps
const SWEEP_CONDITIONS = new Set([41, 14]); // IntermarketSweep, OpeningPrint
 
function classifyOrderType(trade: PolygonOptionsTrade, totalPremium: number): 'SWEEP' | 'BLOCK' | 'SPLIT' {
  // Sweep: specific exchange condition codes OR large size + multiple exchanges
  if (trade.c?.some(c => SWEEP_CONDITIONS.has(c))) return 'SWEEP';
  // Block: single large print over $500K
  if (totalPremium >= 500_000 && trade.s >= 100) return 'BLOCK';
  // Split: everything else
  return 'SPLIT';
}
 
function classifySentiment(
  flow_type: 'CALL' | 'PUT',
  orderType: 'SWEEP' | 'BLOCK' | 'SPLIT',
  dte: number
): 'BULLISH' | 'BEARISH' | 'NEUTRAL' {
  // Short-dated sweeps are high-conviction directional bets
  if (orderType === 'SWEEP' && dte <= 30) {
    return flow_type === 'CALL' ? 'BULLISH' : 'BEARISH';
  }
  if (orderType === 'BLOCK') {
    return flow_type === 'CALL' ? 'BULLISH' : 'BEARISH';
  }
  // Long-dated splits could be hedges
  if (dte > 90 && flow_type === 'PUT') return 'NEUTRAL';
  return flow_type === 'CALL' ? 'BULLISH' : 'BEARISH';
}
 
function isUnusual(size: number, totalPremium: number, dte: number): boolean {
  // Unusual = large premium + short-dated + significant size
  return totalPremium >= 250_000 && dte <= 45 && size >= 50;
}
 
// ── Batch buffer ──────────────────────────────────────────────
 
let batch: FlowRow[] = [];
let batchTimer: ReturnType<typeof setTimeout> | null = null;
 
async function flushBatch(): Promise<void> {
  if (batch.length === 0) return;
 
  const toInsert = batch.splice(0, MAX_BATCH_SIZE);
 
  const { error } = await supabase
    .from('flow_cache')
    .upsert(toInsert, { onConflict: 'polygon_id', ignoreDuplicates: true });
 
  if (error) {
    console.error('[ingest] batch upsert error:', error.message);
  } else {
    console.log(`[ingest] flushed ${toInsert.length} rows`);
  }
}
 
function scheduleBatchFlush(): void {
  if (batchTimer) return;
  batchTimer = setTimeout(async () => {
    batchTimer = null;
    await flushBatch();
    // If more rows came in while flushing
    if (batch.length > 0) scheduleBatchFlush();
  }, BATCH_INTERVAL_MS);
}
 
// ── Dark pool ingest (REST polling) ──────────────────────────
// Polygon WebSocket doesn't stream dark pool — we poll REST every 5s
 
async function pollDarkPool(): Promise<void> {
  const url = `https://api.polygon.io/v3/trades?market=stocks&order=desc&limit=50&apiKey=${POLYGON_API_KEY}`;
 
  const data = await fetchJSON(url);
  if (!data?.results) return;
 
  const rows = data.results
    .filter((t: any) => t.trf_id !== undefined) // off-exchange flag
    .map((t: any) => ({
      polygon_id:  t.id || `${t.ticker}-${t.sip_timestamp}`,
      ticker:      t.ticker || '',
      price:       t.price || 0,
      size:        t.size || 0,
      notional:    (t.price || 0) * (t.size || 0),
      exchange_code: String(t.exchange || ''),
      traded_at:   new Date(t.sip_timestamp / 1_000_000).toISOString(),
    }))
    .filter((r: any) => r.notional >= 100_000); // $100K minimum
 
  if (rows.length === 0) return;
 
  const { error } = await supabase
    .from('dark_pool_cache')
    .upsert(rows, { onConflict: 'polygon_id', ignoreDuplicates: true });
 
  if (error) console.error('[dark-pool] upsert error:', error.message);
  else if (rows.length > 0) console.log(`[dark-pool] inserted ${rows.length} prints`);
}
 
// ── Congress trade scraper ─────────────────────────────────────
// Polls SEC EDGAR RSS feed every 5 minutes
 
async function pollCongressTrades(): Promise<void> {
  // Form 4 RSS feed (insider/congressional disclosures)
  const url = 'https://efts.sec.gov/LATEST/search-index?q=%22Form+4%22&dateRange=custom&startdt=' +
    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] +
    '&enddt=' + new Date().toISOString().split('T')[0] +
    '&hits.hits._source=period_of_report,entity_name,file_num&hits.hits.total.value=true&hits.hits.hits.total=true';
 
  // Basic implementation — full scraper will be built separately
  // This polls the EDGAR full-text search for recent Form 4 filings
  console.log('[congress] polling EDGAR for recent disclosures...');
}
 
// ── HTTP helper ───────────────────────────────────────────────
 
function fetchJSON(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('JSON parse error')); }
      });
    }).on('error', reject);
  });
}
 
// ── Trade processor ───────────────────────────────────────────
 
function processTrade(raw: PolygonOptionsTrade): void {
  const parsed = parseOptionSymbol(raw.sym);
  if (!parsed) return;
 
  const { ticker, expiry, dte, flow_type, strike } = parsed;
  const totalPremium = raw.p * raw.s * 100; // premium × contracts × 100
 
  // Filter noise
  if (totalPremium < MIN_PREMIUM) return;
 
  const orderType = classifyOrderType(raw, totalPremium);
  const sentiment = classifySentiment(flow_type, orderType, dte);
  const unusual   = isUnusual(raw.s, totalPremium, dte);
 
  const row: FlowRow = {
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
    open_interest: null, // enriched separately
    iv:            null, // enriched separately
    is_sweep:      orderType === 'SWEEP',
    is_unusual:    unusual,
    traded_at:     new Date(raw.t).toISOString(),
  };
 
  batch.push(row);
 
  // Log whale alerts
  if (totalPremium >= 500_000) {
    console.log(`[whale] ${ticker} ${flow_type} $${strike} exp:${expiry} prem:$${(totalPremium/1000).toFixed(0)}K ${orderType}`);
  }
 
  // Flush immediately if batch is full
  if (batch.length >= MAX_BATCH_SIZE) {
    flushBatch();
  } else {
    scheduleBatchFlush();
  }
}
 
// ── WebSocket connection ──────────────────────────────────────
 
let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let isConnected = false;
 
function connect(): void {
  console.log('[ingest] connecting to Polygon WebSocket...');
 
  ws = new WebSocket(WS_URL);
 
  ws.on('open', () => {
    console.log('[ingest] connected');
    isConnected = true;
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  });
 
  ws.on('message', (data: Buffer) => {
    try {
      const messages = JSON.parse(data.toString());
 
      for (const msg of messages) {
        switch (msg.ev) {
          case 'connected':
            // Authenticate
            ws!.send(JSON.stringify({ action: 'auth', params: POLYGON_API_KEY }));
            break;
 
          case 'auth_success':
            console.log('[ingest] authenticated — subscribing to options trades');
            // Subscribe to all options trades
            ws!.send(JSON.stringify({ action: 'subscribe', params: 'T.*' }));
            break;
 
          case 'auth_failed':
            console.error('[ingest] authentication failed — check POLYGON_API_KEY');
            process.exit(1);
 
          case 'subscribed':
            console.log('[ingest] subscribed to:', msg.params);
            break;
 
          case 'T':
            // Options trade
            processTrade(msg as PolygonOptionsTrade);
            break;
 
          case 'status':
            console.log('[ingest] status:', msg.message);
            break;
        }
      }
    } catch (err) {
      console.error('[ingest] message parse error:', err);
    }
  });
 
  ws.on('close', (code, reason) => {
    isConnected = false;
    console.log(`[ingest] disconnected (${code}): ${reason} — reconnecting in 5s`);
    scheduleReconnect();
  });
 
  ws.on('error', (err) => {
    console.error('[ingest] WebSocket error:', err.message);
  });
}
 
function scheduleReconnect(): void {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, 5000);
}
 
// ── Heartbeat ─────────────────────────────────────────────────
// Send ping every 30s to keep connection alive
 
function startHeartbeat(): void {
  setInterval(() => {
    if (ws && isConnected && ws.readyState === WebSocket.OPEN) {
      ws.ping();
    }
  }, 30_000);
}
 
// ── Dark pool polling ─────────────────────────────────────────
 
function startDarkPoolPolling(): void {
  pollDarkPool();
  setInterval(pollDarkPool, 5_000);
}
 
// ── Congress polling ──────────────────────────────────────────
 
function startCongressPolling(): void {
  pollCongressTrades();
  setInterval(pollCongressTrades, 5 * 60_000); // every 5 minutes
}
 
// ── Market hours check ────────────────────────────────────────
 
function isMarketHours(): boolean {
  const now = new Date();
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const hour = et.getHours();
  const min  = et.getMinutes();
  const day  = et.getDay(); // 0=Sun, 6=Sat
 
  if (day === 0 || day === 6) return false;
  const timeVal = hour * 60 + min;
  return timeVal >= 9 * 60 + 30 && timeVal < 16 * 60;
}
 
// ── Entry point ───────────────────────────────────────────────
 
async function main(): Promise<void> {
  console.log('🌊 Fathom Ingest Pipeline starting...');
  console.log(`   Supabase: ${process.env.NEXT_PUBLIC_SUPABASE_URL}`);
  console.log(`   Market hours: ${isMarketHours() ? 'OPEN' : 'CLOSED'}`);
 
  if (!POLYGON_API_KEY) {
    console.error('POLYGON_API_KEY is not set');
    process.exit(1);
  }
 
  connect();
  startHeartbeat();
  startDarkPoolPolling();
  startCongressPolling();
 
  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('[ingest] shutting down...');
    if (batchTimer) clearTimeout(batchTimer);
    await flushBatch();
    ws?.close();
    process.exit(0);
  });
 
  process.on('SIGINT', async () => {
    console.log('[ingest] shutting down...');
    if (batchTimer) clearTimeout(batchTimer);
    await flushBatch();
    ws?.close();
    process.exit(0);
  });
}
 
main().catch(console.error);
