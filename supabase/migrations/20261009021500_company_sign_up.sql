-- Company self sign-up.
--
-- Anyone can sign up a new company from the public sign-up page with their
-- email and a password. The company name and their name travel with the new
-- login. Once they confirm their email, the company is created and they
-- become its first admin. Nothing is created for an email nobody confirmed.

create function private.create_company_on_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  company_name text := left(trim(new.raw_user_meta_data ->> 'company_name'), 100);
  person_name  text := left(trim(new.raw_user_meta_data ->> 'full_name'), 100);
  new_company  uuid;
begin
  -- Only an email sign-up from the sign-up page, at the moment its email is
  -- confirmed, and only once: a login that already belongs to a company
  -- (such as a worker's phone login) is left alone.
  if new.email is null
     or new.email_confirmed_at is null
     or (tg_op = 'UPDATE' and old.email_confirmed_at is not null)
     or coalesce(company_name, '') = ''
     or coalesce(person_name, '') = ''
     or exists (select 1 from public.employees where user_id = new.id) then
    return new;
  end if;

  insert into public.companies (name)
  values (company_name)
  returning id into new_company;

  insert into public.employees (company_id, user_id, full_name, email, role_key)
  values (new_company, new.id, person_name, new.email, 'admin');

  return new;
end;
$$;

revoke all on function private.create_company_on_signup() from public, authenticated;

-- Covers both a later email confirmation and a login created already
-- confirmed (when email confirmation is switched off).
create trigger create_company_on_signup_insert
  after insert on auth.users
  for each row execute function private.create_company_on_signup();

create trigger create_company_on_signup_confirm
  after update of email_confirmed_at on auth.users
  for each row execute function private.create_company_on_signup();
