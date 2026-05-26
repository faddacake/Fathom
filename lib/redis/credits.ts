import { Redis } from '@upstash/redis';
import type { PlatformTier, ApiTier } from '@/types';

// ─── CLIENT ───────────────────────────────────────────────────────────────────
export const redis = new Redis({
  url:   process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// ─── CREDIT AMOUNTS BY TIER ───────────────────────────────────────────────────
const PLATFORM_CREDITS: Record<PlatformTier, number> = {
  free:    0,
  starter: 500,
  pro:     500,
  whale:   10_000,
};

const API_CREDITS: Record<ApiTier, number> = {
  api_500:        500,
  api_2500:       2_500,
  api_10000:      10_000,
  api_enterprise: 100_000,
};

// ─── KEY HELPERS ──────────────────────────────────────────────────────────────
/** Returns the ISO date string for the most recent Monday (UTC) */
export function getWeekStart(from = new Date()): string {
  const d = new Date(from);
  const day = d.getUTCDay();                  // 0=Sun, 1=Mon … 6=Sat
  const diff = day === 0 ? 6 : day - 1;      // days since Monday
  d.setUTCDate(d.getUTCDate() - diff);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);        // "YYYY-MM-DD"
}

/** Seconds until next Monday 00:00 UTC */
export function secondsUntilNextMonday(): number {
  const now = new Date();
  const nextMonday = new Date(now);
  const day = now.getUTCDay();
  const daysUntilMonday = day === 0 ? 1 : 8 - day;
  nextMonday.setUTCDate(now.getUTCDate() + daysUntilMonday);
  nextMonday.setUTCHours(0, 0, 0, 0);
  return Math.floor((nextMonday.getTime() - now.getTime()) / 1000);
}

export function creditKey(userId: string, weekStart?: string): string {
  return `api_credits:${userId}:${weekStart ?? getWeekStart()}`;
}

export function rateLimitKey(userId: string): string {
  return `rate_limit:${userId}`;
}

export function marketCacheKey(endpoint: string, params?: string): string {
  return `market:${endpoint}${params ? ':' + params : ''}`;
}

// ─── CREDIT OPERATIONS ────────────────────────────────────────────────────────

/** Initialize credits for a user's week. Call on subscription created/renewed. */
export async function initCredits(
  userId: string,
  tier: PlatformTier | ApiTier
): Promise<number> {
  const amount =
    tier in PLATFORM_CREDITS
      ? PLATFORM_CREDITS[tier as PlatformTier]
      : API_CREDITS[tier as ApiTier];

  if (amount === 0) return 0;

  const key = creditKey(userId);
  const ttl = secondsUntilNextMonday();

  await redis.set(key, amount, { ex: ttl });
  return amount;
}

/** Atomically decrement credits. Returns remaining credits or throws. */
export async function consumeCredits(
  userId: string,
  cost: number
): Promise<{ remaining: number; used: number }> {
  const key = creditKey(userId);

  // Check balance first
  const balance = await redis.get<number>(key);

  if (balance === null) {
    throw new CreditError('NO_SUBSCRIPTION', 'No active credit subscription found');
  }

  if (balance < cost) {
    throw new CreditError(
      'CREDIT_LIMIT_EXCEEDED',
      `Insufficient credits. Need ${cost}, have ${balance}`
    );
  }

  // Atomic decrement
  const remaining = await redis.decrby(key, cost);

  // Guard against race conditions (very unlikely but safe)
  if (remaining < 0) {
    await redis.incrby(key, cost); // undo
    throw new CreditError('CREDIT_LIMIT_EXCEEDED', 'Insufficient credits');
  }

  return { remaining, used: cost };
}

/** Get current credit balance without consuming. */
export async function getCredits(userId: string): Promise<number> {
  const key = creditKey(userId);
  const balance = await redis.get<number>(key);
  return balance ?? 0;
}

/** Get full credit status for API response headers. */
export async function getCreditStatus(userId: string): Promise<{
  balance: number;
  weekStart: string;
  ttl: number;
}> {
  const weekStart = getWeekStart();
  const key = creditKey(userId, weekStart);
  const [balance, ttl] = await Promise.all([
    redis.get<number>(key),
    redis.ttl(key),
  ]);
  return { balance: balance ?? 0, weekStart, ttl };
}

// ─── RATE LIMITING ────────────────────────────────────────────────────────────
const RATE_LIMITS: Record<PlatformTier, number> = {
  free:    5,
  starter: 10,
  pro:     20,
  whale:   100,
};

/**
 * Sliding window rate limiter.
 * Returns { allowed, remaining, resetAt }
 */
export async function checkRateLimit(
  userId: string,
  tier: PlatformTier
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const limit  = RATE_LIMITS[tier];
  const window = 60;                              // 1 minute window
  const key    = rateLimitKey(userId);
  const now    = Math.floor(Date.now() / 1000);

  // Use Redis sorted set as sliding window
  const pipeline = redis.pipeline();
  pipeline.zremrangebyscore(key, 0, now - window);   // remove old entries
  pipeline.zadd(key, { score: now, member: `${now}-${Math.random()}` });
  pipeline.zcard(key);
  pipeline.expire(key, window);
  const results = await pipeline.exec();

  const count = results[2] as number;
  const allowed = count <= limit;

  return {
    allowed,
    remaining: Math.max(0, limit - count),
    resetAt:   now + window,
  };
}

// ─── MARKET DATA CACHE ────────────────────────────────────────────────────────
const CACHE_TTL: Record<string, number> = {
  flow:      3,    // seconds
  darkpool:  5,
  congress:  300,
  snapshot:  2,
  gex:       30,
};

export async function getCached<T>(
  type: keyof typeof CACHE_TTL,
  key: string
): Promise<T | null> {
  return redis.get<T>(marketCacheKey(type, key));
}

export async function setCached<T>(
  type: keyof typeof CACHE_TTL,
  key: string,
  data: T
): Promise<void> {
  await redis.set(marketCacheKey(type, key), data, {
    ex: CACHE_TTL[type] ?? 5,
  });
}

// ─── ERROR CLASS ──────────────────────────────────────────────────────────────
export class CreditError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'CreditError';
  }
}
