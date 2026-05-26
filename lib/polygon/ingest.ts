/**
 * FATHOM — POLYGON.IO INGEST PIPELINE
 * ─────────────────────────────────────────────────────────────────────────────
 * Connects to Polygon.io WebSocket feeds and streams:
 *   1. Options trades → flow_cache (Supabase) + Redis pub
 *   2. Off-exchange (dark pool) prints → dark_pool (Supabase)
 *
 * Run as a long-lived process on Railway alongside the Discord bot.
 * Entry: node dist/ingest.js (compiled) or ts-node src/ingest.ts
 *
 * Environment variables required:
 *   POLYGON_API_KEY
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   UPSTASH_REDIS_REST_URL
 *   UPSTASH_REDIS_REST_TOKEN
 */

import WebSocket from 'ws';
import { createClient } from '@supabase/supabase-js';
import { Redis } from '@upstash/redis';
import type { OptionsFlow, DarkPoolPrint, FlowOrderType, FlowSentiment, DarkPoolSignal } from './types';

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const POLYGON_KEY    = process.env.POLYGON_API_KEY!;
const SUPABASE_URL   = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const RECONNECT_MS   = 5_000;
const BATCH_SIZE     = 25;        // rows to upsert at once
const BATCH_FLUSH_MS = 2_000;     // flush every 2s even if batch not full
const WHALE_THRESHOLD = 500_000;  // $500K total premium = whale alert

