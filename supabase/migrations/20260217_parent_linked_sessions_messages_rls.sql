-- Supabase RLS: Parent can read linked student's sessions/messages
-- Goals:
-- 1) Students can read their own chat_sessions/messages
-- 2) Parents can read chat_sessions/messages of students linked by student_profiles.parent_user_id
-- 3) Writes remain student-focused (message inserts by student only)

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.student_profiles') IS NULL
     OR to_regclass('public.chat_sessions') IS NULL
     OR to_regclass('public.messages') IS NULL THEN
    RAISE NOTICE 'Skipping migration 20260217_parent_linked_sessions_messages_rls: required tables do not exist yet.';
    RETURN;
  END IF;

  -- =========================
  -- 0) Ensure RLS enabled
  -- =========================
  ALTER TABLE public.student_profiles ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

  -- =========================
  -- 1) Remove potentially conflicting policies
  -- =========================
  DROP POLICY IF EXISTS "students_select_own_sessions" ON public.chat_sessions;
  DROP POLICY IF EXISTS "parents_select_linked_sessions" ON public.chat_sessions;
  DROP POLICY IF EXISTS "chat_sessions_select_student_or_parent" ON public.chat_sessions;

  DROP POLICY IF EXISTS "students_select_own_messages" ON public.messages;
  DROP POLICY IF EXISTS "parents_select_linked_messages" ON public.messages;
  DROP POLICY IF EXISTS "messages_select_student_or_parent" ON public.messages;
  DROP POLICY IF EXISTS "students_insert_own_messages" ON public.messages;
  DROP POLICY IF EXISTS "messages_insert_student" ON public.messages;
  DROP POLICY IF EXISTS "students_update_own_messages" ON public.messages;

  DROP POLICY IF EXISTS "students_select_own_profile" ON public.student_profiles;
  DROP POLICY IF EXISTS "parents_select_linked_student_profiles" ON public.student_profiles;
  DROP POLICY IF EXISTS "student_profiles_select_own_or_parent" ON public.student_profiles;

  -- =========================
  -- 2) student_profiles policies
  -- =========================
  CREATE POLICY "students_select_own_profile"
  ON public.student_profiles
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

  CREATE POLICY "parents_select_linked_student_profiles"
  ON public.student_profiles
  FOR SELECT
  TO authenticated
  USING (parent_user_id = auth.uid());

  -- =========================
  -- 3) chat_sessions policies
  -- =========================
  CREATE POLICY "students_select_own_sessions"
  ON public.chat_sessions
  FOR SELECT
  TO authenticated
  USING (student_id = auth.uid());

  CREATE POLICY "parents_select_linked_sessions"
  ON public.chat_sessions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.student_profiles sp
      WHERE sp.user_id = public.chat_sessions.student_id
        AND sp.parent_user_id = auth.uid()
    )
  );

  -- =========================
  -- 4) messages policies
  -- =========================
  CREATE POLICY "students_select_own_messages"
  ON public.messages
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.chat_sessions cs
      WHERE cs.id = public.messages.session_id
        AND cs.student_id = auth.uid()
    )
  );

  CREATE POLICY "parents_select_linked_messages"
  ON public.messages
  FOR SELECT
  TO authenticated
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

  CREATE POLICY "students_insert_own_messages"
  ON public.messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.chat_sessions cs
      WHERE cs.id = public.messages.session_id
        AND cs.student_id = auth.uid()
    )
  );

  -- =========================
  -- 5) Performance indexes for policy joins
  -- =========================
  CREATE INDEX IF NOT EXISTS idx_student_profiles_parent_user_id ON public.student_profiles(parent_user_id);
  CREATE INDEX IF NOT EXISTS idx_student_profiles_user_id ON public.student_profiles(user_id);
  CREATE INDEX IF NOT EXISTS idx_chat_sessions_student_id ON public.chat_sessions(student_id);
  CREATE INDEX IF NOT EXISTS idx_messages_session_id ON public.messages(session_id);
END;
$$;

COMMIT;
