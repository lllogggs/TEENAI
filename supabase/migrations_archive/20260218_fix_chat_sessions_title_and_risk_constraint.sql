-- Normalize legacy/null titles
update public.chat_sessions
set title = '새 대화'
where title is null or btrim(title) = '';

alter table public.chat_sessions
  alter column title set default '새 대화';

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
