-- Only phones an admin has added can create a login, and the login is linked
-- to that employee record.
begin;
select plan(14);

insert into public.companies (id, name, status) values
  ('10000000-0000-0000-0000-00000000000a', 'Company A', 'active'),
  ('10000000-0000-0000-0000-00000000000b', 'Company B', 'suspended');

insert into public.employees (id, company_id, full_name, phone, is_active) values
  ('20000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a', 'Active Worker', '+15875550101', true),
  ('20000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-00000000000a', 'Inactive Worker', '+15875550102', false),
  ('20000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-00000000000b', 'Suspended Co Worker', '+15875550103', true),
  ('20000000-0000-0000-0000-0000000000a3', '10000000-0000-0000-0000-00000000000a', 'Other Worker', '+15875550104', true);

-- An unknown phone must be rejected even while other people are waiting
-- for their first login.
select throws_ok(
  $$insert into auth.users (id, phone) values ('00000000-0000-0000-0000-0000000000d0', '15875550198')$$,
  'phone_not_registered', 'an unknown phone is rejected while others are unlinked');
select results_eq(
  $$select count(*)::int from public.employees where user_id is not null$$,
  $$values (0)$$, 'a rejected phone links nobody');

select lives_ok(
  $$insert into auth.users (id, phone) values ('00000000-0000-0000-0000-0000000000a1', '15875550101')$$,
  'an added, active worker can create a login');
select results_eq(
  $$select user_id from public.employees where id = '20000000-0000-0000-0000-0000000000a1'$$,
  $$values ('00000000-0000-0000-0000-0000000000a1'::uuid)$$,
  'the new login is linked to their employee record');

select throws_ok(
  $$insert into auth.users (id, phone) values ('00000000-0000-0000-0000-0000000000d1', '15875550199')$$,
  'phone_not_registered', 'an unknown phone cannot create a login');
select throws_ok(
  $$insert into auth.users (id, phone) values ('00000000-0000-0000-0000-0000000000a2', '15875550102')$$,
  'phone_not_registered', 'an inactive worker cannot create a login');
select throws_ok(
  $$insert into auth.users (id, phone) values ('00000000-0000-0000-0000-0000000000b1', '15875550103')$$,
  'phone_not_registered', 'a worker at a suspended company cannot create a login');

select lives_ok(
  $$insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000e1', 'office@test.local')$$,
  'email logins are not affected by the phone check');

select throws_ok(
  $$insert into public.employees (company_id, full_name, phone)
    values ('10000000-0000-0000-0000-00000000000a', 'Bad Format', '587-555-0104')$$,
  '23514', null, 'phone numbers must be in international format');
select throws_ok(
  $$insert into public.employees (company_id, full_name, phone)
    values ('10000000-0000-0000-0000-00000000000b', 'Duplicate', '+15875550101')$$,
  '23505', null, 'the same phone cannot belong to two people');

-- The auth hook gives the same answer before a login is created.
select results_eq(
  $$select public.hook_before_user_created('{"user": {"phone": "15875550199"}}') -> 'error' ->> 'http_code'$$,
  $$values ('403')$$, 'the auth hook turns away an unknown phone');
select results_eq(
  $$select public.hook_before_user_created('{"user": {"phone": "15875550104"}}')$$,
  $$values ('{}'::jsonb)$$, 'the auth hook lets an added worker through');
select results_eq(
  $$select public.hook_before_user_created('{"user": {"email": "office@test.local"}}')$$,
  $$values ('{}'::jsonb)$$, 'the auth hook leaves email logins alone');

-- Signed in as the linked worker, they see their own company.
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-0000000000a1', 'role', 'authenticated')::text, true);
set local role authenticated;
select results_eq('select name from public.companies', $$values ('Company A')$$,
  'the linked worker sees their own company');

select * from finish();
rollback;
