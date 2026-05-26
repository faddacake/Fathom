/**
 * GET /api/v1/market/snapshot
 * Returns live SPY, QQQ, VIX snapshot from Polygon.io REST API.
 * Cached for 2 seconds. No credit cost (1 credit per call via ENDPOINT_COSTS).
 */

import { NextRequest }           from 'next/server';
import { withApiAuth, ok, err }  from '@/lib/api/helpers';
import { getCached, setCached }  from '@/lib/redis/credits';

const POLYGON_KEY = process.env.POLYGON_API_KEY!;
const TICKERS     = ['SPY', 'QQQ', 'VIX'];

interface PolygonSnapshot {
  ticker:  string;
  day:     { o: number; h: number; l: number; c: number; v: number };
  prevDay: { c: number };
  lastTrade: { p: number };
  todaysChangePerc: number;
}

interface MarketTicker {
  ticker:  string;
  price:   number;
  open:    number;
  high:    number;
  low:     number;
  close:   number;
  volume:  number;
  prevClose: number;
  changePercent: number;
}

async function fetchSnapshot(): Promise<MarketTicker[]> {
  const symbols = TICKERS.join(',');
  const url     = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${symbols}&apiKey=${POLYGON_KEY}`;

  const res  = await fetch(url, { next: { revalidate: 2 } });
  if (!res.ok) throw new Error(`Polygon API error: ${res.status}`);

  const json = await res.json();
  const snaps: PolygonSnapshot[] = json.tickers ?? [];

  return snaps.map(s => ({
    ticker:        s.ticker,
    price:         s.lastTrade?.p ?? s.day?.c ?? 0,
    open:          s.day?.o ?? 0,
    high:          s.day?.h ?? 0,
    low:           s.day?.l ?? 0,
    close:         s.day?.c ?? 0,
    volume:        s.day?.v ?? 0,
    prevClose:     s.prevDay?.c ?? 0,
    changePercent: s.todaysChangePerc ?? 0,
  }));
}

export const GET = withApiAuth('/v1/market/snapshot', async (_req, ctx) => {
  const cacheKey = 'global';
  const cached   = await getCached<MarketTicker[]>('snapshot', cacheKey);

  if (cached) {
    return ok(cached, { creditsUsed: ctx.creditsUsed, creditsLeft: ctx.creditsLeft });
  }

  let tickers: MarketTicker[];
  try {
    tickers = await fetchSnapshot();
  } catch (e) {
    return err('Market data temporarily unavailable', 'UPSTREAM_ERROR', 503);
  }

  await setCached('snapshot', cacheKey, tickers);

  return ok(tickers, { creditsUsed: ctx.creditsUsed, creditsLeft: ctx.creditsLeft });
});
