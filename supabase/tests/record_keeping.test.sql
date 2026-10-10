-- Record keeping: each company picks how long records are kept; the nightly
-- cleanup lists the files of anything older, then deletes the rows once the
-- files are gone. Only the office sets it, only the server cleans up, and
-- nothing crosses companies.
begin;
select plan(30);

insert into public.companies (id, name) values
  ('10000000-0000-0000-0000-00000000000a', 'Company A'),
  ('10000000-0000-0000-0000-00000000000b', 'Company B');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin-a@test.local'),
  ('00000000-0000-0000-0000-0000000000a2', 'worker-a@test.local'),
  ('00000000-0000-0000-0000-0000000000b1', 'admin-b@test.local');

insert into public.employees (id, company_id, user_id, full_name, role_key) values
  ('20000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a',
   '00000000-0000-0000-0000-0000000000a1', 'Admin A', 'admin'),
  ('20000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-00000000000a',
   '00000000-0000-0000-0000-0000000000a2', 'Joe Worker', 'employee'),
  ('20000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-00000000000b',
   '00000000-0000-0000-0000-0000000000b1', 'Admin B', 'admin');

insert into public.jobs (id, company_id, name, status, start_date) values
  ('30000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a', 'Highway 1', 'active', '2020-01-01'),
  ('30000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-00000000000b', 'B job', 'active', '2020-01-01');

insert into public.cost_codes (id, company_id, code, name) values
  ('40000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a', '100', 'Mobilization');

insert into public.forms (id, company_id, name) values
  ('41000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a', 'Inspection');
insert into public.form_versions (id, company_id, form_id, version, questions) values
  ('42000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a',
   '41000000-0000-0000-0000-0000000000a1', 1, '[]');

-- Old: three years ago. New: yesterday.
create function pg_temp.old() returns date language sql as $$
  select (now() at time zone 'America/Vancouver')::date - interval '3 years'
$$;
create function pg_temp.new() returns date language sql as $$
  select (now() at time zone 'America/Vancouver')::date - 1
$$;

-- One old and one new record of every kind for Joe on Highway 1 (ids ending
-- 1 are old, 2 are new), and one old FLHA at Company B.
insert into public.flhas (id, company_id, job_id, employee_id, work_date, filled_at, signature) values
  ('60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a',
   '30000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a2', pg_temp.old(), pg_temp.old(), 'M1 1'),
  ('60000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-00000000000a',
   '30000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a2', pg_temp.new(), pg_temp.new(), 'M1 1'),
  ('60000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-00000000000b',
   '30000000-0000-0000-0000-0000000000b1', '20000000-0000-0000-0000-0000000000b1', pg_temp.old(), pg_temp.old(), 'M1 1');
insert into public.flha_tasks (flha_id, company_id, cost_code_id, code, name, position) values
  ('60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a',
   '40000000-0000-0000-0000-0000000000a1', '100', 'Mobilization', 1);

insert into public.time_cards (id, company_id, job_id, employee_id, work_date, start_time, end_time,
                               break_minutes, worked_minutes, filled_at) values
  ('70000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a',
   '30000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a2',
   pg_temp.old(), '07:00', '15:30', 30, 480, pg_temp.old()),
  ('70000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-00000000000a',
   '30000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a2',
   pg_temp.new(), '07:00', '15:30', 30, 480, pg_temp.new());
insert into public.time_card_lines (time_card_id, company_id, position, cost_code_id, code, name, minutes, description) values
  ('70000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a', 1,
   '40000000-0000-0000-0000-0000000000a1', '100', 'Mobilization', 480, 'Moved in');

insert into public.safety_meetings (id, company_id, job_id, led_by, work_date, filled_at, topic) values
  ('71000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a',
   '30000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a2', pg_temp.old(), pg_temp.old(), 'Trenching'),
  ('71000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-00000000000a',
   '30000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a2', pg_temp.new(), pg_temp.new(), 'Trenching');

