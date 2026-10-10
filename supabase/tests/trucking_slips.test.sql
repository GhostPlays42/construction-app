-- Trucking slips: a worker on a job sends a slip photo after their FLHA; the
-- reading fills in values once; the worker checks them once; the office
-- corrects them with every change logged. Only admins and the sender see a
-- slip, and nothing crosses companies.
begin;
select plan(30);

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

-- Worker A did today's FLHA; A3 didn't.
insert into public.flhas (id, company_id, job_id, employee_id, work_date, filled_at, signature) values
  ('60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a',
   '30000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a2',
   (now() at time zone 'America/Vancouver')::date, now() - interval '2 hours', 'M1 1');

-- Slip photos already uploaded: ...01 and ...02 by Worker A, ...03 by Worker A3.
insert into storage.objects (bucket_id, name, owner_id) values
  ('slip-photos', '10000000-0000-0000-0000-00000000000a/90000000-0000-0000-0000-000000000001.jpg',
   '00000000-0000-0000-0000-0000000000a2'),
  ('slip-photos', '10000000-0000-0000-0000-00000000000a/90000000-0000-0000-0000-000000000002.jpg',
   '00000000-0000-0000-0000-0000000000a2'),
  ('slip-photos', '10000000-0000-0000-0000-00000000000a/90000000-0000-0000-0000-000000000003.jpg',
   '00000000-0000-0000-0000-0000000000a3');

create function pg_temp.login(uid uuid, aal text) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated', 'aal', aal)::text, true);
  set local role authenticated;
$$;

create function pg_temp.submit(
  p_id uuid default '90000000-0000-0000-0000-000000000001',
  p_job uuid default '30000000-0000-0000-0000-0000000000a1',
  p_at timestamptz default now() - interval '1 hour'
) returns uuid language sql as $$
  select public.submit_trucking_slip(p_id, p_job, p_at)
$$;

-- Checks slip ...01 with good values; each test changes one thing.
create function pg_temp.check_slip(
  p_company text default 'Smith Trucking',
  p_ticket text default 'T-5512',
  p_loads numeric default 3,
  p_tonnage numeric default 42.5,
  p_date date default current_date
) returns void language sql as $$
  select public.check_trucking_slip('90000000-0000-0000-0000-000000000001',
    p_company, '17', p_ticket, 'Road base', p_loads, p_tonnage, p_date)
$$;

-- Worker A3 (no FLHA) ----------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000a3', 'aal1');
select throws_ok($$select pg_temp.submit('90000000-0000-0000-0000-000000000003')$$,
  'P0001', 'flha_required', 'not before their own FLHA');

-- Worker A -----------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000a2', 'aal1');
select throws_ok($$select pg_temp.submit(p_job => '30000000-0000-0000-0000-0000000000a2')$$,
  'P0001', 'job_not_available', 'not for a job they aren''t on');
select throws_ok($$select pg_temp.submit('90000000-0000-0000-0000-000000000009')$$,
  'P0001', 'photo_missing', 'the photo must be uploaded first');
select throws_ok($$select pg_temp.submit('90000000-0000-0000-0000-000000000003')$$,
  'P0001', 'photo_missing', 'not a photo someone else uploaded');
select throws_ok($$select pg_temp.submit(p_at => now() - interval '15 days')$$,
  'P0001', 'bad_time', 'not from a wrong phone clock');

select is(pg_temp.submit(), '90000000-0000-0000-0000-000000000001'::uuid, 'a slip is saved');
select is(pg_temp.submit(), '90000000-0000-0000-0000-000000000001'::uuid, 'sending the same slip again is fine');
select is((select count(*)::integer from public.trucking_slips), 1, '... and saves it once');
select is((select read_status || ':' || status from public.trucking_slips), 'pending:unchecked',
  'waits to be read and checked');

-- Reading fills in what makes sense, once.
select lives_ok($$select public.save_trucking_slip_reading('90000000-0000-0000-0000-000000000001',
  jsonb_build_object('trucking_company', ' Smith Trucking ', 'truck_number', '17', 'ticket_number', 'T-5512',
                     'material', repeat('x', 250), 'loads', 'three', 'tonnage', 42.5, 'slip_date', 'not a date'))$$,
  'saves what was read');
