// app/api/flow/route.ts
// ─────────────────────────────────────────────────────────────
// Options flow feed API endpoint.
// Reads from Supabase flow_cache with tier-based freshness.
// ─────────────────────────────────────────────────────────────
 
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';
import { checkCredits } from '@/lib/credits';
 
function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}
 
export async function GET(req: NextRequest) {
  const { userId } = auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
 
  // Get user + tier
  const db = getSupabase();
  const { data: user } = await db
    .from('users')
    .select('id, platform_tier, api_tier')
    .eq('clerk_id', userId)
    .maybeSingle();
 
  const platformTier = user?.platform_tier ?? 'free';
  const apiTier      = user?.api_tier ?? 'free';
  const userId_db    = user?.id;
 
  // Check API credits if this is an API key request
  const apiKey = req.headers.get('x-api-key');
  if (apiKey && userId_db) {
    const creditCheck = await checkCredits(userId_db, 'flow', apiTier);
    if (!creditCheck.allowed) return creditCheck.response;
  }
 
  // Parse query params
  const { searchParams } = new URL(req.url);
  const ticker      = searchParams.get('ticker') ?? undefined;
  const flowType    = searchParams.get('type') as 'CALL' | 'PUT' | undefined;
  const orderType   = searchParams.get('order') as 'SWEEP' | 'BLOCK' | 'SPLIT' | undefined;
  const minPremium  = searchParams.get('min_premium') ? Number(searchParams.get('min_premium')) : undefined;
  const unusualOnly = searchParams.get('unusual') === 'true';
  const limit       = Math.min(Number(searchParams.get('limit') ?? 50), 200);
  const offset      = Number(searchParams.get('offset') ?? 0);
 
  // Build query
  let query = db
    .from('flow_cache')
    .select('*')
    .order('traded_at', { ascending: false })
    .limit(limit)
    .range(offset, offset + limit - 1);
 
  // Free tier: 15 min delay
  if (platformTier === 'free') {
    const delayedTime = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    query = query.lt('traded_at', delayedTime);
  }
 
  if (ticker)      query = query.eq('ticker', ticker.toUpperCase());
  if (flowType)    query = query.eq('flow_type', flowType);
  if (orderType)   query = query.eq('order_type', orderType);
  if (minPremium)  query = query.gte('total_premium', minPremium);
  if (unusualOnly) query = query.eq('is_unusual', true);
 
  const { data, error } = await query;
 
  if (error) {
    console.error('[api/flow] query error:', error.message);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
 
  return NextResponse.json({
    data,
    meta: {
      count:        data?.length ?? 0,
      tier:         platformTier,
      delayed:      platformTier === 'free',
      delay_minutes: platformTier === 'free' ? 15 : 0,
    },
  }, {
    headers: {
      'Cache-Control': platformTier === 'free' ? 's-maxage=60' : 's-maxage=3',
    },
  });
}