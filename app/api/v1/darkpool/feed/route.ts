/**
 * GET /api/v1/darkpool/feed
 * Returns latest dark pool prints across all tickers.
 *
 * Query params:
 *   limit    number (default 50, max 200)
 *   signal   accumulation|distribution|neutral
 *   minSize  number (minimum notional USD)
 */

import { NextRequest }                               from 'next/server';
import { withApiAuth, ok, getDelayMs, applyDelay }  from '@/lib/api/helpers';
import { getLatestDarkPool }                         from '@/lib/supabase/client';
import { getCached, setCached }                      from '@/lib/redis/credits';

export const GET = withApiAuth('/v1/darkpool/feed', async (req, ctx) => {
  const { searchParams } = req.nextUrl;

  const limit   = Math.min(parseInt(searchParams.get('limit') ?? '50'), 200);
  const signal  = searchParams.get('signal') as 'accumulation' | 'distribution' | 'neutral' | null;
  const minSize = parseFloat(searchParams.get('minSize') ?? '0') || 0;

  const cacheKey = `feed:${limit}:${signal}:${minSize}`;
  const cached   = await getCached<Awaited<ReturnType<typeof getLatestDarkPool>>>('darkpool', cacheKey);

  let rows = cached ?? await getLatestDarkPool(limit * 2);

  const delayMs = getDelayMs(ctx.tier);
  rows = rows.filter(r => applyDelay(r.timestamp, delayMs));

  if (signal)  rows = rows.filter(r => r.signal === signal);
  if (minSize) rows = rows.filter(r => r.notional >= minSize);

  rows = rows.slice(0, limit);

  if (!cached) await setCached('darkpool', cacheKey, rows);

  return ok(rows, { creditsUsed: ctx.creditsUsed, creditsLeft: ctx.creditsLeft });
});
