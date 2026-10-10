-- Form builder: only the office makes and changes forms; changing the
-- questions makes a new version and answers keep theirs. Workers see the
-- forms on their jobs, send answers once (however often a phone retries),
-- only after their FLHA, and once a day for once-a-day forms. Answers are
-- checked against the questions. Report forms show in the daily report.
-- Nothing crosses companies.
begin;
select plan(45);

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
   '00000000-0000-0000-0000-0000000000a2', 'Joe Worker', 'employee'),
  ('20000000-0000-0000-0000-0000000000a3', '10000000-0000-0000-0000-00000000000a',
   '00000000-0000-0000-0000-0000000000a3', 'Sam Other', 'employee'),
  ('20000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-00000000000b',
   '00000000-0000-0000-0000-0000000000b1', 'Admin B', 'admin');

insert into public.jobs (id, company_id, name, status) values
  ('30000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a', 'Highway 1', 'active'),
  ('30000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-00000000000a', 'Bridge', 'active'),
  ('30000000-0000-0000-0000-0000000000a4', '10000000-0000-0000-0000-00000000000a', 'Road', 'active'),
  ('30000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-00000000000b', 'B job', 'active');

-- Joe is on Highway 1 and Bridge; Sam is on Highway 1.
insert into public.job_assignments (job_id, employee_id, company_id) values
  ('30000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-00000000000a'),
  ('30000000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-00000000000a'),
  ('30000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a3', '10000000-0000-0000-0000-00000000000a');

-- Joe has done today's FLHA on Highway 1 only.
insert into public.flhas (id, company_id, job_id, employee_id, work_date, filled_at, signature) values
  ('60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a',
   '30000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a2',
   (now() at time zone 'America/Vancouver')::date, now() - interval '2 hours', 'M1 1');

-- A photo Joe uploaded for his inspection answers.
insert into storage.objects (bucket_id, name, owner_id) values
  ('form-photos', '10000000-0000-0000-0000-00000000000a/50000000-0000-0000-0000-000000000001/70000000-0000-0000-0000-000000000001.jpg',
   '00000000-0000-0000-0000-0000000000a2');

create function pg_temp.login(uid uuid, aal text) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated', 'aal', aal)::text, true);
  set local role authenticated;
$$;

-- The questions used below.
create function pg_temp.inspection() returns jsonb language sql as $$
  select '[
    {"id": "a0000000-0000-0000-0000-000000000001", "type": "yes_no", "label": "Fire extinguisher on site?", "required": true},
    {"id": "a0000000-0000-0000-0000-000000000002", "type": "pick_one", "label": "Weather", "required": true,
     "options": ["Sunny", " Rain ", "", "Snow"]},
    {"id": "a0000000-0000-0000-0000-000000000003", "type": "short", "label": "  Notes  ", "required": false},
    {"id": "a0000000-0000-0000-0000-000000000004", "type": "photo", "label": "Photo of the gate"}
  ]'::jsonb
$$;

-- Ids the different people need, readable by all of them.
create temp table ids (name text primary key, id uuid);
grant select, insert on ids to authenticated;

-- Admin A ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000a1', 'aal2');

insert into ids select 'inspection', public.save_form(null, ' Daily inspection ', 'once_daily', true, false,
  array['30000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-0000000000a4']::uuid[], pg_temp.inspection());
select is((select name from public.forms where id = (select id from ids where name = 'inspection')),
  'Daily inspection', 'the office makes a form');
select is((select count(*)::integer from public.form_versions), 1, '... with its first version');
select is((select questions->1->'options' from public.form_versions),
  '["Sunny", "Rain", "Snow"]'::jsonb, '... options trimmed, blanks dropped');
select is((select questions->2 from public.form_versions),
  '{"id": "a0000000-0000-0000-0000-000000000003", "type": "short", "label": "Notes", "required": false}'::jsonb,
  '... and each question kept tidy');
