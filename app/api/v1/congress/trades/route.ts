/**
 * GET /api/v1/congress/trades
 * Returns recent congressional trade disclosures.
 *
 * Query params:
 *   limit      number (default 50, max 200)
 *   chamber    house|senate
 *   party      R|D|I
 *   tradeType  purchase|sale|sale_partial|exchange
 *   ticker     string
 */

import { NextRequest }                from 'next/server';
import { withApiAuth, ok }            from '@/lib/api/helpers';
import { getCongressTrades }          from '@/lib/supabase/client';
import { getCached, setCached }       from '@/lib/redis/credits';

export const GET = withApiAuth('/v1/congress/trades', async (req, ctx) => {
  const { searchParams } = req.nextUrl;

  const limit     = Math.min(parseInt(searchParams.get('limit') ?? '50'), 200);
  const chamber   = searchParams.get('chamber')   as 'house' | 'senate' | null;
  const party     = searchParams.get('party')     as 'R' | 'D' | 'I' | null;
  const tradeType = searchParams.get('tradeType') as 'purchase' | 'sale' | null;
  const ticker    = searchParams.get('ticker')?.toUpperCase() ?? null;

  const cacheKey = `trades:${limit}:${chamber}:${party}:${tradeType}:${ticker}`;
  const cached   = await getCached<Awaited<ReturnType<typeof getCongressTrades>>>('congress', cacheKey);

  let rows = cached ?? await getCongressTrades(limit * 2);

  if (chamber)   rows = rows.filter(r => r.chamber === chamber);
  if (party)     rows = rows.filter(r => r.party === party);
  if (tradeType) rows = rows.filter(r => r.tradeType === tradeType);
  if (ticker)    rows = rows.filter(r => r.ticker === ticker);

  rows = rows.slice(0, limit);

  if (!cached) await setCached('congress', cacheKey, rows);

  return ok(rows, { creditsUsed: ctx.creditsUsed, creditsLeft: ctx.creditsLeft });
});
