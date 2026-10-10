-- Daily reports: built from a job's day (time cards, FLHAs, safety meeting,
-- trucking slips, site photos), flags what's missing, ready at noon the next
-- day, finalized once by an admin and kept as it was. Admins only, and
-- nothing crosses companies.
begin;
select plan(24);

insert into public.companies (id, name) values
  ('10000000-0000-0000-0000-00000000000a', 'Company A'),
  ('10000000-0000-0000-0000-00000000000b', 'Company B');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin-a@test.local'),
  ('00000000-0000-0000-0000-0000000000a2', 'worker-a@test.local'),
  ('00000000-0000-0000-0000-0000000000a3', 'worker-a3@test.local'),
  ('00000000-0000-0000-0000-0000000000b1', 'admin-b@test.local');

insert into public.employees (id, company_id, user_id, full_name, role_key, trade) values
  ('20000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a',
   '00000000-0000-0000-0000-0000000000a1', 'Admin A', 'admin', null),
  ('20000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-00000000000a',
   '00000000-0000-0000-0000-0000000000a2', 'Joe Worker', 'employee', 'Labourer'),
  ('20000000-0000-0000-0000-0000000000a3', '10000000-0000-0000-0000-00000000000a',
   '00000000-0000-0000-0000-0000000000a3', 'Sam Operator', 'employee', 'Operator'),
  ('20000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-00000000000b',
   '00000000-0000-0000-0000-0000000000b1', 'Admin B', 'admin', null);

insert into public.jobs (id, company_id, name, job_number, status, start_date) values
  ('30000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a', 'Highway 1', 'J-1', 'active', '2026-01-01'),
  ('30000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-00000000000a', 'Paused job', null, 'paused', '2026-01-01');

insert into public.job_assignments (job_id, employee_id, company_id) values
  ('30000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-00000000000a'),
  ('30000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a3', '10000000-0000-0000-0000-00000000000a');

insert into public.cost_codes (id, company_id, code, name) values
  ('40000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a', '100', 'Mobilization'),
  ('40000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-00000000000a', '200', 'Excavation');

insert into public.equipment (id, company_id, name, unit_number) values
  ('50000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a', 'Excavator', 'EX-12');

-- The day reported on: two days ago, always past noon the next day.
create function pg_temp.day() returns date language sql as $$
  select (now() at time zone 'America/Vancouver')::date - 2
$$;

-- Joe did his FLHA and a time card (8 h: 6 h excavation, 2 h mobilization,
-- 5 h on the excavator), sent an unchecked slip and a site photo. Sam sent
-- nothing. No safety meeting.
insert into public.flhas (id, company_id, job_id, employee_id, work_date, filled_at, signature) values
  ('60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a',
   '30000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a2',
   pg_temp.day(), pg_temp.day() + time '07:00', 'M1 1');
insert into public.flha_tasks (flha_id, company_id, cost_code_id, code, name, position) values
  ('60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a',
   '40000000-0000-0000-0000-0000000000a2', '200', 'Excavation', 1);

insert into public.time_cards (id, company_id, job_id, employee_id, work_date, start_time, end_time,
                               break_minutes, worked_minutes, filled_at) values
  ('70000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a',
   '30000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a2',
   pg_temp.day(), '07:00', '15:30', 30, 480, pg_temp.day() + time '15:30');
insert into public.time_card_lines (time_card_id, company_id, position, cost_code_id, code, name, minutes, description) values
  ('70000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a', 1,
   '40000000-0000-0000-0000-0000000000a2', '200', 'Excavation', 360, 'Dug the trench'),
  ('70000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a', 2,
   '40000000-0000-0000-0000-0000000000a1', '100', 'Mobilization', 120, 'Moved the excavator');
insert into public.time_card_equipment (time_card_id, company_id, equipment_id, name, minutes, position) values
  ('70000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a',
   '50000000-0000-0000-0000-0000000000a1', 'Excavator', 300, 1);

insert into public.trucking_slips (id, company_id, job_id, employee_id, work_date, filled_at, photo_path,
                                   trucking_company, ticket_number, loads, tonnage) values
  ('90000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a',
   '30000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a2',
   pg_temp.day(), pg_temp.day() + time '10:00', 'a/slip.jpg', 'Smith Trucking', 'T-1', 3, 42.5);

insert into public.site_entries (id, company_id, job_id, employee_id, work_date, filled_at, notes) values
  ('80000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a',
   '30000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a2',
   pg_temp.day(), pg_temp.day() + time '12:00', 'Rain after lunch');
insert into public.site_photos (id, entry_id, company_id, position, path, caption) values
  ('81000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-00000000000a', 1, 'a/photo.jpg', 'Trench');

create function pg_temp.login(uid uuid, aal text) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated', 'aal', aal)::text, true);
  set local role authenticated;
$$;

create function pg_temp.report() returns jsonb language sql as $$
  select public.daily_report_content('30000000-0000-0000-0000-0000000000a1', pg_temp.day())
$$;

