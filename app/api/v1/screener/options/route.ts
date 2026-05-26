/**
 * GET /api/v1/screener/options
 * Screener across flow_cache with multi-filter support.
 * Pro+ only (costs 5 credits).
 *
 * Query params:
 *   type        call|put
 *   sentiment   bullish|bearish|neutral
 *   orderType   sweep|block|split
 *   minPremium  number
 *   maxDte      number (days to expiry)
 *   minDte      number
 *   minIv       number (0-1 decimal, e.g. 0.50 = 50% IV)
 *   ticker      string (comma-separated list for multiple tickers)
 *   whaleOnly   boolean
 *   limit       number (default 50, max 100)
 */

import { NextRequest }                from 'next/server';
import { withApiAuth, ok, err }       from '@/lib/api/helpers';
import { getLatestFlow }              from '@/lib/supabase/client';
import type { OptionsFlow }           from '@/types';

export const GET = withApiAuth('/v1/screener/options', async (req, ctx) => {
  // Screener is Pro+ only
  if (ctx.tier === 'free' || ctx.tier === 'starter') {
    return err(
      'Options screener requires Pro tier or above',
      'TIER_REQUIRED',
      403
    );
  }

  const { searchParams } = req.nextUrl;

  const type       = searchParams.get('type')       as 'call' | 'put' | null;
  const sentiment  = searchParams.get('sentiment')  as 'bullish' | 'bearish' | 'neutral' | null;
  const orderType  = searchParams.get('orderType')  as 'sweep' | 'block' | 'split' | null;
  const minPremium = parseFloat(searchParams.get('minPremium') ?? '0') || 0;
  const maxDte     = parseInt(searchParams.get('maxDte') ?? '0') || null;
  const minDte     = parseInt(searchParams.get('minDte') ?? '0') || null;
  const minIv      = parseFloat(searchParams.get('minIv') ?? '0') || null;
  const whaleOnly  = searchParams.get('whaleOnly') === 'true';
  const limit      = Math.min(parseInt(searchParams.get('limit') ?? '50'), 100);

  // Multi-ticker filter
  const tickerParam = searchParams.get('ticker');
  const tickers     = tickerParam
    ? tickerParam.split(',').map(t => t.toUpperCase().trim()).filter(Boolean)
    : null;

  // Fetch a generous pool then filter in-process
  let rows: OptionsFlow[] = await getLatestFlow(500);

  if (type)       rows = rows.filter(r => r.optionType === type);
  if (sentiment)  rows = rows.filter(r => r.sentiment === sentiment);
  if (orderType)  rows = rows.filter(r => r.orderType === orderType);
  if (minPremium) rows = rows.filter(r => r.totalPremium >= minPremium);
  if (maxDte)     rows = rows.filter(r => r.dte <= maxDte);
  if (minDte)     rows = rows.filter(r => r.dte >= minDte);
  if (minIv)      rows = rows.filter(r => r.iv >= minIv);
  if (whaleOnly)  rows = rows.filter(r => r.isWhale);
  if (tickers?.length) rows = rows.filter(r => tickers.includes(r.ticker));

  // Sort by total premium desc
  rows.sort((a, b) => b.totalPremium - a.totalPremium);
  rows = rows.slice(0, limit);

  return ok(
    { results: rows, count: rows.length, filters: Object.fromEntries(searchParams) },
    { creditsUsed: ctx.creditsUsed, creditsLeft: ctx.creditsLeft }
  );
});
