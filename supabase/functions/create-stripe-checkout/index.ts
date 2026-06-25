import { createClient } from 'jsr:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@19.1.0';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PLANS = {
  monthly: {
    name: 'Model-x-202 Pro (Monthly)',
    price: 999, // cents = $9.99
    currency: 'usd',
    interval: 'monthly',
  },
  yearly: {
    name: 'Model-x-202 Pro (Yearly)',
    price: 7999, // cents = $79.99
    currency: 'usd',
    interval: 'yearly',
  },
};

function ok(data: unknown): Response {
  return new Response(JSON.stringify({ code: 'SUCCESS', data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

function fail(msg: string, code = 400): Response {
  return new Response(JSON.stringify({ code: 'FAIL', message: msg }), {
    status: code,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return fail('Method not allowed', 405);

  try {
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeKey) return fail('STRIPE_SECRET_KEY is not configured. Please add it in your project secrets.', 500);

    const { plan, successPath = '/payment-success', cancelPath = '/pricing' } = await req.json();
    if (!plan || !PLANS[plan as keyof typeof PLANS]) return fail('Invalid plan. Must be "monthly" or "yearly".');

    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');
    let userId: string | null = null;
    let userEmail: string | null = null;

    if (token) {
      const { data: { user } } = await supabase.auth.getUser(token);
      userId = user?.id ?? null;
      userEmail = user?.email ?? null;
    }

    const stripe = new Stripe(stripeKey, { apiVersion: '2025-05-28.basil' });
    const selectedPlan = PLANS[plan as keyof typeof PLANS];
    const origin = req.headers.get('origin') ?? 'http://localhost:5173';

    // Create order record
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        user_id: userId,
        items: [{ name: selectedPlan.name, price: selectedPlan.price, quantity: 1 }],
        total_amount: selectedPlan.price / 100,
        currency: selectedPlan.currency,
        plan_selected: plan,
        status: 'pending',
        customer_email: userEmail,
      })
      .select()
      .single();

    if (orderError) throw new Error(`Failed to create order: ${orderError.message}`);

    const session = await stripe.checkout.sessions.create({
      line_items: [
        {
          price_data: {
            currency: selectedPlan.currency,
            product_data: { name: selectedPlan.name },
            unit_amount: selectedPlan.price,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${origin}${successPath}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}${cancelPath}`,
      customer_email: userEmail ?? undefined,
      metadata: { order_id: order.id, user_id: userId ?? '', plan },
    });

    await supabase.from('orders').update({ stripe_session_id: session.id }).eq('id', order.id);

    return ok({ url: session.url, sessionId: session.id, orderId: order.id });
  } catch (err) {
    console.error('Checkout error:', err);
    return fail(err instanceof Error ? err.message : 'Checkout failed', 500);
  }
});
