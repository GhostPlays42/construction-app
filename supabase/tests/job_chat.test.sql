-- Job chat: the job's crew and the office can read and post; nobody else.
-- Messages can't be deleted; the office can remove one. Unread counts, and
-- the phones to notify, go only to the right people. Nothing crosses
-- companies.
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
   '00000000-0000-0000-0000-0000000000a2', 'Joe Worker', 'employee'),
  ('20000000-0000-0000-0000-0000000000a3', '10000000-0000-0000-0000-00000000000a',
   '00000000-0000-0000-0000-0000000000a3', 'Sam Other', 'employee'),
  ('20000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-00000000000b',
   '00000000-0000-0000-0000-0000000000b1', 'Admin B', 'admin');

insert into public.jobs (id, company_id, name, status) values
  ('30000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a', 'Highway 1', 'active'),
  ('30000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-00000000000a', 'Bridge', 'active'),
  ('30000000-0000-0000-0000-0000000000a3', '10000000-0000-0000-0000-00000000000a', 'Done job', 'complete');

-- Joe is on Highway 1 and Done job; Sam is on Bridge.
insert into public.job_assignments (job_id, employee_id, company_id) values
  ('30000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-00000000000a'),
  ('30000000-0000-0000-0000-0000000000a3', '20000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-00000000000a'),
  ('30000000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-0000000000a3', '10000000-0000-0000-0000-00000000000a');

-- Phones for everyone in company A.
insert into public.push_subscriptions (company_id, employee_id, endpoint, p256dh, auth) values
  ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1', 'https://push.example.com/admin', 'k', 'a'),
  ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a2', 'https://push.example.com/joe', 'k', 'a'),
  ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a3', 'https://push.example.com/sam', 'k', 'a');

-- A photo Joe uploaded for one message.
insert into storage.objects (bucket_id, name, owner_id) values
  ('chat-photos', '10000000-0000-0000-0000-00000000000a/30000000-0000-0000-0000-0000000000a1/40000000-0000-0000-0000-000000000002.jpg',
   '00000000-0000-0000-0000-0000000000a2');

create function pg_temp.login(uid uuid, aal text) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated', 'aal', aal)::text, true);
  set local role authenticated;
$$;

-- Joe ------------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000a2', 'aal1');
select lives_ok($$select public.send_chat_message('40000000-0000-0000-0000-000000000001',
                   '30000000-0000-0000-0000-0000000000a1', '  Pump is down  ', false)$$, 'crew can post to their job');
select is((select body from public.chat_messages where id = '40000000-0000-0000-0000-000000000001'),
  'Pump is down', '... trimmed');
select lives_ok($$select public.send_chat_message('40000000-0000-0000-0000-000000000001',
                   '30000000-0000-0000-0000-0000000000a1', 'Pump is down', false)$$, 'sending again is fine');
select is((select count(*)::integer from public.chat_messages), 1, '... and saves it once');
select lives_ok($$select public.send_chat_message('40000000-0000-0000-0000-000000000002',
                   '30000000-0000-0000-0000-0000000000a1', null, true)$$, 'a photo on its own');
select throws_ok($$select public.send_chat_message('40000000-0000-0000-0000-000000000003',
                   '30000000-0000-0000-0000-0000000000a1', 'x', true)$$, 'P0001', 'photo_missing', 'the photo must be uploaded first');
select throws_ok($$select public.send_chat_message('40000000-0000-0000-0000-000000000003',
                   '30000000-0000-0000-0000-0000000000a1', '   ', false)$$, 'P0001', 'empty', 'can''t send nothing');
select throws_ok($$select public.send_chat_message('40000000-0000-0000-0000-000000000003',
                   '30000000-0000-0000-0000-0000000000a1', repeat('x', 2001), false)$$, 'P0001', 'too_long', 'or too much');
select throws_ok($$select public.send_chat_message('40000000-0000-0000-0000-000000000003',
                   '30000000-0000-0000-0000-0000000000a2', 'hi', false)$$, 'P0001', 'not_on_job', 'can''t post to a job he''s not on');
select throws_ok($$select public.send_chat_message('40000000-0000-0000-0000-000000000003',
                   '30000000-0000-0000-0000-0000000000a3', 'hi', false)$$, 'P0001', 'not_on_job', '... or a finished job');
select is((select count(*)::integer from public.chat_messages where job_id = '30000000-0000-0000-0000-0000000000a1'), 2,
  'he sees his job''s chat');
select throws_ok($$select public.remove_chat_message('40000000-0000-0000-0000-000000000001')$$,
  'P0001', 'no_access', 'workers can''t remove messages');
select throws_ok($$update public.chat_messages set body = 'changed'$$, '42501', null, '... or change them');

select is((select string_agg(endpoint, ',' order by endpoint) from public.chat_message_targets('40000000-0000-0000-0000-000000000001')),
  'https://push.example.com/admin', 'notifies the office, not himself or people off the job');
select is((select count(*)::integer from public.chat_message_targets('40000000-0000-0000-0000-000000000001')), 0,
  '... only once');

-- Sam (on Bridge, not Highway 1) ------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000a3', 'aal1');
select is((select count(*)::integer from public.chat_messages), 0, 'people off the job see nothing');
select is((select count(*)::integer from storage.objects where bucket_id = 'chat-photos'), 0, '... not even the photos');
select is((select count(*)::integer from public.chat_message_targets('40000000-0000-0000-0000-000000000002')), 0,
  'and can''t ask for someone else''s message targets');
select throws_ok($$select public.mark_chat_read('30000000-0000-0000-0000-0000000000a1')$$,
  'P0001', 'no_access', 'or mark a chat he can''t use as read');

-- Admin A -----------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000a1', 'aal2');
select is((select unread from public.chat_unread() where job_id = '30000000-0000-0000-0000-0000000000a1'), 2,
  'the office has 2 unread on Highway 1');
select lives_ok($$select public.mark_chat_read('30000000-0000-0000-0000-0000000000a1')$$, 'opening the chat');
select is((select count(*)::integer from public.chat_unread()), 0, '... clears them');
select lives_ok($$select public.send_chat_message('40000000-0000-0000-0000-000000000004',
                   '30000000-0000-0000-0000-0000000000a3', 'Final walk-through notes', false)$$, 'the office can post on any job');
select lives_ok($$select public.remove_chat_message('40000000-0000-0000-0000-000000000002')$$, 'and remove a message');
select ok((select body is null and photo_path is null and removed_at is not null
           from public.chat_messages where id = '40000000-0000-0000-0000-000000000002'), '... its words and photo are gone');

-- Admin B -----------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000b1', 'aal2');
select is((select count(*)::integer from public.chat_messages), 0, 'another company sees nothing');

select * from finish();
rollback;
