
-- Extend existing profiles table
alter table public.profiles
  add column if not exists display_name text,
  add column if not exists avatar_url text,
  add column if not exists bio text,
  add column if not exists language_preference text default 'Auto',
  add column if not exists theme_preference text default 'system',
  add column if not exists updated_at timestamptz default now();

-- Subscription plan/status enums (safe create)
do $$ begin
  create type subscription_plan as enum ('free', 'monthly', 'yearly');
exception when duplicate_object then null; end $$;

do $$ begin
  create type subscription_status as enum ('active', 'cancelled', 'expired', 'trialing');
exception when duplicate_object then null; end $$;

do $$ begin
  create type order_status as enum ('pending', 'completed', 'cancelled', 'refunded');
exception when duplicate_object then null; end $$;

-- Subscriptions table
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null unique,
  plan subscription_plan not null default 'free',
  status subscription_status not null default 'active',
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_subscriptions_user_id on public.subscriptions(user_id);
create index if not exists idx_subscriptions_stripe_customer_id on public.subscriptions(stripe_customer_id);

alter table public.subscriptions enable row level security;

drop policy if exists "Users can view own subscription" on public.subscriptions;
create policy "Users can view own subscription"
  on public.subscriptions for select
  using (auth.uid() = user_id);

drop policy if exists "Service role can manage subscriptions" on public.subscriptions;
create policy "Service role can manage subscriptions"
  on public.subscriptions for all
  using (auth.jwt()->>'role' = 'service_role');

-- Orders table
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  items jsonb not null default '[]',
  total_amount numeric(12, 2) not null,
  currency text not null default 'usd',
  status order_status not null default 'pending',
  stripe_session_id text unique,
  stripe_payment_intent_id text,
  customer_email text,
  customer_name text,
  plan_selected text,
  completed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_orders_user_id on public.orders(user_id);
create index if not exists idx_orders_stripe_session_id on public.orders(stripe_session_id);

alter table public.orders enable row level security;

drop policy if exists "Users can view own orders" on public.orders;
create policy "Users can view own orders"
  on public.orders for select
  using (auth.uid() = user_id);

drop policy if exists "Service role can manage orders" on public.orders;
create policy "Service role can manage orders"
  on public.orders for all
  using (auth.jwt()->>'role' = 'service_role');

-- Auto-create subscription on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, split_part(new.email, '@', 1))
  on conflict (id) do update set email = excluded.email;

  insert into public.subscriptions (user_id, plan, status)
  values (new.id, 'free', 'active')
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
