-- Dispatch: the office plans people, machines, a start time and a note per
-- job per day; workers see only what was sent to them, and only their own.
-- Sending puts people on the job's crew and says who changed. The daily
-- report checks the people sent that day. Nothing crosses companies.
begin;
select plan(37);

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
   '00000000-0000-0000-0000-0000000000a3', 'Sam Operator', 'employee'),
  ('20000000-0000-0000-0000-0000000000a4', '10000000-0000-0000-0000-00000000000a',
   null, 'Old Hand', 'employee'),
  ('20000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-00000000000b',
   '00000000-0000-0000-0000-0000000000b1', 'Admin B', 'admin'),
  ('20000000-0000-0000-0000-0000000000b2', '10000000-0000-0000-0000-00000000000b',
   null, 'B Worker', 'employee');
update public.employees set is_active = false where id = '20000000-0000-0000-0000-0000000000a4';

insert into public.jobs (id, company_id, name, status, start_date) values
  ('30000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a', 'Highway 1', 'active', '2026-01-01'),
  ('30000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-00000000000a', 'Bridge', 'active', '2026-01-01'),
  ('30000000-0000-0000-0000-0000000000a3', '10000000-0000-0000-0000-00000000000a', 'Paused job', 'paused', '2026-01-01'),
  ('30000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-00000000000b', 'B Job', 'active', '2026-01-01');

insert into public.equipment (id, company_id, name, unit_number) values
  ('50000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a', 'Excavator', 'EX-12'),
  ('50000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-00000000000b', 'Loader', 'L-1');

create function pg_temp.today() returns date language sql as $$
  select (now() at time zone 'America/Vancouver')::date
$$;

create function pg_temp.login(uid uuid, aal text) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated', 'aal', aal)::text, true);
  set local role authenticated;
$$;

-- Saves Highway 1 for a day with the given people and machines.
create function pg_temp.plan(d date, people uuid[], machines uuid[]) returns void language sql as $$
  select public.save_dispatch('30000000-0000-0000-0000-0000000000a1', d, '07:00', 'Bring the pump',
                              people, machines)
$$;

-- Worker ------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000a2', 'aal1');
select throws_ok($$select pg_temp.plan(pg_temp.today(), array['20000000-0000-0000-0000-0000000000a2'::uuid], '{}')$$,
  'P0001', 'no_access', 'workers can''t dispatch');
select throws_ok($$select public.send_schedule()$$, 'P0001', 'no_access', '... or send the schedule');

-- Admin without the authenticator step --------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000a1', 'aal1');
select throws_ok($$select pg_temp.plan(pg_temp.today(), '{}', '{}')$$,
  'P0001', 'no_access', 'admins need the authenticator step');

-- Admin A ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000a1', 'aal2');
select throws_ok($$select pg_temp.plan(pg_temp.today() - 1, '{}', '{}')$$,
  'P0001', 'past_date', 'can''t plan a day that has gone');
select throws_ok($$select public.save_dispatch('30000000-0000-0000-0000-0000000000a3', pg_temp.today(), null, null, '{}', '{}')$$,
  'P0001', 'job_not_available', 'can''t plan a paused job');
select throws_ok($$select public.save_dispatch('30000000-0000-0000-0000-0000000000b1', pg_temp.today(), null, null, '{}', '{}')$$,
  'P0001', 'job_not_available', '... or another company''s job');
select throws_ok($$select public.save_dispatch('30000000-0000-0000-0000-0000000000a1', pg_temp.today(), '07:10', null, '{}', '{}')$$,
  'P0001', 'bad_time', 'start times are in 15 minute steps');
select throws_ok($$select pg_temp.plan(pg_temp.today(), array['20000000-0000-0000-0000-0000000000a4'::uuid], '{}')$$,
  'P0001', 'person_not_available', 'can''t send someone switched off');
select throws_ok($$select pg_temp.plan(pg_temp.today(), array['20000000-0000-0000-0000-0000000000b2'::uuid], '{}')$$,
  'P0001', 'person_not_available', '... or someone from another company');
select throws_ok($$select pg_temp.plan(pg_temp.today(), '{}', array['50000000-0000-0000-0000-0000000000b1'::uuid])$$,
  'P0001', 'equipment_not_available', '... or another company''s machine');

select lives_ok($$select pg_temp.plan(pg_temp.today(),
                   array['20000000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-0000000000a3']::uuid[],
                   array['50000000-0000-0000-0000-0000000000a1']::uuid[])$$,
  'plans Joe and Sam with the excavator on Highway 1 today');
select is((select count(*)::integer from public.dispatch_people), 2, 'both people are on the plan');
select ok(exists (select 1 from public.job_equipment where job_id = '30000000-0000-0000-0000-0000000000a1'
                  and equipment_id = '50000000-0000-0000-0000-0000000000a1'), 'the excavator is put on the job');

select lives_ok($$select pg_temp.plan(pg_temp.today(), array['20000000-0000-0000-0000-0000000000a2']::uuid[], '{}')$$,
  'saving again changes the plan');
