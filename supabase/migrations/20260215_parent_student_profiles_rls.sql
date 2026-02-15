-- Ensure parent can select/update linked student_profiles rows
-- using parent_user_id = auth.uid()

drop policy if exists "student_profiles_select_own_or_parent" on public.student_profiles;
create policy "student_profiles_select_own_or_parent"
  on public.student_profiles for select
  to authenticated
  using (
    auth.uid() = user_id
    or auth.uid() = parent_user_id
  );

drop policy if exists "student_profiles_update_own_or_parent" on public.student_profiles;
create policy "student_profiles_update_own_or_parent"
  on public.student_profiles for update
  to authenticated
  using (
    auth.uid() = user_id
    or auth.uid() = parent_user_id
  )
  with check (
    auth.uid() = user_id
    or auth.uid() = parent_user_id
  );
