-- Baseline migration assembled from repository schema.sql and archived migrations.
-- Note: exact remote schema export was blocked because Docker Desktop is unavailable for supabase db pull.

-- TEENAI Supabase schema (run in Supabase SQL Editor)
create extension if not exists pgcrypto;

-- 1) App users profile table (linked to Supabase Auth)
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  role text not null check (role in ('student', 'parent')),
  name text not null,
  my_invite_code text unique,
  created_at timestamptz not null default now()
);

create index if not exists idx_users_role on public.users(role);
create index if not exists idx_users_invite_code on public.users(my_invite_code);

-- 2) Student profile / parent link
create table if not exists public.student_profiles (
  user_id uuid primary key references public.users(id) on delete cascade,
  invite_code text,
  parent_user_id uuid references public.users(id) on delete set null,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_student_profiles_parent_user_id
  on public.student_profiles(parent_user_id);

-- 3) Chat sessions for parent dashboard timeline
create table if not exists public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.users(id) on delete cascade,
  chat_mode text not null default 'conversation' check (chat_mode in ('conversation', 'study')),
  tone_level text not null default 'low' check (tone_level in ('low', 'medium', 'high')),
  title text not null default '?????,
  topic_tags text[] not null default '{}',
  output_types text[] not null default '{}',
  session_summary text,
  student_intent text,
  ai_intervention text,
  started_at timestamptz not null default now()
);

create index if not exists idx_chat_sessions_student_id_started_at
  on public.chat_sessions(student_id, started_at desc);

-- 4) Messages table (full raw transcript)
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.chat_sessions(id) on delete cascade,
  student_id uuid not null references public.users(id) on delete cascade,
  role text not null check (role in ('user', 'model')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_messages_session_id_created_at
  on public.messages(session_id, created_at asc);
create index if not exists idx_messages_student_id_created_at
  on public.messages(student_id, created_at desc);

-- 5) Safety alerts table
create table if not exists public.safety_alerts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.users(id) on delete cascade,
  message text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_safety_alerts_student_id_created_at
  on public.safety_alerts(student_id, created_at desc);

alter table public.users
  drop constraint if exists users_my_invite_code_format_chk;

alter table public.users
  add constraint users_my_invite_code_format_chk
  check (my_invite_code is null or my_invite_code ~ '^[A-Z0-9]{6}$');

-- ============================
-- Row Level Security (RLS)
-- ============================
alter table public.users enable row level security;
alter table public.student_profiles enable row level security;
alter table public.chat_sessions enable row level security;
alter table public.messages enable row level security;
alter table public.safety_alerts enable row level security;

-- users policies
 drop policy if exists "users_select_own" on public.users;
create policy "users_select_own"
  on public.users for select
  to authenticated
  using (auth.uid() = id);

 drop policy if exists "users_insert_own" on public.users;
create policy "users_insert_own"
  on public.users for insert
  to authenticated
  with check (auth.uid() = id);

 drop policy if exists "users_update_own" on public.users;
create policy "users_update_own"
  on public.users for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- student_profiles policies
 drop policy if exists "student_profiles_select_own_or_parent" on public.student_profiles;
create policy "student_profiles_select_own_or_parent"
  on public.student_profiles for select
  to authenticated
  using (
    auth.uid() = user_id
    or auth.uid() = parent_user_id
  );

 drop policy if exists "student_profiles_insert_own" on public.student_profiles;
create policy "student_profiles_insert_own"
  on public.student_profiles for insert
  to authenticated
  with check (auth.uid() = user_id);

 drop policy if exists "student_profiles_update_own" on public.student_profiles;
create policy "student_profiles_update_own"
  on public.student_profiles for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

 drop policy if exists "student_profiles_update_own_or_parent" on public.student_profiles;
create policy "student_profiles_update_own_or_parent"
  on public.student_profiles for update
  to authenticated
  using (auth.uid() = user_id or auth.uid() = parent_user_id)
  with check (auth.uid() = user_id or auth.uid() = parent_user_id);

-- chat_sessions policies
 drop policy if exists "chat_sessions_select_student_or_parent" on public.chat_sessions;
create policy "chat_sessions_select_student_or_parent"
  on public.chat_sessions for select
  to authenticated
  using (
    auth.uid() = student_id
    or exists (
      select 1 from public.student_profiles sp
      where sp.user_id = chat_sessions.student_id
        and sp.parent_user_id = auth.uid()
    )
  );

 drop policy if exists "chat_sessions_insert_student" on public.chat_sessions;
create policy "chat_sessions_insert_student"
  on public.chat_sessions for insert
  to authenticated
  with check (auth.uid() = student_id);

 drop policy if exists "chat_sessions_update_student" on public.chat_sessions;
