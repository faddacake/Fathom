/**
 * POST /api/webhooks/stripe
 * Receives and processes Stripe webhook events.
 * Must use raw body — do NOT use NextResponse.json() before verifying.
 */

import { NextRequest, NextResponse } from 'next/server';
import { handleStripeWebhook }       from '@/lib/stripe/client';

// Disable body parsing — Stripe needs the raw bytes for signature verification
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const body      = await req.text();
  const signature = req.headers.get('stripe-signature') ?? '';

  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
  }

  const { status, message } = await handleStripeWebhook(body, signature);
  return NextResponse.json({ message }, { status });
}