-- Worker -------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000a2', 'aal1');
select throws_ok($$select pg_temp.report()$$, 'P0001', 'no_access', 'workers can''t see reports');
select throws_ok($$select public.finalize_daily_report('30000000-0000-0000-0000-0000000000a1', pg_temp.day())$$,
  'P0001', 'no_access', '... or finalize them');
select is((select count(*)::integer from public.daily_report_days()), 0, '... or list them');

-- Admin A ------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000a1', 'aal2');
select is(pg_temp.report() -> 'job' ->> 'name', 'Highway 1', 'the header names the job');
select is((select string_agg(m ->> 'name' || ':' || (m ->> 'minutes') || ':' || (m ->> 'approved'), ',')
           from jsonb_array_elements(pg_temp.report() -> 'manpower') m),
  'Joe Worker:480:false', 'manpower lists each time card');
select is((pg_temp.report() ->> 'total_minutes')::integer, 480, '... with the total');
select is((select string_agg(c ->> 'code' || ':' || (c ->> 'minutes') || ':' || (c -> 'lines' -> 0 ->> 'description'), ',')
           from jsonb_array_elements(pg_temp.report() -> 'cost_codes') c),
  '100:120:Moved the excavator,200:360:Dug the trench', 'hours by cost code with every description');
select is((select string_agg(e ->> 'name' || ' ' || (e ->> 'unit_number') || ':' || (e ->> 'minutes'), ',')
           from jsonb_array_elements(pg_temp.report() -> 'equipment') e),
  'Excavator EX-12:300', 'equipment hours');
select is((select string_agg(f ->> 'name' || ':' || (f ->> 'done'), ',' order by f ->> 'name')
           from jsonb_array_elements(pg_temp.report() -> 'flhas') f),
  'Joe Worker:true,Sam Operator:false', 'who did and didn''t do their FLHA');
select ok(pg_temp.report() -> 'safety_meeting' = 'null'::jsonb, 'no safety meeting that day');
select is((select string_agg(s ->> 'ticket_number' || ':' || (s ->> 'checked'), ',')
           from jsonb_array_elements(pg_temp.report() -> 'trucking') s)
          || '|' || (pg_temp.report() ->> 'total_loads') || '|' || (pg_temp.report() ->> 'total_tonnage'),
  'T-1:false|3|42.5', 'trucking slips with totals');
select is(pg_temp.report() -> 'site_entries' -> 0 ->> 'notes', 'Rain after lunch', 'site notes');
select is(pg_temp.report() -> 'site_entries' -> 0 -> 'photos' -> 0 ->> 'caption', 'Trench', '... and photos');
select is(pg_temp.report() -> 'missing',
  '["No FLHA from Sam Operator", "No time card from Sam Operator", "Time card not approved: Joe Worker", "No safety meeting", "Trucking slip not checked: ticket T-1"]'::jsonb,
  'flags what''s missing');

select is((select string_agg(job_name, ',') from public.daily_report_days() where work_date = pg_temp.day()),
  'Highway 1', 'the list has active jobs, not paused ones with nothing sent');
select ok(not exists (select 1 from public.daily_report_days()
                      where work_date >= (now() at time zone 'America/Vancouver')::date),
  'today''s report isn''t ready yet');
select throws_ok($$select public.finalize_daily_report('30000000-0000-0000-0000-0000000000a1',
                                                        (now() at time zone 'America/Vancouver')::date)$$,
  'P0001', 'not_ready', 'can''t finalize before noon the next day');

select lives_ok($$select public.finalize_daily_report('30000000-0000-0000-0000-0000000000a1', pg_temp.day())$$,
  'the office finalizes a report');
select throws_ok($$select public.finalize_daily_report('30000000-0000-0000-0000-0000000000a1', pg_temp.day())$$,
  'P0001', 'already_finalized', 'once only');

-- Later changes don't touch the finalized report.
reset role;
update public.time_cards set status = 'approved', approved_at = now(),
  approved_by = '20000000-0000-0000-0000-0000000000a1';
select pg_temp.login('00000000-0000-0000-0000-0000000000a1', 'aal2');
select is((select content -> 'manpower' -> 0 ->> 'approved' from public.daily_reports), 'false',
  'a finalized report stays as it was');
select throws_ok($$update public.daily_reports set content = '{}'$$, '42501', null, 'and can''t be changed');

-- The PDF.
select throws_ok($$select public.set_daily_report_pdf((select id from public.daily_reports))$$,
  'P0001', 'pdf_missing', 'the PDF must be uploaded first');
select lives_ok($$insert into storage.objects (bucket_id, name, owner_id) values ('daily-reports',
  '10000000-0000-0000-0000-00000000000a/' || (select id from public.daily_reports) || '.pdf',
  '00000000-0000-0000-0000-0000000000a1');
  select public.set_daily_report_pdf((select id from public.daily_reports))$$, 'then it''s kept on the report');

-- Admin B ------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000b1', 'aal2');
select is((select count(*)::integer from public.daily_reports)
          + (select count(*)::integer from public.daily_report_days())
          + (select count(*)::integer from storage.objects where bucket_id = 'daily-reports'), 0,
  'other companies see nothing');

select * from finish();
rollback;
