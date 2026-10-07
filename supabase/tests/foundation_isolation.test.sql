-- Company isolation tests for the foundation tables.
-- Run with: npx supabase test db
begin;
select plan(23);

-- Two companies, each with an admin and a worker, plus a platform owner.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin-a@test.local'),
  ('00000000-0000-0000-0000-0000000000a2', 'worker-a@test.local'),
  ('00000000-0000-0000-0000-0000000000b1', 'admin-b@test.local'),
  ('00000000-0000-0000-0000-0000000000c1', 'owner@test.local'),
  ('00000000-0000-0000-0000-0000000000d1', 'nobody@test.local');

insert into public.companies (id, name) values
  ('10000000-0000-0000-0000-00000000000a', 'Company A'),
  ('10000000-0000-0000-0000-00000000000b', 'Company B');

insert into public.employees (id, company_id, user_id, full_name, role_key) values
  ('20000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a',
   '00000000-0000-0000-0000-0000000000a1', 'Admin A', 'admin'),
  ('20000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-00000000000a',
   '00000000-0000-0000-0000-0000000000a2', 'Worker A', 'employee'),
  ('20000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-00000000000b',
   '00000000-0000-0000-0000-0000000000b1', 'Admin B', 'admin');

insert into public.employee_rates (employee_id, company_id, hourly_rate) values
  ('20000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-00000000000a', 42.50),
  ('20000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-00000000000b', 60.00);

insert into public.certifications (company_id, employee_id, name, expires_on) values
  ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1', 'First Aid', '2027-01-01'),
  ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a2', 'Fall Protection', '2027-01-01'),
  ('10000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-0000000000b1', 'H2S Alive', '2027-01-01');

insert into public.platform_owners (user_id) values ('00000000-0000-0000-0000-0000000000c1');

-- Everyone here has finished sign-in, including the authenticator app
-- code for admins (aal2). admin_mfa.test.sql covers the aal1 case.
create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  set local role authenticated;
$$;

-- Admin A ---------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');

select results_eq('select name from public.companies', $$values ('Company A')$$,
  'admin A sees only company A');
select results_eq('select count(*)::int from public.employees', $$values (2)$$,
  'admin A sees only company A people');
select results_eq('select count(*)::int from public.employee_rates', $$values (1)$$,
  'admin A sees only company A rates');
select results_eq('select count(*)::int from public.certifications', $$values (2)$$,
  'admin A sees all company A certifications');

select lives_ok($$insert into public.employees (company_id, full_name)
  values ('10000000-0000-0000-0000-00000000000a', 'New Hire A')$$,
  'admin A can add a person to company A');
select throws_ok($$insert into public.employees (company_id, full_name)
  values ('10000000-0000-0000-0000-00000000000b', 'Sneaky')$$,
  '42501', null, 'admin A cannot add a person to company B');

update public.employees set full_name = 'Hacked' where id = '20000000-0000-0000-0000-0000000000b1';
select throws_ok($$update public.employees set company_id = '10000000-0000-0000-0000-00000000000b'
  where id = '20000000-0000-0000-0000-0000000000a2'$$,
  null, null, 'admin A cannot move a person to company B');

-- Worker A --------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000a2');

select results_eq('select count(*)::int from public.employee_rates', $$values (0)$$,
  'worker A cannot see any hourly rates, including their own');
select results_eq('select name from public.certifications', $$values ('Fall Protection')$$,
  'worker A sees only their own certifications');
select results_eq('select count(*)::int from public.employees', $$values (3)$$,
  'worker A sees the company A crew list');
select throws_ok($$insert into public.employees (company_id, full_name)
  values ('10000000-0000-0000-0000-00000000000a', 'Self Hire')$$,
  '42501', null, 'worker A cannot add people');
update public.employees set full_name = 'Renamed' where id = '20000000-0000-0000-0000-0000000000a1';
select throws_ok($$insert into public.employee_rates (employee_id, company_id, hourly_rate)
  values ('20000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a', 99)$$,
  '42501', null, 'worker A cannot set rates');

-- Back to a superuser view to check what actually changed.
reset role;
select results_eq($$select full_name from public.employees where id = '20000000-0000-0000-0000-0000000000b1'$$,
  $$values ('Admin B')$$, 'admin A''s update to a company B person changed nothing');
select results_eq($$select full_name from public.employees where id = '20000000-0000-0000-0000-0000000000a1'$$,
  $$values ('Admin A')$$, 'worker A''s update to a coworker changed nothing');

select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
update public.companies set status = 'active' where id = '10000000-0000-0000-0000-00000000000a';
reset role;
select results_eq($$select status from public.companies where id = '10000000-0000-0000-0000-00000000000a'$$,
  $$values ('trial')$$, 'admin A could not change their company status');

-- Signed in with no employee record --------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000d1');
select results_eq('select count(*)::int from public.companies', $$values (0)$$,
  'a login with no company sees no companies');
select results_eq('select count(*)::int from public.employees', $$values (0)$$,
  'a login with no company sees no people');

-- Not signed in -----------------------------------------------------------
reset role;
set local role anon;
select throws_ok('select count(*) from public.employees', '42501', null,
  'anonymous visitors cannot read people');

-- Inactive worker loses access immediately --------------------------------
reset role;
update public.employees set is_active = false where id = '20000000-0000-0000-0000-0000000000a2';
select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select results_eq('select count(*)::int from public.employees', $$values (0)$$,
  'an inactive worker sees nothing');
select results_eq('select count(*)::int from public.certifications', $$values (0)$$,
  'an inactive worker sees no certifications');

-- Suspended company loses access ------------------------------------------
reset role;
update public.companies set status = 'suspended' where id = '10000000-0000-0000-0000-00000000000b';
select pg_temp.login('00000000-0000-0000-0000-0000000000b1');
select results_eq('select count(*)::int from public.employees', $$values (0)$$,
  'admins of a suspended company see nothing');

-- Platform owner ------------------------------------------------------------
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
select results_eq('select count(*)::int from public.companies', $$values (2)$$,
  'the platform owner sees every company');
select results_eq('select count(*)::int from public.employee_rates', $$values (0)$$,
  'the platform owner does not see hourly rates');

select * from finish();
rollback;
