create or replace function public.sync_auth_user_to_public_users()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  metadata jsonb := coalesce(NEW.raw_user_meta_data, '{}'::jsonb);
  resolved_role text;
  resolved_name text;
begin
  resolved_role := case
    when metadata->>'role' in ('student', 'parent', 'admin') then metadata->>'role'
    else 'student'
  end;

  resolved_name := coalesce(nullif(trim(metadata->>'name'), ''), split_part(coalesce(NEW.email, ''), '@', 1), 'User');

  insert into public.users (id, email, role, name, subscription_expires_at)
  values (
    NEW.id,
    coalesce(NEW.email, ''),
    resolved_role,
    resolved_name,
    nullif(metadata->>'subscription_expires_at', '')::timestamptz
  )
  on conflict (id) do update
  set
    email = excluded.email,
    role = excluded.role,
    name = excluded.name,
    subscription_expires_at = coalesce(excluded.subscription_expires_at, public.users.subscription_expires_at);

  return NEW;
end;
$$;

drop trigger if exists trg_sync_auth_user_to_public_users on auth.users;
create trigger trg_sync_auth_user_to_public_users
after insert on auth.users
for each row
execute function public.sync_auth_user_to_public_users();

insert into public.users (id, email, role, name, subscription_expires_at)
select
  au.id,
  coalesce(au.email, ''),
  case
    when coalesce(au.raw_user_meta_data->>'role', '') in ('student', 'parent', 'admin') then au.raw_user_meta_data->>'role'
    else 'student'
  end,
  coalesce(nullif(trim(au.raw_user_meta_data->>'name'), ''), split_part(coalesce(au.email, ''), '@', 1), 'User'),
  nullif(au.raw_user_meta_data->>'subscription_expires_at', '')::timestamptz
from auth.users au
left join public.users pu on pu.id = au.id
where pu.id is null;
