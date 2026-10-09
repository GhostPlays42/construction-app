-- People screen rules: admins manage their own company's people, rates and
-- certifications; nobody can lock themselves out; a worker's phone login
-- follows their phone number.
begin;
select plan(16);

insert into public.companies (id, name) values
  ('10000000-0000-0000-0000-00000000000a', 'Company A'),
  ('10000000-0000-0000-0000-00000000000b', 'Company B');

insert into public.employees (id, company_id, full_name, phone, role_key) values
  ('20000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-00000000000a',
   'Worker A', '+15875550102', 'employee');
-- The worker signs in by phone, which links their login.
insert into auth.users (id, phone) values ('00000000-0000-0000-0000-0000000000a2', '15875550102');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin-a@test.local'),
  ('00000000-0000-0000-0000-0000000000b1', 'admin-b@test.local');
insert into public.employees (id, company_id, user_id, full_name, email, phone, role_key) values
  ('20000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a',
   '00000000-0000-0000-0000-0000000000a1', 'Admin A', 'admin-a@test.local', '+15875550101', 'admin'),
  ('20000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-00000000000b',
   '00000000-0000-0000-0000-0000000000b1', 'Admin B', 'admin-b@test.local', null, 'admin');

create function pg_temp.login(uid uuid, aal text) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated', 'aal', aal)::text, true);
  set local role authenticated;
$$;

select pg_temp.login('00000000-0000-0000-0000-0000000000a1', 'aal2');

-- Adding and editing people --------------------------------------------------
select lives_ok($$insert into public.employees (id, company_id, full_name, phone, trade)
  values ('20000000-0000-0000-0000-0000000000a3', '10000000-0000-0000-0000-00000000000a',
          'New Hire', '+15875550103', 'Labourer')$$, 'an admin adds a worker');
select lives_ok($$insert into public.employee_rates (employee_id, company_id, hourly_rate)
  values ('20000000-0000-0000-0000-0000000000a3', '10000000-0000-0000-0000-00000000000a', 31.25)$$,
  'an admin sets their hourly rate');
select lives_ok($$insert into public.certifications (company_id, employee_id, name, expires_on)
  values ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a3',
          'First Aid', '2027-01-31')$$, 'an admin adds a certification');
select throws_ok($$insert into public.employees (company_id, full_name)
  values ('10000000-0000-0000-0000-00000000000b', 'Sneaky')$$,
  '42501', null, 'an admin cannot add people to another company');
select results_eq($$select count(*)::int from public.employees
  where company_id = '10000000-0000-0000-0000-00000000000b'$$, $$values (0)$$,
  'an admin cannot see another company''s people');
select throws_ok($$insert into public.employee_rates (employee_id, company_id, hourly_rate)
  values ('20000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-00000000000b', 99)$$,
  '42501', null, 'an admin cannot set rates in another company');

-- No locking yourself out ----------------------------------------------------
select throws_ok($$update public.employees set is_active = false
  where id = '20000000-0000-0000-0000-0000000000a1'$$,
  'cannot_lock_yourself_out', 'an admin cannot switch off their own access');
select throws_ok($$update public.employees set role_key = 'employee'
  where id = '20000000-0000-0000-0000-0000000000a1'$$,
  'cannot_lock_yourself_out', 'an admin cannot remove their own admin role');
select lives_ok($$update public.employees set full_name = 'Admin Alpha', trade = 'Office'
  where id = '20000000-0000-0000-0000-0000000000a1'$$,
  'an admin can still edit their own name and trade');
select lives_ok($$update public.employees set is_active = false
  where id = '20000000-0000-0000-0000-0000000000a3'$$,
  'an admin can switch off someone else');

-- Phone changes --------------------------------------------------------------
select lives_ok($$update public.employees set phone = '+15875550199'
  where id = '20000000-0000-0000-0000-0000000000a2'$$,
  'an admin changes a signed-in worker''s phone');
reset role;
select results_eq($$select phone from auth.users where id = '00000000-0000-0000-0000-0000000000a2'$$,
  $$values ('15875550199'::text)$$, 'the worker''s phone login moves to the new number');

select pg_temp.login('00000000-0000-0000-0000-0000000000a1', 'aal2');
update public.employees set phone = '+15875550111'
  where id = '20000000-0000-0000-0000-0000000000a1';
reset role;
select results_eq($$select phone from auth.users where id = '00000000-0000-0000-0000-0000000000a1'$$,
  $$values (null::text)$$, 'an office login never gains a phone sign-in');

-- Workers -------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000a2', 'aal1');
select throws_ok($$insert into public.employees (company_id, full_name)
  values ('10000000-0000-0000-0000-00000000000a', 'Worker Hire')$$,
  '42501', null, 'a worker cannot add people');
select results_eq($$select count(*)::int from public.employee_rates$$, $$values (0)$$,
  'a worker cannot see hourly rates');
select is_empty($$update public.employees set trade = 'Boss'
  where id = '20000000-0000-0000-0000-0000000000a2' returning id$$,
  'a worker cannot edit their own record');
reset role;

select * from finish();
rollback;
