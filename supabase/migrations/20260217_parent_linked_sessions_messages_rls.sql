-- Supabase RLS: Parent can read linked student's sessions/messages
-- Goals:
-- 1) Students can read their own chat_sessions/messages
-- 2) Parents can read chat_sessions/messages of students linked by student_profiles.parent_user_id
-- 3) Writes remain student-focused (message inserts by student only)

begin;

-- =========================
-- 0) Ensure RLS enabled
-- =========================
alter table public.student_profiles enable row level security;
alter table public.chat_sessions enable row level security;
alter table public.messages enable row level security;

-- =========================
-- 1) Remove potentially conflicting policies
-- =========================
drop policy if exists "students_select_own_sessions" on public.chat_sessions;
drop policy if exists "parents_select_linked_sessions" on public.chat_sessions;
drop policy if exists "chat_sessions_select_student_or_parent" on public.chat_sessions;

drop policy if exists "students_select_own_messages" on public.messages;
drop policy if exists "parents_select_linked_messages" on public.messages;
drop policy if exists "messages_select_student_or_parent" on public.messages;
drop policy if exists "students_insert_own_messages" on public.messages;
drop policy if exists "messages_insert_student" on public.messages;
drop policy if exists "students_update_own_messages" on public.messages;

drop policy if exists "students_select_own_profile" on public.student_profiles;
drop policy if exists "parents_select_linked_student_profiles" on public.student_profiles;
drop policy if exists "student_profiles_select_own_or_parent" on public.student_profiles;

-- =========================
-- 2) student_profiles policies
-- =========================
create policy "students_select_own_profile"
on public.student_profiles
for select
to authenticated
using (user_id = auth.uid());

create policy "parents_select_linked_student_profiles"
on public.student_profiles
for select
to authenticated
using (parent_user_id = auth.uid());

-- =========================
-- 3) chat_sessions policies
-- =========================
create policy "students_select_own_sessions"
on public.chat_sessions
for select
to authenticated
using (student_id = auth.uid());

create policy "parents_select_linked_sessions"
on public.chat_sessions
for select
to authenticated
using (
  exists (
    select 1
    from public.student_profiles sp
    where sp.user_id = public.chat_sessions.student_id
      and sp.parent_user_id = auth.uid()
  )
);

-- =========================
-- 4) messages policies
-- =========================
create policy "students_select_own_messages"
on public.messages
for select
to authenticated
using (
  exists (
    select 1
    from public.chat_sessions cs
    where cs.id = public.messages.session_id
      and cs.student_id = auth.uid()
  )
);

create policy "parents_select_linked_messages"
on public.messages
for select
to authenticated
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

create policy "students_insert_own_messages"
on public.messages
for insert
to authenticated
with check (
  exists (
    select 1
    from public.chat_sessions cs
    where cs.id = public.messages.session_id
      and cs.student_id = auth.uid()
  )
);

-- =========================
-- 5) Performance indexes for policy joins
-- =========================
create index if not exists idx_student_profiles_parent_user_id on public.student_profiles(parent_user_id);
create index if not exists idx_student_profiles_user_id on public.student_profiles(user_id);
create index if not exists idx_chat_sessions_student_id on public.chat_sessions(student_id);
create index if not exists idx_messages_session_id on public.messages(session_id);

commit;
