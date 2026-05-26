import Stripe from 'stripe';
import { updateUserTier, getUserByClerkId, upsertUser } from '@/lib/supabase/client';
import { initCredits } from '@/lib/redis/credits';
import type { PlatformTier, ApiTier, BotTier } from '@/types';

// ─── CLIENT ───────────────────────────────────────────────────────────────────
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-04-10',
  typescript:  true,
});

// ─── PRICE ID → TIER MAPS ─────────────────────────────────────────────────────
const PLATFORM_PRICE_TO_TIER: Record<string, PlatformTier> = {
  [process.env.STRIPE_PRICE_STARTER_MONTHLY!]: 'starter',
  [process.env.STRIPE_PRICE_STARTER_ANNUAL!]:  'starter',
  [process.env.STRIPE_PRICE_PRO_MONTHLY!]:     'pro',
  [process.env.STRIPE_PRICE_PRO_ANNUAL!]:      'pro',
  [process.env.STRIPE_PRICE_WHALE_MONTHLY!]:   'whale',
  [process.env.STRIPE_PRICE_WHALE_ANNUAL!]:    'whale',
};

const API_PRICE_TO_TIER: Record<string, ApiTier> = {
  [process.env.STRIPE_PRICE_API_500!]:   'api_500',
  [process.env.STRIPE_PRICE_API_2500!]:  'api_2500',
  [process.env.STRIPE_PRICE_API_10000!]: 'api_10000',
};

