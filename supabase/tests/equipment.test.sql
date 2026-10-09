-- Equipment: admins manage their company's machines, rates and which jobs
-- they're on; workers see only machines on their own jobs and never rates;
-- nothing crosses companies.
begin;
select plan(20);

insert into public.companies (id, name) values
  ('10000000-0000-0000-0000-00000000000a', 'Company A'),
  ('10000000-0000-0000-0000-00000000000b', 'Company B');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin-a@test.local'),
  ('00000000-0000-0000-0000-0000000000a2', 'worker-a@test.local'),
  ('00000000-0000-0000-0000-0000000000a3', 'worker-a3@test.local'),
  ('00000000-0000-0000-0000-0000000000b1', 'admin-b@test.local');

insert into public.employees (id, company_id, user_id, full_name, role_key) values
  ('20000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a',
   '00000000-0000-0000-0000-0000000000a1', 'Admin A', 'admin'),
  ('20000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-00000000000a',
   '00000000-0000-0000-0000-0000000000a2', 'Worker A', 'employee'),
  ('20000000-0000-0000-0000-0000000000a3', '10000000-0000-0000-0000-00000000000a',
   '00000000-0000-0000-0000-0000000000a3', 'Worker A3', 'employee'),
  ('20000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-00000000000b',
   '00000000-0000-0000-0000-0000000000b1', 'Admin B', 'admin');

insert into public.jobs (id, company_id, name) values
  ('30000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a', 'Highway 1 Paving'),
  ('30000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-00000000000a', 'Shop Yard'),
  ('30000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-00000000000b', 'B Job');

insert into public.job_assignments (job_id, employee_id, company_id) values
  ('30000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a2',
   '10000000-0000-0000-0000-00000000000a');

insert into public.equipment (id, company_id, name) values
  ('40000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-00000000000b', 'B Loader');

create function pg_temp.login(uid uuid, aal text) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated', 'aal', aal)::text, true);
  set local role authenticated;
$$;

-- Admin A ---------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000a1', 'aal2');
select lives_ok($$insert into public.equipment (id, company_id, name, unit_number, equipment_type, make, model)
  values ('40000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a',
          'Excavator', 'EX-12', 'Excavator', 'CAT', '320')$$, 'an admin adds equipment');
select lives_ok($$insert into public.equipment (id, company_id, name, ownership, rental_company)
  values ('40000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-00000000000a',
          'Skid steer', 'rented', 'United Rentals')$$, 'an admin adds rented equipment');
select throws_ok($$insert into public.equipment (company_id, name, unit_number)
  values ('10000000-0000-0000-0000-00000000000a', 'Dup', 'ex-12')$$,
  '23505', null, 'unit numbers are unique in a company, ignoring case');
select throws_ok($$insert into public.equipment (company_id, name, rental_company)
  values ('10000000-0000-0000-0000-00000000000a', 'Owned truck', 'Somebody')$$,
  '23514', null, 'owned equipment has no rental company');
select throws_ok($$insert into public.equipment (company_id, name, ownership)
  values ('10000000-0000-0000-0000-00000000000a', 'Odd', 'leased')$$,
  '23514', null, 'equipment is owned or rented');
select throws_ok($$insert into public.equipment (company_id, name)
  values ('10000000-0000-0000-0000-00000000000b', 'Sneaky')$$,
  '42501', null, 'an admin cannot add equipment to another company');
select results_eq($$select count(*)::int from public.equipment$$, $$values (2)$$,
  'an admin sees only their company''s equipment');
select lives_ok($$insert into public.equipment_rates (equipment_id, company_id, hourly_rate)
  values ('40000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a', 145)$$,
  'an admin sets a rate');
select lives_ok($$update public.equipment set down_for_repair = true
  where id = '40000000-0000-0000-0000-0000000000a2'$$, 'an admin marks a machine down for repair');

select lives_ok($$select public.set_job_equipment('30000000-0000-0000-0000-0000000000a1',
  array['40000000-0000-0000-0000-0000000000a1', '40000000-0000-0000-0000-0000000000a2']::uuid[])$$,
  'an admin puts equipment on a job');
select lives_ok($$select public.set_job_equipment('30000000-0000-0000-0000-0000000000a1',
  array['40000000-0000-0000-0000-0000000000a1']::uuid[])$$, 'an admin changes a job''s equipment');
select results_eq($$select equipment_id from public.job_equipment
  where job_id = '30000000-0000-0000-0000-0000000000a1'$$,
  $$values ('40000000-0000-0000-0000-0000000000a1'::uuid)$$,
  'removed equipment is taken off the job');
select throws_ok($$select public.set_job_equipment('30000000-0000-0000-0000-0000000000a2',
  array['40000000-0000-0000-0000-0000000000b1']::uuid[])$$,
  '23503', null, 'another company''s equipment cannot be put on a job');
select throws_ok($$select public.set_job_equipment('30000000-0000-0000-0000-0000000000b1',
  array['40000000-0000-0000-0000-0000000000a1']::uuid[])$$,
  'job_not_found', 'an admin cannot touch another company''s job');
select throws_ok($$delete from public.equipment where id = '40000000-0000-0000-0000-0000000000a2' returning 1$$,
  '42501', null, 'equipment is never deleted');
reset role;

-- Worker A (on Highway 1, which has the excavator) ------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000a2', 'aal1');
select results_eq($$select name from public.equipment$$, $$values ('Excavator')$$,
  'a worker sees only equipment on their jobs');
select is_empty($$select 1 from public.equipment_rates$$, 'a worker never sees equipment rates');
select throws_ok($$select public.set_job_equipment('30000000-0000-0000-0000-0000000000a1', '{}'::uuid[])$$,
  '42501', null, 'a worker cannot change a job''s equipment');
select is_empty($$update public.equipment set down_for_repair = true returning 1$$,
  'a worker cannot change equipment');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000a3', 'aal1');
select is_empty($$select 1 from public.equipment$$, 'a worker on no job sees no equipment');
reset role;

select * from finish();
rollback;
