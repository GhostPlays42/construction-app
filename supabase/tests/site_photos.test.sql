-- Site photos & notes: a worker on a job sends photos and notes after their
-- FLHA, as often as they like; each photo must be uploaded by them first.
-- Entries are saved once and never changed. Only admins and the sender see
-- them, and nothing crosses companies.
begin;
select plan(26);

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
  ('30000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-00000000000a', 'Other job', 'active');

insert into public.job_assignments (job_id, employee_id, company_id) values
  ('30000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-00000000000a'),
  ('30000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a3', '10000000-0000-0000-0000-00000000000a');

insert into public.cost_codes (id, company_id, code, name) values
  ('40000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a', '200', 'Excavation'),
  ('40000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-00000000000b', '200', 'Excavation');

-- Worker A did today's FLHA; A3 didn't.
insert into public.flhas (id, company_id, job_id, employee_id, work_date, filled_at, signature) values
  ('60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a',
   '30000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a2',
   (now() at time zone 'America/Vancouver')::date, now() - interval '2 hours', 'M1 1');

-- Photos already uploaded: two by Worker A for entry ...e1, one by Worker A3
-- into the same folder (not theirs to use).
insert into storage.objects (bucket_id, name, owner_id) values
  ('site-photos', '10000000-0000-0000-0000-00000000000a/90000000-0000-0000-0000-0000000000e1/70000000-0000-0000-0000-000000000001.jpg',
   '00000000-0000-0000-0000-0000000000a2'),
  ('site-photos', '10000000-0000-0000-0000-00000000000a/90000000-0000-0000-0000-0000000000e1/70000000-0000-0000-0000-000000000002.jpg',
   '00000000-0000-0000-0000-0000000000a2'),
  ('site-photos', '10000000-0000-0000-0000-00000000000a/90000000-0000-0000-0000-0000000000e1/70000000-0000-0000-0000-000000000003.jpg',
   '00000000-0000-0000-0000-0000000000a3');

create function pg_temp.login(uid uuid, aal text) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated', 'aal', aal)::text, true);
  set local role authenticated;
$$;

-- Sends as the logged-in person with sensible defaults: entry ...e1 with
-- two photos (the first with a cost code and caption) and notes.
create function pg_temp.submit(
  p_id uuid default '90000000-0000-0000-0000-0000000000e1',
  p_job uuid default '30000000-0000-0000-0000-0000000000a1',
  p_notes text default 'Dug the trench. Rain after lunch.',
  p_photos jsonb default '[{"id": "70000000-0000-0000-0000-000000000001",
                            "cost_code_id": "40000000-0000-0000-0000-0000000000a1", "caption": "Trench"},
                           {"id": "70000000-0000-0000-0000-000000000002", "cost_code_id": null, "caption": null}]',
  p_at timestamptz default now() - interval '1 hour'
) returns uuid language sql as $$
  select public.submit_site_entry(p_id, p_job, p_notes, p_photos, p_at)
$$;

-- Worker A3 (no FLHA) ----------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000a3', 'aal1');
select throws_ok($$select pg_temp.submit()$$, 'P0001', 'flha_required', 'not before their own FLHA');

-- Worker A -----------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000a2', 'aal1');
select throws_ok($$select pg_temp.submit(p_job => '30000000-0000-0000-0000-0000000000a2')$$,
  'P0001', 'job_not_available', 'not for a job they aren''t on');
select throws_ok($$select pg_temp.submit(p_notes => '  ', p_photos => '[]')$$,
  'P0001', 'photo_or_notes_required', 'needs a photo or notes');
select throws_ok($$select pg_temp.submit(p_notes => repeat('x', 4001))$$,
  'P0001', 'notes_too_long', 'notes have a limit');
select throws_ok($$select pg_temp.submit(p_photos =>
  jsonb_build_array(jsonb_build_object('id', '70000000-0000-0000-0000-000000000001', 'caption', repeat('x', 301))))$$,
  'P0001', 'caption_too_long', 'captions have a limit');
select throws_ok($$select pg_temp.submit(p_photos =>
  '[{"id": "70000000-0000-0000-0000-000000000001", "cost_code_id": "40000000-0000-0000-0000-0000000000b1"}]')$$,
  'P0001', 'item_not_available', 'not another company''s cost code');
