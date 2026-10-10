-- Dispatch: the office plans who and what goes to each job on each day,
-- with a start time and a note. The plan is a draft until the office sends
-- it; sending copies it to each worker's schedule and returns who changed,
-- so the app can notify them. Workers only ever see what was sent.
--
-- Days are in America/Vancouver until each company picks its own time zone.

-- The office's plan: one row per job per day.
create table public.dispatches (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies (id) on delete cascade,
  job_id      uuid not null,
  work_date   date not null,
  start_time  time check (start_time is null or extract(epoch from start_time)::integer % 900 = 0),
  notes       text check (notes is null or length(trim(notes)) between 1 and 1000),
  updated_at  timestamptz not null default now(),
  updated_by  uuid not null,
  unique (company_id, id),
  unique (job_id, work_date),
  foreign key (company_id, job_id) references public.jobs (company_id, id),
  foreign key (company_id, updated_by) references public.employees (company_id, id)
);

create index dispatches_company_date_idx on public.dispatches (company_id, work_date);
create index dispatches_company_by_idx on public.dispatches (company_id, updated_by);

create table public.dispatch_people (
  dispatch_id  uuid not null,
  company_id   uuid not null,
  employee_id  uuid not null,
  primary key (dispatch_id, employee_id),
  foreign key (company_id, dispatch_id) references public.dispatches (company_id, id) on delete cascade,
  foreign key (company_id, employee_id) references public.employees (company_id, id)
);

create index dispatch_people_company_employee_idx on public.dispatch_people (company_id, employee_id);

create table public.dispatch_equipment (
  dispatch_id   uuid not null,
  company_id    uuid not null,
  equipment_id  uuid not null,
  primary key (dispatch_id, equipment_id),
  foreign key (company_id, dispatch_id) references public.dispatches (company_id, id) on delete cascade,
  foreign key (company_id, equipment_id) references public.equipment (company_id, id)
);

create index dispatch_equipment_company_equipment_idx on public.dispatch_equipment (company_id, equipment_id);

-- What each worker has been sent: one row per worker, day and job.
create table public.schedule_entries (
  company_id   uuid not null references public.companies (id) on delete cascade,
  employee_id  uuid not null,
  work_date    date not null,
  job_id       uuid not null,
  start_time   time,
  notes        text,
  sent_at      timestamptz not null default now(),
  primary key (employee_id, work_date, job_id),
  foreign key (company_id, employee_id) references public.employees (company_id, id) on delete cascade,
  foreign key (company_id, job_id) references public.jobs (company_id, id)
);

create index schedule_entries_company_date_idx on public.schedule_entries (company_id, work_date);
create index schedule_entries_company_employee_idx on public.schedule_entries (company_id, employee_id);
create index schedule_entries_company_job_idx on public.schedule_entries (company_id, job_id, work_date);

-- A worker's phone, for app notifications.
create table public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null,
  employee_id  uuid not null,
  endpoint     text not null unique check (endpoint ~ '^https://' and length(endpoint) <= 2000),
  p256dh       text not null check (length(p256dh) <= 200),
  auth         text not null check (length(auth) <= 100),
  created_at   timestamptz not null default now(),
  foreign key (company_id, employee_id) references public.employees (company_id, id) on delete cascade
);

create index push_subscriptions_company_employee_idx on public.push_subscriptions (company_id, employee_id);

alter table public.dispatches enable row level security;
alter table public.dispatch_people enable row level security;
alter table public.dispatch_equipment enable row level security;
alter table public.schedule_entries enable row level security;
alter table public.push_subscriptions enable row level security;

revoke all on public.dispatches, public.dispatch_people, public.dispatch_equipment,
              public.schedule_entries, public.push_subscriptions from anon, authenticated;
grant select on public.dispatches, public.dispatch_people, public.dispatch_equipment,
                public.schedule_entries, public.push_subscriptions to authenticated;

-- The plan is the office's.
create policy dispatches_select on public.dispatches for select to authenticated
  using (company_id = (select private.current_company_id()) and (select private.is_company_admin()));
create policy dispatch_people_select on public.dispatch_people for select to authenticated
  using (company_id = (select private.current_company_id()) and (select private.is_company_admin()));
create policy dispatch_equipment_select on public.dispatch_equipment for select to authenticated
  using (company_id = (select private.current_company_id()) and (select private.is_company_admin()));

