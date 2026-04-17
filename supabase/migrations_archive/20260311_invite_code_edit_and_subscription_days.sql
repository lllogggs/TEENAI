alter table public.admin_codes
  add column if not exists is_active boolean not null default true,
  add column if not exists subscription_days integer not null default 31;

alter table public.admin_codes
  drop constraint if exists admin_codes_subscription_days_chk;

alter table public.admin_codes
  add constraint admin_codes_subscription_days_chk
  check (subscription_days >= 1 and subscription_days <= 3650);

update public.admin_codes
set subscription_days = 31
where subscription_days is null or subscription_days < 1;

update public.admin_codes
set is_active = true
where is_active is null;

create or replace function public.claim_admin_code_use(p_code text, p_used_at timestamptz)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  update public.admin_codes
  set
    use_count = coalesce(use_count, 0) + 1,
    is_used = case
      when max_uses is null then false
      else coalesce(use_count, 0) + 1 >= max_uses
    end,
    used_at = p_used_at
  where code = p_code
    and coalesce(is_active, true) = true
    and (expires_at is null or expires_at >= now())
    and (max_uses is null or coalesce(use_count, 0) < max_uses);

  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;
