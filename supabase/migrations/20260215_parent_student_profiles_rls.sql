-- Ensure parent can select/update linked student_profiles rows
-- using parent_user_id = auth.uid()

DO $$
BEGIN
  IF to_regclass('public.student_profiles') IS NULL THEN
    RAISE NOTICE 'Skipping migration 20260215_parent_student_profiles_rls: public.student_profiles does not exist yet.';
    RETURN;
  END IF;

  DROP POLICY IF EXISTS "student_profiles_select_own_or_parent" ON public.student_profiles;
  CREATE POLICY "student_profiles_select_own_or_parent"
    ON public.student_profiles FOR SELECT
    TO authenticated
    USING (
      auth.uid() = user_id
      OR auth.uid() = parent_user_id
    );

  DROP POLICY IF EXISTS "student_profiles_update_own_or_parent" ON public.student_profiles;
  CREATE POLICY "student_profiles_update_own_or_parent"
    ON public.student_profiles FOR UPDATE
    TO authenticated
    USING (
      auth.uid() = user_id
      OR auth.uid() = parent_user_id
    )
    WITH CHECK (
      auth.uid() = user_id
      OR auth.uid() = parent_user_id
    );
END;
$$;
