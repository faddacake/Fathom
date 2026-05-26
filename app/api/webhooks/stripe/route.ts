// app/api/webhooks/stripe/route.ts
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
 
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-04-10',
});
 
// Lazy client — never called at module load time
function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}
 
const PLATFORM_PRICE_TIERS: Record<string, string> = {
  [process.env.STRIPE_PRICE_PLATFORM_STARTER_MONTHLY!]: 'starter',
  [process.env.STRIPE_PRICE_PLATFORM_STARTER_ANNUAL!]:  'starter',
  [process.env.STRIPE_PRICE_PLATFORM_PRO_MONTHLY!]:     'pro',
  [process.env.STRIPE_PRICE_PLATFORM_PRO_ANNUAL!]:      'pro',
  [process.env.STRIPE_PRICE_PLATFORM_WHALE_MONTHLY!]:   'whale',
  [process.env.STRIPE_PRICE_PLATFORM_WHALE_ANNUAL!]:    'whale',
};
 
const API_PRICE_TIERS: Record<string, string> = {
  [process.env.STRIPE_PRICE_API_500!]:   'basic',
  [process.env.STRIPE_PRICE_API_2500!]:  'pro',
  [process.env.STRIPE_PRICE_API_10000!]: 'institutional',
};
 
const BOT_PRICE_TIERS: Record<string, string> = {
  [process.env.STRIPE_PRICE_BOT_BASIC!]:  'basic',
  [process.env.STRIPE_PRICE_BOT_PRO!]:    'pro',
  [process.env.STRIPE_PRICE_BOT_SERVER!]: 'server',
};
 
const DISCORD_ROLES: Record<string, string | undefined> = {
  'platform:starter': process.env.DISCORD_ROLE_PLATFORM_STARTER,
  'platform:pro':     process.env.DISCORD_ROLE_PLATFORM_PRO,
  'platform:whale':   process.env.DISCORD_ROLE_PLATFORM_WHALE,
  'bot:basic':        process.env.DISCORD_ROLE_BOT_BASIC,
  'bot:pro':          process.env.DISCORD_ROLE_BOT_PRO,
  'bot:server':       process.env.DISCORD_ROLE_BOT_SERVER,
};
 
function classifyPrice(priceId: string): { product: 'platform' | 'api' | 'bot' | null; tier: string | null } {
  if (PLATFORM_PRICE_TIERS[priceId]) return { product: 'platform', tier: PLATFORM_PRICE_TIERS[priceId] };
  if (API_PRICE_TIERS[priceId])      return { product: 'api',      tier: API_PRICE_TIERS[priceId] };
  if (BOT_PRICE_TIERS[priceId])      return { product: 'bot',      tier: BOT_PRICE_TIERS[priceId] };
  return { product: null, tier: null };
}
 
async function isAlreadyProcessed(eventId: string): Promise<boolean> {
  const db = getSupabase();
  const { data } = await db
    .from('stripe_events')
    .select('stripe_event_id')
    .eq('stripe_event_id', eventId)
    .maybeSingle();
  return !!data;
}
 
async function markProcessed(eventId: string, eventType: string): Promise<void> {
  const db = getSupabase();
  await db.from('stripe_events').insert({
    stripe_event_id: eventId,
    event_type: eventType,
  });
}
 
async function getUserByCustomerId(customerId: string) {
  const db = getSupabase();
  const { data } = await db
    .from('users')
    .select('*')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();
  return data;
}
 
async function syncDiscordRole(discordId: string, roleKey: string, action: 'add' | 'remove'): Promise<void> {
  const roleId = DISCORD_ROLES[roleKey];
  if (!roleId || !process.env.BOT_INTERNAL_URL) return;
  try {
    await fetch(`${process.env.BOT_INTERNAL_URL}/roles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.BOT_INTERNAL_SECRET}` },
      body: JSON.stringify({ discordId, roleId, action }),
    });
  } catch (err) {
    console.error('[discord-role-sync] failed:', err);
  }
}
 
async function sendDiscordDM(discordId: string, message: string): Promise<void> {
  if (!process.env.BOT_INTERNAL_URL) return;
  try {
    await fetch(`${process.env.BOT_INTERNAL_URL}/dm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.BOT_INTERNAL_SECRET}` },
      body: JSON.stringify({ discordId, message }),
    });
  } catch (err) {
    console.error('[discord-dm] failed:', err);
  }
}
 
