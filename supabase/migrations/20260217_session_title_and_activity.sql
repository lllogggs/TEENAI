alter table public.chat_sessions
  add column if not exists title text,
  add column if not exists title_source text,
  add column if not exists title_updated_at timestamptz,
  add column if not exists last_activity_at timestamptz not null default now(),
  add column if not exists closed_at timestamptz;

update public.chat_sessions
set last_activity_at = coalesce(last_activity_at, started_at, now())
where last_activity_at is null;

alter table public.chat_sessions
  drop constraint if exists chat_sessions_risk_level_check;

alter table public.chat_sessions
  add constraint chat_sessions_risk_level_check
  check (risk_level in ('stable', 'normal', 'caution', 'warn', 'high'));
