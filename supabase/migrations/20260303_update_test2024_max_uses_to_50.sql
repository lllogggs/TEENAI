update public.admin_codes
set
  max_uses = 50,
  is_used = case
    when coalesce(use_count, 0) < 50 then false
    else true
  end
where code = 'TEST2024';
