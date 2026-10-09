-- Safety meetings: anyone on a job runs one per job per day after their FLHA;
-- crew present sign or are tapped; it is saved once and never changed. Crew
-- see that it happened, signatures stay private, nothing crosses companies.
begin;
select plan(24);

insert into public.companies (id, name) values
  ('10000000-0000-0000-0000-00000000000a', 'Company A'),
  ('10000000-0000-0000-0000-00000000000b', 'Company B');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin-a@test.local'),
  ('00000000-0000-0000-0000-0000000000a2', 'worker-a@test.local'),
  ('00000000-0000-0000-0000-0000000000a3', 'worker-a3@test.local'),
  ('00000000-0000-0000-0000-0000000000a4', 'worker-a4@test.local'),
  ('00000000-0000-0000-0000-0000000000b1', 'admin-b@test.local');

insert into public.employees (id, company_id, user_id, full_name, role_key) values
  ('20000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a',
   '00000000-0000-0000-0000-0000000000a1', 'Admin A', 'admin'),
  ('20000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-00000000000a',
   '00000000-0000-0000-0000-0000000000a2', 'Worker A', 'employee'),
  ('20000000-0000-0000-0000-0000000000a3', '10000000-0000-0000-0000-00000000000a',
   '00000000-0000-0000-0000-0000000000a3', 'Worker A3', 'employee'),
  ('20000000-0000-0000-0000-0000000000a4', '10000000-0000-0000-0000-00000000000a',
   '00000000-0000-0000-0000-0000000000a4', 'Worker A4', 'employee'),
  ('20000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-00000000000b',
   '00000000-0000-0000-0000-0000000000b1', 'Admin B', 'admin');

insert into public.jobs (id, company_id, name, status) values
  ('30000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a', 'Highway 1', 'active'),
  ('30000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-00000000000a', 'Other job', 'active');

-- Workers A and A3 are on Highway 1; A4 is on the other job.
insert into public.job_assignments (job_id, employee_id, company_id) values
  ('30000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-00000000000a'),
  ('30000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a3', '10000000-0000-0000-0000-00000000000a'),
  ('30000000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-0000000000a4', '10000000-0000-0000-0000-00000000000a');

-- Worker A did today's FLHA; A3 didn't.
insert into public.flhas (id, company_id, job_id, employee_id, work_date, filled_at, signature) values
  ('60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a',
   '30000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a2',
   (now() at time zone 'America/Vancouver')::date, now() - interval '2 hours', 'M1 1');

create function pg_temp.login(uid uuid, aal text) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated', 'aal', aal)::text, true);
  set local role authenticated;
$$;

create temporary table ids as select
  (select id from public.hazards where company_id = '10000000-0000-0000-0000-00000000000a' and name = 'Noise') as noise,
  (select id from public.hazards where company_id = '10000000-0000-0000-0000-00000000000b' and name = 'Noise') as b_noise;
grant select on ids to authenticated;

-- Sends as the logged-in person with sensible defaults: Noise, a topic, and
-- Worker A signing with Worker A3 tapped. Each test changes one thing.
create function pg_temp.submit(
  p_id uuid,
  p_job uuid default '30000000-0000-0000-0000-0000000000a1',
  p_hazards uuid[] default null,
  p_other text default null,
  p_topic text default 'Working near traffic',
  p_crew jsonb default '[{"employee_id": "20000000-0000-0000-0000-0000000000a2", "signature": "M1 1 L5 5"},
                         {"employee_id": "20000000-0000-0000-0000-0000000000a3", "signature": null}]',
  p_at timestamptz default now() - interval '1 hour'
) returns uuid language sql as $$
  select public.submit_safety_meeting(p_id, p_job,
    coalesce(p_hazards, array[(select noise from ids)]), p_other, p_topic, p_crew, p_at)
$$;

-- Worker A3 (no FLHA) ----------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000a3', 'aal1');
select throws_ok($$select pg_temp.submit('90000000-0000-0000-0000-000000000009')$$,
  'P0001', 'flha_required', 'not before their own FLHA');