select throws_ok($$select pg_temp.submit(p_photos =>
  '[{"id": "70000000-0000-0000-0000-000000000009"}]')$$,
  'P0001', 'photo_missing', 'every photo must be uploaded first');
select throws_ok($$select pg_temp.submit(p_photos =>
  '[{"id": "70000000-0000-0000-0000-000000000003"}]')$$,
  'P0001', 'photo_missing', 'not a photo someone else uploaded');
select throws_ok($$select pg_temp.submit(p_photos =>
  '[{"id": "70000000-0000-0000-0000-000000000001"}, {"id": "70000000-0000-0000-0000-000000000001"}]')$$,
  'P0001', 'missing_id', 'not the same photo twice');
select throws_ok($$select pg_temp.submit(p_at => now() - interval '15 days')$$,
  'P0001', 'bad_time', 'not from a wrong phone clock');

select is(pg_temp.submit(), '90000000-0000-0000-0000-0000000000e1'::uuid, 'a good entry is saved');
select is((select string_agg(coalesce(code, '-') || ':' || coalesce(code_name, '-') || ':' || coalesce(caption, '-'),
                             ',' order by position) from public.site_photos),
  '200:Excavation:Trench,-:-:-', 'photos keep their order, cost code and caption');
select is((select path from public.site_photos where position = 1),
  '10000000-0000-0000-0000-00000000000a/90000000-0000-0000-0000-0000000000e1/70000000-0000-0000-0000-000000000001.jpg',
  'each photo knows where it is stored');
select is(pg_temp.submit(), '90000000-0000-0000-0000-0000000000e1'::uuid, 'sending the same entry again is fine');
select is((select count(*)::integer from public.site_entries), 1, '... and saves it once');
select is(pg_temp.submit('90000000-0000-0000-0000-0000000000e2', p_photos => '[]'),
  '90000000-0000-0000-0000-0000000000e2'::uuid, 'more than one a day, and notes alone are fine');
select throws_ok($$update public.site_entries set notes = 'changed'$$,
  '42501', null, 'can''t be changed');
select throws_ok($$insert into public.site_entries (id, company_id, job_id, employee_id, work_date, filled_at)
  values (gen_random_uuid(), '10000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-0000000000a1',
          '20000000-0000-0000-0000-0000000000a2', current_date, now())$$,
  '42501', null, 'only through the checks');
select is((select count(*)::integer from storage.objects where bucket_id = 'site-photos'), 2,
  'workers see only the photos they uploaded');

-- Uploading: into their own company's folder only.
select lives_ok($$insert into storage.objects (bucket_id, name, owner_id) values ('site-photos',
  '10000000-0000-0000-0000-00000000000a/90000000-0000-0000-0000-0000000000e3/70000000-0000-0000-0000-000000000004.jpg',
  '00000000-0000-0000-0000-0000000000a2')$$, 'workers upload into their company''s folder');
select throws_ok($$insert into storage.objects (bucket_id, name, owner_id) values ('site-photos',
  '10000000-0000-0000-0000-00000000000b/90000000-0000-0000-0000-0000000000e3/70000000-0000-0000-0000-000000000005.jpg',
  '00000000-0000-0000-0000-0000000000a2')$$, '42501', null, '... not another company''s');

-- Worker A3 is on the same job but doesn't see Worker A's entries.
select pg_temp.login('00000000-0000-0000-0000-0000000000a3', 'aal1');
select is((select count(*)::integer from public.site_entries), 0, 'other workers don''t see them');
select is((select count(*)::integer from public.site_photos), 0, '... or their photos');

-- Admin A ----------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000a1', 'aal2');
select is((select count(*)::integer from public.site_photos), 2, 'admins see every photo entry');
select is((select count(*)::integer from storage.objects where bucket_id = 'site-photos'), 4,
  '... and every photo file in their company');

-- Admin B ----------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000b1', 'aal2');
select is((select count(*)::integer from public.site_entries)
          + (select count(*)::integer from storage.objects where bucket_id = 'site-photos'), 0,
  'other companies see nothing');

select * from finish();
rollback;
