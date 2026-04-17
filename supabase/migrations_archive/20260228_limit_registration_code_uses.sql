alter table public.admin_codes
  add column if not exists max_uses integer,
  add column if not exists use_count integer not null default 0;

alter table public.admin_codes
  drop constraint if exists admin_codes_max_uses_chk;

alter table public.admin_codes
  add constraint admin_codes_max_uses_chk
  check (max_uses is null or max_uses >= 1);

alter table public.admin_codes
  drop constraint if exists admin_codes_use_count_chk;

alter table public.admin_codes
  add constraint admin_codes_use_count_chk
  check (use_count >= 0);


update public.admin_codes
set use_count = case when is_used then 1 else 0 end
where use_count is null or use_count = 0;

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
    and (max_uses is null or coalesce(use_count, 0) < max_uses);

  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

create or replace function public.decrement_admin_code_use(p_code text, p_used_at timestamptz)
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
    use_count = greatest(coalesce(use_count, 0) - 1, 0),
    is_used = false,
    used_at = case
      when used_at = p_used_at then null
      else used_at
    end
  where code = p_code;

  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

revoke all on function public.claim_admin_code_use(text, timestamptz) from public;
revoke all on function public.decrement_admin_code_use(text, timestamptz) from public;
grant execute on function public.claim_admin_code_use(text, timestamptz) to service_role;
grant execute on function public.decrement_admin_code_use(text, timestamptz) to service_role;

update public.admin_codes
set
  max_uses = 20,
  is_used = coalesce(use_count, 0) >= 20
where code = 'TEST2024';
