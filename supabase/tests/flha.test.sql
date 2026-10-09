-- FLHAs: a worker submits one per job per day for a job they're on; it is
-- checked, saved once, and never changed. Workers see their own, admins see
-- their company's, nothing crosses companies.
begin;
select plan(27);

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
  ('30000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-00000000000a', 'Not my job', 'active'),
  ('30000000-0000-0000-0000-0000000000a3', '10000000-0000-0000-0000-00000000000a', 'Paused job', 'paused');

insert into public.job_assignments (job_id, employee_id, company_id) values
  ('30000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-00000000000a'),
  ('30000000-0000-0000-0000-0000000000a3', '20000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-00000000000a'),
  ('30000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a3', '10000000-0000-0000-0000-00000000000a');

insert into public.cost_codes (id, company_id, code, name, is_active) values
  ('50000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a', '200', 'Excavation', true),
  ('50000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-00000000000a', '900', 'Old code', false),
  ('50000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-00000000000b', '200', 'B code', true);

create function pg_temp.login(uid uuid, aal text) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated', 'aal', aal)::text, true);
  set local role authenticated;
$$;

create function pg_temp.hazard(company text, hazard text) returns uuid language sql as $$
  select id from public.hazards where company_id = company::uuid and name = hazard
$$;
create function pg_temp.ppe(company text, item text) returns uuid language sql as $$
  select id from public.ppe_items where company_id = company::uuid and name = item
$$;

-- Built as postgres before switching roles, so the helpers' lookups work.
create temporary table ids as select
  pg_temp.hazard('10000000-0000-0000-0000-00000000000a', 'Noise') as noise,
  pg_temp.hazard('10000000-0000-0000-0000-00000000000a', 'Pinch points') as pinch,
  pg_temp.hazard('10000000-0000-0000-0000-00000000000b', 'Noise') as b_noise,
  pg_temp.ppe('10000000-0000-0000-0000-00000000000a', 'Hard hat') as hat,
  pg_temp.ppe('10000000-0000-0000-0000-00000000000a', 'Gloves') as gloves;
grant select on ids to authenticated;

-- Submits as the logged-in person with sensible defaults; each test changes one thing.
create function pg_temp.submit(
  p_id uuid,
  p_job uuid default '30000000-0000-0000-0000-0000000000a1',
  p_codes uuid[] default array['50000000-0000-0000-0000-0000000000a1']::uuid[],
  p_hazards jsonb default null,
  p_other text default null,
  p_other_control text default null,
  p_ppe uuid[] default null,
  p_sig text default 'M1 1 L5 5',
  p_at timestamptz default now()
) returns uuid language sql as $$
  select public.submit_flha(p_id, p_job, p_codes,
    coalesce(p_hazards, jsonb_build_array(jsonb_build_object(
      'hazard_id', (select noise from ids), 'control', 'Ear plugs in'))),
    p_other, p_other_control,
    coalesce(p_ppe, array[(select hat from ids), (select gloves from ids)]),
    p_sig, p_at)
$$;

-- Worker A ---------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000a2', 'aal1');

select throws_ok($$select pg_temp.submit('60000000-0000-0000-0000-000000000001',
  p_job => '30000000-0000-0000-0000-0000000000a2')$$,
  'P0001', 'job_not_available', 'not on a job they aren''t assigned to');
select throws_ok($$select pg_temp.submit('60000000-0000-0000-0000-000000000001',
  p_job => '30000000-0000-0000-0000-0000000000a3')$$,
  'P0001', 'job_not_available', 'not on a paused job');
select throws_ok($$select pg_temp.submit('60000000-0000-0000-0000-000000000001', p_codes => '{}')$$,
  'P0001', 'task_required', 'a task is required');
select throws_ok($$select pg_temp.submit('60000000-0000-0000-0000-000000000001',
  p_codes => array['50000000-0000-0000-0000-0000000000a2']::uuid[])$$,
  'P0001', 'item_not_available', 'a switched-off cost code can''t be picked');
select throws_ok($$select pg_temp.submit('60000000-0000-0000-0000-000000000001',
  p_codes => array['50000000-0000-0000-0000-0000000000b1']::uuid[])$$,
  'P0001', 'item_not_available', 'another company''s cost code can''t be picked');
select throws_ok($$select pg_temp.submit('60000000-0000-0000-0000-000000000001', p_hazards => '[]')$$,
  'P0001', 'hazard_required', 'at least one hazard is required');