create policy "chat_sessions_update_student"
  on public.chat_sessions for update
  to authenticated
  using (auth.uid() = student_id)
  with check (auth.uid() = student_id);

-- messages policies
 drop policy if exists "messages_select_student_or_parent" on public.messages;
create policy "messages_select_student_or_parent"
  on public.messages for select
  to authenticated
  using (
    auth.uid() = student_id
    or exists (
      select 1 from public.student_profiles sp
      where sp.user_id = messages.student_id
        and sp.parent_user_id = auth.uid()
    )
  );

 drop policy if exists "messages_insert_student" on public.messages;
create policy "messages_insert_student"
  on public.messages for insert
  to authenticated
  with check (auth.uid() = student_id);

-- safety_alerts policies
 drop policy if exists "safety_alerts_select_student_or_parent" on public.safety_alerts;
create policy "safety_alerts_select_student_or_parent"
  on public.safety_alerts for select
  to authenticated
  using (
    auth.uid() = student_id
    or exists (
      select 1 from public.student_profiles sp
      where sp.user_id = safety_alerts.student_id
        and sp.parent_user_id = auth.uid()
    )
  );

 drop policy if exists "safety_alerts_insert_student" on public.safety_alerts;
create policy "safety_alerts_insert_student"
  on public.safety_alerts for insert
  to authenticated
  with check (auth.uid() = student_id);

-- ============================
-- Additions for chat summary / risk / invite code resiliency
-- ============================
alter table public.chat_sessions
  add column if not exists risk_level text not null default 'normal'
  check (risk_level in ('stable', 'normal', 'caution'));

alter table public.chat_sessions
  add column if not exists chat_mode text not null default 'conversation';

update public.chat_sessions
set chat_mode = 'conversation'
where chat_mode is null;

alter table public.chat_sessions
  drop constraint if exists chat_sessions_chat_mode_check;

alter table public.chat_sessions
  add constraint chat_sessions_chat_mode_check
  check (chat_mode in ('conversation', 'study'));

create or replace function public.generate_parent_invite_code()
returns text
language plpgsql
as $$
declare
  candidate text;
begin
  loop
    candidate := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    exit when not exists (
      select 1
      from public.users
      where my_invite_code = candidate
    );
  end loop;

  return candidate;
end;
$$;

create or replace function public.ensure_parent_invite_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.role = 'parent' and (NEW.my_invite_code is null or NEW.my_invite_code = '') then
    NEW.my_invite_code := public.generate_parent_invite_code();
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_ensure_parent_invite_code on public.users;
create trigger trg_ensure_parent_invite_code
before insert or update on public.users
for each row
execute function public.ensure_parent_invite_code();

update public.users
set my_invite_code = public.generate_parent_invite_code()
where role = 'parent'
  and (my_invite_code is null or my_invite_code = '');


alter table public.chat_sessions
  add column if not exists title text not null default '?????;

-- >>> BEGIN 
20260215_chat_summary_and_invite_code.sql

-- Add risk level on sessions
alter table public.chat_sessions
  add column if not exists risk_level text not null default 'normal'
  check (risk_level in ('stable', 'normal', 'caution'));

-- Ensure parent invite code exists for all current/future parents
create or replace function public.generate_parent_invite_code()
returns text
language plpgsql
as $$
declare
  candidate text;
begin
  loop
    candidate := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    exit when not exists (select 1 from public.users where my_invite_code = candidate);
  end loop;

  return candidate;
end;
$$;

create or replace function public.ensure_parent_invite_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.role = 'parent' and (NEW.my_invite_code is null or NEW.my_invite_code = '') then
    NEW.my_invite_code := public.generate_parent_invite_code();
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_ensure_parent_invite_code on public.users;
create trigger trg_ensure_parent_invite_code
before insert or update on public.users
for each row
execute function public.ensure_parent_invite_code();

update public.users
set my_invite_code = public.generate_parent_invite_code()
where role = 'parent'
  and (my_invite_code is null or my_invite_code = '');

-- <<< END 
20260215_chat_summary_and_invite_code.sql


-- >>> BEGIN 
20260217_add_chat_title.sql

alter table public.chat_sessions
  add column if not exists title text not null default '?????;

-- <<< END 
20260217_add_chat_title.sql


-- >>> BEGIN 
20260218_fix_chat_sessions_title_and_risk_constraint.sql

-- Normalize legacy/null titles
update public.chat_sessions
set title = '?????
where title is null or btrim(title) = '';

alter table public.chat_sessions
  alter column title set default '?????;

alter table public.chat_sessions
  alter column title set not null;

