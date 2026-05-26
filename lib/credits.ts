// lib/credits.ts
// ─────────────────────────────────────────────────────────────
// API Credit System — Upstash Redis
//
// Key format:  api_credits:{userId}:{YYYY-MM-DD}  (Monday of week)
// Value:       remaining credits (integer, can go to -1 on race)
// TTL:         seconds until next Monday 00:00 UTC
//
// Usage:
//   const ok = await consumeCredits(userId, 'flow');   // returns false if exhausted
//   const bal = await getCreditBalance(userId);
//   await grantWeeklyCredits(userId, apiTier);          // called on new week start
// ─────────────────────────────────────────────────────────────

import { Redis } from '@upstash/redis';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';

// ── Clients ──────────────────────────────────────────────────

const redis = new Redis({
  url:   process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// ── Constants ─────────────────────────────────────────────────

// Credit cost per endpoint group
export const ENDPOINT_COSTS: Record<string, number> = {
  // Basic (1 credit)
  flow:             1,
  darkpool:         1,
  congress:         1,
  market_snapshot:  1,
  // Standard (3 credits)
  alerts_feed:      3,
  gamma:            3,
  sector_sentiment: 3,
  // Premium (5 credits)
  screener_options: 5,
  screener_stocks:  5,
} as const;

// Weekly allocation per tier (mirrors DB table — keep in sync)
export const TIER_WEEKLY_CREDITS: Record<string, number> = {
  free:          50,
  basic:         500,
  pro:           2000,
  institutional: 10000,
};

// Rate limits (requests per minute) per tier
export const TIER_RATE_LIMITS: Record<string, number> = {
  free:          10,
  basic:         30,
  pro:           100,
  institutional: 500,
};

// ── Date helpers ──────────────────────────────────────────────

/**
 * Returns the ISO date string (YYYY-MM-DD) for the most recent Monday in UTC.
 */
export function getWeekStartMonday(): string {
  const now  = new Date();
  const day  = now.getUTCDay(); // 0=Sun, 1=Mon, …
  const diff = day === 0 ? 6 : day - 1; // days since last Monday
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - diff);
  monday.setUTCHours(0, 0, 0, 0);
  return monday.toISOString().split('T')[0];
}

/**
 * Returns seconds until next Monday 00:00 UTC.
 * Used as the Redis key TTL so credits auto-expire.
 */
export function secondsUntilNextMonday(): number {
  const now    = new Date();
  const day    = now.getUTCDay();
  const daysUntilMonday = day === 0 ? 1 : 8 - day;
  const nextMonday = new Date(now);
  nextMonday.setUTCDate(now.getUTCDate() + daysUntilMonday);
  nextMonday.setUTCHours(0, 0, 0, 0);
  return Math.floor((nextMonday.getTime() - now.getTime()) / 1000);
}

export function creditKey(userId: string, weekStart?: string): string {
  return `api_credits:${userId}:${weekStart ?? getWeekStartMonday()}`;
}

// Rate limit key (sliding window, per user per tier)
export function rateLimitKey(userId: string): string {
  return `rate_limit:${userId}`;
}

// ── Core functions ────────────────────────────────────────────

export interface CreditBalance {
  remaining: number;
  allocated: number;
  weekStart: string;
  exhausted: boolean;
}

/**
 * Get current credit balance for a user.
 * If no Redis key exists yet, initialise from their tier.
 */
export async function getCreditBalance(
  userId: string,
  apiTier: string = 'free'
): Promise<CreditBalance> {
  const weekStart = getWeekStartMonday();
  const key       = creditKey(userId, weekStart);
  const allocated = TIER_WEEKLY_CREDITS[apiTier] ?? TIER_WEEKLY_CREDITS.free;

  let remaining = await redis.get<number>(key);

  if (remaining === null) {
    // First request this week — initialise
    await grantWeeklyCredits(userId, apiTier);
    remaining = allocated;
  }

  return {
    remaining,
    allocated,
    weekStart,
    exhausted: remaining <= 0,
  };
}

/**
 * Grant weekly credits for a user (called on new week start or new subscription).
 * Sets with TTL so the key auto-expires at next Monday 00:00 UTC.
 */
export async function grantWeeklyCredits(
  userId: string,
  apiTier: string,
  weekStart?: string
): Promise<void> {
  const ws        = weekStart ?? getWeekStartMonday();
  const key       = creditKey(userId, ws);
  const allocated = TIER_WEEKLY_CREDITS[apiTier] ?? TIER_WEEKLY_CREDITS.free;
  const ttl       = secondsUntilNextMonday();

  // SET only if not already set (don't overwrite a partially-consumed balance)
  await redis.set(key, allocated, { ex: ttl, nx: true });

  // Sync allocation to Supabase for billing audit
  await (supabase as any).from('api_usage').upsert({
    user_id:        userId,
    week_start:     ws,
    credits_used:   0,
    credits_alloc:  allocated,
  }, { onConflict: 'user_id,week_start', ignoreDuplicates: true });
}

/**
 * Consume credits for an API request.
 * Returns:
 *   { allowed: true }   — request is allowed, credits deducted
 *   { allowed: false, reason: 'EXHAUSTED' | 'RATE_LIMITED' }
 */
export async function consumeCredits(
  userId: string,
  endpoint: string,
  apiTier: string = 'free'
): Promise<{ allowed: boolean; reason?: string; remaining?: number }> {
  const cost = ENDPOINT_COSTS[endpoint] ?? 1;

  // ── 1. Rate limit check (sliding window, 60s) ─────────────
  const rpmLimit = TIER_RATE_LIMITS[apiTier] ?? TIER_RATE_LIMITS.free;
  const rlKey    = rateLimitKey(userId);
  const now      = Date.now();
  const windowMs = 60_000;

  // ZADD + ZREMRANGEBYSCORE + ZCARD in a pipeline
  const pipeline = redis.pipeline();
  pipeline.zadd(rlKey, { score: now, member: `${now}` });
  pipeline.zremrangebyscore(rlKey, 0, now - windowMs);
  pipeline.zcard(rlKey);
  pipeline.expire(rlKey, 61);
  const results = await pipeline.exec();
  const requestCount = results[2] as number;

  if (requestCount > rpmLimit) {
    return { allowed: false, reason: 'RATE_LIMITED' };
  }

  // ── 2. Credit check + deduction ───────────────────────────
  const weekStart = getWeekStartMonday();
  const key       = creditKey(userId, weekStart);

  // Ensure key exists (first request of the week)
  const existing = await redis.get<number>(key);
  if (existing === null) {
    await grantWeeklyCredits(userId, apiTier, weekStart);
  }

  // Atomic decrement by cost
  const remaining = await redis.decrby(key, cost);

  if (remaining < 0) {
    // Undo the decrement (optimistic — might have a brief negative window
    // under extreme concurrency, but that's acceptable; it self-corrects)
    await redis.incrby(key, cost);
    return { allowed: false, reason: 'EXHAUSTED', remaining: 0 };
  }

  // ── 3. Async: update Supabase usage counter ────────────────
  // Fire-and-forget (don't await — not in the hot path)
  updateUsageRecord(userId, weekStart, endpoint, cost).catch(console.error);

  return { allowed: true, remaining };
}

/**
 * Upsert the api_usage row with incremented credit count.
 * Called async from consumeCredits to keep latency low.
 */
async function updateUsageRecord(
  userId: string,
  weekStart: string,
  endpoint: string,
  cost: number
): Promise<void> {
  // Use a raw SQL upsert to atomically increment the jsonb endpoint_counts
  await supabase.rpc('increment_api_usage', {
    p_user_id:   userId,
    p_week_start: weekStart,
    p_endpoint:   endpoint,
    p_cost:       cost,
  });
}

// ── Middleware helper ─────────────────────────────────────────

/**
 * Next.js middleware helper — call this in every API route that
 * requires credits.
 *
 * Usage in a route handler:
 *   const check = await checkCredits(req, userId, 'flow', apiTier);
 *   if (!check.allowed) return check.response;
 */
export async function checkCredits(
  userId: string,
  endpoint: string,
  apiTier: string = 'free'
): Promise<{ allowed: true; remaining: number } | { allowed: false; response: Response }> {
  const result = await consumeCredits(userId, endpoint, apiTier);

  if (!result.allowed) {
    const status  = result.reason === 'RATE_LIMITED' ? 429 : 402;
    const message = result.reason === 'RATE_LIMITED'
      ? 'Rate limit exceeded. Please slow down your requests.'
      : 'Weekly credit limit reached. Upgrade your plan or wait for Monday reset.';

    return {
      allowed: false,
      response: new Response(
        JSON.stringify({ error: result.reason, message }),
        {
          status,
          headers: {
            'Content-Type': 'application/json',
            'X-Credits-Remaining': '0',
            ...(result.reason === 'RATE_LIMITED'
              ? { 'Retry-After': '60' }
              : {}),
          },
        }
      ),
    };
  }

  return { allowed: true, remaining: result.remaining ?? 0 };
}

// ── Admin helpers ─────────────────────────────────────────────

/**
 * Add bonus credits (e.g. for support, promotions).
 */
export async function addBonusCredits(userId: string, amount: number): Promise<number> {
  const key = creditKey(userId);
  return redis.incrby(key, amount);
}

/**
 * Check if a user's balance key exists (for health checks).
 */
export async function creditKeyExists(userId: string): Promise<boolean> {
  return (await redis.exists(creditKey(userId))) === 1;
}
