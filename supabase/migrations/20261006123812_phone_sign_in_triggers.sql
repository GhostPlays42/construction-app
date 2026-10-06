-- Backstop and linking for phone sign-in (see the phone_sign_in migration).

-- Refuses to create a phone login no admin has added, even if the auth hook
-- is switched off.
create function private.guard_phone_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.phone_digits(new.phone) is not null
     and private.signup_employee_id(new.phone) is null then
    raise exception 'phone_not_registered'
      using hint = 'This phone number has not been added by a company admin.';
  end if;
  return new;
end;
$$;

-- Links a new phone login to the employee record it belongs to.
create function private.link_employee_login()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.phone_digits(new.phone) is not null then
    update public.employees
    set user_id = new.id
    where id = private.signup_employee_id(new.phone);
  end if;
  return new;
end;
$$;

create trigger guard_phone_signup
  before insert on auth.users
  for each row execute function private.guard_phone_signup();

create trigger link_employee_login
  after insert on auth.users
  for each row execute function private.link_employee_login();

revoke all on function private.guard_phone_signup() from public, authenticated;
revoke all on function private.link_employee_login() from public, authenticated;
