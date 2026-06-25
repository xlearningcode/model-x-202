
create table if not exists public.daily_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  usage_date date not null default (current_date at time zone 'utc'),
  message_count integer not null default 0,
  image_count integer not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, usage_date)
);

create index if not exists idx_daily_usage_user_date on public.daily_usage(user_id, usage_date);

alter table public.daily_usage enable row level security;

create policy "Users can view own usage"
  on public.daily_usage for select
  using (auth.uid() = user_id);

create policy "Service role can manage usage"
  on public.daily_usage for all
  using (auth.jwt()->>'role' = 'service_role');

-- RPC to increment usage and return updated counts (atomic upsert)
create or replace function public.increment_usage(
  p_user_id uuid,
  p_type text -- 'message' or 'image'
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_date date := (now() at time zone 'utc')::date;
  v_row public.daily_usage;
begin
  insert into public.daily_usage (user_id, usage_date, message_count, image_count)
  values (p_user_id, v_date, 0, 0)
  on conflict (user_id, usage_date) do nothing;

  if p_type = 'message' then
    update public.daily_usage
    set message_count = message_count + 1, updated_at = now()
    where user_id = p_user_id and usage_date = v_date
    returning * into v_row;
  elsif p_type = 'image' then
    update public.daily_usage
    set image_count = image_count + 1, updated_at = now()
    where user_id = p_user_id and usage_date = v_date
    returning * into v_row;
  end if;

  return jsonb_build_object(
    'message_count', v_row.message_count,
    'image_count', v_row.image_count,
    'usage_date', v_row.usage_date
  );
end;
$$;

-- RPC to get today's usage
create or replace function public.get_today_usage(p_user_id uuid)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_date date := (now() at time zone 'utc')::date;
  v_row public.daily_usage;
begin
  select * into v_row
  from public.daily_usage
  where user_id = p_user_id and usage_date = v_date;

  if not found then
    return jsonb_build_object('message_count', 0, 'image_count', 0, 'usage_date', v_date);
  end if;

  return jsonb_build_object(
    'message_count', v_row.message_count,
    'image_count', v_row.image_count,
    'usage_date', v_row.usage_date
  );
end;
$$;
