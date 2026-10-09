-- Time cards: a worker sends one per job per day after that day's FLHA; the
-- work lines add up to the hours worked; the worker can change it until the
-- office approves it; every change is recorded; nothing crosses companies.
begin;
select plan(38);

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

insert into public.jobs (id, company_id, name, status) values
  ('30000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a', 'Highway 1', 'active'),
  ('30000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-00000000000a', 'Not my job', 'active');

insert into public.job_assignments (job_id, employee_id, company_id) values
  ('30000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-00000000000a'),
  ('30000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a3', '10000000-0000-0000-0000-00000000000a');

insert into public.cost_codes (id, company_id, code, name, is_active) values
  ('50000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a', '200', 'Excavation', true),
  ('50000000-0000-0000-0000-0000000000a3', '10000000-0000-0000-0000-00000000000a', '300', 'Paving', true),
  ('50000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-00000000000a', '900', 'Old code', false);

insert into public.equipment (id, company_id, name, unit_number) values
  ('70000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a', 'Excavator', 'EX-12'),
  ('70000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-00000000000a', 'Loader', null);
insert into public.job_equipment (job_id, equipment_id, company_id) values
  ('30000000-0000-0000-0000-0000000000a1', '70000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a');

-- Worker A did today's FLHA on Highway 1; Worker A3 didn't.
insert into public.flhas (id, company_id, job_id, employee_id, work_date, filled_at, signature) values
  ('60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a',
   '30000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a2',
   (now() at time zone 'America/Vancouver')::date, now() - interval '9 hours', 'M1 1');

create function pg_temp.login(uid uuid, aal text) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated', 'aal', aal)::text, true);
  set local role authenticated;
$$;

create function pg_temp.today() returns date language sql as $$
  select (now() at time zone 'America/Vancouver')::date
$$;

-- Sends as the logged-in person with sensible defaults: 7:00 to 15:00 with a
-- 30 minute break (7.5 hours) split 4h + 3.5h, and 2 hours on the excavator.
-- Each test changes one thing.
create function pg_temp.submit(
  p_id uuid,
  p_job uuid default '30000000-0000-0000-0000-0000000000a1',
  p_start time default '07:00',
  p_end time default '15:00',
  p_break integer default 30,
  p_lines jsonb default '[{"cost_code_id": "50000000-0000-0000-0000-0000000000a1", "minutes": 240, "description": "Dug the trench"},
                          {"cost_code_id": "50000000-0000-0000-0000-0000000000a3", "minutes": 210, "description": "Paved the lot"}]',
  p_equipment jsonb default '[{"equipment_id": "70000000-0000-0000-0000-0000000000a1", "minutes": 120}]',
  p_at timestamptz default now() - interval '1 hour',
  p_date date default null
) returns uuid language sql as $$
  select public.submit_time_card(p_id, p_job, coalesce(p_date, pg_temp.today()),
    p_start, p_end, p_break, p_lines, p_equipment, p_at)
$$;

-- Worker A3 (no FLHA) ------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000a3', 'aal1');
select throws_ok($$select pg_temp.submit('80000000-0000-0000-0000-000000000009')$$,
  'P0001', 'flha_required', 'not before that day''s FLHA');

-- Worker A -----------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000a2', 'aal1');
select throws_ok($$select pg_temp.submit('80000000-0000-0000-0000-000000000001',
  p_job => '30000000-0000-0000-0000-0000000000a2')$$,
  'P0001', 'job_not_available', 'not on a job they aren''t assigned to');
select throws_ok($$select pg_temp.submit('80000000-0000-0000-0000-000000000001', p_break => 0)$$,
  'P0001', 'hours_dont_match', 'work lines must add up to the hours worked');
select throws_ok($$select pg_temp.submit('80000000-0000-0000-0000-000000000001', p_start => '07:10')$$,
  'P0001', 'bad_times', 'times are in 15-minute steps');
select throws_ok($$select pg_temp.submit('80000000-0000-0000-0000-000000000001', p_end => '07:00')$$,
  'P0001', 'bad_times', 'start and end can''t be the same');
select throws_ok($$select pg_temp.submit('80000000-0000-0000-0000-000000000001', p_break => 600)$$,
  'P0001', 'bad_break', 'break can''t be longer than the shift');
select throws_ok($$select pg_temp.submit('80000000-0000-0000-0000-000000000001', p_lines => '[]')$$,
  'P0001', 'line_required', 'needs at least one work line');
select throws_ok($$select pg_temp.submit('80000000-0000-0000-0000-000000000001', p_lines =>
  '[{"cost_code_id": "50000000-0000-0000-0000-0000000000a1", "minutes": 450, "description": "  "}]')$$,
  'P0001', 'description_required', 'each line needs a description');
select throws_ok($$select pg_temp.submit('80000000-0000-0000-0000-000000000001', p_lines =>
  '[{"cost_code_id": "50000000-0000-0000-0000-0000000000a1", "minutes": 440, "description": "x"},
    {"cost_code_id": "50000000-0000-0000-0000-0000000000a3", "minutes": 10, "description": "x"}]')$$,
  'P0001', 'line_hours', 'line hours are in quarter hours');
select throws_ok($$select pg_temp.submit('80000000-0000-0000-0000-000000000001', p_lines =>
  '[{"cost_code_id": "50000000-0000-0000-0000-0000000000a2", "minutes": 450, "description": "x"}]')$$,
  'P0001', 'item_not_available', 'not a switched-off cost code');
