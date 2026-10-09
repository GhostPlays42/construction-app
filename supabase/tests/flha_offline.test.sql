-- FLHAs sent late from a phone that had no signal count for the day they
-- were filled in, up to two weeks back.
begin;
select plan(4);

insert into public.companies (id, name) values ('10000000-0000-0000-0000-00000000000a', 'Company A');
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a2', 'worker-a@test.local');
insert into public.employees (id, company_id, user_id, full_name, role_key) values
  ('20000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-00000000000a',
   '00000000-0000-0000-0000-0000000000a2', 'Worker A', 'employee');
insert into public.jobs (id, company_id, name) values
  ('30000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a', 'Highway 1');
insert into public.job_assignments (job_id, employee_id, company_id) values
  ('30000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-00000000000a');
insert into public.cost_codes (id, company_id, code, name) values
  ('50000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a', '200', 'Excavation');

create temporary table ids as select
  (select id from public.hazards where name = 'Noise') as noise,
  (select id from public.ppe_items where name = 'Hard hat') as hat;
grant select on ids to authenticated;

select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-0000000000a2', 'role', 'authenticated', 'aal', 'aal1')::text, true);
set local role authenticated;

create function pg_temp.submit(p_id uuid, p_at timestamptz) returns uuid language sql as $$
  select public.submit_flha(p_id, '30000000-0000-0000-0000-0000000000a1',
    array['50000000-0000-0000-0000-0000000000a1']::uuid[],
    jsonb_build_array(jsonb_build_object('hazard_id', (select noise from ids), 'control', 'Plugs')),
    '', '', array[(select hat from ids)], 'M1 1 L2 2', p_at)
$$;

select lives_ok($$select pg_temp.submit('60000000-0000-0000-0000-000000000001', now() - interval '3 days')$$,
  'an FLHA filled in three days ago is accepted');
select results_eq($$select work_date from public.flhas$$,
  $$values (((now() - interval '3 days') at time zone 'America/Vancouver')::date)$$,
  'it counts for the day it was filled in');
select lives_ok($$select pg_temp.submit('60000000-0000-0000-0000-000000000002', now() - interval '13 days')$$,
  'thirteen days ago is still accepted');
select throws_ok($$select pg_temp.submit('60000000-0000-0000-0000-000000000003', now() - interval '15 days')$$,
  'P0001', 'bad_time', 'more than two weeks ago is not');

select * from finish();
rollback;