-- Worker A -----------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000a2', 'aal1');
select is((select count(*)::integer from public.my_job_crews()), 2, 'sees the crew of their own job only');
select throws_ok($$select pg_temp.submit('90000000-0000-0000-0000-000000000001',
  p_job => '30000000-0000-0000-0000-0000000000a2')$$,
  'P0001', 'job_not_available', 'not for a job they aren''t on');
select throws_ok($$select pg_temp.submit('90000000-0000-0000-0000-000000000001', p_hazards => '{}')$$,
  'P0001', 'hazard_required', 'needs a hazard');
select throws_ok($$select pg_temp.submit('90000000-0000-0000-0000-000000000001',
  p_hazards => array[(select b_noise from ids)])$$,
  'P0001', 'item_not_available', 'not another company''s hazard');
select throws_ok($$select pg_temp.submit('90000000-0000-0000-0000-000000000001', p_topic => '  ')$$,
  'P0001', 'topic_required', 'needs a topic');
select throws_ok($$select pg_temp.submit('90000000-0000-0000-0000-000000000001', p_crew => '[]')$$,
  'P0001', 'crew_required', 'needs someone present');
select throws_ok($$select pg_temp.submit('90000000-0000-0000-0000-000000000001', p_crew =>
  '[{"employee_id": "20000000-0000-0000-0000-0000000000a4", "signature": null}]')$$,
  'P0001', 'crew_changed', 'only crew on the job');
select throws_ok($$select pg_temp.submit('90000000-0000-0000-0000-000000000001',
  p_at => now() - interval '15 days')$$,
  'P0001', 'bad_time', 'not from a wrong phone clock');

select is(pg_temp.submit('90000000-0000-0000-0000-000000000001', p_other => 'Wasps'),
  '90000000-0000-0000-0000-000000000001'::uuid, 'a good meeting is saved');
select is((select string_agg(name || ':' || (signature is not null)::text, ',' order by position)
           from public.safety_meeting_attendees), 'Worker A:true,Worker A3:false',
  'who signed and who was tapped');
select is((select name from public.safety_meeting_hazards), 'Noise', 'hazard names copied in');
select is(pg_temp.submit('90000000-0000-0000-0000-000000000001'),
  '90000000-0000-0000-0000-000000000001'::uuid, 'sending the same meeting again is fine');
select is((select count(*)::integer from public.safety_meetings), 1, '... and saves it once');
select throws_ok($$select pg_temp.submit('90000000-0000-0000-0000-000000000002')$$,
  'P0001', 'already_done', 'one meeting per job per day');
select throws_ok($$update public.safety_meetings set topic = 'changed'$$,
  '42501', null, 'can''t be changed');

-- Worker A3 sees it happened and their own sign-off, not Worker A's signature.
select pg_temp.login('00000000-0000-0000-0000-0000000000a3', 'aal1');
select is((select count(*)::integer from public.safety_meetings), 1, 'the crew sees the meeting happened');
select is((select string_agg(name, ',') from public.safety_meeting_attendees), 'Worker A3',
  'crew see only their own sign-off');

-- Worker A4 is on a different job.
select pg_temp.login('00000000-0000-0000-0000-0000000000a4', 'aal1');
select is((select count(*)::integer from public.safety_meetings), 0, 'other crews don''t see it');
select is((select count(*)::integer from public.my_job_crews()), 1, 'and see only their own crew');

-- Admin A ----------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000a1', 'aal2');
select is((select count(*)::integer from public.safety_meeting_attendees), 2, 'admins see every sign-off');
select is((select other_hazard from public.safety_meetings), 'Wasps', '... and the other hazard');

-- Admin B ----------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000b1', 'aal2');
select is((select count(*)::integer from public.safety_meetings), 0, 'other companies see nothing');
select is((select count(*)::integer from public.safety_meeting_attendees), 0, '... not even sign-offs');

select * from finish();
rollback;
