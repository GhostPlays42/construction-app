-- A new company and its first admin are created when someone who signed up
-- on the sign-up page confirms their email, and at no other time.
begin;
select plan(12);

-- Signed up, email not confirmed yet: nothing is created.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000c1', 'owner@acme.test',
   '{"company_name": "  Acme Paving  ", "full_name": " Pat Acme "}');
select results_eq(
  $$select count(*)::int from public.companies$$,
  $$values (0)$$, 'no company before the email is confirmed');

-- Confirming the email creates the company and makes them its admin.
update auth.users set email_confirmed_at = now()
  where id = '00000000-0000-0000-0000-0000000000c1';
select results_eq(
  $$select name, status from public.companies$$,
  $$values ('Acme Paving', 'trial')$$, 'confirming creates the company, name trimmed');
select results_eq(
  $$select e.full_name, e.email::text, e.role_key, e.is_active
    from public.employees e where e.user_id = '00000000-0000-0000-0000-0000000000c1'$$,
  $$values ('Pat Acme', 'owner@acme.test', 'admin', true)$$,
  'the person who signed up is the company''s first admin');
select results_eq(
  $$select e.company_id from public.employees e
    where e.user_id = '00000000-0000-0000-0000-0000000000c1'$$,
  $$select id from public.companies where name = 'Acme Paving'$$,
  'the admin belongs to the new company');

-- Confirming again (for example after an email change) creates nothing more.
update auth.users set email_confirmed_at = null
  where id = '00000000-0000-0000-0000-0000000000c1';
update auth.users set email_confirmed_at = now()
  where id = '00000000-0000-0000-0000-0000000000c1';
select results_eq(
  $$select count(*)::int from public.companies$$,
  $$values (1)$$, 'a login that already has a company never gets a second one');

-- A login created already confirmed (email confirmation switched off).
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000c2', 'boss@bravo.test', now(),
   '{"company_name": "Bravo Excavating", "full_name": "Sam Bravo"}');
select results_eq(
  $$select count(*)::int from public.employees e join public.companies c on c.id = e.company_id
    where e.user_id = '00000000-0000-0000-0000-0000000000c2' and c.name = 'Bravo Excavating'$$,
  $$values (1)$$, 'a login created already confirmed also gets its company');

-- Email logins that did not come from the sign-up page get nothing.
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000c3', 'plain@test.local', now());
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000c4', 'blank@test.local', now(),
   '{"company_name": "   ", "full_name": "Blank Name"}');
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000c5', 'noname@test.local', now(),
   '{"company_name": "No Person Co"}');
select results_eq(
  $$select count(*)::int from public.companies$$,
  $$values (2)$$, 'no company without both a company name and a person''s name');

-- Very long names are cut to 100 characters rather than failing sign-up.
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000c6', 'long@test.local', now(),
   jsonb_build_object('company_name', repeat('x', 300), 'full_name', repeat('y', 300)));
select results_eq(
  $$select length(c.name), length(e.full_name) from public.employees e
    join public.companies c on c.id = e.company_id
    where e.user_id = '00000000-0000-0000-0000-0000000000c6'$$,
  $$values (100, 100)$$, 'long names are cut to 100 characters');

-- A worker who already belongs to a company never starts a new one, even if
-- they later confirm an email with sign-up details attached.
insert into public.companies (id, name, status) values
  ('10000000-0000-0000-0000-00000000000a', 'Company A', 'active');
insert into public.employees (id, company_id, full_name, phone) values
  ('20000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a', 'Worker', '+15875550101');
insert into auth.users (id, phone) values
  ('00000000-0000-0000-0000-0000000000a1', '15875550101');
update auth.users
  set email = 'worker@test.local', email_confirmed_at = now(),
      raw_user_meta_data = '{"company_name": "Sneaky Co", "full_name": "Worker"}'
  where id = '00000000-0000-0000-0000-0000000000a1';
select results_eq(
  $$select count(*)::int from public.companies where name = 'Sneaky Co'$$,
  $$values (0)$$, 'an existing worker cannot start a second company');
select results_eq(
  $$select company_id from public.employees where user_id = '00000000-0000-0000-0000-0000000000a1'$$,
  $$values ('10000000-0000-0000-0000-00000000000a'::uuid)$$,
  'the worker stays in their own company');

-- The new admin sees only their own company, and gets admin powers only
-- after the authenticator code (aal2), like every other admin.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object(
  'sub', '00000000-0000-0000-0000-0000000000c1', 'role', 'authenticated', 'aal', 'aal1')::text, true);
select results_eq(
  $$select name from public.companies$$,
  $$values ('Acme Paving')$$, 'the new admin sees only their own company');
select is(private.is_company_admin(), false, 'no admin powers before the authenticator code');
reset role;

select * from finish();
rollback;
