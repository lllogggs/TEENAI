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
