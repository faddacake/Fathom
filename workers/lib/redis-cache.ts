import { Redis } from '@upstash/redis';
import type { FlowRow, DarkPoolRow } from './types';
import { logger } from './logger';

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
}

let _redis: Redis | null = null;

function getRedis(): Redis {
  if (!_redis) {
    _redis = new Redis({
      url: requireEnv('UPSTASH_REDIS_REST_URL'),
      token: requireEnv('UPSTASH_REDIS_REST_TOKEN'),
    });
  }
  return _redis;
}

/** Cache the latest 50 flow rows. TTL = 3 s. Written before Supabase upsert. */
export async function cacheFlowRows(rows: FlowRow[]): Promise<void> {
  try {
    await getRedis().set('flow:latest', rows.slice(0, 50), { ex: 3 });
  } catch (err) {
    logger.warn({ msg: 'redis flow cache write failed', err: String(err) });
  }
}

/** Cache latest dark pool rows. TTL = 5 s. */
export async function cacheDarkPoolRows(rows: DarkPoolRow[]): Promise<void> {
  try {
    await getRedis().set('darkpool:latest', rows, { ex: 5 });
  } catch (err) {
    logger.warn({ msg: 'redis darkpool cache write failed', err: String(err) });
  }
}