insert into public.trucking_slips (id, company_id, job_id, employee_id, work_date, filled_at, photo_path) values
  ('90000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a',
   '30000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a2', pg_temp.old(), pg_temp.old(),
   '10000000-0000-0000-0000-00000000000a/90000000-0000-0000-0000-000000000001.jpg'),
  ('90000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-00000000000a',
   '30000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a2', pg_temp.new(), pg_temp.new(),
   '10000000-0000-0000-0000-00000000000a/90000000-0000-0000-0000-000000000002.jpg');

insert into public.site_entries (id, company_id, job_id, employee_id, work_date, filled_at, notes) values
  ('80000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a',
   '30000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a2', pg_temp.old(), pg_temp.old(), 'Old'),
  ('80000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-00000000000a',
   '30000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a2', pg_temp.new(), pg_temp.new(), 'New');
insert into public.site_photos (id, entry_id, company_id, position, path) values
  ('81000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a', 1,
   '10000000-0000-0000-0000-00000000000a/80000000-0000-0000-0000-000000000001/81000000-0000-0000-0000-000000000001.jpg');

insert into public.form_submissions (id, company_id, form_id, version_id, form_name, job_id, employee_id,
                                     work_date, filled_at, answers) values
  ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a',
   '41000000-0000-0000-0000-0000000000a1', '42000000-0000-0000-0000-0000000000a1', 'Inspection',
   '30000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a2', pg_temp.old(), pg_temp.old(), '{}'),
  ('50000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-00000000000a',
   '41000000-0000-0000-0000-0000000000a1', '42000000-0000-0000-0000-0000000000a1', 'Inspection',
   '30000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a2', pg_temp.new(), pg_temp.new(), '{}');

-- The old message was removed by the office, so it no longer names its photo.
insert into public.chat_messages (id, company_id, job_id, employee_id, sender_name, body, created_at,
                                  removed_at, removed_by) values
  ('43000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a',
   '30000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a2', 'Joe Worker', null,
   pg_temp.old() + time '12:00', pg_temp.old() + time '13:00', '20000000-0000-0000-0000-0000000000a1'),
  ('43000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-00000000000a',
   '30000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a2', 'Joe Worker', 'Hi',
   now(), null, null);

insert into public.daily_reports (id, company_id, job_id, work_date, content, finalized_by, pdf_path) values
  ('44000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a',
   '30000000-0000-0000-0000-0000000000a1', pg_temp.old(), '{}', '20000000-0000-0000-0000-0000000000a1',
   '10000000-0000-0000-0000-00000000000a/44000000-0000-0000-0000-000000000001.pdf'),
  ('44000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-00000000000a',
   '30000000-0000-0000-0000-0000000000a1', pg_temp.new(), '{}', '20000000-0000-0000-0000-0000000000a1', null);

insert into public.dispatches (id, company_id, job_id, work_date, updated_by) values
  ('45000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a',
   '30000000-0000-0000-0000-0000000000a1', pg_temp.old(), '20000000-0000-0000-0000-0000000000a1'),
  ('45000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-00000000000a',
   '30000000-0000-0000-0000-0000000000a1', pg_temp.new(), '20000000-0000-0000-0000-0000000000a1');
insert into public.dispatch_people (dispatch_id, company_id, employee_id) values
  ('45000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a2');
insert into public.schedule_entries (company_id, employee_id, work_date, job_id) values
  ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a2', pg_temp.old(), '30000000-0000-0000-0000-0000000000a1'),
  ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a2', pg_temp.new(), '30000000-0000-0000-0000-0000000000a1');

