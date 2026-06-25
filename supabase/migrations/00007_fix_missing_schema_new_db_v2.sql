
-- Add missing columns to profiles (no username column on this DB)
DO $$ BEGIN
  CREATE TYPE public.user_role AS ENUM ('user', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role public.user_role NOT NULL DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS bio text,
  ADD COLUMN IF NOT EXISTS language_preference text DEFAULT 'Auto',
  ADD COLUMN IF NOT EXISTS theme_preference text DEFAULT 'system';

-- Backfill display_name from email
UPDATE public.profiles
SET display_name = split_part(email, '@', 1)
WHERE display_name IS NULL AND email IS NOT NULL;

-- Helper function for role checks
CREATE OR REPLACE FUNCTION public.get_user_role(uid uuid)
RETURNS public.user_role
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM profiles WHERE id = uid;
$$;

-- Subscription types
DO $$ BEGIN
  CREATE TYPE subscription_plan AS ENUM ('free', 'monthly', 'yearly');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE subscription_status AS ENUM ('active', 'cancelled', 'expired', 'trialing');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE order_status AS ENUM ('pending', 'completed', 'cancelled', 'refunded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Subscriptions table
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  plan subscription_plan NOT NULL DEFAULT 'free',
  status subscription_status NOT NULL DEFAULT 'active',
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions(user_id);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own subscription" ON public.subscriptions;
CREATE POLICY "Users can view own subscription" ON public.subscriptions
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role can manage subscriptions" ON public.subscriptions;
CREATE POLICY "Service role can manage subscriptions" ON public.subscriptions
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- Seed free subscription for existing users
INSERT INTO public.subscriptions (user_id, plan, status)
SELECT id, 'free', 'active'
FROM public.profiles
WHERE id NOT IN (SELECT user_id FROM public.subscriptions)
ON CONFLICT (user_id) DO NOTHING;

-- Orders table
CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  items jsonb NOT NULL DEFAULT '[]',
  total_amount numeric(12, 2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'usd',
  status order_status NOT NULL DEFAULT 'pending',
  stripe_session_id text UNIQUE,
  stripe_payment_intent_id text,
  customer_email text,
  customer_name text,
  plan_selected text,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own orders" ON public.orders;
CREATE POLICY "Users can view own orders" ON public.orders
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role can manage orders" ON public.orders;
CREATE POLICY "Service role can manage orders" ON public.orders
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- Daily usage table
CREATE TABLE IF NOT EXISTS public.daily_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  usage_date date NOT NULL DEFAULT (current_date at time zone 'utc'),
  message_count integer NOT NULL DEFAULT 0,
  image_count integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (user_id, usage_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_usage_user_date ON public.daily_usage(user_id, usage_date);

ALTER TABLE public.daily_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own usage" ON public.daily_usage;
CREATE POLICY "Users can view own usage" ON public.daily_usage
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role can manage usage" ON public.daily_usage;
CREATE POLICY "Service role can manage usage" ON public.daily_usage
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- get_today_usage RPC
CREATE OR REPLACE FUNCTION public.get_today_usage(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_date date := (now() at time zone 'utc')::date;
  v_row public.daily_usage;
BEGIN
  SELECT * INTO v_row
  FROM public.daily_usage
  WHERE user_id = p_user_id AND usage_date = v_date;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('message_count', 0, 'image_count', 0, 'usage_date', v_date);
  END IF;
  RETURN jsonb_build_object(
    'message_count', v_row.message_count,
    'image_count', v_row.image_count,
    'usage_date', v_row.usage_date
  );
END;
$$;

-- increment_usage RPC
CREATE OR REPLACE FUNCTION public.increment_usage(p_user_id uuid, p_type text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_date date := (now() at time zone 'utc')::date;
  v_row public.daily_usage;
BEGIN
  INSERT INTO public.daily_usage (user_id, usage_date, message_count, image_count)
  VALUES (p_user_id, v_date, 0, 0)
  ON CONFLICT (user_id, usage_date) DO NOTHING;
  IF p_type = 'message' THEN
    UPDATE public.daily_usage
    SET message_count = message_count + 1, updated_at = now()
    WHERE user_id = p_user_id AND usage_date = v_date
    RETURNING * INTO v_row;
  ELSIF p_type = 'image' THEN
    UPDATE public.daily_usage
    SET image_count = image_count + 1, updated_at = now()
    WHERE user_id = p_user_id AND usage_date = v_date
    RETURNING * INTO v_row;
  END IF;
  RETURN jsonb_build_object(
    'message_count', v_row.message_count,
    'image_count', v_row.image_count,
    'usage_date', v_row.usage_date
  );
END;
$$;

-- Pricing plans table
CREATE TABLE IF NOT EXISTS public.pricing_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  plan_key text NOT NULL UNIQUE,
  price numeric(10,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'usd',
  period text NOT NULL DEFAULT 'forever',
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

DROP POLICY IF EXISTS "Anyone can view active plans" ON public.pricing_plans;
CREATE POLICY "Anyone can view active plans" ON public.pricing_plans
  FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "Admins can manage plans" ON public.pricing_plans;
CREATE POLICY "Admins can manage plans" ON public.pricing_plans
  FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) = 'admin'::user_role)
  WITH CHECK (get_user_role(auth.uid()) = 'admin'::user_role);

INSERT INTO public.pricing_plans (name, plan_key, price, currency, period, description, features, is_highlighted, badge, sort_order)
VALUES
  ('Free', 'free', 0, 'usd', 'forever', 'Get started with basic AI features',
   '["50 messages per day","3 image generations per day","Basic text chat","Standard response speed","Community support"]',
   false, null, 1),
  ('Pro Monthly', 'monthly', 9.99, 'usd', 'month', 'Full access with monthly flexibility',
   '["Unlimited messages","Unlimited image generation","Priority response speed","Video generation (Kling)","AI Search with web access","Speech-to-text & TTS","Priority support"]',
   false, null, 2),
  ('Pro Yearly', 'yearly', 79.99, 'usd', 'year', 'Best value — save 33% vs monthly',
   '["Everything in Pro Monthly","Unlimited messages & images","2 months free","Early access to new features","Dedicated support","Usage analytics","API access (coming soon)"]',
   true, 'Best Value', 3)
ON CONFLICT (plan_key) DO NOTHING;

-- admin_set_user_plan RPC
CREATE OR REPLACE FUNCTION public.admin_set_user_plan(
  p_user_id uuid,
  p_plan text,
  p_status text DEFAULT 'active'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF get_user_role(auth.uid()) != 'admin'::user_role THEN
    RAISE EXCEPTION 'Unauthorized: admin only';
  END IF;
  INSERT INTO public.subscriptions (user_id, plan, status)
  VALUES (p_user_id, p_plan::subscription_plan, p_status::subscription_status)
  ON CONFLICT (user_id) DO UPDATE
    SET plan = EXCLUDED.plan, status = EXCLUDED.status, updated_at = now();
  RETURN jsonb_build_object('success', true, 'user_id', p_user_id, 'plan', p_plan);
END;
$$;

-- Update handle_new_user trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (new.id, new.email, split_part(new.email, '@', 1))
  ON CONFLICT (id) DO UPDATE SET
    email = excluded.email,
    display_name = COALESCE(profiles.display_name, excluded.display_name);

  INSERT INTO public.subscriptions (user_id, plan, status)
  VALUES (new.id, 'free', 'active')
  ON CONFLICT (user_id) DO NOTHING;

  RETURN new;
END;
$$;

NOTIFY pgrst, 'reload schema';
