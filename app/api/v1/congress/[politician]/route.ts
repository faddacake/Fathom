/**
 * GET /api/v1/congress/[politician]
 * Returns trades for a specific politician (partial name match).
 */

import { NextRequest }          from 'next/server';
import { withApiAuth, ok, err } from '@/lib/api/helpers';
import { getCongressTrades }    from '@/lib/supabase/client';

export const GET = withApiAuth('/v1/congress/:politician', async (
  req,
  ctx,
  { params }: { params: { politician: string } }
) => {
  const politician = decodeURIComponent(params?.politician ?? '').trim();
  if (!politician || politician.length < 2) {
    return err('Politician name must be at least 2 characters', 'INVALID_PARAM', 400);
  }

  const { searchParams } = req.nextUrl;
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 200);

  const rows = await getCongressTrades(limit, politician);

  return ok(rows, { creditsUsed: ctx.creditsUsed, creditsLeft: ctx.creditsLeft });
});
