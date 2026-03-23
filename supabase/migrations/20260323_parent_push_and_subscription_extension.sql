create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema extensions;
create extension if not exists vault;

create table if not exists public.parent_push_tokens (
  id uuid primary key default gen_random_uuid(),
  parent_user_id uuid not null references public.users(id) on delete cascade,
  expo_push_token text not null,
  platform text not null default 'expo',
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (parent_user_id, expo_push_token)
);

create index if not exists idx_parent_push_tokens_parent_user_id
  on public.parent_push_tokens(parent_user_id);

alter table public.parent_push_tokens enable row level security;

create or replace function public.set_parent_push_tokens_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_parent_push_tokens_updated_at on public.parent_push_tokens;
create trigger trg_parent_push_tokens_updated_at
before update on public.parent_push_tokens
for each row
execute function public.set_parent_push_tokens_updated_at();

drop policy if exists "parent_push_tokens_select_own" on public.parent_push_tokens;
create policy "parent_push_tokens_select_own"
  on public.parent_push_tokens for select
  to authenticated
  using (auth.uid() = parent_user_id);

drop policy if exists "parent_push_tokens_insert_own" on public.parent_push_tokens;
create policy "parent_push_tokens_insert_own"
  on public.parent_push_tokens for insert
  to authenticated
  with check (
    auth.uid() = parent_user_id
    and exists (
      select 1
      from public.users u
      where u.id = auth.uid()
        and u.role = 'parent'
    )
  );

drop policy if exists "parent_push_tokens_update_own" on public.parent_push_tokens;
create policy "parent_push_tokens_update_own"
  on public.parent_push_tokens for update
  to authenticated
  using (auth.uid() = parent_user_id)
  with check (auth.uid() = parent_user_id);

drop policy if exists "parent_push_tokens_delete_own" on public.parent_push_tokens;
create policy "parent_push_tokens_delete_own"
  on public.parent_push_tokens for delete
  to authenticated
  using (auth.uid() = parent_user_id);

create or replace function public.invoke_parent_risk_push()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  project_url text := (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_project_url' limit 1);
  service_role_key text := (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_service_role_key' limit 1);
  request_body jsonb;
  target_student_id uuid;
begin
  if tg_table_name = 'chat_sessions' then
    if new.risk_level is distinct from 'caution' then
      return new;
    end if;

    if old.risk_level is not distinct from new.risk_level then
      return new;
    end if;

    target_student_id := new.student_id;
    request_body := jsonb_build_object(
      'event_type', 'chat_session_caution',
      'table', tg_table_name,
      'record', to_jsonb(new),
      'old_record', to_jsonb(old)
    );
  elsif tg_table_name = 'safety_alerts' then
    target_student_id := new.student_id;
    request_body := jsonb_build_object(
      'event_type', 'safety_alert_insert',
      'table', tg_table_name,
      'record', to_jsonb(new)
    );
  else
    return new;
  end if;

  if target_student_id is null then
    return new;
  end if;

  if project_url is null or service_role_key is null then
    raise warning 'Parent risk push webhook skipped because required vault secrets are missing.';
    return new;
  end if;

  perform net.http_post(
    url := project_url || '/functions/v1/send-parent-risk-alert',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_role_key
    ),
    body := request_body
  );

  return new;
end;
$$;

drop trigger if exists trg_chat_sessions_parent_risk_push on public.chat_sessions;
create trigger trg_chat_sessions_parent_risk_push
after update of risk_level on public.chat_sessions
for each row
when (new.risk_level = 'caution')
execute function public.invoke_parent_risk_push();

drop trigger if exists trg_safety_alerts_parent_risk_push on public.safety_alerts;
create trigger trg_safety_alerts_parent_risk_push
after insert on public.safety_alerts
for each row
execute function public.invoke_parent_risk_push();

create or replace function public.invoke_parent_daily_summary()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  project_url text := (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_project_url' limit 1);
  service_role_key text := (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_service_role_key' limit 1);
begin
  if project_url is null or service_role_key is null then
    raise warning 'Parent daily summary webhook skipped because required vault secrets are missing.';
    return;
  end if;

  perform net.http_post(
    url := project_url || '/functions/v1/send-parent-daily-summary',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_role_key
    ),
    body := jsonb_build_object(
      'target_date', (timezone('Asia/Seoul', now()))::date::text,
      'time_zone', 'Asia/Seoul',
      'deep_link', jsonb_build_object('url', '/parent')
    )
  );
end;
$$;

create or replace function public.get_parent_daily_chat_summary(p_target_date date, p_time_zone text default 'Asia/Seoul')
returns table (
  parent_user_id uuid,
  student_id uuid,
  student_name text,
  stable_count integer,
  normal_count integer,
  caution_count integer
)
language sql
security definer
set search_path = public
as $$
  with day_window as (
    select
      ((p_target_date::text || ' 00:00:00')::timestamp at time zone p_time_zone) as start_at,
      (((p_target_date + 1)::text || ' 00:00:00')::timestamp at time zone p_time_zone) as end_at
  )
  select
    sp.parent_user_id,
    cs.student_id,
    u.name as student_name,
    count(*) filter (where cs.risk_level = 'stable')::integer as stable_count,
    count(*) filter (where cs.risk_level = 'normal')::integer as normal_count,
    count(*) filter (where cs.risk_level = 'caution')::integer as caution_count
  from public.chat_sessions cs
  join public.student_profiles sp on sp.user_id = cs.student_id
  join public.users u on u.id = cs.student_id
  cross join day_window dw
  where sp.parent_user_id is not null
    and cs.started_at >= dw.start_at
    and cs.started_at < dw.end_at
  group by sp.parent_user_id, cs.student_id, u.name
  having count(*) > 0;
$$;

revoke all on function public.get_parent_daily_chat_summary(date, text) from public;
grant execute on function public.get_parent_daily_chat_summary(date, text) to service_role;

do $$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id
  from cron.job
  where jobname = 'parent-daily-summary-kst-2000'
  limit 1;

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;
end $$;

select cron.schedule(
  'parent-daily-summary-kst-2000',
  '0 11 * * *',
  $$select public.invoke_parent_daily_summary();$$
);
