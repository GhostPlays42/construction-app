-- Admins and platform owners get no extra powers until they confirm their
-- sign-in with an authenticator app code (aal2).
begin;
select plan(8);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin-a@test.local'),
  ('00000000-0000-0000-0000-0000000000a2', 'worker-a@test.local'),
  ('00000000-0000-0000-0000-0000000000b1', 'admin-b@test.local'),
  ('00000000-0000-0000-0000-0000000000c1', 'owner@test.local');

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
  ('20000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-00000000000a', 42.50);

insert into public.platform_owners (user_id) values ('00000000-0000-0000-0000-0000000000c1');

create function pg_temp.login(uid uuid, aal text) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated', 'aal', aal)::text, true);
  set local role authenticated;
$$;

-- Admin A after only email and password ------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000a1', 'aal1');
select results_eq('select count(*)::int from public.employee_rates', $$values (0)$$,
  'an admin without the app code cannot see hourly rates');
select throws_ok($$insert into public.employees (company_id, full_name)
  values ('10000000-0000-0000-0000-00000000000a', 'New Hire')$$,
  '42501', null, 'an admin without the app code cannot add people');
select results_eq('select count(*)::int from public.employees', $$values (2)$$,
  'an admin without the app code still sees their own crew list');

-- Admin A after the app code -------------------------------------------------
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000a1', 'aal2');
select results_eq('select count(*)::int from public.employee_rates', $$values (1)$$,
  'with the app code, the admin sees their company rates');
select lives_ok($$insert into public.employees (company_id, full_name)
  values ('10000000-0000-0000-0000-00000000000a', 'New Hire')$$,
  'with the app code, the admin can add people');

-- A missing aal claim counts as no app code ----------------------------------
reset role;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-0000000000a1', 'role', 'authenticated')::text, true);
set local role authenticated;
select results_eq('select count(*)::int from public.employee_rates', $$values (0)$$,
  'a session with no aal claim gets no admin powers');

-- Platform owner ---------------------------------------------------------------
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000c1', 'aal1');
select results_eq('select count(*)::int from public.companies', $$values (0)$$,
  'the platform owner without the app code sees no companies');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000c1', 'aal2');
select results_eq('select count(*)::int from public.companies', $$values (2)$$,
  'with the app code, the platform owner sees every company');

select * from finish();
rollback;