select throws_ok($$select pg_temp.submit('60000000-0000-0000-0000-000000000001',
  p_hazards => jsonb_build_array(jsonb_build_object('hazard_id', (select noise from ids), 'control', '  ')))$$,
  'P0001', 'control_required', 'each hazard needs a control');
select throws_ok($$select pg_temp.submit('60000000-0000-0000-0000-000000000001',
  p_hazards => '[]', p_other => 'Bees')$$,
  'P0001', 'control_required', 'an other hazard needs a control');
select throws_ok($$select pg_temp.submit('60000000-0000-0000-0000-000000000001',
  p_hazards => jsonb_build_array(jsonb_build_object('hazard_id', (select b_noise from ids), 'control', 'x')))$$,
  'P0001', 'item_not_available', 'another company''s hazard can''t be picked');
select throws_ok($$select pg_temp.submit('60000000-0000-0000-0000-000000000001', p_ppe => '{}')$$,
  'P0001', 'ppe_required', 'PPE is required');
select throws_ok($$select pg_temp.submit('60000000-0000-0000-0000-000000000001', p_sig => '')$$,
  'P0001', 'signature_required', 'a signature is required');
select throws_ok($$select pg_temp.submit('60000000-0000-0000-0000-000000000001',
  p_at => now() + interval '1 hour')$$,
  'P0001', 'bad_time', 'it can''t be filled in the future');

select lives_ok($$select pg_temp.submit('60000000-0000-0000-0000-000000000001',
  p_hazards => jsonb_build_array(
    jsonb_build_object('hazard_id', (select noise from ids), 'control', ' Ear plugs in '),
    jsonb_build_object('hazard_id', (select pinch from ids), 'control', 'Hands clear')),
  p_other => 'Wasp nest', p_other_control => 'Flagged off')$$,
  'a worker submits an FLHA for their job');
select results_eq($$select employee_id, work_date, other_hazard, other_control from public.flhas$$,
  $$values ('20000000-0000-0000-0000-0000000000a2'::uuid,
            (now() at time zone 'America/Vancouver')::date, 'Wasp nest', 'Flagged off')$$,
  'it is saved for them, for today');
select results_eq($$select name, control from public.flha_hazards order by position$$,
  $$values ('Pinch points', 'Hands clear'), ('Noise', 'Ear plugs in')$$,
  'hazards are saved with names and trimmed controls, in list order');
select results_eq($$select code, name from public.flha_tasks$$,
  $$values ('200', 'Excavation')$$, 'the task is saved with its code and name');
select results_eq($$select count(*)::int from public.flha_ppe$$, $$values (2)$$, 'PPE is saved');
select lives_ok($$select pg_temp.submit('60000000-0000-0000-0000-000000000001')$$,
  'sending the same FLHA again is fine');
select results_eq($$select count(*)::int from public.flhas$$, $$values (1)$$, 'and saves it only once');
select throws_ok($$select pg_temp.submit('60000000-0000-0000-0000-000000000002')$$,
  'P0001', 'already_done', 'one FLHA per job per day');
select throws_ok($$update public.flhas set other_hazard = 'changed'$$,
  '42501', null, 'a worker cannot change an FLHA');
select throws_ok($$insert into public.flhas (id, company_id, job_id, employee_id, work_date, filled_at, signature)
  values (gen_random_uuid(), '10000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-0000000000a1',
          '20000000-0000-0000-0000-0000000000a2', current_date - 1, now(), 'x')$$,
  '42501', null, 'a worker cannot write FLHAs directly');

-- Worker A3: can't see Worker A's FLHA, and can't reuse its id ------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000a3', 'aal1');
select results_eq($$select (select count(*) from public.flhas)::int + (select count(*) from public.flha_hazards)::int$$,
  $$values (0)$$, 'a worker cannot see someone else''s FLHA');
select throws_ok($$select pg_temp.submit('60000000-0000-0000-0000-000000000001')$$,
  'P0001', 'missing_id', 'a worker cannot claim someone else''s FLHA');

-- Admin A sees it; Admin B doesn't -------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000a1', 'aal2');
select results_eq($$select (select count(*) from public.flhas)::int, (select count(*) from public.flha_hazards)::int$$,
  $$values (1, 2)$$, 'an admin sees their company''s FLHAs');
select throws_ok($$delete from public.flhas$$, '42501', null, 'an admin cannot delete an FLHA');

select pg_temp.login('00000000-0000-0000-0000-0000000000b1', 'aal2');
select results_eq($$select count(*)::int from public.flhas$$, $$values (0)$$,
  'another company''s admin sees none');

select * from finish();
rollback;
