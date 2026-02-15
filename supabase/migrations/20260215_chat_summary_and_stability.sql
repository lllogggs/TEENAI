-- [SQL_1_EXTENSIONS]
create extension if not exists pgcrypto;

-- [SQL_2_SESSION_COLUMNS]
alter table public.chat_sessions
  add column if not exists last_message_at timestamptz not null default now(),
  add column if not exists stability_label text not null default 'stable' check (stability_label in ('stable','normal','caution')),
  add column if not exists stability_reason text;

alter table public.chat_sessions
  add column if not exists summary text;

-- [SQL_3_MESSAGE_INSERT_TOUCH_SESSION]
create or replace function public.touch_session_last_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.chat_sessions
  set last_message_at = now()
  where id = new.session_id;
  return new;
end;
$$;

drop trigger if exists trg_touch_session_last_message on public.messages;
create trigger trg_touch_session_last_message
after insert on public.messages
for each row execute function public.touch_session_last_message();

-- [SQL_4_RLS_PARENT_CAN_READ]
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
