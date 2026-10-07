-- Worker sign-in by phone number and text code.
--
-- Only a phone number an admin has added to an active employee record can
-- create a login. The check runs before the login is created, so an unknown
-- number is rejected before any text message is sent (and before we pay for
-- one). The new login is then linked to that employee record (see the
-- phone_sign_in_triggers migration).

-- Phone numbers are stored in international format, e.g. +15875551234.
alter table public.employees
  add constraint employees_phone_format
  check (phone ~ '^\+[1-9][0-9]{7,14}$');

-- One phone number means one login, and a login belongs to one company.
-- (This makes the older per-company phone index redundant; it is harmless
-- and can be dropped in a later tidy-up.)
create unique index employees_phone_key
  on public.employees (phone) where phone is not null;

-- Supabase Auth stores phones as digits only ("15875551234").
create function private.phone_digits(value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(regexp_replace(coalesce(value, ''), '[^0-9]', '', 'g'), '')
$$;

create function private.signup_employee_id(p_phone text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select e.id
  from public.employees e
  join public.companies c on c.id = e.company_id
  where private.phone_digits(e.phone) = private.phone_digits(p_phone)
    and e.is_active
    and e.user_id is null
    and c.status <> 'suspended'
$$;

revoke all on function private.phone_digits(text) from public;
revoke all on function private.signup_employee_id(text) from public, authenticated;

-- Auth hook that turns away unknown phones before Supabase tries to create a
-- login, so the sign-in screen gets a clear answer instead of a database
-- error. The trigger on auth.users stays as the backstop if the hook is off.
create function public.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  new_phone text := event -> 'user' ->> 'phone';
begin
  if private.phone_digits(new_phone) is not null
     and private.signup_employee_id(new_phone) is null then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 403,
      'message', 'phone_not_registered'));
  end if;
  return '{}'::jsonb;
end;
$$;

revoke all on function public.hook_before_user_created(jsonb) from public, anon, authenticated;
grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;
