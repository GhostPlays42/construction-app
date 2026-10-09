-- Lists: admins manage their company's cost codes, hazards and PPE; everyone
-- in the company can read them; nothing is deleted; nothing crosses companies.
begin;
select plan(19);

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
   '00000000-0000-0000-0000-0000000000a2', 'Worker A', 'employee'),
  ('20000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-00000000000b',
   '00000000-0000-0000-0000-0000000000b1', 'Admin B', 'admin');

insert into public.cost_codes (company_id, code, name) values
  ('10000000-0000-0000-0000-00000000000b', '900', 'B code');

create function pg_temp.login(uid uuid, aal text) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated', 'aal', aal)::text, true);
  set local role authenticated;
$$;

-- Starter lists ---------------------------------------------------------------
select is((select count(*)::int from public.hazards
           where company_id = '10000000-0000-0000-0000-00000000000a'), 14,
          'a new company starts with common hazards');
select is((select count(*)::int from public.ppe_items
           where company_id = '10000000-0000-0000-0000-00000000000a'), 9,
          'a new company starts with common PPE');
select is((select count(*)::int from public.cost_codes
           where company_id = '10000000-0000-0000-0000-00000000000a'), 0,
          'a new company starts with no cost codes');
select is((select name from public.hazards
           where company_id = '10000000-0000-0000-0000-00000000000a' order by sort_order limit 1),
          'Overhead power lines', 'starter items keep their order');

-- Admin A ---------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000a1', 'aal2');
select lives_ok($$insert into public.cost_codes (company_id, code, name, sort_order)
  values ('10000000-0000-0000-0000-00000000000a', '200', 'Excavation', 1)$$, 'an admin adds a cost code');
select throws_ok($$insert into public.cost_codes (company_id, code, name)
  values ('10000000-0000-0000-0000-00000000000a', '200', 'Again')$$,
  '23505', null, 'cost codes are unique in a company');
select throws_ok($$insert into public.hazards (company_id, name)
  values ('10000000-0000-0000-0000-00000000000a', 'NOISE')$$,
  '23505', null, 'hazard names are unique in a company, ignoring case');
select throws_ok($$insert into public.ppe_items (company_id, name)
  values ('10000000-0000-0000-0000-00000000000a', '  ')$$,
  '23514', null, 'a list item needs a name');
select lives_ok($$update public.hazards set name = 'Loud noise'
  where company_id = '10000000-0000-0000-0000-00000000000a' and name = 'Noise'$$, 'an admin renames an item');
select lives_ok($$update public.ppe_items set is_active = false
  where company_id = '10000000-0000-0000-0000-00000000000a' and name = 'Face shield'$$,
  'an admin switches an item off');
select throws_ok($$delete from public.hazards
  where company_id = '10000000-0000-0000-0000-00000000000a' returning 1$$,
  '42501', null, 'list items are never deleted');
select throws_ok($$insert into public.cost_codes (company_id, code, name)
  values ('10000000-0000-0000-0000-00000000000b', '1', 'Sneaky')$$,
  '42501', null, 'an admin cannot add to another company''s list');
select results_eq($$select code from public.cost_codes$$, $$values ('200')$$,
  'an admin sees only their company''s cost codes');
reset role;

-- Worker A --------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000a2', 'aal1');
select results_eq($$select name from public.cost_codes$$, $$values ('Excavation')$$,
  'a worker reads their company''s cost codes');
select is((select count(*)::int from public.ppe_items), 9,
  'a worker reads switched-off items too, for old entries');
select throws_ok($$insert into public.hazards (company_id, name)
  values ('10000000-0000-0000-0000-00000000000a', 'Bears')$$,
  '42501', null, 'a worker cannot add to a list');
select is_empty($$update public.cost_codes set name = 'Digging' returning 1$$,
  'a worker cannot change a list');
reset role;

-- Not signed in ---------------------------------------------------------------
set local role anon;
select throws_ok($$select 1 from public.hazards$$, '42501', null,
  'lists are not readable without signing in');
reset role;

-- Starter lists are added once.
select private.add_starter_lists('10000000-0000-0000-0000-00000000000b');
select is((select count(*)::int from public.hazards
           where company_id = '10000000-0000-0000-0000-00000000000b'), 14,
          'adding starter lists again does not duplicate them');

select * from finish();
rollback;
