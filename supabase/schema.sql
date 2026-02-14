-- TEENAI Supabase schema (run in Supabase SQL Editor)
-- Required extension for random UUIDs
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
  session_summary text,
  student_intent text,
  ai_intervention text,
  started_at timestamptz not null default now()
);

create index if not exists idx_chat_sessions_student_id_started_at
  on public.chat_sessions(student_id, started_at desc);

-- 4) Safety alerts table
create table if not exists public.safety_alerts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.users(id) on delete cascade,
  message text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_safety_alerts_student_id_created_at
  on public.safety_alerts(student_id, created_at desc);

-- Optional: enforce 6-char invite code format when present
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
alter table public.safety_alerts enable row level security;

-- users: a logged-in user can see/update only own row
create policy if not exists "users_select_own"
  on public.users for select
  to authenticated
  using (auth.uid() = id);

create policy if not exists "users_insert_own"
  on public.users for insert
  to authenticated
  with check (auth.uid() = id);

create policy if not exists "users_update_own"
  on public.users for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- student_profiles:
-- - student can read/update own profile
-- - parent can read connected students' profiles
create policy if not exists "student_profiles_select_own_or_parent"
  on public.student_profiles for select
  to authenticated
  using (
    auth.uid() = user_id
    or auth.uid() = parent_user_id
  );

create policy if not exists "student_profiles_insert_own"
  on public.student_profiles for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy if not exists "student_profiles_update_own"
  on public.student_profiles for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- chat_sessions:
-- - student can insert/select own sessions
-- - parent can select connected student's sessions
create policy if not exists "chat_sessions_select_student_or_parent"
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

create policy if not exists "chat_sessions_insert_student"
  on public.chat_sessions for insert
  to authenticated
  with check (auth.uid() = student_id);

-- safety_alerts:
-- - student can insert/select own alerts
-- - parent can select connected student's alerts
create policy if not exists "safety_alerts_select_student_or_parent"
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

create policy if not exists "safety_alerts_insert_student"
  on public.safety_alerts for insert
  to authenticated
  with check (auth.uid() = student_id);