select is((select string_agg(employee_id::text, ',') from public.dispatch_people),
  '20000000-0000-0000-0000-0000000000a2', '... Sam is taken off');
select is((select count(*)::integer from public.dispatch_equipment), 0, '... and so is the excavator');

-- Joe is also on Bridge today: a double booking.
select lives_ok($$select public.save_dispatch('30000000-0000-0000-0000-0000000000a2', pg_temp.today(), null, null,
                   array['20000000-0000-0000-0000-0000000000a2']::uuid[], '{}')$$, 'Joe can be planned on two jobs');
select is((select string_agg(kind || ':' || name || ':' || other_job, ',')
           from public.dispatch_conflicts('30000000-0000-0000-0000-0000000000a1', pg_temp.today(),
                                          array['20000000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-0000000000a3']::uuid[], '{}')),
  'person:Joe Worker:Bridge', '... and that shows as a double booking');
select lives_ok($$select public.save_dispatch('30000000-0000-0000-0000-0000000000a2', pg_temp.today(), null, null, '{}', '{}')$$,
  'taking him off Bridge');

select is((select array_agg(u) from public.unsent_schedule_people() u),
  array['20000000-0000-0000-0000-0000000000a2'::uuid], 'Joe has unsent changes');
select is((select array_agg(u) from public.send_schedule() u),
  array['20000000-0000-0000-0000-0000000000a2'::uuid], 'sending says Joe changed');
select is((select count(*)::integer from public.unsent_schedule_people()), 0, 'nothing is left to send');
select is((select start_time::text || ' ' || notes from public.schedule_entries
           where employee_id = '20000000-0000-0000-0000-0000000000a2' and work_date = pg_temp.today()),
  '07:00:00 Bring the pump', 'Joe''s schedule has the start time and note');
select ok(exists (select 1 from public.job_assignments where job_id = '30000000-0000-0000-0000-0000000000a1'
                  and employee_id = '20000000-0000-0000-0000-0000000000a2'), 'Joe is put on the job''s crew');

-- Moving Joe to tomorrow changes today's and tomorrow's schedule.
select lives_ok($$select pg_temp.plan(pg_temp.today(), '{}', '{}')$$, 'taking Joe off today');
select lives_ok($$select pg_temp.plan(pg_temp.today() + 1, array['20000000-0000-0000-0000-0000000000a2']::uuid[], '{}')$$,
  '... and planning him tomorrow');
select is((select count(*)::integer from public.schedule_entries), 1, 'his sent schedule doesn''t change until sent');
select is((select array_agg(u) from public.send_schedule() u),
  array['20000000-0000-0000-0000-0000000000a2'::uuid], 'sending says Joe changed again');
select is((select string_agg((work_date - pg_temp.today())::text, ',') from public.schedule_entries), '1',
  'his schedule is tomorrow only');

-- Worker sees only their own schedule ------------------------------------------------
reset role;
insert into public.schedule_entries (company_id, employee_id, work_date, job_id) values
  ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a3', pg_temp.today() + 1,
   '30000000-0000-0000-0000-0000000000a2');
select pg_temp.login('00000000-0000-0000-0000-0000000000a2', 'aal1');
select is((select string_agg(employee_id::text, ',') from public.schedule_entries),
  '20000000-0000-0000-0000-0000000000a2', 'Joe sees only his own schedule');
select is((select count(*)::integer from public.dispatches), 0, '... and not the office''s plan');

select lives_ok($$select public.save_push_subscription('https://push.example.com/joe', 'key', 'auth')$$,
  'Joe turns on notifications');
select throws_ok($$select public.save_push_subscription('http://push.example.com/joe', 'key', 'auth')$$,
  'P0001', 'bad_subscription', 'only secure push links are kept');

-- Admin B ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000b1', 'aal2');
select is((select count(*)::integer from public.schedule_entries)
          + (select count(*)::integer from public.dispatches)
          + (select count(*)::integer from public.push_subscriptions), 0, 'another company sees nothing');
select public.remove_push_subscriptions(array['https://push.example.com/joe']);
select pg_temp.login('00000000-0000-0000-0000-0000000000a2', 'aal1');
select is((select count(*)::integer from public.push_subscriptions), 1, '... and can''t remove Joe''s phone');
select public.remove_push_subscriptions(array['https://push.example.com/joe']);
select is((select count(*)::integer from public.push_subscriptions), 0, 'Joe can remove his own');

-- Daily report: Joe is on Highway 1's crew, but only Sam was sent two days ago,
-- so only Sam is checked for that day.
reset role;
insert into public.schedule_entries (company_id, employee_id, work_date, job_id) values
  ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a3', pg_temp.today() - 2,
   '30000000-0000-0000-0000-0000000000a1');
select pg_temp.login('00000000-0000-0000-0000-0000000000a1', 'aal2');
select is((select string_agg(f ->> 'name', ',')
           from jsonb_array_elements(public.daily_report_content('30000000-0000-0000-0000-0000000000a1',
                                                                 pg_temp.today() - 2) -> 'flhas') f),
  'Sam Operator', 'the daily report checks the people sent that day');

select * from finish();
rollback;