// ─── CLIENTS ──────────────────────────────────────────────────────────────────
const db    = createClient(SUPABASE_URL, SUPABASE_KEY);
const redis = new Redis({
  url:   process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// ─── STATE ────────────────────────────────────────────────────────────────────
let flowBatch:    OptionsFlow[]   = [];
let darkBatch:    DarkPoolPrint[] = [];
let flowTimer:    NodeJS.Timeout | null = null;
let darkTimer:    NodeJS.Timeout | null = null;
let reconnecting: boolean = false;

// ─── LOGGING ──────────────────────────────────────────────────────────────────
function log(level: 'info' | 'warn' | 'error', msg: string, data?: unknown) {
  const entry = { ts: new Date().toISOString(), level, msg, ...(data ? { data } : {}) };
  console[level === 'error' ? 'error' : 'log'](JSON.stringify(entry));
}

// ─── CLASSIFICATION HELPERS ───────────────────────────────────────────────────
function classifyOrderType(trade: PolygonOptionsTrade): FlowOrderType {
  // Sweeps hit multiple exchanges; blocks are single large prints
  if (trade.conditions?.includes(41)) return 'sweep';   // condition 41 = sweep
  if (trade.size >= 500)              return 'block';
  return 'split';
}

function classifySentiment(trade: PolygonOptionsTrade, optionType: 'call' | 'put'): FlowSentiment {
  const aboveAsk = trade.price >= trade.ask;
  const belowBid = trade.price <= trade.bid;
  if (optionType === 'call') return aboveAsk ? 'bullish' : belowBid ? 'bearish' : 'neutral';
  if (optionType === 'put')  return aboveAsk ? 'bearish' : belowBid ? 'bullish' : 'neutral';
  return 'neutral';
}

function classifyDarkPoolSignal(notional: number, avgPrice: number, spotPrice: number): DarkPoolSignal {
  if (avgPrice < spotPrice * 0.995) return 'accumulation';   // buying below market
  if (avgPrice > spotPrice * 1.005) return 'distribution';   // selling above market
  return 'neutral';
}

function getDTE(expiry: string): number {
  const exp  = new Date(expiry);
  const now  = new Date();
  const diff = exp.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

// ─── BATCH FLUSH ──────────────────────────────────────────────────────────────
async function flushFlowBatch(): Promise<void> {
  if (flowBatch.length === 0) return;
  const rows = flowBatch.splice(0);           // atomic swap

  const { error } = await db.from('flow_cache').insert(rows);
  if (error) {
    log('error', 'Flow batch insert failed', error);
    return;
  }

  // Publish whale alerts to Redis pub/sub for alert engine
  const whales = rows.filter(r => r.isWhale);
  for (const whale of whales) {
    await redis.publish('fathom:whale_alerts', JSON.stringify(whale)).catch(() => {});
  }

  log('info', `Flushed ${rows.length} flow rows (${whales.length} whales)`);
}

async function flushDarkBatch(): Promise<void> {
  if (darkBatch.length === 0) return;
  const rows = darkBatch.splice(0);

  const { error } = await db.from('dark_pool').insert(rows);
  if (error) {
    log('error', 'Dark pool batch insert failed', error);
    return;
  }
  log('info', `Flushed ${rows.length} dark pool rows`);
}

function scheduleBatchFlush() {
  if (!flowTimer) {
    flowTimer = setTimeout(async () => {
      flowTimer = null;
      await flushFlowBatch();
    }, BATCH_FLUSH_MS);
  }
  if (!darkTimer) {
    darkTimer = setTimeout(async () => {
      darkTimer = null;
      await flushDarkBatch();
    }, BATCH_FLUSH_MS);
  }
}

// ─── TRADE PROCESSORS ─────────────────────────────────────────────────────────
function processOptionsTrade(trade: PolygonOptionsTrade): void {
  try {
    // Parse option symbol: O:AAPL240119C00150000
    // Format: O:{TICKER}{YY}{MM}{DD}{C/P}{8-digit strike * 1000}
    const sym = trade.sym.replace('O:', '');
    const match = sym.match(/^([A-Z]+)(\d{6})([CP])(\d{8})$/);
    if (!match) return;

    const [, ticker, dateStr, cpFlag, strikeStr] = match;
    const optionType = cpFlag === 'C' ? 'call' : 'put';
    const strike     = parseInt(strikeStr, 10) / 1000;
    const expiry     = `20${dateStr.slice(0,2)}-${dateStr.slice(2,4)}-${dateStr.slice(4,6)}`;
    const premium    = trade.price;
    const size       = trade.size;
    const total      = parseFloat((premium * size * 100).toFixed(2));
    const orderType  = classifyOrderType(trade);
    const sentiment  = classifySentiment(trade, optionType);

    const row: OptionsFlow = {
      id:           crypto.randomUUID(),
      ticker:       ticker.toUpperCase(),
      optionType,
      strike,
      expiry,
      dte:          getDTE(expiry),
      premium,
      size,
      totalPremium: total,
      orderType,
      sentiment,
      exchange:     trade.x?.toString() ?? 'unknown',
      iv:           trade.iv ?? 0,
      openInterest: trade.oi ?? 0,
      spotPrice:    trade.underlying_price ?? 0,
      isWhale:      total >= WHALE_THRESHOLD,
      timestamp:    new Date(trade.t).toISOString(),
    };

    flowBatch.push(row);
    if (flowBatch.length >= BATCH_SIZE) flushFlowBatch();
    else scheduleBatchFlush();

  } catch (err) {
    log('warn', 'Failed to process options trade', err);
  }
}

function processDarkPoolTrade(trade: PolygonTrade): void {
  try {
    // Off-exchange conditions: TRF (condition 12), dark pool prints
    const isDarkPool = trade.conditions?.some(c => [12, 47, 52].includes(c));
    if (!isDarkPool || !trade.size || trade.size < 10_000) return;  // min 10K shares

    const notional = trade.price * trade.size;
    if (notional < 100_000) return;   // min $100K notional

    const row: DarkPoolPrint = {
      id:        crypto.randomUUID(),
      ticker:    trade.sym.toUpperCase(),
      size:      trade.size,
      price:     trade.price,
      notional:  parseFloat(notional.toFixed(2)),
      exchange:  trade.x?.toString() ?? 'TRF',
      signal:    classifyDarkPoolSignal(notional, trade.price, trade.price), // refine with quote data
      timestamp: new Date(trade.t).toISOString(),
    };

    darkBatch.push(row);
    if (darkBatch.length >= BATCH_SIZE) flushDarkBatch();
    else scheduleBatchFlush();

  } catch (err) {
    log('warn', 'Failed to process dark pool trade', err);
  }
}

// ─── WEBSOCKET CONNECTION ─────────────────────────────────────────────────────
function connectOptionsWS(): WebSocket {
  const ws = new WebSocket('wss://socket.polygon.io/options');

  ws.on('open', () => {
    log('info', 'Options WebSocket connected');
    ws.send(JSON.stringify({ action: 'auth', params: POLYGON_KEY }));
  });

  ws.on('message', (data: Buffer) => {
    try {
      const msgs: PolygonMessage[] = JSON.parse(data.toString());
      for (const msg of msgs) {
        if (msg.ev === 'status' && msg.status === 'auth_success') {
          log('info', 'Polygon auth successful — subscribing to options trades');
          ws.send(JSON.stringify({ action: 'subscribe', params: 'T.*' })); // all option trades
        }
        if (msg.ev === 'T') {                          // options trade event
          processOptionsTrade(msg as PolygonOptionsTrade);
        }
      }
    } catch (err) {
      log('warn', 'Failed to parse WS message', err);
    }
  });

  ws.on('close', (code, reason) => {
    log('warn', `Options WS closed: ${code} ${reason}`);
    scheduleReconnect(connectOptionsWS);
  });

  ws.on('error', (err) => {
    log('error', 'Options WS error', err.message);
  });

  return ws;
}

function connectStocksWS(): WebSocket {
  const ws = new WebSocket('wss://socket.polygon.io/stocks');

  ws.on('open', () => {
    log('info', 'Stocks WebSocket connected');
    ws.send(JSON.stringify({ action: 'auth', params: POLYGON_KEY }));
  });

  ws.on('message', (data: Buffer) => {
    try {
      const msgs: PolygonMessage[] = JSON.parse(data.toString());
      for (const msg of msgs) {
        if (msg.ev === 'status' && msg.status === 'auth_success') {
          log('info', 'Stocks WS auth successful — subscribing to trades');
          // Subscribe to all trades (filter dark pool in processor)
          ws.send(JSON.stringify({ action: 'subscribe', params: 'T.*' }));
        }
        if (msg.ev === 'T') {
          processDarkPoolTrade(msg as PolygonTrade);
        }
      }
    } catch (err) {
      log('warn', 'Failed to parse stocks WS message', err);
    }
  });

  ws.on('close', (code, reason) => {
    log('warn', `Stocks WS closed: ${code} ${reason}`);
    scheduleReconnect(connectStocksWS);
  });

  ws.on('error', (err) => {
    log('error', 'Stocks WS error', err.message);
  });

  return ws;
}

function scheduleReconnect(connector: () => WebSocket): void {
  if (reconnecting) return;
  reconnecting = true;
  log('info', `Reconnecting in ${RECONNECT_MS}ms…`);
  setTimeout(() => {
    reconnecting = false;
    connector();
  }, RECONNECT_MS);
}

// ─── CLEANUP JOB ──────────────────────────────────────────────────────────────
async function runCleanup(): Promise<void> {
  const { error } = await db.rpc('cleanup_old_flow');
  if (error) log('error', 'Cleanup failed', error);
  else log('info', 'Old flow data cleaned up');
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  log('info', '🌊 Fathom Ingest Pipeline starting…');

  if (!POLYGON_KEY) throw new Error('POLYGON_API_KEY is required');
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Supabase credentials required');

  // Start both WebSocket feeds
  connectOptionsWS();
  connectStocksWS();

  // Run cleanup every 6 hours
  setInterval(runCleanup, 6 * 60 * 60 * 1000);

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    log('info', 'SIGTERM received — flushing batches and shutting down');
    await Promise.all([flushFlowBatch(), flushDarkBatch()]);
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    log('info', 'SIGINT received — flushing batches and shutting down');
    await Promise.all([flushFlowBatch(), flushDarkBatch()]);
    process.exit(0);
  });
}

main().catch((err) => {
  log('error', 'Fatal ingest error', err.message);
  process.exit(1);
});

// ─── POLYGON TYPE STUBS ───────────────────────────────────────────────────────
interface PolygonMessage {
  ev:      string;
  status?: string;
  message?: string;
}

interface PolygonOptionsTrade extends PolygonMessage {
  sym:              string;   // O:AAPL240119C00150000
  x:                number;   // exchange ID
  p:                number;   // price (alias)
  price:            number;
  s:                number;   // size (alias)
  size:             number;
  t:                number;   // timestamp ms
  conditions?:      number[];
  iv?:              number;
  oi?:              number;
  underlying_price?: number;
  bid?:             number;
  ask?:             number;
}

interface PolygonTrade extends PolygonMessage {
  sym:         string;
  x:           number;
  price:       number;
  size:        number;
  t:           number;
  conditions?: number[];
}
