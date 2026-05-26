/**
 * FATHOM — API ROUTE HELPERS
 * Shared auth, credit consumption, rate limiting, and response utilities.
 * Used by every /api/v1/* route handler.
 */

import { auth }                           from '@clerk/nextjs/server';
import { NextRequest, NextResponse }      from 'next/server';
import { consumeCredits, checkRateLimit,
         getCreditStatus, CreditError }   from '@/lib/redis/credits';
import { getUserByClerkId }              from '@/lib/supabase/client';
import { ENDPOINT_COSTS }                from '@/types';
import type { PlatformTier, ApiSuccess, ApiError } from '@/types';

// ─── RESPONSE HELPERS ────────────────────────────────────────────────────────

export function ok<T>(data: T, meta?: { creditsUsed?: number; creditsLeft?: number }): NextResponse {
  const body: ApiSuccess<T> = {
    data,
    creditsUsed: meta?.creditsUsed ?? 0,
    creditsLeft: meta?.creditsLeft ?? 0,
    timestamp:   new Date().toISOString(),
  };
  return NextResponse.json(body);
}

export function err(
  message: string,
  code: string,
  status: number
): NextResponse {
  const body: ApiError = { error: message, code, status };
  return NextResponse.json(body, { status });
}

// ─── TIER DELAY (free tier sees 10-min delayed data) ─────────────────────────

export function getDelayMs(tier: PlatformTier): number {
  return tier === 'free' ? 10 * 60 * 1000 : 0;   // 10 min for free, 0 for paid
}

export function applyDelay(isoTimestamp: string, delayMs: number): boolean {
  if (delayMs === 0) return true;
  const age = Date.now() - new Date(isoTimestamp).getTime();
  return age >= delayMs;
}

// ─── DAILY ALERT CAP ─────────────────────────────────────────────────────────

const DAILY_ALERT_CAP: Record<PlatformTier, number> = {
  free:    5,
  starter: 50,
  pro:     -1,   // unlimited
  whale:   -1,
};

export function getAlertCap(tier: PlatformTier): number {
  return DAILY_ALERT_CAP[tier];
}

// ─── ROUTE CONTEXT ───────────────────────────────────────────────────────────

export interface RouteContext {
  userId:        string;
  tier:          PlatformTier;
  apiTier:       string | null;
  discordId:     string | null;
  creditsUsed:   number;
  creditsLeft:   number;
}

// ─── withApiAuth ─────────────────────────────────────────────────────────────
/**
 * Wraps a route handler with:
 *  1. Clerk authentication
 *  2. User tier resolution from Supabase
 *  3. Rate limiting (sliding window)
 *  4. Credit consumption (if endpoint has a cost)
 *  5. Standard error responses
 *
 * Usage:
 *   export const GET = withApiAuth('/v1/options/flow', async (req, ctx) => {
 *     // ctx.userId, ctx.tier available
 *     return ok(data, { creditsUsed: ctx.creditsUsed, creditsLeft: ctx.creditsLeft });
 *   });
 */
export function withApiAuth(
  endpoint: string,
  handler: (req: NextRequest, ctx: RouteContext) => Promise<NextResponse>
) {
  return async (req: NextRequest, routeParams?: unknown): Promise<NextResponse> => {
    // 1. Auth
    const { userId } = await auth();
    if (!userId) {
      return err('Authentication required', 'AUTH_REQUIRED', 401);
    }

    // 2. Resolve user + tier
    const user = await getUserByClerkId(userId);
    if (!user) {
      // First time — allow as free tier (user will be created on subscription)
      return handler(req, {
        userId,
        tier:        'free',
        apiTier:     null,
        discordId:   null,
        creditsUsed: 0,
        creditsLeft: 0,
      });
    }

    const tier: PlatformTier = user.platformTier ?? 'free';

    // 3. Rate limiting
    const { allowed, remaining: rlRemaining, resetAt } = await checkRateLimit(userId, tier);
    if (!allowed) {
      const res = err('Rate limit exceeded', 'RATE_LIMIT_EXCEEDED', 429);
      res.headers.set('X-RateLimit-Remaining', '0');
      res.headers.set('X-RateLimit-Reset',     String(resetAt));
      return res;
    }

    // 4. Credit consumption
    const cost = ENDPOINT_COSTS[endpoint] ?? 1;
    let creditsUsed = 0;
    let creditsLeft = 0;

    // Only deduct credits if user has an API tier subscription
    if (user.apiTier || (tier !== 'free' && tier !== 'starter')) {
      try {
        const result = await consumeCredits(userId, cost);
        creditsUsed = result.used;
        creditsLeft = result.remaining;
      } catch (e) {
        if (e instanceof CreditError) {
          if (e.code === 'CREDIT_LIMIT_EXCEEDED') {
            return err('Weekly API credits exhausted. Upgrade or wait until Monday.', 'CREDIT_LIMIT_EXCEEDED', 402);
          }
          // NO_SUBSCRIPTION — allow but note no credits tracked
        }
      }
    }

    // 5. Call handler
    const ctx: RouteContext = {
      userId,
      tier,
      apiTier:   user.apiTier,
      discordId: user.discordId,
      creditsUsed,
      creditsLeft,
    };

    const response = await handler(req, ctx);

    // Attach credit headers
    response.headers.set('X-Credits-Used',      String(creditsUsed));
    response.headers.set('X-Credits-Remaining', String(creditsLeft));
    response.headers.set('X-RateLimit-Remaining', String(rlRemaining));

    return response;
  };
}
