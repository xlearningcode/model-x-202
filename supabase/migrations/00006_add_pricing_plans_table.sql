
-- Pricing plans table (admin-managed)
CREATE TABLE IF NOT EXISTS public.pricing_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  plan_key text NOT NULL UNIQUE, -- 'free', 'monthly', 'yearly'
  price numeric(10,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'usd',
  period text NOT NULL DEFAULT 'forever', -- 'forever', 'month', 'year'
  description text,
  features jsonb NOT NULL DEFAULT '[]',
  is_highlighted boolean NOT NULL DEFAULT false,
  badge text,
  stripe_price_id text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.pricing_plans ENABLE ROW LEVEL SECURITY;

-- Everyone (including anonymous) can read active plans
DROP POLICY IF EXISTS "Anyone can view active plans" ON public.pricing_plans;
CREATE POLICY "Anyone can view active plans" ON public.pricing_plans
  FOR SELECT USING (is_active = true);

-- Only admins can manage plans
DROP POLICY IF EXISTS "Admins can manage plans" ON public.pricing_plans;
CREATE POLICY "Admins can manage plans" ON public.pricing_plans
  FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) = 'admin'::user_role)
  WITH CHECK (get_user_role(auth.uid()) = 'admin'::user_role);

-- Seed default plans
INSERT INTO public.pricing_plans (name, plan_key, price, currency, period, description, features, is_highlighted, badge, sort_order)
VALUES
  (
    'Free', 'free', 0, 'usd', 'forever',
    'Get started with basic AI features',
    '["50 messages per day","3 image generations per day","Basic text chat","Standard response speed","Community support"]',
    false, null, 1
  ),
  (
    'Pro Monthly', 'monthly', 9.99, 'usd', 'month',
    'Full access with monthly flexibility',
    '["Unlimited messages","Unlimited image generation","Priority response speed","Video generation (Kling)","AI Search with web access","Speech-to-text & TTS","Priority support"]',
    false, null, 2
  ),
  (
    'Pro Yearly', 'yearly', 79.99, 'usd', 'year',
    'Best value — save 33% vs monthly',
    '["Everything in Pro Monthly","Unlimited messages & images","2 months free","Early access to new features","Dedicated support","Usage analytics","API access (coming soon)"]',
    true, 'Best Value', 3
  )
ON CONFLICT (plan_key) DO NOTHING;

-- Admin function: set user plan manually (bypasses RLS)
CREATE OR REPLACE FUNCTION public.admin_set_user_plan(
  p_user_id uuid,
  p_plan text, -- 'free', 'monthly', 'yearly'
  p_status text DEFAULT 'active'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Only admins can call this
  IF get_user_role(auth.uid()) != 'admin'::user_role THEN
    RAISE EXCEPTION 'Unauthorized: admin only';
  END IF;

  INSERT INTO public.subscriptions (user_id, plan, status)
  VALUES (p_user_id, p_plan::subscription_plan, p_status::subscription_status)
  ON CONFLICT (user_id) DO UPDATE
    SET plan = EXCLUDED.plan,
        status = EXCLUDED.status,
        updated_at = now();

  RETURN jsonb_build_object('success', true, 'user_id', p_user_id, 'plan', p_plan);
END;
$$;
