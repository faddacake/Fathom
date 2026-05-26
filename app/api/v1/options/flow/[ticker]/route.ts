/**
 * GET /api/v1/options/flow/[ticker]
 * Returns options flow for a specific ticker.
 *
 * Query params:
 *   limit     number (default 50, max 200)
 *   type      call|put
 *   sentiment bullish|bearish|neutral
 */

import { NextRequest }           from 'next/server';
import { withApiAuth, ok, err, getDelayMs, applyDelay } from '@/lib/api/helpers';
import { getLatestFlow }         from '@/lib/supabase/client';
import { getCached, setCached }  from '@/lib/redis/credits';

export const GET = withApiAuth('/v1/options/flow/:ticker', async (
  req,
  ctx,
  { params }: { params: { ticker: string } }
) => {
  const ticker = (params?.ticker ?? '').toUpperCase().trim();
  if (!ticker || !/^[A-Z]{1,5}$/.test(ticker)) {
    return err('Invalid ticker symbol', 'INVALID_TICKER', 400);
  }

  const { searchParams } = req.nextUrl;
  const limit     = Math.min(parseInt(searchParams.get('limit') ?? '50'), 200);
  const type      = searchParams.get('type')      as 'call' | 'put' | null;
  const sentiment = searchParams.get('sentiment') as 'bullish' | 'bearish' | 'neutral' | null;

  const cacheKey = `${ticker}:${limit}:${type}:${sentiment}`;
  const cached   = await getCached<Awaited<ReturnType<typeof getLatestFlow>>>('flow', cacheKey);

  let rows = cached ?? await getLatestFlow(limit * 2, ticker);

  // Apply tier delay
  const delayMs = getDelayMs(ctx.tier);
  rows = rows.filter(r => applyDelay(r.timestamp, delayMs));

  if (type)      rows = rows.filter(r => r.optionType === type);
  if (sentiment) rows = rows.filter(r => r.sentiment === sentiment);

  rows = rows.slice(0, limit);

  if (!cached) await setCached('flow', cacheKey, rows);

  return ok(rows, { creditsUsed: ctx.creditsUsed, creditsLeft: ctx.creditsLeft });
});
