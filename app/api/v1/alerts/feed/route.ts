/**
 * GET /api/v1/alerts/feed
 * Returns recent flow events matching the user's active alert rules.
 * Respects tier delay. Free tier capped at 5 results.
 */

import { NextRequest }           from 'next/server';
import { withApiAuth, ok }       from '@/lib/api/helpers';
import { getActiveAlerts, getLatestFlow, getLatestDarkPool, getCongressTrades }
                                 from '@/lib/supabase/client';
import { getAlertCap, getDelayMs, applyDelay } from '@/lib/api/helpers';
import type { OptionsFlow, DarkPoolPrint, CongressTrade } from '@/types';

export const GET = withApiAuth('/v1/alerts/feed', async (req, ctx) => {
  const rules    = await getActiveAlerts(ctx.userId);
  const delayMs  = getDelayMs(ctx.tier);
  const cap      = getAlertCap(ctx.tier);

  if (rules.length === 0) {
    return ok([], { creditsUsed: ctx.creditsUsed, creditsLeft: ctx.creditsLeft });
  }

  const results: Array<{
    type:    'flow' | 'darkpool' | 'congress';
    ruleId:  string;
    payload: OptionsFlow | DarkPoolPrint | CongressTrade;
  }> = [];

  // Evaluate each rule against recent data
  for (const rule of rules) {
    if (rule.type === 'flow') {
      let rows = await getLatestFlow(100, rule.ticker ?? undefined);
      rows = rows.filter(r => applyDelay(r.timestamp, delayMs));

      if (rule.optionType)  rows = rows.filter(r => r.optionType === rule.optionType);
      if (rule.premiumMin)  rows = rows.filter(r => r.totalPremium >= rule.premiumMin!);
      if (rule.sweepOnly)   rows = rows.filter(r => r.orderType === 'sweep');

      for (const row of rows) {
        results.push({ type: 'flow', ruleId: rule.id, payload: row });
      }
    }

    if (rule.type === 'darkpool') {
      let rows = await getLatestDarkPool(50, rule.ticker ?? undefined);
      rows = rows.filter(r => applyDelay(r.timestamp, delayMs));

      for (const row of rows) {
        results.push({ type: 'darkpool', ruleId: rule.id, payload: row });
      }
    }

    if (rule.type === 'congress') {
      const rows = await getCongressTrades(50, rule.ticker ?? undefined);
      for (const row of rows) {
        results.push({ type: 'congress', ruleId: rule.id, payload: row });
      }
    }
  }

  // Sort by most recent
  results.sort((a, b) => {
    const getTime = (p: typeof a.payload): string => {
      if ('timestamp' in p && p.timestamp) return p.timestamp as string;
      if ('disclosureDate' in p && (p as any).disclosureDate) return (p as any).disclosureDate as string;
      return '';
    };
    return getTime(b.payload).localeCompare(getTime(a.payload));
  });

  // Apply daily cap for free tier
  const limited = cap >= 0 ? results.slice(0, cap) : results;

  return ok(
    { alerts: limited, total: results.length, capped: cap >= 0 && results.length > cap },
    { creditsUsed: ctx.creditsUsed, creditsLeft: ctx.creditsLeft }
  );
});
