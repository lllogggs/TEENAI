alter table public.users
  add column if not exists nickname text,
  add column if not exists birth_year int;

update public.users
set nickname = coalesce(nickname, name)
where nickname is null;

create table if not exists public.ai_message_reports (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  reporter_id uuid not null references public.users(id) on delete cascade,
  reason text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_message_reports_message_id_created_at
  on public.ai_message_reports(message_id, created_at desc);

create index if not exists idx_ai_message_reports_reporter_id_created_at
  on public.ai_message_reports(reporter_id, created_at desc);

alter table public.ai_message_reports enable row level security;

drop policy if exists "ai_message_reports_insert_reporter" on public.ai_message_reports;
create policy "ai_message_reports_insert_reporter"
  on public.ai_message_reports for insert
  to authenticated
  with check (auth.uid() = reporter_id);

drop policy if exists "ai_message_reports_select_reporter_or_parent" on public.ai_message_reports;
create policy "ai_message_reports_select_reporter_or_parent"
  on public.ai_message_reports for select
  to authenticated
  using (
    auth.uid() = reporter_id
    or exists (
      select 1
      from public.messages m
      join public.student_profiles sp on sp.user_id = m.student_id
      where m.id = ai_message_reports.message_id
        and sp.parent_user_id = auth.uid()
    )
  );
