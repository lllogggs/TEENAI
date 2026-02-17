-- Unify legacy chat_sessions columns to the latest schema.

alter table public.chat_sessions
  add column if not exists summary text,
  add column if not exists risk_level text not null default 'normal',
  add column if not exists title text,
  add column if not exists title_source text,
  add column if not exists title_updated_at timestamptz,
  add column if not exists last_message_at timestamptz,
  add column if not exists last_activity_at timestamptz not null default now(),
  add column if not exists closed_at timestamptz;

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
      drop column session_summary;
  end if;
end;
$$;

update public.chat_sessions
set last_activity_at = coalesce(last_activity_at, last_message_at, started_at, now())
where last_activity_at is null;

update public.chat_sessions
set risk_level = 'normal'
where risk_level is null;

alter table public.chat_sessions
  drop constraint if exists chat_sessions_risk_level_check;

alter table public.chat_sessions
  add constraint chat_sessions_risk_level_check
  check (risk_level in ('stable', 'normal', 'caution', 'warn', 'high'));

create index if not exists idx_chat_sessions_last_activity_at
  on public.chat_sessions(last_activity_at desc);
