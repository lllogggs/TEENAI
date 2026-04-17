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