-- Files for the old slip, site photo, form photo, chat photo and report PDF,
-- one for the new slip, and a site photo at Company B with an A-like path.
insert into storage.objects (bucket_id, name, owner_id) values
  ('slip-photos', '10000000-0000-0000-0000-00000000000a/90000000-0000-0000-0000-000000000001.jpg', '00000000-0000-0000-0000-0000000000a2'),
  ('slip-photos', '10000000-0000-0000-0000-00000000000a/90000000-0000-0000-0000-000000000002.jpg', '00000000-0000-0000-0000-0000000000a2'),
  ('site-photos', '10000000-0000-0000-0000-00000000000a/80000000-0000-0000-0000-000000000001/81000000-0000-0000-0000-000000000001.jpg', '00000000-0000-0000-0000-0000000000a2'),
  ('form-photos', '10000000-0000-0000-0000-00000000000a/50000000-0000-0000-0000-000000000001/x.jpg', '00000000-0000-0000-0000-0000000000a2'),
  ('chat-photos', '10000000-0000-0000-0000-00000000000a/30000000-0000-0000-0000-0000000000a1/43000000-0000-0000-0000-000000000001.jpg', '00000000-0000-0000-0000-0000000000a2'),
  ('daily-reports', '10000000-0000-0000-0000-00000000000a/44000000-0000-0000-0000-000000000001.pdf', '00000000-0000-0000-0000-0000000000a1'),
  ('site-photos', '10000000-0000-0000-0000-00000000000b/80000000-0000-0000-0000-000000000001/y.jpg', '00000000-0000-0000-0000-0000000000b1');

create function pg_temp.login(uid uuid, aal text) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated', 'aal', aal)::text, true);
  set local role authenticated;
$$;

select is((select keep_years from public.companies where id = '10000000-0000-0000-0000-00000000000a'), 7,
          'companies keep records for 7 years to start');

-- The setting -----------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000a2', 'aal1');
select throws_ok($$select public.set_keep_years(2)$$, 'P0001', 'no_access', 'a worker can''t change it');
select throws_ok($$select public.retention_preview(2)$$, 'P0001', 'no_access', 'a worker can''t preview it');

select pg_temp.login('00000000-0000-0000-0000-0000000000a1', 'aal1');
select throws_ok($$select public.set_keep_years(2)$$, 'P0001', 'no_access', 'an admin must pass the authenticator step');

select pg_temp.login('00000000-0000-0000-0000-0000000000a1', 'aal2');
select is(public.retention_preview(2),
          '{"time_cards": 1, "flhas": 1, "safety_meetings": 1, "trucking_slips": 1, "site_entries": 1,
            "form_submissions": 1, "chat_messages": 1, "daily_reports": 1, "dispatches": 1}'::jsonb,
          'the preview counts what 2 years would remove, own company only');
select is(public.retention_preview(5), '{}'::jsonb, 'nothing is older than 5 years');
select is(public.retention_preview(null), '{}'::jsonb, 'forever removes nothing');
select throws_ok($$select public.retention_preview(4)$$, 'P0001', 'bad_years', 'only the listed choices preview');
select throws_ok($$select public.set_keep_years(4)$$, 'P0001', 'bad_years', 'only the listed choices save');
select lives_ok($$select public.set_keep_years(null)$$, 'an admin can keep records forever');
select is((select keep_years from public.companies where id = '10000000-0000-0000-0000-00000000000a'), null,
          'forever is saved');
select lives_ok($$select public.set_keep_years(2)$$, 'an admin can pick 2 years');

-- The cleanup is server only -----------------------------------------------------
select throws_ok($$select public.retention_companies()$$, '42501', null, 'signed-in people can''t list companies to clean');
select throws_ok($$select * from public.retention_files('10000000-0000-0000-0000-00000000000a')$$, '42501', null,
                 'signed-in people can''t list files to remove');
select throws_ok($$select public.retention_delete('10000000-0000-0000-0000-00000000000a')$$, '42501', null,
                 'signed-in people can''t delete records');

reset role;
select is((select keep_years from public.companies where id = '10000000-0000-0000-0000-00000000000b'), 7,
          'another company''s setting is untouched');
select set_config('request.jwt.claims', '{"role": "service_role"}', true);
set local role service_role;

select results_eq($$select * from public.retention_companies()$$,
                  $$values ('10000000-0000-0000-0000-00000000000a'::uuid)$$,
                  'only the company with old enough records is due (B keeps 7 years)');