select is((select array_agg(job_id order by job_id)::text from public.form_jobs),
  '{30000000-0000-0000-0000-0000000000a1,30000000-0000-0000-0000-0000000000a4}', '... on the jobs picked');

select lives_ok($$select public.save_form((select id from ids where name = 'inspection'), 'Daily inspection',
  'once_daily', true, false, array['30000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-0000000000a4']::uuid[],
  pg_temp.inspection())$$, 'saving with no changes');
select is((select count(*)::integer from public.form_versions), 1, '... makes no new version');

insert into ids select 'incident', public.save_form(null, 'Incident report', 'many', false, true, null,
  '[{"id": "b0000000-0000-0000-0000-000000000001", "type": "long", "label": "What happened?", "required": true}]');
select lives_ok($$select public.save_form((select id from ids where name = 'incident'), 'Incident report', 'many', false, true, null,
  '[{"id": "b0000000-0000-0000-0000-000000000001", "type": "long", "label": "What happened?", "required": true},
    {"id": "b0000000-0000-0000-0000-000000000002", "type": "signature", "label": "Sign", "required": true}]')$$,
  'changing the questions');
insert into ids select 'incident_v1', id from public.form_versions
where form_id = (select id from ids where name = 'incident') and version = 1;
select is((select max(version) from public.form_versions where form_id = (select id from ids where name = 'incident')), 2,
  '... makes version 2');
select is((select count(*)::integer from public.form_jobs where form_id = (select id from ids where name = 'incident')), 0,
  'a form on every job lists no jobs');

select throws_ok($$select public.save_form(null, 'DAILY INSPECTION', 'many', false, true, null,
  '[{"id": "c0000000-0000-0000-0000-000000000001", "type": "short", "label": "x"}]')$$,
  'P0001', 'name_taken', 'names are one per company');
select throws_ok($$select public.save_form(null, 'New', 'many', false, true, null,
  '[{"id": "c0000000-0000-0000-0000-000000000001", "type": "short", "label": "  "}]')$$,
  'P0001', 'label_required', 'every question needs words');
select throws_ok($$select public.save_form(null, 'New', 'many', false, true, null,
  '[{"id": "c0000000-0000-0000-0000-000000000001", "type": "pick_one", "label": "Pick", "options": ["Only one"]}]')$$,
  'P0001', 'options_required', 'a pick question needs two choices');
select throws_ok($$select public.save_form(null, 'New', 'many', false, true, null,
  '[{"id": "c0000000-0000-0000-0000-000000000001", "type": "pick_one", "label": "Pick", "options": ["Yes", "yes"]}]')$$,
  'P0001', 'options_repeat', '... that differ');
select throws_ok($$select public.save_form(null, 'New', 'many', false, true, null,
  '[{"id": "c0000000-0000-0000-0000-000000000001", "type": "drawing", "label": "x"}]')$$,
  'P0001', 'bad_question', 'only known question types');
select throws_ok($$select public.save_form(null, 'New', 'many', false, true, null, '[]')$$,
  'P0001', 'questions_required', 'a form needs a question');
select throws_ok($$select public.save_form(null, 'New', 'many', false, false,
  array['30000000-0000-0000-0000-0000000000b1']::uuid[],
  '[{"id": "c0000000-0000-0000-0000-000000000001", "type": "short", "label": "x"}]')$$,
  'P0001', 'job_not_found', 'only this company''s jobs');
select throws_ok($$update public.forms set name = 'x'$$, '42501', null, 'forms change only through save_form');

-- Joe -------------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000a2', 'aal1');
select throws_ok($$select public.save_form(null, 'Mine', 'many', false, true, null,
  '[{"id": "c0000000-0000-0000-0000-000000000001", "type": "short", "label": "x"}]')$$,
  'P0001', 'no_access', 'workers can''t make forms');
