-- Rules for the People screen.
--
-- 1. An admin can't switch off their own access or remove their own admin
--    role, so a company can't lock itself out by accident.
-- 2. When an admin changes a worker's phone number after the worker has
--    signed in, their phone login moves to the new number.

create function private.guard_self_lockout()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.user_id is not null and old.user_id = (select auth.uid()) then
    if old.is_active and not new.is_active then
      raise exception 'cannot_lock_yourself_out'
        using hint = 'You cannot switch off your own access.';
    end if;
    if new.role_key <> old.role_key
       and (select is_admin from public.roles where key = old.role_key)
       and not (select is_admin from public.roles where key = new.role_key) then
      raise exception 'cannot_lock_yourself_out'
        using hint = 'You cannot remove your own admin role.';
    end if;
  end if;
  return new;
end;
$$;

create trigger employees_guard_self_lockout
  before update on public.employees
  for each row execute function private.guard_self_lockout();

-- Only phone logins move: an office login (email and password) never gains
-- a phone sign-in this way.
create function private.sync_login_phone()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id is not null and new.phone is distinct from old.phone then
    update auth.users
    set phone = private.phone_digits(new.phone),
        phone_confirmed_at = null,
        updated_at = now()
    where id = new.user_id
      and email is null;
  end if;
  return new;
end;
$$;

revoke all on function private.sync_login_phone() from public, authenticated;

create trigger employees_sync_login_phone
  after update of phone on public.employees
  for each row execute function private.sync_login_phone();
