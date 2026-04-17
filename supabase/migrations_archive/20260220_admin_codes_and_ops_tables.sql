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
