import https from 'https';
import { logger } from './logger';
import type { DarkPoolRow } from './types';

const MIN_SHARES   = 10_000;  // block print threshold
const MIN_NOTIONAL = 100_000; // $100 K minimum

/** Fetch latest off-exchange (dark pool) block prints from Polygon REST. */
export async function fetchDarkPoolPrints(apiKey: string): Promise<DarkPoolRow[]> {
  // off-exchange trades: trf_id present OR condition 41 (off-exchange)
  const url = `https://api.polygon.io/v3/trades?market=stocks&order=desc&limit=100&sort=timestamp&apiKey=${apiKey}`;

  let data: Record<string, unknown>;
  try {
    data = await fetchJson(url);
  } catch (err) {
    logger.error({ msg: 'dark pool REST fetch failed', err: String(err) });
    return [];
  }

  const results = (data['results'] as Array<Record<string, unknown>> | undefined) ?? [];

  return results
    .filter((t) => {
      // off-exchange: TRF (Trade Reporting Facility) marker
      const isOffExchange = t['trf_id'] !== undefined;
      const size = Number(t['size'] ?? 0);
      return isOffExchange && size >= MIN_SHARES;
    })
    .map((t): DarkPoolRow => {
      const price    = Number(t['price'] ?? 0);
      const size     = Number(t['size']  ?? 0);
      const tsNs     = t['sip_timestamp'] as number;
      return {
        polygon_id: (t['id'] as string) || `${t['ticker'] as string}-${tsNs}`,
        ticker:     (t['ticker'] as string) ?? '',
        price,
        size,
        notional:   price * size,
        exchange:   String(t['exchange'] ?? ''),
        traded_at:  new Date(tsNs / 1_000_000).toISOString(),
        raw:        t,
      };
    })
    .filter((r) => r.notional >= MIN_NOTIONAL);
}

/** Fetch SPY/QQQ/VIX/IWM/AAPL snapshots for the market strip. */
export async function fetchMarketSnapshots(
  apiKey: string,
  tickers = ['SPY', 'QQQ', 'VIX', 'IWM', 'AAPL'],
): Promise<Array<{ ticker: string; price: number; change: number; change_pct: number }>> {
  const symbols = tickers.join(',');
  const url = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${symbols}&apiKey=${apiKey}`;

  let data: Record<string, unknown>;
  try {
    data = await fetchJson(url);
  } catch (err) {
    logger.error({ msg: 'market snapshot REST fetch failed', err: String(err) });
    return [];
  }

  type SnapRaw = {
    ticker: string;
    lastTrade?: { p: number };
    day?: { c: number };
    prevDay?: { c: number };
    todaysChangePerc?: number;
  };

  const snaps: SnapRaw[] = (data['tickers'] as SnapRaw[] | undefined) ?? [];
  return snaps.map((s) => {
    const price    = s.lastTrade?.p ?? s.day?.c ?? 0;
    const prevClose = s.prevDay?.c ?? price;
    return {
      ticker:     s.ticker,
      price,
      change:     price - prevClose,
      change_pct: s.todaysChangePerc ?? 0,
    };
  });
}

function fetchJson(url: string): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk as string; });
      res.on('end', () => {
        try { resolve(JSON.parse(raw) as Record<string, unknown>); }
        catch (e) { reject(new Error(`JSON parse error: ${String(e)}`)); }
      });
    }).on('error', reject);
  });
}
