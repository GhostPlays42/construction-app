-- Job sites: admins manage their company's jobs and crews; workers see only
-- the jobs they're assigned to; nothing crosses companies.
begin;
select plan(16);

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
  ('30000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-00000000000b', 'B Job');

create function pg_temp.login(uid uuid, aal text) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated', 'aal', aal)::text, true);
  set local role authenticated;
$$;

-- Admin A ---------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000a1', 'aal2');
select lives_ok($$insert into public.jobs (id, company_id, name, job_number, start_date, end_date)
  values ('30000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a',
          'Highway 1 Paving', 'J-101', '2026-10-01', '2026-12-15')$$, 'an admin adds a job');
select lives_ok($$insert into public.jobs (id, company_id, name)
  values ('30000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-00000000000a', 'Shop Yard')$$,
  'a second job');
select throws_ok($$insert into public.jobs (company_id, name, job_number)
  values ('10000000-0000-0000-0000-00000000000a', 'Dup', 'j-101')$$,
  '23505', null, 'job numbers are unique in a company, ignoring case');
select throws_ok($$insert into public.jobs (company_id, name, start_date, end_date)
  values ('10000000-0000-0000-0000-00000000000a', 'Backwards', '2026-10-10', '2026-10-01')$$,
  '23514', null, 'a job cannot end before it starts');
select throws_ok($$insert into public.jobs (company_id, name, status)
  values ('10000000-0000-0000-0000-00000000000a', 'Odd', 'cancelled')$$,
  '23514', null, 'status is active, paused or complete');
select throws_ok($$insert into public.jobs (company_id, name)
  values ('10000000-0000-0000-0000-00000000000b', 'Sneaky')$$,
  '42501', null, 'an admin cannot add a job to another company');
select results_eq($$select count(*)::int from public.jobs$$, $$values (2)$$,
  'an admin sees only their company''s jobs');

select lives_ok($$select public.set_job_crew('30000000-0000-0000-0000-0000000000a1',
  array['20000000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-0000000000a3']::uuid[])$$,
  'an admin assigns crew');
select lives_ok($$select public.set_job_crew('30000000-0000-0000-0000-0000000000a1',
  array['20000000-0000-0000-0000-0000000000a2']::uuid[])$$, 'an admin changes the crew');
select results_eq($$select employee_id from public.job_assignments
  where job_id = '30000000-0000-0000-0000-0000000000a1'$$,
  $$values ('20000000-0000-0000-0000-0000000000a2'::uuid)$$,
  'removed crew are taken off the job');
select throws_ok($$select public.set_job_crew('30000000-0000-0000-0000-0000000000a2',
  array['20000000-0000-0000-0000-0000000000b1']::uuid[])$$,
  '23503', null, 'someone from another company cannot be put on a job');
select throws_ok($$select public.set_job_crew('30000000-0000-0000-0000-0000000000b1',
  array['20000000-0000-0000-0000-0000000000a2']::uuid[])$$,
  'job_not_found', 'an admin cannot touch another company''s job');
select throws_ok($$delete from public.jobs where id = '30000000-0000-0000-0000-0000000000a2' returning 1$$,
  '42501', null, 'jobs are never deleted');
reset role;

-- Worker A (assigned to Highway 1 only) ---------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000a2', 'aal1');
select results_eq($$select name from public.jobs$$, $$values ('Highway 1 Paving')$$,
  'a worker sees only the jobs they are assigned to');
select throws_ok($$select public.set_job_crew('30000000-0000-0000-0000-0000000000a1',
  array['20000000-0000-0000-0000-0000000000a3']::uuid[])$$,
  '42501', null, 'a worker cannot change the crew on their own job');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000a3', 'aal1');
select is_empty($$select 1 from public.jobs$$, 'an unassigned worker sees no jobs');
reset role;

select * from finish();
rollback;
