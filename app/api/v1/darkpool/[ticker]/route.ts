// @ts-nocheck
/**
 * GET /api/v1/darkpool/[ticker]
 * Returns dark pool prints for a specific ticker.
 */

import { NextRequest }                               from 'next/server';
import { withApiAuth, ok, err, getDelayMs, applyDelay } from '@/lib/api/helpers';
import { getLatestDarkPool }                         from '@/lib/supabase/client';
import { getCached, setCached }                      from '@/lib/redis/credits';

export const GET = withApiAuth('/v1/darkpool/:ticker', async (
  req,
  ctx,
  { params }: { params: { ticker: string } }
) => {
  const ticker = (params?.ticker ?? '').toUpperCase().trim();
  if (!ticker || !/^[A-Z]{1,5}$/.test(ticker)) {
    return err('Invalid ticker symbol', 'INVALID_TICKER', 400);
  }

  const { searchParams } = req.nextUrl;
  const limit  = Math.min(parseInt(searchParams.get('limit') ?? '50'), 200);

  const cacheKey = `${ticker}:${limit}`;
  const cached   = await getCached<Awaited<ReturnType<typeof getLatestDarkPool>>>('darkpool', cacheKey);

  let rows = cached ?? await getLatestDarkPool(limit * 2, ticker);

  const delayMs = getDelayMs(ctx.tier);
  rows = rows.filter(r => applyDelay(r.timestamp, delayMs));
  rows = rows.slice(0, limit);

  if (!cached) await setCached('darkpool', cacheKey, rows);

  return ok(rows, { creditsUsed: ctx.creditsUsed, creditsLeft: ctx.creditsLeft });
});