select throws_ok($$select pg_temp.submit('80000000-0000-0000-0000-000000000001', p_equipment =>
  '[{"equipment_id": "70000000-0000-0000-0000-0000000000a2", "minutes": 60}]')$$,
  'P0001', 'item_not_available', 'only machines on the job');
select throws_ok($$select pg_temp.submit('80000000-0000-0000-0000-000000000001', p_equipment =>
  '[{"equipment_id": "70000000-0000-0000-0000-0000000000a1", "minutes": 480}]')$$,
  'P0001', 'equipment_too_long', 'machine hours can''t be more than hours worked');
select throws_ok($$select pg_temp.submit('80000000-0000-0000-0000-000000000001',
  p_date => pg_temp.today() - 2)$$,
  'P0001', 'bad_time', 'only for the day it was filled in or the day before');

select is(pg_temp.submit('80000000-0000-0000-0000-000000000001'),
  '80000000-0000-0000-0000-000000000001'::uuid, 'a good time card is saved');
select is((select worked_minutes from public.time_cards), 450, 'hours worked = end - start - break');
select is((select count(*)::integer from public.time_card_lines), 2, 'both work lines saved');
select is((select name from public.time_card_equipment), 'Excavator #EX-12', 'machine name copied in');

select is(pg_temp.submit('80000000-0000-0000-0000-000000000001'),
  '80000000-0000-0000-0000-000000000001'::uuid, 'sending the same copy again is fine');
select is((select count(*)::integer from public.time_cards), 1, '... and saves it once');

-- The worker changes it: all 7.5 hours on one line.
select lives_ok($$select pg_temp.submit('80000000-0000-0000-0000-000000000001',
  p_at => now() - interval '30 minutes', p_lines =>
  '[{"cost_code_id": "50000000-0000-0000-0000-0000000000a1", "minutes": 450, "description": "Dug all day"}]')$$,
  'the worker can change it before approval');
select is((select count(*)::integer from public.time_card_lines), 1, '... and the lines are replaced');

-- The older copy arrives late (a slow phone): ignored.
select is(pg_temp.submit('80000000-0000-0000-0000-000000000001', p_at => now() - interval '45 minutes'),
  '80000000-0000-0000-0000-000000000001'::uuid, 'an older copy arriving late is accepted...');
select is((select description from public.time_card_lines), 'Dug all day', '... but changes nothing');

select throws_ok($$select pg_temp.submit('80000000-0000-0000-0000-000000000002')$$,
  'P0001', 'already_done', 'one time card per job per day');
select is((select count(*)::integer from public.time_card_changes), 0, 'workers can''t see the change history');
select throws_ok($$insert into public.time_cards (id, company_id, job_id, employee_id, work_date,
  start_time, end_time, worked_minutes, filled_at) values ('80000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-0000000000a1',
  '20000000-0000-0000-0000-0000000000a2', current_date, '07:00', '08:00', 60, now())$$,
  '42501', null, 'workers can''t write time cards directly');
select throws_ok($$select public.approve_time_card('80000000-0000-0000-0000-000000000001')$$,
  'P0001', 'no_access', 'workers can''t approve');

select pg_temp.login('00000000-0000-0000-0000-0000000000a3', 'aal1');
select is((select count(*)::integer from public.time_cards), 0, 'workers can''t see each other''s time cards');

-- Admin A --------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000a1', 'aal1');
select throws_ok($$select public.approve_time_card('80000000-0000-0000-0000-000000000001')$$,
  'P0001', 'no_access', 'admins need their app code first');

select pg_temp.login('00000000-0000-0000-0000-0000000000a1', 'aal2');
select is((select field from public.time_card_changes), 'Work', 'the worker''s change was recorded');

-- The office edits: an overnight shift, a machine not on the job.
select lives_ok($$select public.update_time_card('80000000-0000-0000-0000-000000000001',
  '20:00', '04:00', 0,
  '[{"cost_code_id": "50000000-0000-0000-0000-0000000000a1", "minutes": 480, "description": "Night work"}]',
  '[{"equipment_id": "70000000-0000-0000-0000-0000000000a2", "minutes": 480}]')$$,
  'the office can edit, including machines not on the job');
select is((select worked_minutes from public.time_cards), 480, 'an overnight shift counts the hours past midnight');
select is((select array_agg(field order by id) from public.time_card_changes
           where changed_by = '20000000-0000-0000-0000-0000000000a1'),
  array['Start', 'End', 'Break', 'Work', 'Equipment'], 'each changed part is recorded');

select lives_ok($$select public.approve_time_card('80000000-0000-0000-0000-000000000001')$$, 'the office approves');
select is((select status from public.time_cards), 'approved', '... and it is approved');

select pg_temp.login('00000000-0000-0000-0000-0000000000a2', 'aal1');
select throws_ok($$select pg_temp.submit('80000000-0000-0000-0000-000000000001',
  p_at => now() - interval '10 minutes')$$,
  'P0001', 'already_approved', 'the worker can''t change it once approved');

-- Admin B --------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000b1', 'aal2');
select is((select count(*)::integer from public.time_cards), 0, 'other companies see nothing');
select throws_ok($$select public.update_time_card('80000000-0000-0000-0000-000000000001',
  '07:00', '08:00', 0, '[]', '[]')$$,
  'P0001', 'not_found', 'other companies can''t edit');

select * from finish();
rollback;