select results_eq($$select bucket, name from public.retention_files('10000000-0000-0000-0000-00000000000a')$$,
  $$values
    ('chat-photos', '10000000-0000-0000-0000-00000000000a/30000000-0000-0000-0000-0000000000a1/43000000-0000-0000-0000-000000000001.jpg'),
    ('daily-reports', '10000000-0000-0000-0000-00000000000a/44000000-0000-0000-0000-000000000001.pdf'),
    ('form-photos', '10000000-0000-0000-0000-00000000000a/50000000-0000-0000-0000-000000000001/x.jpg'),
    ('site-photos', '10000000-0000-0000-0000-00000000000a/80000000-0000-0000-0000-000000000001/81000000-0000-0000-0000-000000000001.jpg'),
    ('slip-photos', '10000000-0000-0000-0000-00000000000a/90000000-0000-0000-0000-000000000001.jpg')$$,
  'the old records'' files are listed, including a removed chat photo');
select is((select count(*)::int from public.retention_files('10000000-0000-0000-0000-00000000000a', 2)), 2,
          'files come in batches');
select throws_ok($$select public.retention_delete('10000000-0000-0000-0000-00000000000a')$$, 'P0001', 'files_remain',
                 'rows stay until their files are removed');

-- What the Storage API does when the cleanup removes them.
reset role;
set local storage.allow_delete_query = 'true';
merge into storage.objects o
using (select * from public.retention_files('10000000-0000-0000-0000-00000000000a')) f
on o.bucket_id = f.bucket and o.name = f.name
when matched then delete;
set local role service_role;

select is((select count(*)::int from public.retention_files('10000000-0000-0000-0000-00000000000a')), 0,
          'no files left to remove');
select is(public.retention_delete('10000000-0000-0000-0000-00000000000a'),
          '{"time_cards": 1, "flhas": 1, "safety_meetings": 1, "trucking_slips": 1, "site_entries": 1,
            "form_submissions": 1, "chat_messages": 1, "daily_reports": 1, "dispatches": 1}'::jsonb,
          'the old records are deleted');

reset role;
select is((select count(*)::int from public.flhas where company_id = '10000000-0000-0000-0000-00000000000a'), 1,
          'the new FLHA is kept');
select is((select array_agg(id::text order by id) from (
             select id from public.time_cards union all select id from public.safety_meetings
             union all select id from public.trucking_slips union all select id from public.site_entries
             union all select id from public.form_submissions union all select id from public.chat_messages
             union all select id from public.daily_reports union all select id from public.dispatches) x
           where id::text like '%2'),
          array['43000000-0000-0000-0000-000000000002', '44000000-0000-0000-0000-000000000002',
                '45000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000002',
                '70000000-0000-0000-0000-000000000002', '71000000-0000-0000-0000-000000000002',
                '80000000-0000-0000-0000-000000000002', '90000000-0000-0000-0000-000000000002'],
          'every new record is kept');
select is((select count(*)::int from public.time_card_lines) + (select count(*)::int from public.flha_tasks)
          + (select count(*)::int from public.site_photos) + (select count(*)::int from public.dispatch_people), 0,
          'the old records'' details went with them');
select is((select array_agg(work_date) from public.schedule_entries), array[pg_temp.new()],
          'old schedules are deleted, new ones kept');
select ok(exists (select 1 from storage.objects
                  where name = '10000000-0000-0000-0000-00000000000a/90000000-0000-0000-0000-000000000002.jpg'),
          'the new slip photo is kept');
select ok(exists (select 1 from public.flhas where company_id = '10000000-0000-0000-0000-00000000000b')
          and exists (select 1 from storage.objects where name like '10000000-0000-0000-0000-00000000000b/%'),
          'another company''s records and files are untouched');

set local role service_role;
select is((select count(*)::int from public.retention_companies()), 0, 'nobody is due after the cleanup');
select is(public.retention_delete('10000000-0000-0000-0000-00000000000a'), '{}'::jsonb, 'running again changes nothing');

select * from finish();
rollback;
