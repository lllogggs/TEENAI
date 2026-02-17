begin;

alter table public.student_profiles enable row level security;
alter table public.chat_sessions enable row level security;
alter table public.messages enable row level security;

-- student_profiles: 학생/부모 SELECT
drop policy if exists "students_select_own_profile" on public.student_profiles;
create policy "students_select_own_profile"
on public.student_profiles for select to authenticated
using (user_id = auth.uid());

drop policy if exists "parents_select_linked_student_profiles" on public.student_profiles;
create policy "parents_select_linked_student_profiles"
on public.student_profiles for select to authenticated
using (parent_user_id = auth.uid());

-- student_profiles: 학생/부모 UPDATE (부모 대시보드 설정/표시명 저장에 필요)
drop policy if exists "students_update_own_profile" on public.student_profiles;
create policy "students_update_own_profile"
on public.student_profiles for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "parents_update_linked_student_profiles" on public.student_profiles;
create policy "parents_update_linked_student_profiles"
on public.student_profiles for update to authenticated
using (parent_user_id = auth.uid())
with check (parent_user_id = auth.uid());

-- chat_sessions: 학생/부모 SELECT
drop policy if exists "students_select_own_sessions" on public.chat_sessions;
create policy "students_select_own_sessions"
on public.chat_sessions for select to authenticated
using (student_id = auth.uid());

drop policy if exists "parents_select_linked_sessions" on public.chat_sessions;
create policy "parents_select_linked_sessions"
on public.chat_sessions for select to authenticated
using (
  exists (
    select 1
    from public.student_profiles sp
    where sp.user_id = public.chat_sessions.student_id
      and sp.parent_user_id = auth.uid()
  )
);

-- messages: 학생/부모 SELECT (핵심)
drop policy if exists "students_select_own_messages" on public.messages;
create policy "students_select_own_messages"
on public.messages for select to authenticated
using (
  exists (
    select 1
    from public.chat_sessions cs
    where cs.id = public.messages.session_id
      and cs.student_id = auth.uid()
  )
);

drop policy if exists "parents_select_linked_messages" on public.messages;
create policy "parents_select_linked_messages"
on public.messages for select to authenticated
using (
  exists (
    select 1
    from public.chat_sessions cs
    join public.student_profiles sp
      on sp.user_id = cs.student_id
    where cs.id = public.messages.session_id
      and sp.parent_user_id = auth.uid()
  )
);

-- messages: 학생 INSERT (필요 시)
drop policy if exists "students_insert_own_messages" on public.messages;
create policy "students_insert_own_messages"
on public.messages for insert to authenticated
with check (
  exists (
    select 1
    from public.chat_sessions cs
    where cs.id = public.messages.session_id
      and cs.student_id = auth.uid()
  )
);

-- 성능 인덱스
create index if not exists idx_student_profiles_parent_user_id on public.student_profiles(parent_user_id);
create index if not exists idx_student_profiles_user_id on public.student_profiles(user_id);
create index if not exists idx_chat_sessions_student_id on public.chat_sessions(student_id);
create index if not exists idx_messages_session_id on public.messages(session_id);

commit;