select is((select count(*)::integer from public.forms), 0, '... or read them directly');
select is((select string_agg(j.name || ':' || f.name, ',' order by j.name, f.name) from public.my_job_forms() f
           join (values ('30000000-0000-0000-0000-0000000000a1'::uuid, 'Highway 1'),
                        ('30000000-0000-0000-0000-0000000000a2'::uuid, 'Bridge')) j(id, name) on j.id = f.job_id),
  'Bridge:Incident report,Highway 1:Daily inspection,Highway 1:Incident report', 'he gets the forms on his jobs');
insert into ids select 'inspection_v', version_id from public.my_job_forms() where name = 'Daily inspection';

select throws_ok($$select public.submit_form('50000000-0000-0000-0000-000000000009', (select id from ids where name = 'inspection_v'),
  '30000000-0000-0000-0000-0000000000a2', '{}')$$, 'P0001', 'form_not_available', 'not on a job the form isn''t on');
select throws_ok($$select public.submit_form('50000000-0000-0000-0000-000000000009',
  (select version_id from public.my_job_forms() where name = 'Incident report' limit 1),
  '30000000-0000-0000-0000-0000000000a2', '{"b0000000-0000-0000-0000-000000000001": "x", "b0000000-0000-0000-0000-000000000002": "M1 1"}')$$,
  'P0001', 'flha_required', 'only after his FLHA');
select throws_ok($$select public.submit_form('50000000-0000-0000-0000-000000000001', (select id from ids where name = 'inspection_v'),
  '30000000-0000-0000-0000-0000000000a1', '{"a0000000-0000-0000-0000-000000000001": true}')$$,
  'P0001', 'answer_required', 'required questions need answers');
select throws_ok($$select public.submit_form('50000000-0000-0000-0000-000000000001', (select id from ids where name = 'inspection_v'),
  '30000000-0000-0000-0000-0000000000a1', '{"a0000000-0000-0000-0000-000000000001": true,
                                           "a0000000-0000-0000-0000-000000000002": "Hail"}')$$,
  'P0001', 'option_not_available', 'a pick must be one of the choices');
select throws_ok($$select public.submit_form('50000000-0000-0000-0000-000000000001', (select id from ids where name = 'inspection_v'),
  '30000000-0000-0000-0000-0000000000a1', '{"a0000000-0000-0000-0000-000000000001": "yes",
                                           "a0000000-0000-0000-0000-000000000002": "Rain"}')$$,
  'P0001', 'bad_answer', 'a yes/no is yes or no');
select throws_ok($$select public.submit_form('50000000-0000-0000-0000-000000000001', (select id from ids where name = 'inspection_v'),
  '30000000-0000-0000-0000-0000000000a1', '{"a0000000-0000-0000-0000-000000000001": true,
                                           "a0000000-0000-0000-0000-000000000002": "Rain",
                                           "d0000000-0000-0000-0000-000000000001": "extra"}')$$,
  'P0001', 'bad_answer', 'no answers to questions the form doesn''t have');
select throws_ok($$select public.submit_form('50000000-0000-0000-0000-000000000001', (select id from ids where name = 'inspection_v'),
  '30000000-0000-0000-0000-0000000000a1', '{"a0000000-0000-0000-0000-000000000001": true,
                                           "a0000000-0000-0000-0000-000000000002": "Rain",
                                           "a0000000-0000-0000-0000-000000000004": ["70000000-0000-0000-0000-000000000002"]}')$$,
  'P0001', 'photo_missing', 'photos must be uploaded first');

select lives_ok($$select public.submit_form('50000000-0000-0000-0000-000000000001', (select id from ids where name = 'inspection_v'),
  '30000000-0000-0000-0000-0000000000a1', '{"a0000000-0000-0000-0000-000000000001": true,
                                           "a0000000-0000-0000-0000-000000000002": "Rain",
                                           "a0000000-0000-0000-0000-000000000003": "  Gate was open  ",
                                           "a0000000-0000-0000-0000-000000000004": ["70000000-0000-0000-0000-000000000001"]}')$$,
  'he sends the inspection');