const BOT_PRICE_TO_TIER: Record<string, BotTier> = {
  [process.env.STRIPE_PRICE_BOT_BASIC!]:  'bot_basic',
  [process.env.STRIPE_PRICE_BOT_PRO!]:    'bot_pro',
  [process.env.STRIPE_PRICE_BOT_SERVER!]: 'bot_server',
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function getPriceId(subscription: Stripe.Subscription): string {
  return subscription.items.data[0]?.price.id ?? '';
}

function resolveTiers(priceId: string): {
  platformTier?: PlatformTier;
  apiTier?:      ApiTier;
  botTier?:      BotTier;
} {
  return {
    platformTier: PLATFORM_PRICE_TO_TIER[priceId],
    apiTier:      API_PRICE_TO_TIER[priceId],
    botTier:      BOT_PRICE_TO_TIER[priceId],
  };
}

async function getClerkIdFromCustomer(customerId: string): Promise<string | null> {
  const customer = await stripe.customers.retrieve(customerId) as Stripe.Customer;
  return (customer.metadata?.clerkId as string) ?? null;
}

// ─── DISCORD ROLE SYNC ────────────────────────────────────────────────────────
// Called after tier updates to sync Discord roles via bot API
async function syncDiscordRole(discordId: string, tier: PlatformTier): Promise<void> {
  if (!discordId) return;
  try {
    const res = await fetch(`${process.env.BOT_API_URL}/sync-role`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.BOT_API_SECRET}`,
      },
      body: JSON.stringify({ discordId, tier }),
    });
    if (!res.ok) console.error('[Discord] Role sync failed:', await res.text());
  } catch (err) {
    console.error('[Discord] Role sync error:', err);
  }
}

// ─── WEBHOOK HANDLER ──────────────────────────────────────────────────────────
export async function handleStripeWebhook(
  body: string,
  signature: string
): Promise<{ status: number; message: string }> {
  let event: Stripe.Event;

  // Verify signature
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error('[Stripe] Webhook signature verification failed:', err);
    return { status: 400, message: 'Invalid signature' };
  }

  console.log(`[Stripe] Event: ${event.type} (${event.id})`);

  try {
    switch (event.type) {

      // ── SUBSCRIPTION CREATED ────────────────────────────────────────────────
      case 'customer.subscription.created': {
        const sub        = event.data.object as Stripe.Subscription;
        const customerId = sub.customer as string;
        const priceId    = getPriceId(sub);
        const clerkId    = await getClerkIdFromCustomer(customerId);

        if (!clerkId) {
          console.error('[Stripe] No clerkId on customer:', customerId);
          break;
        }

        const { platformTier, apiTier, botTier } = resolveTiers(priceId);

        // Upsert user in Supabase
        await upsertUser({
          clerkId,
          stripeCustomerId: customerId,
          discordId:        null,
          email:            '',         // populated by Clerk webhook
          platformTier:     platformTier ?? 'free',
          apiTier:          apiTier ?? null,
          botTier:          botTier ?? null,
        });

        // Init credits in Redis
        if (platformTier && platformTier !== 'free') {
          await initCredits(clerkId, platformTier);
        }
        if (apiTier) {
          await initCredits(clerkId, apiTier);
        }

        // Sync Discord role
        const user = await getUserByClerkId(clerkId);
        if (user?.discordId && platformTier) {
          await syncDiscordRole(user.discordId, platformTier);
        }

        console.log(`[Stripe] Subscription created: ${clerkId} → ${platformTier ?? apiTier ?? botTier}`);
        break;
      }

      // ── SUBSCRIPTION UPDATED (tier change / renewal) ─────────────────────
      case 'customer.subscription.updated': {
        const sub        = event.data.object as Stripe.Subscription;
        const customerId = sub.customer as string;
        const priceId    = getPriceId(sub);
        const clerkId    = await getClerkIdFromCustomer(customerId);

        if (!clerkId) break;

        const { platformTier, apiTier, botTier } = resolveTiers(priceId);

        await updateUserTier(clerkId, {
          platformTier: platformTier,
          apiTier:      apiTier,
          botTier:      botTier,
        });

        // Re-init credits on renewal
        if (sub.status === 'active') {
          if (platformTier && platformTier !== 'free') await initCredits(clerkId, platformTier);
          if (apiTier) await initCredits(clerkId, apiTier);
        }

        const user = await getUserByClerkId(clerkId);
        if (user?.discordId && platformTier) {
          await syncDiscordRole(user.discordId, platformTier);
        }

        console.log(`[Stripe] Subscription updated: ${clerkId} → ${platformTier ?? apiTier ?? botTier}`);
        break;
      }

      // ── SUBSCRIPTION DELETED (cancellation / non-payment) ────────────────
      case 'customer.subscription.deleted': {
        const sub        = event.data.object as Stripe.Subscription;
        const customerId = sub.customer as string;
        const priceId    = getPriceId(sub);
        const clerkId    = await getClerkIdFromCustomer(customerId);

        if (!clerkId) break;

        const { platformTier, apiTier, botTier } = resolveTiers(priceId);

        // Downgrade to free
        await updateUserTier(clerkId, {
          platformTier: platformTier    ? 'free' : undefined,
          apiTier:      apiTier         ? null   : undefined,
          botTier:      botTier         ? null   : undefined,
        });

        // Revoke Discord role
        const user = await getUserByClerkId(clerkId);
        if (user?.discordId) {
          await syncDiscordRole(user.discordId, 'free');
        }

        console.log(`[Stripe] Subscription deleted: ${clerkId} → downgraded to free`);
        break;
      }

      // ── PAYMENT FAILED ────────────────────────────────────────────────────
      case 'invoice.payment_failed': {
        const invoice    = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;
        const clerkId    = await getClerkIdFromCustomer(customerId);
        if (!clerkId) break;

        // Send Discord DM warning via bot
        const user = await getUserByClerkId(clerkId);
        if (user?.discordId) {
          await fetch(`${process.env.BOT_API_URL}/send-dm`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.BOT_API_SECRET}`,
            },
            body: JSON.stringify({
              discordId: user.discordId,
              message: `⚠️ **Payment failed** for your Fathom subscription.\n\nYou have a 3-day grace period before your access is downgraded.\n\nUpdate your payment method here: ${process.env.NEXT_PUBLIC_APP_URL}/billing`,
            }),
          }).catch(console.error);
        }

        console.log(`[Stripe] Payment failed: ${clerkId}`);
        break;
      }

      // ── PAYMENT SUCCEEDED (credit refresh) ────────────────────────────────
      case 'invoice.payment_succeeded': {
        const invoice    = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;
        const clerkId    = await getClerkIdFromCustomer(customerId);
        if (!clerkId) break;

        // Credits are refreshed on subscription.updated — nothing extra needed
        console.log(`[Stripe] Payment succeeded: ${clerkId}`);
        break;
      }

      // ── TRIAL ENDING ──────────────────────────────────────────────────────
      case 'customer.subscription.trial_will_end': {
        const sub        = event.data.object as Stripe.Subscription;
        const customerId = sub.customer as string;
        const clerkId    = await getClerkIdFromCustomer(customerId);
        if (!clerkId) break;

        // Send reminder DM
        const user = await getUserByClerkId(clerkId);
        if (user?.discordId) {
          const trialEnd = new Date((sub.trial_end ?? 0) * 1000).toLocaleDateString();
          await fetch(`${process.env.BOT_API_URL}/send-dm`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.BOT_API_SECRET}`,
            },
            body: JSON.stringify({
              discordId: user.discordId,
              message: `📅 **Your Fathom trial ends on ${trialEnd}.**\n\nYour payment method will be charged automatically. Manage your subscription at ${process.env.NEXT_PUBLIC_APP_URL}/billing`,
            }),
          }).catch(console.error);
        }

        console.log(`[Stripe] Trial ending: ${clerkId}`);
        break;
      }

      default:
        console.log(`[Stripe] Unhandled event: ${event.type}`);
    }
  } catch (err) {
    console.error(`[Stripe] Handler error for ${event.type}:`, err);
    return { status: 500, message: 'Handler error' };
  }

  return { status: 200, message: 'OK' };
}

// ─── BILLING PORTAL ───────────────────────────────────────────────────────────
export async function createBillingPortalSession(
  stripeCustomerId: string,
  returnUrl: string
): Promise<string> {
  const session = await stripe.billingPortal.sessions.create({
    customer:   stripeCustomerId,
    return_url: returnUrl,
  });
  return session.url;
}

// ─── CHECKOUT SESSION ─────────────────────────────────────────────────────────
export async function createCheckoutSession({
  priceId,
  clerkId,
  email,
  successUrl,
  cancelUrl,
}: {
  priceId:    string;
  clerkId:    string;
  email:      string;
  successUrl: string;
  cancelUrl:  string;
}): Promise<string> {
  const session = await stripe.checkout.sessions.create({
    mode:               'subscription',
    payment_method_types: ['card'],
    customer_email:     email,
    line_items:         [{ price: priceId, quantity: 1 }],
    success_url:        successUrl,
    cancel_url:         cancelUrl,
    metadata:           { clerkId },
    subscription_data:  { metadata: { clerkId } },
  });
  return session.url!;
}
