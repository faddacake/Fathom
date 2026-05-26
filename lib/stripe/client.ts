import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-04-10',
});

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
    mode:                 'subscription',
    payment_method_types: ['card'],
    customer_email:       email,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url:  cancelUrl,
    metadata:    { clerkId },
    subscription_data: {
      metadata: { clerkId },
    },
  });

  return session.url!;
}
