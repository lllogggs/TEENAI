alter table public.chat_sessions
  add column if not exists title text not null default '새 대화';
