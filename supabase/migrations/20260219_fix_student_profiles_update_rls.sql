begin;

-- Keep student profile read policies deterministic
DROP POLICY IF EXISTS "students_select_own_profile" ON public.student_profiles;
CREATE POLICY "students_select_own_profile"
  ON public.student_profiles
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "parents_select_linked_student_profiles" ON public.student_profiles;
CREATE POLICY "parents_select_linked_student_profiles"
  ON public.student_profiles
  FOR SELECT
  TO authenticated
  USING (parent_user_id = auth.uid());

-- student_profiles update 정책 보강
DROP POLICY IF EXISTS "students_update_own_profile" ON public.student_profiles;
CREATE POLICY "students_update_own_profile"
  ON public.student_profiles
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "parents_update_linked_student_profiles" ON public.student_profiles;
CREATE POLICY "parents_update_linked_student_profiles"
  ON public.student_profiles
  FOR UPDATE
  TO authenticated
  USING (parent_user_id = auth.uid())
  WITH CHECK (parent_user_id = auth.uid());

-- Ensure session/message read policies stay aligned for parent-linked access
DROP POLICY IF EXISTS "students_select_own_sessions" ON public.chat_sessions;
CREATE POLICY "students_select_own_sessions"
  ON public.chat_sessions
  FOR SELECT
  TO authenticated
  USING (student_id = auth.uid());

DROP POLICY IF EXISTS "parents_select_linked_sessions" ON public.chat_sessions;
CREATE POLICY "parents_select_linked_sessions"
  ON public.chat_sessions
  FOR SELECT
  TO authenticated
  USING (
    exists (
      select 1
      from public.student_profiles sp
      where sp.user_id = public.chat_sessions.student_id
        and sp.parent_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "students_select_own_messages" ON public.messages;
CREATE POLICY "students_select_own_messages"
  ON public.messages
  FOR SELECT
  TO authenticated
  USING (
    exists (
      select 1
      from public.chat_sessions cs
      where cs.id = public.messages.session_id
        and cs.student_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "parents_select_linked_messages" ON public.messages;
CREATE POLICY "parents_select_linked_messages"
  ON public.messages
  FOR SELECT
  TO authenticated
  USING (
    exists (
      select 1
      from public.chat_sessions cs
      join public.student_profiles sp
        on sp.user_id = cs.student_id
      where cs.id = public.messages.session_id
        and sp.parent_user_id = auth.uid()
    )
  );

commit;