async function handleSubscriptionCreated(sub: Stripe.Subscription): Promise<void> {
  const db = getSupabase();
  const customerId = sub.customer as string;
  const priceId = sub.items.data[0]?.price.id;
  if (!priceId) return;
  const { product, tier } = classifyPrice(priceId);
  if (!product || !tier) return;
 
  let user = await getUserByCustomerId(customerId);
 
  if (!user) {
    const customer = await stripe.customers.retrieve(customerId) as Stripe.Customer;
    if (!customer.email) return;
    const { data } = await db.from('users')
      .insert({ clerk_id: `stripe:${customerId}`, email: customer.email, stripe_customer_id: customerId })
      .select().single();
    user = data;
  }
 
  if (!user) return;
 
  await db.rpc('update_user_tier', {
    p_stripe_customer_id: customerId,
    p_product: product,
    p_new_tier: tier,
    p_sub_id: sub.id,
  });
 
  if (user.discord_id && (product === 'platform' || product === 'bot')) {
    await syncDiscordRole(user.discord_id, `${product}:${tier}`, 'add');
  }
 
  if (sub.discount?.coupon?.id === 'FOUNDER40') {
    await db.from('users').update({ is_founding_member: true }).eq('id', user.id);
  }
}
 
async function handleSubscriptionUpdated(sub: Stripe.Subscription): Promise<void> {
  const db = getSupabase();
  const customerId = sub.customer as string;
  const priceId = sub.items.data[0]?.price.id;
  if (!priceId) return;
  const { product, tier } = classifyPrice(priceId);
  if (!product || !tier) return;
 
  const user = await getUserByCustomerId(customerId);
  if (!user) return;
 
  const oldTier = product === 'platform' ? user.platform_tier : product === 'api' ? user.api_tier : user.bot_tier;
 
  await db.rpc('update_user_tier', {
    p_stripe_customer_id: customerId,
    p_product: product,
    p_new_tier: tier,
    p_sub_id: sub.id,
  });
 
  if (user.discord_id && (product === 'platform' || product === 'bot')) {
    if (oldTier && oldTier !== 'free') await syncDiscordRole(user.discord_id, `${product}:${oldTier}`, 'remove');
    await syncDiscordRole(user.discord_id, `${product}:${tier}`, 'add');
  }
}
 
async function handleSubscriptionDeleted(sub: Stripe.Subscription): Promise<void> {
  const db = getSupabase();
  const customerId = sub.customer as string;
  const priceId = sub.items.data[0]?.price.id;
  if (!priceId) return;
  const { product } = classifyPrice(priceId);
  if (!product) return;
 
  const user = await getUserByCustomerId(customerId);
  if (!user) return;
 
  const oldTier = product === 'platform' ? user.platform_tier : product === 'api' ? user.api_tier : user.bot_tier;
 
  await db.rpc('update_user_tier', {
    p_stripe_customer_id: customerId,
    p_product: product,
    p_new_tier: 'free',
    p_sub_id: null,
  });
 
  if (user.discord_id && oldTier && oldTier !== 'free') {
    await syncDiscordRole(user.discord_id, `${product}:${oldTier}`, 'remove');
    await sendDiscordDM(user.discord_id,
      `Your Fathom ${product} subscription has been cancelled. You've been moved to the free tier.\n\nWant to come back? Use code **COMEBACK20** for 20% off.\nhttps://fathomtrade.com/pricing`
    );
  }
}
 
async function handlePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  const customerId = invoice.customer as string;
  const user = await getUserByCustomerId(customerId);
  if (!user?.discord_id) return;
  await sendDiscordDM(user.discord_id,
    `⚠️ **Payment failed** for your Fathom subscription.\n\nPlease update your billing info within 3 days to avoid losing access.\n→ https://fathomtrade.com/billing`
  );
}
 
async function handleTrialWillEnd(sub: Stripe.Subscription): Promise<void> {
  const customerId = sub.customer as string;
  const user = await getUserByCustomerId(customerId);
  if (!user?.discord_id) return;
  const trialEnd = new Date((sub.trial_end ?? 0) * 1000).toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  await sendDiscordDM(user.discord_id,
    `Your Fathom trial ends on **${trialEnd}**.\n\nManage your subscription at https://fathomtrade.com/billing`
  );
}
 
export async function POST(req: Request) {
  const body = await req.text();
  const signature = headers().get('stripe-signature');
  if (!signature) return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
 
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err: any) {
    console.error('[stripe-webhook] signature verification failed:', err.message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }
 
  if (await isAlreadyProcessed(event.id)) {
    return NextResponse.json({ received: true });
  }
 
  try {
    switch (event.type) {
      case 'customer.subscription.created':
        await handleSubscriptionCreated(event.data.object as Stripe.Subscription); break;
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription); break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription); break;
      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object as Stripe.Invoice); break;
      case 'customer.subscription.trial_will_end':
        await handleTrialWillEnd(event.data.object as Stripe.Subscription); break;
      default:
        console.log(`[stripe-webhook] unhandled: ${event.type}`);
    }
    await markProcessed(event.id, event.type);
    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error(`[stripe-webhook] error processing ${event.type}:`, err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}