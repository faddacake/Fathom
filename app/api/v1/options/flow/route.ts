/**
 * GET /api/v1/options/flow
 * Returns latest options flow. Free tier: 10-min delay. Paid: real-time.
 *
 * Query params:
 *   limit       number  (default 50, max 200)
 *   type        call|put
 *   sentiment   bullish|bearish|neutral
 *   orderType   sweep|block|split
 *   whaleOnly   boolean
 *   minPremium  number  (USD)
 */

import { NextRequest }           from 'next/server';
import { withApiAuth, ok, err, getDelayMs, applyDelay } from '@/lib/api/helpers';
import { getLatestFlow }         from '@/lib/supabase/client';
import { getCached, setCached }  from '@/lib/redis/credits';

export const GET = withApiAuth('/v1/options/flow', async (req, ctx) => {
  const { searchParams } = req.nextUrl;

  const limit      = Math.min(parseInt(searchParams.get('limit') ?? '50'), 200);
  const type       = searchParams.get('type')       as 'call' | 'put' | null;
  const sentiment  = searchParams.get('sentiment')  as 'bullish' | 'bearish' | 'neutral' | null;
  const orderType  = searchParams.get('orderType')  as 'sweep' | 'block' | 'split' | null;
  const whaleOnly  = searchParams.get('whaleOnly') === 'true';
  const minPremium = parseFloat(searchParams.get('minPremium') ?? '0') || 0;

  const cacheKey = `flow:${limit}:${type}:${sentiment}:${orderType}:${whaleOnly}:${minPremium}`;

  // Check cache (3s TTL)
  const cached = await getCached<ReturnType<typeof getLatestFlow>>('flow', cacheKey);
  let rows = cached ? await cached : await getLatestFlow(limit * 2); // fetch extra for client-side filter

  // Apply tier delay
  const delayMs = getDelayMs(ctx.tier);
  rows = (await rows ?? []).filter(row => applyDelay(row.timestamp, delayMs));

  // Apply filters
  if (type)       rows = rows.filter(r => r.optionType === type);
  if (sentiment)  rows = rows.filter(r => r.sentiment === sentiment);
  if (orderType)  rows = rows.filter(r => r.orderType === orderType);
  if (whaleOnly)  rows = rows.filter(r => r.isWhale);
  if (minPremium) rows = rows.filter(r => r.totalPremium >= minPremium);

  rows = rows.slice(0, limit);

  // Cache result
  await setCached('flow', cacheKey, rows);

  return ok(rows, { creditsUsed: ctx.creditsUsed, creditsLeft: ctx.creditsLeft });
});
