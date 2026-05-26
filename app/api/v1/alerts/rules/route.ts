/**
 * GET    /api/v1/alerts/rules  — List user's alert rules
 * POST   /api/v1/alerts/rules  — Create a new alert rule
 * DELETE /api/v1/alerts/rules?id=xxx  — Delete (deactivate) a rule
 */

import { NextRequest }                    from 'next/server';
import { withApiAuth, ok, err }           from '@/lib/api/helpers';
import { getActiveAlerts, getSupabaseAdmin } from '@/lib/supabase/client';
import { getAlertCap }                    from '@/lib/api/helpers';
import type { AlertRule }                 from '@/types';

// ── GET: list rules ───────────────────────────────────────────────────────────
export const GET = withApiAuth('/v1/alerts/feed', async (_req, ctx) => {
  const rules = await getActiveAlerts(ctx.userId);
  return ok(rules, { creditsUsed: 0, creditsLeft: ctx.creditsLeft });
});

// ── POST: create rule ─────────────────────────────────────────────────────────
export const POST = withApiAuth('/v1/alerts/feed', async (req, ctx) => {
  const body = await req.json().catch(() => ({})) as Partial<AlertRule>;

  // Validate required fields
  const type = body.type;
  if (!type || !['flow', 'darkpool', 'congress', 'price'].includes(type)) {
    return err('type must be flow | darkpool | congress | price', 'INVALID_PARAM', 400);
  }

  // Check rule cap per tier
  const existing = await getActiveAlerts(ctx.userId);
  const caps: Record<string, number> = { free: 1, starter: 10, pro: 50, whale: -1 };
  const cap = caps[ctx.tier] ?? 0;

  if (cap >= 0 && existing.length >= cap) {
    return err(
      `Your tier allows a maximum of ${cap} active alert rule(s). Upgrade to add more.`,
      'RULE_LIMIT_REACHED',
      403
    );
  }

  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from('alert_rules')
    .insert({
      userId:      ctx.userId,
      type:        body.type!,
      ticker:      body.ticker?.toUpperCase() ?? null,
      optionType:  body.optionType ?? null,
      premiumMin:  body.premiumMin ?? null,
      sweepOnly:   body.sweepOnly ?? false,
      isActive:    true,
    } as any)
    .select()
    .single();

  if (error) {
    return err('Failed to create alert rule', 'DB_ERROR', 500);
  }

  return ok(data, { creditsUsed: 0, creditsLeft: ctx.creditsLeft });
});

// ── DELETE: deactivate rule ───────────────────────────────────────────────────
export const DELETE = withApiAuth('/v1/alerts/feed', async (req, ctx) => {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) {
    return err('id query param is required', 'INVALID_PARAM', 400);
  }

  const db = getSupabaseAdmin();

  // Verify ownership
  const { data: rule } = await db
    .from('alert_rules')
    .select('userId')
    .eq('id', id)
    .single();

  if (!rule || (rule as any).userId !== ctx.userId) {
    return err('Alert rule not found', 'NOT_FOUND', 404);
  }

  // Soft delete — set isActive = false
  await db
    .from('alert_rules')
    .update({ isActive: false })
    .eq('id', id);

  return ok({ deleted: id }, { creditsUsed: 0, creditsLeft: ctx.creditsLeft });
});
