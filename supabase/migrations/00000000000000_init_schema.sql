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
  tone_level text not null default 'low' check (tone_level in ('low', 'medium', 'high')),
  topic_tags text[] not null default '{}',
  output_types text[] not null default '{}',
  summary text,
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
  add column if not exists summary text;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'chat_sessions'
      and column_name = 'session_summary'
  ) then
    update public.chat_sessions
    set summary = coalesce(summary, session_summary)
    where session_summary is not null;

    alter table public.chat_sessions
      drop column if exists session_summary;
  end if;
end;
$$;

alter table public.chat_sessions
  add column if not exists risk_level text not null default 'normal'
  check (risk_level in ('stable', 'normal', 'caution'));

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
