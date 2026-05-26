/**
 * POST /api/checkout
 * Creates a Stripe Checkout session for subscription purchase.
 * Body: { priceId: string }
 */

import { NextRequest, NextResponse }  from 'next/server';
import { auth, currentUser }          from '@clerk/nextjs/server';
import { createCheckoutSession }      from '@/lib/stripe/client';

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { priceId } = body as { priceId?: string };

  if (!priceId) {
    return NextResponse.json({ error: 'priceId is required' }, { status: 400 });
  }

  const user      = await currentUser();
  const email     = user?.emailAddresses?.[0]?.emailAddress ?? '';
  const origin    = req.headers.get('origin') ?? process.env.NEXT_PUBLIC_APP_URL ?? '';

  const url = await createCheckoutSession({
    priceId,
    clerkId:    userId,
    email,
    successUrl: `${origin}/dashboard?checkout=success`,
    cancelUrl:  `${origin}/pricing?checkout=cancelled`,
  });

  return NextResponse.json({ url });
}
