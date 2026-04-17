-- Add risk level on sessions
alter table public.chat_sessions
  add column if not exists risk_level text not null default 'normal'
  check (risk_level in ('stable', 'normal', 'caution'));

-- Ensure parent invite code exists for all current/future parents
create or replace function public.generate_parent_invite_code()
returns text
language plpgsql
as $$
declare
  candidate text;
begin
  loop
    candidate := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    exit when not exists (select 1 from public.users where my_invite_code = candidate);
  end loop;

  return candidate;
end;
$$;

create or replace function public.ensure_parent_invite_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.role = 'parent' and (NEW.my_invite_code is null or NEW.my_invite_code = '') then
    NEW.my_invite_code := public.generate_parent_invite_code();
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_ensure_parent_invite_code on public.users;
create trigger trg_ensure_parent_invite_code
before insert or update on public.users
for each row
execute function public.ensure_parent_invite_code();

update public.users
set my_invite_code = public.generate_parent_invite_code()
where role = 'parent'
  and (my_invite_code is null or my_invite_code = '');
