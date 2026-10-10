-- Job chat: one conversation per job, for the job's crew and the office.
-- Text and photos (one photo per message). Messages appear instantly through
-- Supabase Realtime. Nobody can delete a message; an admin can remove one,
-- which clears its words and photo and leaves "removed by the office".
-- Chat isn't part of the daily report.

create table public.chat_messages (
  -- Made on the phone, so a send that's tried twice is saved once.
  id           uuid primary key,
  company_id   uuid not null references public.companies (id) on delete cascade,
  job_id       uuid not null,
  employee_id  uuid not null,
  -- Shown on the message. Crew can't look up each other's records, so the
  -- name is kept with it.
  sender_name  text not null,
  body         text check (body is null or length(body) between 1 and 2000),
  photo_path   text unique,
  created_at   timestamptz not null default now(),
  removed_at   timestamptz,
  removed_by   uuid,
  -- When the sender's phone asked for the others to be notified.
  notified_at  timestamptz,
  check (removed_at is not null or body is not null or photo_path is not null),
  foreign key (company_id, job_id) references public.jobs (company_id, id) on delete cascade,
  foreign key (company_id, employee_id) references public.employees (company_id, id),
  foreign key (company_id, removed_by) references public.employees (company_id, id)
);

create index chat_messages_job_created_idx on public.chat_messages (job_id, created_at desc);
create index chat_messages_company_job_idx on public.chat_messages (company_id, job_id);
create index chat_messages_company_employee_idx on public.chat_messages (company_id, employee_id);
create index chat_messages_company_removed_by_idx on public.chat_messages (company_id, removed_by);

-- When each person last opened each job's chat, for "new messages".
create table public.chat_reads (
  employee_id  uuid not null,
  job_id       uuid not null,
  company_id   uuid not null,
  read_at      timestamptz not null default now(),
  primary key (employee_id, job_id),
  foreign key (company_id, employee_id) references public.employees (company_id, id) on delete cascade,
  foreign key (company_id, job_id) references public.jobs (company_id, id) on delete cascade
);

create index chat_reads_company_job_idx on public.chat_reads (company_id, job_id);

alter table public.chat_messages enable row level security;
alter table public.chat_reads enable row level security;

revoke all on public.chat_messages, public.chat_reads from anon, authenticated;
grant select on public.chat_messages, public.chat_reads to authenticated;

-- The office sees every job's chat; crew see the chats of jobs they're on.
create policy chat_messages_select on public.chat_messages for select to authenticated
  using (company_id = (select private.current_company_id())
         and ((select private.is_company_admin()) or private.on_job(job_id)));

create policy chat_reads_select on public.chat_reads for select to authenticated
  using (company_id = (select private.current_company_id())
         and employee_id = (select private.current_employee_id()));

-- New and changed messages are pushed to open chat screens. Row level
-- security decides who receives each one.
alter publication supabase_realtime add table public.chat_messages;

-- Chat photos: a private bucket, in <company>/<job>/<message>.jpg. Only
-- people who can see the job's chat can add or see its photos; nobody can
-- change or remove one.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-photos', 'chat-photos', false, 10485760, array['image/jpeg']);

-- Whether the signed-in person can use a job's chat, from a photo's folder.
create function private.can_chat(p_job text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.jobs j
    where j.id::text = p_job
      and j.company_id = (select private.current_company_id())
      and ((select private.is_company_admin()) or private.on_job(j.id))
  )
$$;
revoke all on function private.can_chat(text) from public, anon;
grant execute on function private.can_chat(text) to authenticated;

create policy chat_photos_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'chat-photos'
              and (storage.foldername(name))[1] = (select private.current_company_id())::text
              and private.can_chat((storage.foldername(name))[2]));

create policy chat_photos_read on storage.objects for select to authenticated
  using (bucket_id = 'chat-photos'
         and (storage.foldername(name))[1] = (select private.current_company_id())::text
         and private.can_chat((storage.foldername(name))[2]));

-- Sends a message to a job's chat. The photo, if any, must already be
-- uploaded to <company>/<job>/<message id>.jpg. Crew can post on active jobs;
-- the office on any of its jobs. Sending the same id again does nothing.
-- Errors are short codes the app turns into plain words.
create function public.send_chat_message(p_id uuid, p_job_id uuid, p_body text, p_photo boolean)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  me     uuid := private.current_employee_id();
  co     uuid := private.current_company_id();
  admin  boolean := private.is_company_admin();
  words  text := nullif(trim(coalesce(p_body, '')), '');
  path   text;
  sent   timestamptz;
