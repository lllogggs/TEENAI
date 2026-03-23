create table if not exists public.api_rate_limits (
  key text primary key,
  count integer not null default 0,
  reset_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.consume_rate_limit(
  p_key text,
  p_max_requests integer,
  p_window_ms integer
)
returns table (
  allowed boolean,
  retry_after_sec integer,
  current_count integer,
  reset_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_window interval := ((greatest(p_window_ms, 1000))::text || ' milliseconds')::interval;
begin
  insert into public.api_rate_limits as rl (key, count, reset_at, created_at, updated_at)
  values (p_key, 1, v_now + v_window, v_now, v_now)
  on conflict (key) do update
    set count = case
      when rl.reset_at <= v_now then 1
      else rl.count + 1
    end,
        reset_at = case
      when rl.reset_at <= v_now then v_now + v_window
      else rl.reset_at
    end,
        updated_at = v_now;

  return query
  select
    (rl.count <= p_max_requests) as allowed,
    case
      when rl.count <= p_max_requests then 0
      else greatest(ceil(extract(epoch from (rl.reset_at - v_now)))::integer, 1)
    end as retry_after_sec,
    rl.count,
    rl.reset_at
  from public.api_rate_limits rl
  where rl.key = p_key;
end;
$$;

alter table public.api_rate_limits enable row level security;

drop policy if exists "api_rate_limits_service_role_all" on public.api_rate_limits;
create policy "api_rate_limits_service_role_all"
  on public.api_rate_limits for all
  to service_role
  using (true)
  with check (true);
