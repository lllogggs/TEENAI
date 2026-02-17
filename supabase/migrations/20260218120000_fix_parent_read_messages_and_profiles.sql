BEGIN;

DO $$
BEGIN
  IF to_regclass('public.student_profiles') IS NULL
     OR to_regclass('public.chat_sessions') IS NULL
     OR to_regclass('public.messages') IS NULL THEN
    RAISE NOTICE 'Skipping migration 20260218120000_fix_parent_read_messages_and_profiles: required tables do not exist yet.';
    RETURN;
  END IF;

  ALTER TABLE public.student_profiles ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

  -- student_profiles: 학생/부모 SELECT
  DROP POLICY IF EXISTS "students_select_own_profile" ON public.student_profiles;
  CREATE POLICY "students_select_own_profile"
  ON public.student_profiles FOR SELECT TO authenticated
  USING (user_id = auth.uid());

  DROP POLICY IF EXISTS "parents_select_linked_student_profiles" ON public.student_profiles;
  CREATE POLICY "parents_select_linked_student_profiles"
  ON public.student_profiles FOR SELECT TO authenticated
  USING (parent_user_id = auth.uid());

  -- student_profiles: 학생/부모 UPDATE (부모 대시보드 설정/표시명 저장에 필요)
  DROP POLICY IF EXISTS "students_update_own_profile" ON public.student_profiles;
  CREATE POLICY "students_update_own_profile"
  ON public.student_profiles FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

  DROP POLICY IF EXISTS "parents_update_linked_student_profiles" ON public.student_profiles;
  CREATE POLICY "parents_update_linked_student_profiles"
  ON public.student_profiles FOR UPDATE TO authenticated
  USING (parent_user_id = auth.uid())
  WITH CHECK (parent_user_id = auth.uid());

  -- chat_sessions: 학생/부모 SELECT
  DROP POLICY IF EXISTS "students_select_own_sessions" ON public.chat_sessions;
  CREATE POLICY "students_select_own_sessions"
  ON public.chat_sessions FOR SELECT TO authenticated
  USING (student_id = auth.uid());

  DROP POLICY IF EXISTS "parents_select_linked_sessions" ON public.chat_sessions;
  CREATE POLICY "parents_select_linked_sessions"
  ON public.chat_sessions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.student_profiles sp
      WHERE sp.user_id = public.chat_sessions.student_id
        AND sp.parent_user_id = auth.uid()
    )
  );

  -- messages: 학생/부모 SELECT (핵심)
  DROP POLICY IF EXISTS "students_select_own_messages" ON public.messages;
  CREATE POLICY "students_select_own_messages"
  ON public.messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.chat_sessions cs
      WHERE cs.id = public.messages.session_id
        AND cs.student_id = auth.uid()
    )
  );

  DROP POLICY IF EXISTS "parents_select_linked_messages" ON public.messages;
  CREATE POLICY "parents_select_linked_messages"
  ON public.messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.chat_sessions cs
      JOIN public.student_profiles sp
        ON sp.user_id = cs.student_id
      WHERE cs.id = public.messages.session_id
        AND sp.parent_user_id = auth.uid()
    )
  );

  -- messages: 학생 INSERT (필요 시)
  DROP POLICY IF EXISTS "students_insert_own_messages" ON public.messages;
  CREATE POLICY "students_insert_own_messages"
  ON public.messages FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.chat_sessions cs
      WHERE cs.id = public.messages.session_id
        AND cs.student_id = auth.uid()
    )
  );

  -- 성능 인덱스
  CREATE INDEX IF NOT EXISTS idx_student_profiles_parent_user_id ON public.student_profiles(parent_user_id);
  CREATE INDEX IF NOT EXISTS idx_student_profiles_user_id ON public.student_profiles(user_id);
  CREATE INDEX IF NOT EXISTS idx_chat_sessions_student_id ON public.chat_sessions(student_id);
  CREATE INDEX IF NOT EXISTS idx_messages_session_id ON public.messages(session_id);
END;
$$;

COMMIT;