begin
  if me is null or co is null then
    raise exception 'no_access';
  end if;
  if p_id is null then
    raise exception 'missing_id';
  end if;
  select created_at into sent from public.chat_messages where id = p_id and employee_id = me;
  if found then
    return sent;
  end if;
  if not exists (select 1 from public.jobs j
                 where j.id = p_job_id and j.company_id = co
                   and (admin or (j.status = 'active' and private.on_job(j.id)))) then
    raise exception 'not_on_job';
  end if;
  if length(words) > 2000 then
    raise exception 'too_long';
  end if;
  if coalesce(p_photo, false) then
    path := co || '/' || p_job_id || '/' || p_id || '.jpg';
    if not exists (select 1 from storage.objects where bucket_id = 'chat-photos' and name = path) then
      raise exception 'photo_missing';
    end if;
  end if;
  if words is null and path is null then
    raise exception 'empty';
  end if;

  insert into public.chat_messages (id, company_id, job_id, employee_id, sender_name, body, photo_path)
  values (p_id, co, p_job_id, me, (select full_name from public.employees where id = me), words, path)
  returning created_at into sent;
  return sent;
end;
$$;

-- The office removes a message: its words and photo are cleared for good.
create function public.remove_chat_message(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me  uuid := private.current_employee_id();
  co  uuid := private.current_company_id();
begin
  if me is null or co is null or not private.is_company_admin() then
    raise exception 'no_access';
  end if;
  update public.chat_messages
     set body = null, photo_path = null, removed_at = now(), removed_by = me
   where id = p_id and company_id = co and removed_at is null;
  if not found then
    raise exception 'not_found';
  end if;
end;
$$;

-- Marks a job's chat as read by the signed-in person.
create function public.mark_chat_read(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me  uuid := private.current_employee_id();
  co  uuid := private.current_company_id();
begin
  if me is null or co is null or not private.can_chat(p_job_id::text) then
    raise exception 'no_access';
  end if;
  insert into public.chat_reads (employee_id, job_id, company_id)
  values (me, p_job_id, co)
  on conflict (employee_id, job_id) do update set read_at = now();
end;
$$;

-- How many messages from others the signed-in person hasn't seen, per job
-- whose chat they can use.
create function public.chat_unread()
returns table (job_id uuid, unread integer)
language sql
stable
set search_path = ''
as $$
  select m.job_id, count(*)::integer
  from public.chat_messages m
  left join public.chat_reads r
    on r.job_id = m.job_id and r.employee_id = (select private.current_employee_id())
  where m.employee_id <> (select private.current_employee_id())
    and m.removed_at is null
    and m.created_at > coalesce(r.read_at, '-infinity')
  group by m.job_id
$$;

-- The phones to notify about a new message: everyone else who can see the
-- job's chat (its crew and the office). Only the sender can ask, once per
-- message, within ten minutes of sending it.
create function public.chat_message_targets(p_id uuid)
returns table (endpoint text, p256dh text, auth text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  me   uuid := private.current_employee_id();
  msg  public.chat_messages;
begin
  update public.chat_messages
     set notified_at = now()
   where id = p_id and employee_id = me and notified_at is null
     and created_at > now() - interval '10 minutes'
  returning * into msg;
  if not found then
    return;
  end if;
  return query
  select s.endpoint, s.p256dh, s.auth
  from public.push_subscriptions s
  join public.employees e on e.id = s.employee_id and e.is_active
  left join public.roles r on r.key = e.role_key
  where s.company_id = msg.company_id
    and s.employee_id <> me
    and (coalesce(r.is_admin, false)
         or exists (select 1 from public.job_assignments a
                    where a.job_id = msg.job_id and a.employee_id = e.id));
end;
$$;

revoke all on function public.send_chat_message(uuid, uuid, text, boolean) from public, anon;
grant execute on function public.send_chat_message(uuid, uuid, text, boolean) to authenticated;
revoke all on function public.remove_chat_message(uuid) from public, anon;
grant execute on function public.remove_chat_message(uuid) to authenticated;
revoke all on function public.mark_chat_read(uuid) from public, anon;
grant execute on function public.mark_chat_read(uuid) to authenticated;
revoke all on function public.chat_unread() from public, anon;
grant execute on function public.chat_unread() to authenticated;
revoke all on function public.chat_message_targets(uuid) from public, anon;
grant execute on function public.chat_message_targets(uuid) to authenticated;