select is((select trucking_company || '|' || ticket_number || '|' || length(material) || '|'
                  || coalesce(loads::text, '-') || '|' || tonnage || '|' || coalesce(slip_date::text, '-')
           from public.trucking_slips), 'Smith Trucking|T-5512|200|-|42.50|-',
  'reading fills in the values, leaving out what makes no sense');
select is((select read_status from public.trucking_slips), 'read', 'marked as read');
select lives_ok($$select public.save_trucking_slip_reading('90000000-0000-0000-0000-000000000001',
  '{"trucking_company": "Other"}')$$, 'a second reading is ignored');
select is((select trucking_company from public.trucking_slips), 'Smith Trucking', '... and changes nothing');

-- Checking.
select throws_ok($$select pg_temp.check_slip(p_company => ' ')$$,
  'P0001', 'trucking_company_required', 'needs the trucking company');
select throws_ok($$select pg_temp.check_slip(p_ticket => null)$$,
  'P0001', 'ticket_required', 'needs the ticket #');
select throws_ok($$select pg_temp.check_slip(p_loads => null, p_tonnage => null)$$,
  'P0001', 'amount_required', 'needs loads or tonnage');
select throws_ok($$select pg_temp.check_slip(p_loads => -1)$$,
  'P0001', 'bad_amount', 'no negative loads');
select lives_ok($$select pg_temp.check_slip()$$, 'the worker checks the values');
select is((select status || '|' || loads || '|' || slip_date::text from public.trucking_slips),
  'checked|3.00|' || current_date::text, 'checked with the worker''s values');
select throws_ok($$select pg_temp.check_slip()$$, 'P0001', 'already_checked', 'checked once only');
select throws_ok($$select public.update_trucking_slip('90000000-0000-0000-0000-000000000001',
  'X', null, 'T', null, 1, null, null)$$, 'P0001', 'no_access', 'workers can''t correct after');
select throws_ok($$update public.trucking_slips set ticket_number = 'changed'$$,
  '42501', null, 'can''t be changed directly');

-- A slip that couldn't be read.
select pg_temp.submit('90000000-0000-0000-0000-000000000002');
select public.save_trucking_slip_reading('90000000-0000-0000-0000-000000000002', null);
select is((select read_status || ':' || coalesce(ticket_number, '-') from public.trucking_slips
           where id = '90000000-0000-0000-0000-000000000002'), 'failed:-',
  'a photo that can''t be read leaves the values for the worker');

-- Worker A3 on the same job doesn't see Worker A's slips.
select pg_temp.login('00000000-0000-0000-0000-0000000000a3', 'aal1');
select is((select count(*)::integer from public.trucking_slips), 0, 'other workers don''t see them');

-- Admin A ----------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000a1', 'aal2');
select lives_ok($$select public.update_trucking_slip('90000000-0000-0000-0000-000000000001',
  'Smith Trucking', '17', 'T-5513', 'Road base', 3, 40, current_date)$$, 'the office corrects a slip');
select is((select string_agg(field || ':' || coalesce(old_value, '-') || '>' || coalesce(new_value, '-'), ','
                             order by id) from public.trucking_slip_changes),
  'Ticket #:T-5512>T-5513,Tonnage:42.5>40', 'every change is logged, old and new');
select lives_ok($$select public.update_trucking_slip('90000000-0000-0000-0000-000000000002',
  'Jones Haul', null, 'J-1', null, null, 18, null)$$, 'the office can fill in a slip that wasn''t read');
select is((select status from public.trucking_slips where id = '90000000-0000-0000-0000-000000000002'),
  'checked', '... which settles it');

-- Admin B ----------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000b1', 'aal2');
select is((select count(*)::integer from public.trucking_slips)
          + (select count(*)::integer from public.trucking_slip_changes)
          + (select count(*)::integer from storage.objects where bucket_id = 'slip-photos'), 0,
  'other companies see nothing');

select * from finish();
rollback;