-- Workers see their own schedule; admins see everyone's.
create policy schedule_entries_select on public.schedule_entries for select to authenticated
  using (company_id = (select private.current_company_id())
         and ((select private.is_company_admin())
              or employee_id = (select private.current_employee_id())));

-- Admins read phones to notify them; workers see their own.
create policy push_subscriptions_select on public.push_subscriptions for select to authenticated
  using (company_id = (select private.current_company_id())
         and ((select private.is_company_admin())
              or employee_id = (select private.current_employee_id())));

-- Saves the plan for a job and day: start time, note, people and equipment.
-- No people and no equipment clears it. Today and later only.
create function public.save_dispatch(
  p_job_id      uuid,
  p_date        date,
  p_start_time  time,
  p_notes       text,
  p_people      uuid[],
  p_equipment   uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me     uuid := private.current_employee_id();
  co     uuid := private.current_company_id();
  note   text := nullif(trim(coalesce(p_notes, '')), '');
  d_id   uuid;
begin
  if me is null or co is null or not private.is_company_admin() then
    raise exception 'no_access';
  end if;
  if p_date is null or p_date < (now() at time zone 'America/Vancouver')::date then
    raise exception 'past_date';
  end if;
  if not exists (select 1 from public.jobs where id = p_job_id and company_id = co and status = 'active') then
    raise exception 'job_not_available';
  end if;
  if p_start_time is not null and extract(epoch from p_start_time)::integer % 900 <> 0 then
    raise exception 'bad_time';
  end if;
  if length(note) > 1000 then
    raise exception 'notes_too_long';
  end if;
  if exists (select 1 from unnest(coalesce(p_people, '{}')) e
             where not exists (select 1 from public.employees
                               where id = e and company_id = co and is_active)) then
    raise exception 'person_not_available';
  end if;
  if exists (select 1 from unnest(coalesce(p_equipment, '{}')) m
             where not exists (select 1 from public.equipment
                               where id = m and company_id = co and is_active)) then
    raise exception 'equipment_not_available';
  end if;

  insert into public.dispatches (company_id, job_id, work_date, start_time, notes, updated_by)
  values (co, p_job_id, p_date, p_start_time, note, me)
  on conflict (job_id, work_date) do update
    set start_time = excluded.start_time, notes = excluded.notes,
        updated_at = now(), updated_by = excluded.updated_by
  returning id into d_id;

  merge into public.dispatch_people t
  using (select distinct e from unnest(coalesce(p_people, '{}')) e) s
  on t.dispatch_id = d_id and t.employee_id = s.e
  when not matched by target then
    insert (dispatch_id, company_id, employee_id) values (d_id, co, s.e)
  when not matched by source and t.dispatch_id = d_id then
    delete;

  merge into public.dispatch_equipment t
  using (select distinct m from unnest(coalesce(p_equipment, '{}')) m) s
  on t.dispatch_id = d_id and t.equipment_id = s.m
  when not matched by target then
    insert (dispatch_id, company_id, equipment_id) values (d_id, co, s.m)
  when not matched by source and t.dispatch_id = d_id then
    delete;

  -- Machines sent to a job are on it, like ticking them on the job screen.
  insert into public.job_equipment (job_id, equipment_id, company_id)
  select p_job_id, m, co from unnest(coalesce(p_equipment, '{}')) m
  on conflict do nothing;
end;
$$;

-- People and machines in a plan who are also planned for another job that
-- day, for the double-booking warning.
create function public.dispatch_conflicts(p_job_id uuid, p_date date, p_people uuid[], p_equipment uuid[])
returns table (kind text, id uuid, name text, other_job text)
language sql
stable
set search_path = ''
as $$
  select 'person', e.id, e.full_name, j.name
  from public.dispatch_people p
  join public.dispatches d on d.id = p.dispatch_id
  join public.jobs j on j.id = d.job_id
  join public.employees e on e.id = p.employee_id
  where d.work_date = p_date and d.job_id <> p_job_id
    and p.employee_id = any (coalesce(p_people, '{}'))
    and d.company_id = (select private.current_company_id())
  union all
  select 'equipment', m.id, case when m.unit_number is null then m.name else m.name || ' ' || m.unit_number end, j.name
  from public.dispatch_equipment q
  join public.dispatches d on d.id = q.dispatch_id
  join public.jobs j on j.id = d.job_id
  join public.equipment m on m.id = q.equipment_id
  where d.work_date = p_date and d.job_id <> p_job_id
    and q.equipment_id = any (coalesce(p_equipment, '{}'))
    and d.company_id = (select private.current_company_id())
  order by 1, 3, 4
$$;

-- What the plan says each worker should be sent, from today on.
create function private.planned_schedule(p_company uuid)
returns table (employee_id uuid, work_date date, job_id uuid, start_time time, notes text)
language sql
stable
set search_path = ''
as $$
  select p.employee_id, d.work_date, d.job_id, d.start_time, d.notes
  from public.dispatches d
  join public.dispatch_people p on p.dispatch_id = d.id
  join public.employees e on e.id = p.employee_id and e.is_active
  join public.jobs j on j.id = d.job_id and j.status = 'active'
  where d.company_id = p_company
    and d.work_date >= (now() at time zone 'America/Vancouver')::date
$$;

-- The workers whose schedule from today on would change if the plan were
-- sent now. Empty when everything has been sent.
create function public.unsent_schedule_people()
returns setof uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  co  uuid := private.current_company_id();
begin
  if co is null or not private.is_company_admin() then
    raise exception 'no_access';
  end if;
  return query
  select distinct x.employee_id from (
    (select * from private.planned_schedule(co)
     except
     select s.employee_id, s.work_date, s.job_id, s.start_time, s.notes from public.schedule_entries s
     where s.company_id = co and s.work_date >= (now() at time zone 'America/Vancouver')::date)
    union all
    (select s.employee_id, s.work_date, s.job_id, s.start_time, s.notes from public.schedule_entries s
     where s.company_id = co and s.work_date >= (now() at time zone 'America/Vancouver')::date
     except
     select * from private.planned_schedule(co))
  ) x;
end;
$$;

-- Sends the plan from today on: each worker's schedule becomes what the plan
-- says, and people sent to a job are put on its crew so their forms work.
-- Returns the workers whose schedule changed, to notify.
create function public.send_schedule()
returns setof uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  co       uuid := private.current_company_id();
  today    date := (now() at time zone 'America/Vancouver')::date;
  changed  uuid[];
begin
  if co is null or not private.is_company_admin() then
    raise exception 'no_access';
  end if;
  select coalesce(array_agg(u), '{}') into changed from public.unsent_schedule_people() u;

  merge into public.schedule_entries t
  using private.planned_schedule(co) s
  on t.employee_id = s.employee_id and t.work_date = s.work_date and t.job_id = s.job_id
  when matched and (t.start_time is distinct from s.start_time or t.notes is distinct from s.notes) then
    update set start_time = s.start_time, notes = s.notes, sent_at = now()
  when not matched by target then
    insert (company_id, employee_id, work_date, job_id, start_time, notes)
    values (co, s.employee_id, s.work_date, s.job_id, s.start_time, s.notes)
  when not matched by source and t.company_id = co and t.work_date >= today then
    delete;

  insert into public.job_assignments (job_id, employee_id, company_id)
  select distinct s.job_id, s.employee_id, co from private.planned_schedule(co) s
  on conflict do nothing;

  return query select unnest(changed);
end;
$$;

-- Keeps this phone for app notifications to the signed-in worker.
create function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me  uuid := private.current_employee_id();
  co  uuid := private.current_company_id();
begin
  if me is null or co is null then
    raise exception 'no_access';
  end if;
  if p_endpoint is null or p_endpoint !~ '^https://' or length(p_endpoint) > 2000
     or length(coalesce(p_p256dh, '')) not between 1 and 200 or length(coalesce(p_auth, '')) not between 1 and 100 then
    raise exception 'bad_subscription';
  end if;
  insert into public.push_subscriptions (company_id, employee_id, endpoint, p256dh, auth)
  values (co, me, p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set company_id = excluded.company_id, employee_id = excluded.employee_id,
        p256dh = excluded.p256dh, auth = excluded.auth, created_at = now();
end;
$$;

-- Forgets phones that no longer take notifications (or this phone, when its
-- worker signs out). Admins can forget any in their company.
create function public.remove_push_subscriptions(p_endpoints text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me     uuid := private.current_employee_id();
  co     uuid := private.current_company_id();
  admin  boolean := private.is_company_admin();
begin
  if me is null or co is null then
    raise exception 'no_access';
  end if;
  merge into public.push_subscriptions t
  using (select distinct e from unnest(coalesce(p_endpoints, '{}')) e) s
  on t.endpoint = s.e
  when matched and t.company_id = co and (admin or t.employee_id = me) then
    delete;
end;
$$;

revoke all on function public.save_dispatch(uuid, date, time, text, uuid[], uuid[]) from public, anon;
grant execute on function public.save_dispatch(uuid, date, time, text, uuid[], uuid[]) to authenticated;
revoke all on function public.dispatch_conflicts(uuid, date, uuid[], uuid[]) from public, anon;
grant execute on function public.dispatch_conflicts(uuid, date, uuid[], uuid[]) to authenticated;
revoke all on function private.planned_schedule(uuid) from public, anon, authenticated;
revoke all on function public.unsent_schedule_people() from public, anon;
grant execute on function public.unsent_schedule_people() to authenticated;
revoke all on function public.send_schedule() from public, anon;
grant execute on function public.send_schedule() to authenticated;
revoke all on function public.save_push_subscription(text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text) to authenticated;
revoke all on function public.remove_push_subscriptions(text[]) from public, anon;
grant execute on function public.remove_push_subscriptions(text[]) to authenticated;

-- The daily report's crew: who was sent to the job that day when the
-- schedule was used, otherwise everyone on the job's crew.
create or replace function public.daily_report_content(p_job_id uuid, p_date date)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  co      uuid := private.current_company_id();
  job     public.jobs;
  result  jsonb;
begin
  if co is null or not private.is_company_admin() then
    raise exception 'no_access';
  end if;
  select * into job from public.jobs where id = p_job_id and company_id = co;
  if not found or p_date is null then
    raise exception 'not_found';
  end if;

  with
  cards as (
    select t.*, e.full_name
    from public.time_cards t join public.employees e on e.id = t.employee_id
    where t.job_id = p_job_id and t.work_date = p_date
  ),
  flhas as (
    select f.*, e.full_name
    from public.flhas f join public.employees e on e.id = f.employee_id
    where f.job_id = p_job_id and f.work_date = p_date
  ),
  sent as (
    select employee_id from public.schedule_entries where job_id = p_job_id and work_date = p_date
  ),
  -- Who was meant to be there: the people sent that day, or (when nobody was
  -- sent) everyone on the job who is switched on.
  expected as (
    select e.id, e.full_name, e.trade
    from public.employees e
    where e.company_id = co and e.is_active
      and case when exists (select 1 from sent)
               then e.id in (select employee_id from sent)
               else e.id in (select employee_id from public.job_assignments where job_id = p_job_id) end
  ),
  -- The crew: everyone expected, plus anyone else who sent something.
  crew as (
    select x.id, x.full_name, x.trade, true as on_crew from expected x
    union all
    select e.id, e.full_name, e.trade, false
    from public.employees e
    where e.company_id = co
      and e.id not in (select id from expected)
      and (e.id in (select employee_id from cards) or e.id in (select employee_id from flhas))
  ),
  meeting as (
    select m.*, e.full_name
    from public.safety_meetings m join public.employees e on e.id = m.led_by
    where m.job_id = p_job_id and m.work_date = p_date
  ),
  slips as (
    select s.*, e.full_name
    from public.trucking_slips s join public.employees e on e.id = s.employee_id
    where s.job_id = p_job_id and s.work_date = p_date
  ),
  entries as (
    select s.*, e.full_name
    from public.site_entries s join public.employees e on e.id = s.employee_id
    where s.job_id = p_job_id and s.work_date = p_date
  )
  select jsonb_build_object(
    'job', jsonb_build_object('id', job.id, 'name', job.name, 'job_number', job.job_number,
                              'address', job.address, 'client', job.client),
    'date', p_date,

    'manpower', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', c.full_name, 'trade', c.trade,
               'start', to_char(t.start_time, 'HH24:MI'), 'end', to_char(t.end_time, 'HH24:MI'),
               'break_minutes', t.break_minutes, 'minutes', t.worked_minutes,
               'approved', t.status = 'approved')
             order by c.full_name)
      from crew c join cards t on t.employee_id = c.id), '[]'::jsonb),
    'total_minutes', coalesce((select sum(worked_minutes) from cards), 0),

    'cost_codes', coalesce((
      select jsonb_agg(jsonb_build_object('code', g.code, 'name', g.name, 'minutes', g.minutes, 'lines', g.lines)
             order by g.code, g.name)
      from (select l.code, l.name, sum(l.minutes) as minutes,
                   jsonb_agg(jsonb_build_object('name', t.full_name, 'minutes', l.minutes, 'description', l.description)
                             order by t.full_name, l.position) as lines
            from public.time_card_lines l join cards t on t.id = l.time_card_id
            group by l.code, l.name) g), '[]'::jsonb),

    'equipment', coalesce((
      select jsonb_agg(jsonb_build_object('name', g.name, 'unit_number', g.unit_number, 'minutes', g.minutes, 'by', g.by)
             order by g.name)
      from (select q.name, m.unit_number, sum(q.minutes) as minutes,
                   jsonb_agg(jsonb_build_object('name', t.full_name, 'minutes', q.minutes) order by t.full_name) as by
            from public.time_card_equipment q
            join cards t on t.id = q.time_card_id
            join public.equipment m on m.id = q.equipment_id
            group by q.equipment_id, q.name, m.unit_number) g), '[]'::jsonb),

    'flhas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', c.full_name,
               'done', f.id is not null,
               'filled_at', f.filled_at,
               'tasks', coalesce((select jsonb_agg(k.code || ' ' || k.name order by k.position)
                                  from public.flha_tasks k where k.flha_id = f.id), '[]'::jsonb),
               'hazards', coalesce((select jsonb_agg(jsonb_build_object('name', h.name, 'control', h.control) order by h.position)
                                    from public.flha_hazards h where h.flha_id = f.id), '[]'::jsonb)
                          || case when f.other_hazard is not null
                                  then jsonb_build_array(jsonb_build_object('name', f.other_hazard, 'control', f.other_control))
                                  else '[]'::jsonb end,
               'ppe', coalesce((select jsonb_agg(p.name order by p.position)
                                from public.flha_ppe p where p.flha_id = f.id), '[]'::jsonb))
             order by c.full_name)
      from crew c left join flhas f on f.employee_id = c.id), '[]'::jsonb),

    'safety_meeting', (
      select jsonb_build_object(
               'led_by', m.full_name, 'filled_at', m.filled_at, 'topic', m.topic,
               'hazards', coalesce((select jsonb_agg(h.name order by h.position)
                                    from public.safety_meeting_hazards h where h.meeting_id = m.id), '[]'::jsonb)
                          || case when m.other_hazard is not null then jsonb_build_array(m.other_hazard) else '[]'::jsonb end,
               'attendees', coalesce((select jsonb_agg(jsonb_build_object('name', a.name, 'signed', a.signature is not null)
                                                       order by a.position)
                                      from public.safety_meeting_attendees a where a.meeting_id = m.id), '[]'::jsonb))
      from meeting m),

    'trucking', coalesce((
      select jsonb_agg(jsonb_build_object(
               'sent_by', s.full_name, 'filled_at', s.filled_at, 'checked', s.status = 'checked',
               'trucking_company', s.trucking_company, 'truck_number', s.truck_number,
               'ticket_number', s.ticket_number, 'material', s.material,
               'loads', trim_scale(s.loads), 'tonnage', trim_scale(s.tonnage), 'slip_date', s.slip_date,
               'photo_path', s.photo_path)
             order by s.filled_at)
      from slips s), '[]'::jsonb),
    'total_loads', (select trim_scale(sum(loads)) from slips),
    'total_tonnage', (select trim_scale(sum(tonnage)) from slips),

    'site_entries', coalesce((
      select jsonb_agg(jsonb_build_object(
               'sent_by', s.full_name, 'filled_at', s.filled_at, 'notes', s.notes,
               'photos', coalesce((select jsonb_agg(jsonb_build_object(
                                            'path', p.path, 'code', p.code, 'code_name', p.code_name, 'caption', p.caption)
                                          order by p.position)
                                   from public.site_photos p where p.entry_id = s.id), '[]'::jsonb))
             order by s.filled_at)
      from entries s), '[]'::jsonb),

    -- What's missing, so the office can chase it before finalizing.
    'missing', coalesce((
      select jsonb_agg(m.text order by m.n, m.text)
      from (
        select 1 as n, 'No FLHA from ' || c.full_name as text
        from crew c where c.on_crew and not exists (select 1 from flhas f where f.employee_id = c.id)
        union all
        select 2, 'No time card from ' || c.full_name
        from crew c where c.on_crew and not exists (select 1 from cards t where t.employee_id = c.id)
        union all
        select 3, 'Time card not approved: ' || t.full_name
        from cards t where t.status <> 'approved'
        union all
        select 4, 'No safety meeting'
        where not exists (select 1 from meeting)
        union all
        select 5, 'Trucking slip not checked: '
                  || coalesce('ticket ' || s.ticket_number, 'sent by ' || s.full_name)
        from slips s where s.status <> 'checked'
      ) m), '[]'::jsonb)
  )
  into result;

  return result;
end;
$$;
