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

const PLAN_DURATIONS: Record<string, number> = {
  monthly: 30,
  yearly: 365,
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return fail('Method not allowed', 405);

  try {
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeKey) return fail('STRIPE_SECRET_KEY is not configured.', 500);

    const { sessionId } = await req.json();
    if (!sessionId) return fail('Missing sessionId');

    const stripe = new Stripe(stripeKey, { apiVersion: '2025-05-28.basil' });
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== 'paid') {
      return ok({ verified: false, status: session.payment_status, sessionId: session.id });
    }

    // Find order
    const { data: order } = await supabase
      .from('orders')
      .select('id, status, user_id, plan_selected')
      .eq('stripe_session_id', sessionId)
      .single();

    if (order && order.status !== 'completed') {
      // Mark order complete
      await supabase.from('orders').update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        customer_email: session.customer_details?.email,
        customer_name: session.customer_details?.name,
        stripe_payment_intent_id: session.payment_intent as string,
      }).eq('id', order.id);

      // Activate subscription
      if (order.user_id && order.plan_selected) {
        const days = PLAN_DURATIONS[order.plan_selected] ?? 30;
        const now = new Date();
        const periodEnd = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

        await supabase.from('subscriptions').upsert({
          user_id: order.user_id,
          plan: order.plan_selected,
          status: 'active',
          current_period_start: now.toISOString(),
          current_period_end: periodEnd.toISOString(),
          updated_at: now.toISOString(),
        }, { onConflict: 'user_id' });
      }
    }

    return ok({
      verified: true,
      status: 'paid',
      sessionId: session.id,
      plan: order?.plan_selected ?? null,
      amount: session.amount_total,
      currency: session.currency,
      customerEmail: session.customer_details?.email,
    });
  } catch (err) {
    console.error('Verify error:', err);
    return fail(err instanceof Error ? err.message : 'Verification failed', 500);
  }
});