-- Recreate risk level check to keep only product-supported buckets
alter table public.chat_sessions
  drop constraint if exists chat_sessions_risk_level_check;

-- Normalize legacy risk values if they existed
update public.chat_sessions
set risk_level = 'caution'
where risk_level in ('warn', 'high');

alter table public.chat_sessions
  add constraint chat_sessions_risk_level_check
  check (risk_level in ('stable', 'normal', 'caution'));

-- <<< END 
20260218_fix_chat_sessions_title_and_risk_constraint.sql


-- >>> BEGIN 
20260220_admin_codes_and_ops_tables.sql

-- Admin registration code table
create table if not exists public.admin_codes (
  code text primary key,
  is_used boolean not null default false,
  memo text,
  created_at timestamptz not null default now(),
  used_at timestamptz
);

-- System logs table
create table if not exists public.system_logs (
  id uuid primary key default gen_random_uuid(),
  level text not null check (level in ('error', 'warn', 'info')),
  message text not null,
  context jsonb,
  user_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- Optional operational fields
alter table public.users
  add column if not exists subscription_expires_at timestamptz;

update public.users
set subscription_expires_at = '9999-12-31 23:59:59+09'
where subscription_expires_at is null;

alter table public.chat_sessions
  add column if not exists is_deleted_by_student boolean not null default false;

-- RLS for operational tables
alter table public.admin_codes enable row level security;
alter table public.system_logs enable row level security;

drop policy if exists "system_logs_insert_authenticated" on public.system_logs;
create policy "system_logs_insert_authenticated"
  on public.system_logs for insert
  to authenticated
  with check (true);

-- admin_codes should not be readable from general clients.
-- access should happen via server-side service role or secured RPC only.
drop policy if exists "Enable read access for all users" on public.admin_codes;
drop policy if exists "Enable full access for service role" on public.admin_codes;
create policy "admin_codes_service_role_all"
  on public.admin_codes for all
  to service_role
  using (true)
  with check (true);

-- <<< END 
20260220_admin_codes_and_ops_tables.sql


-- >>> BEGIN 
20260228_limit_registration_code_uses.sql

alter table public.admin_codes
  add column if not exists max_uses integer,
  add column if not exists use_count integer not null default 0;

alter table public.admin_codes
  drop constraint if exists admin_codes_max_uses_chk;

alter table public.admin_codes
  add constraint admin_codes_max_uses_chk
  check (max_uses is null or max_uses >= 1);

alter table public.admin_codes
  drop constraint if exists admin_codes_use_count_chk;

alter table public.admin_codes
  add constraint admin_codes_use_count_chk
  check (use_count >= 0);


update public.admin_codes
set use_count = case when is_used then 1 else 0 end
where use_count is null or use_count = 0;

create or replace function public.claim_admin_code_use(p_code text, p_used_at timestamptz)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  update public.admin_codes
  set
    use_count = coalesce(use_count, 0) + 1,
    is_used = case
      when max_uses is null then false
      else coalesce(use_count, 0) + 1 >= max_uses
    end,
    used_at = p_used_at
  where code = p_code
    and (max_uses is null or coalesce(use_count, 0) < max_uses);

  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

create or replace function public.decrement_admin_code_use(p_code text, p_used_at timestamptz)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  update public.admin_codes
  set
    use_count = greatest(coalesce(use_count, 0) - 1, 0),
    is_used = false,
    used_at = case
      when used_at = p_used_at then null
      else used_at
    end
  where code = p_code;

  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

revoke all on function public.claim_admin_code_use(text, timestamptz) from public;
revoke all on function public.decrement_admin_code_use(text, timestamptz) from public;
grant execute on function public.claim_admin_code_use(text, timestamptz) to service_role;
grant execute on function public.decrement_admin_code_use(text, timestamptz) to service_role;

update public.admin_codes
set
  max_uses = 20,
  is_used = coalesce(use_count, 0) >= 20
where code = 'TEST2024';

-- <<< END 
20260228_limit_registration_code_uses.sql


-- >>> BEGIN 
20260309_admin_role_and_usage.sql

alter table public.users
  drop constraint if exists users_role_check;

alter table public.users
  add constraint users_role_check
  check (role in ('student', 'parent', 'admin'));

update public.users
set role = 'admin'
where lower(email) = 'hishersours7@gmail.com';

create table if not exists public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  endpoint text not null default 'chat',
  model text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  estimated_cost_usd numeric(12, 6) not null default 0,
  abuse_flag boolean not null default false,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_usage_events_user_created_at
  on public.ai_usage_events(user_id, created_at desc);
create index if not exists idx_ai_usage_events_created_at
  on public.ai_usage_events(created_at desc);

alter table public.ai_usage_events enable row level security;

drop policy if exists "ai_usage_events_service_role_all" on public.ai_usage_events;
create policy "ai_usage_events_service_role_all"
  on public.ai_usage_events for all
  to service_role
  using (true)
  with check (true);

alter table public.admin_codes
  add column if not exists expires_at timestamptz,
  add column if not exists auth_provider text,
  add column if not exists used_by_user_id uuid references auth.users(id),
  add column if not exists used_by_email text;

-- <<< END 
20260309_admin_role_and_usage.sql


-- >>> BEGIN 
20260309_sync_auth_users_to_public_users.sql

create or replace function public.sync_auth_user_to_public_users()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  metadata jsonb := coalesce(NEW.raw_user_meta_data, '{}'::jsonb);
  resolved_role text;
  resolved_name text;
begin
  resolved_role := case
    when metadata->>'role' in ('student', 'parent', 'admin') then metadata->>'role'
    else 'student'
  end;

  resolved_name := coalesce(nullif(trim(metadata->>'name'), ''), split_part(coalesce(NEW.email, ''), '@', 1), 'User');

  insert into public.users (id, email, role, name, subscription_expires_at)
  values (
    NEW.id,
    coalesce(NEW.email, ''),
    resolved_role,
    resolved_name,
    nullif(metadata->>'subscription_expires_at', '')::timestamptz
  )
  on conflict (id) do update
  set
    email = excluded.email,
    role = excluded.role,
    name = excluded.name,
    subscription_expires_at = coalesce(excluded.subscription_expires_at, public.users.subscription_expires_at);

  return NEW;
end;
$$;

drop trigger if exists trg_sync_auth_user_to_public_users on auth.users;
create trigger trg_sync_auth_user_to_public_users
after insert on auth.users
for each row
execute function public.sync_auth_user_to_public_users();

insert into public.users (id, email, role, name, subscription_expires_at)
select
  au.id,
  coalesce(au.email, ''),
  case
    when coalesce(au.raw_user_meta_data->>'role', '') in ('student', 'parent', 'admin') then au.raw_user_meta_data->>'role'
    else 'student'
  end,
  coalesce(nullif(trim(au.raw_user_meta_data->>'name'), ''), split_part(coalesce(au.email, ''), '@', 1), 'User'),
  nullif(au.raw_user_meta_data->>'subscription_expires_at', '')::timestamptz
from auth.users au
left join public.users pu on pu.id = au.id
where pu.id is null;

-- <<< END 
20260309_sync_auth_users_to_public_users.sql


-- >>> BEGIN 
20260311_invite_code_edit_and_subscription_days.sql

alter table public.admin_codes
  add column if not exists is_active boolean not null default true,
  add column if not exists subscription_days integer not null default 31;

alter table public.admin_codes
  drop constraint if exists admin_codes_subscription_days_chk;

alter table public.admin_codes
  add constraint admin_codes_subscription_days_chk
  check (subscription_days >= 1 and subscription_days <= 3650);

update public.admin_codes
set subscription_days = 31
where subscription_days is null or subscription_days < 1;

update public.admin_codes
set is_active = true
where is_active is null;

create or replace function public.claim_admin_code_use(p_code text, p_used_at timestamptz)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  update public.admin_codes
  set
    use_count = coalesce(use_count, 0) + 1,
    is_used = case
      when max_uses is null then false
      else coalesce(use_count, 0) + 1 >= max_uses
    end,
    used_at = p_used_at
  where code = p_code
    and coalesce(is_active, true) = true
    and (expires_at is null or expires_at >= now())
    and (max_uses is null or coalesce(use_count, 0) < max_uses);

  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

-- <<< END 
20260311_invite_code_edit_and_subscription_days.sql


-- >>> BEGIN 
20260320_add_chat_mode_to_sessions.sql

alter table public.chat_sessions
  add column if not exists chat_mode text not null default 'conversation';

update public.chat_sessions
set chat_mode = 'conversation'
where chat_mode is null;

alter table public.chat_sessions
  drop constraint if exists chat_sessions_chat_mode_check;

alter table public.chat_sessions
  add constraint chat_sessions_chat_mode_check
  check (chat_mode in ('conversation', 'study'));

-- <<< END 
20260320_add_chat_mode_to_sessions.sql


-- >>> BEGIN 
20260323_parent_push_and_subscription_extension.sql

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

-- <<< END 
20260323_parent_push_and_subscription_extension.sql


-- >>> BEGIN 
20260323_persistent_rate_limits.sql

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

-- <<< END 
20260323_persistent_rate_limits.sql