select is((select answers from public.form_submissions where id = '50000000-0000-0000-0000-000000000001'),
  '{"a0000000-0000-0000-0000-000000000001": true, "a0000000-0000-0000-0000-000000000002": "Rain",
    "a0000000-0000-0000-0000-000000000003": "Gate was open",
    "a0000000-0000-0000-0000-000000000004": ["10000000-0000-0000-0000-00000000000a/50000000-0000-0000-0000-000000000001/70000000-0000-0000-0000-000000000001.jpg"]}'::jsonb,
  '... answers tidied, photos kept by where they are');
select lives_ok($$select public.submit_form('50000000-0000-0000-0000-000000000001', (select id from ids where name = 'inspection_v'),
  '30000000-0000-0000-0000-0000000000a1', '{}')$$, 'sending again is fine');
select is((select count(*)::integer from public.form_submissions), 1, '... and saves it once');
select throws_ok($$select public.submit_form('50000000-0000-0000-0000-000000000002', (select id from ids where name = 'inspection_v'),
  '30000000-0000-0000-0000-0000000000a1', '{"a0000000-0000-0000-0000-000000000001": false,
                                           "a0000000-0000-0000-0000-000000000002": "Sunny"}')$$,
  'P0001', 'already_done', 'a once-a-day form is sent once per job per day');

-- Answers to the version his phone had, before the office changed the form.
select lives_ok($$select public.submit_form('50000000-0000-0000-0000-000000000003',
  (select id from ids where name = 'incident_v1'),
  '30000000-0000-0000-0000-0000000000a1', '{"b0000000-0000-0000-0000-000000000001": "Cut hand"}')$$,
  'answers to the older version still go');
select lives_ok($$select public.submit_form('50000000-0000-0000-0000-000000000004',
  (select version_id from public.my_job_forms() where name = 'Incident report' limit 1),
  '30000000-0000-0000-0000-0000000000a1', '{"b0000000-0000-0000-0000-000000000001": "Again",
                                           "b0000000-0000-0000-0000-000000000002": "M1 1 L5 5"}')$$,
  'an any-time form can be sent again');

-- Sam (on Highway 1) ----------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000a3', 'aal1');
select is((select string_agg(sent_by || ':' || mine, ',') from public.my_form_submissions(current_date - 1)),
  'Joe Worker:false', 'the crew sees the once-a-day form is done, not other answers');
select is((select count(*)::integer from public.form_submissions), 0, '... and can''t read Joe''s answers');
select is((select count(*)::integer from storage.objects where bucket_id = 'form-photos'), 0, '... or his photos');

-- Admin A ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000a1', 'aal2');
select is((select count(*)::integer from public.form_submissions), 3, 'the office sees every answer');
select is((select jsonb_path_query_array(c->'forms', '$[*].name')
           from public.daily_report_content('30000000-0000-0000-0000-0000000000a1',
                                            (now() at time zone 'America/Vancouver')::date) c),
  '["Daily inspection"]'::jsonb, 'report forms show in the daily report');
select is((select c->'forms'->0->'entries'->0->'answers'->1
           from public.daily_report_content('30000000-0000-0000-0000-0000000000a1',
                                            (now() at time zone 'America/Vancouver')::date) c),
  '{"label": "Weather", "type": "pick_one", "value": "Rain"}'::jsonb, '... each answer with its question');
select ok((select c->'missing' ? 'No Daily inspection'
           from public.daily_report_content('30000000-0000-0000-0000-0000000000a4',
                                            (now() at time zone 'America/Vancouver')::date) c),
  'a once-a-day report form not sent shows as missing');
select lives_ok($$select public.set_form_active((select id from ids where name = 'inspection'), false)$$,
  'switching a form off');

select pg_temp.login('00000000-0000-0000-0000-0000000000a2', 'aal1');
select is((select count(*)::integer from public.my_job_forms() where name = 'Daily inspection'), 0,
  '... takes it off workers'' phones');

-- Admin B ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000b1', 'aal2');
select is((select count(*)::integer from public.forms) + (select count(*)::integer from public.form_submissions), 0,
  'another company sees nothing');

select * from finish();
rollback;
