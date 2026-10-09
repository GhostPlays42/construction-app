-- Pre-shift safety meetings: one per job per day, run by anyone on the job
-- after their own FLHA.
-- The person running it ticks the hazards talked about, writes the topic, and
-- each crew member present either signs with their finger on that phone or
-- has their name tapped. No photo.
--
-- A safety meeting is a signed record, so once sent it never changes.
-- Workers can't write these tables directly; they send through
-- public.submit_safety_meeting, which checks everything in one place. Hazard
-- and crew names are copied in, so the record still reads the same later.
--
-- The id comes from the phone. Sending the same meeting twice (for example
-- when a phone retries after losing signal) saves it once.

create table public.safety_meetings (
  id            uuid primary key,
  company_id    uuid not null references public.companies (id) on delete cascade,
  job_id        uuid not null,
  -- Who ran it.
  led_by        uuid not null,
  -- The day it counts for, in the company's time zone.
  work_date     date not null,
  -- When it was filled in on the phone, and when it reached us.
  filled_at     timestamptz not null,
  submitted_at  timestamptz not null default now(),
  topic         text not null check (length(trim(topic)) between 1 and 2000),
  other_hazard  text check (other_hazard is null or length(trim(other_hazard)) between 1 and 500),
  unique (company_id, id),
  unique (job_id, work_date),
  foreign key (company_id, job_id) references public.jobs (company_id, id),
  foreign key (company_id, led_by) references public.employees (company_id, id)
);

create index safety_meetings_company_date_idx on public.safety_meetings (company_id, work_date);
create index safety_meetings_company_job_idx on public.safety_meetings (company_id, job_id);
create index safety_meetings_company_led_by_idx on public.safety_meetings (company_id, led_by);

create table public.safety_meeting_hazards (
  meeting_id  uuid not null,
  company_id  uuid not null,
  hazard_id   uuid not null,
  name        text not null,
  position    integer not null,
  primary key (meeting_id, hazard_id),
  foreign key (company_id, meeting_id) references public.safety_meetings (company_id, id) on delete cascade,
  foreign key (company_id, hazard_id) references public.hazards (company_id, id)
);

-- The crew present. A signature is SVG path data; with none, the person
-- running the meeting tapped their name.
create table public.safety_meeting_attendees (
  meeting_id   uuid not null,
  company_id   uuid not null,
  employee_id  uuid not null,
  name         text not null,
  signature    text check (signature is null or length(signature) between 1 and 200000),
  position     integer not null,
  primary key (meeting_id, employee_id),
  foreign key (company_id, meeting_id) references public.safety_meetings (company_id, id) on delete cascade,
  foreign key (company_id, employee_id) references public.employees (company_id, id)
);

create index safety_meeting_hazards_company_meeting_idx on public.safety_meeting_hazards (company_id, meeting_id);
create index safety_meeting_hazards_company_hazard_idx on public.safety_meeting_hazards (company_id, hazard_id);
create index safety_meeting_attendees_company_meeting_idx on public.safety_meeting_attendees (company_id, meeting_id);
create index safety_meeting_attendees_company_employee_idx on public.safety_meeting_attendees (company_id, employee_id);

alter table public.safety_meetings enable row level security;
alter table public.safety_meeting_hazards enable row level security;
alter table public.safety_meeting_attendees enable row level security;

revoke all on public.safety_meetings, public.safety_meeting_hazards, public.safety_meeting_attendees
  from anon, authenticated;
grant select on public.safety_meetings, public.safety_meeting_hazards, public.safety_meeting_attendees
  to authenticated;

-- Whether the signed-in person is on a job's crew.
create function private.on_job(p_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.job_assignments a
                 where a.job_id = p_job_id
                   and a.employee_id = (select private.current_employee_id()))
$$;
revoke all on function private.on_job(uuid) from public, anon;
grant execute on function private.on_job(uuid) to authenticated;

-- Admins see every meeting in their company. Crew see the meetings for jobs
-- they're on, so the whole crew knows it happened. Signatures are seen by
-- admins, the person who ran the meeting, and the person who signed.
create policy safety_meetings_select on public.safety_meetings for select to authenticated
  using (company_id = (select private.current_company_id())
         and ((select private.is_company_admin()) or private.on_job(job_id)));

create policy safety_meeting_hazards_select on public.safety_meeting_hazards for select to authenticated
  using (company_id = (select private.current_company_id())
         and ((select private.is_company_admin())
              or exists (select 1 from public.safety_meetings m
                         where m.id = safety_meeting_hazards.meeting_id and private.on_job(m.job_id))));

create policy safety_meeting_attendees_select on public.safety_meeting_attendees for select to authenticated
  using (company_id = (select private.current_company_id())
         and ((select private.is_company_admin())
              or employee_id = (select private.current_employee_id())
              or exists (select 1 from public.safety_meetings m
                         where m.id = safety_meeting_attendees.meeting_id
                           and m.led_by = (select private.current_employee_id()))));

-- The crew of each active job the signed-in person is on, for the sign-off
-- list on their phone. Workers can't read other people's job assignments
-- directly.
create function public.my_job_crews()
returns table (job_id uuid, employee_id uuid, full_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select a.job_id, e.id, e.full_name
  from public.job_assignments a
  join public.jobs j on j.id = a.job_id and j.status = 'active'
  join public.employees e on e.id = a.employee_id and e.is_active
  where a.company_id = (select private.current_company_id())
    and private.on_job(a.job_id)
  order by e.full_name
$$;
revoke all on function public.my_job_crews() from public, anon;
grant execute on function public.my_job_crews() to authenticated;

-- Saves a safety meeting for a job the sender is on. p_attendees is a JSON
-- array of {"employee_id": "...", "signature": "M1 1 L5 5" or null}, each
-- someone on the job's crew. Errors are short codes the app turns into
-- plain words.
create function public.submit_safety_meeting(
  p_id            uuid,
  p_job_id        uuid,
  p_hazard_ids    uuid[],
  p_other_hazard  text,
  p_topic         text,
  p_attendees     jsonb,
  p_filled_at     timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me          uuid := private.current_employee_id();
  co          uuid := private.current_company_id();
  day         date;
  other       text := nullif(trim(coalesce(p_other_hazard, '')), '');
  topic       text := trim(coalesce(p_topic, ''));
  hazard_ids  uuid[] := array(select distinct x from unnest(coalesce(p_hazard_ids, '{}')) x);
  existing    uuid;
  n           integer;
begin
  if me is null or co is null then
    raise exception 'no_access';
  end if;
  if p_id is null then
    raise exception 'missing_id';
  end if;

  -- Already received: a resend of the same meeting is fine.
  select led_by into existing from public.safety_meetings where id = p_id;
  if found then
    if existing = me then
      return p_id;
    end if;
    raise exception 'missing_id';
  end if;

  -- Filled in on the phone no later than now. A phone can hold a meeting for
  -- up to two weeks without signal; older than that is a wrong phone clock.
  if p_filled_at is null or p_filled_at > now() + interval '5 minutes'
     or p_filled_at < now() - interval '14 days' then
    raise exception 'bad_time';
  end if;
  day := (p_filled_at at time zone 'America/Vancouver')::date;

  if not exists (select 1
                 from public.jobs j
                 join public.job_assignments a on a.job_id = j.id and a.employee_id = me
                 where j.id = p_job_id and j.company_id = co and j.status = 'active') then
    raise exception 'job_not_available';
  end if;
  -- Like every form, it comes after the sender's FLHA for the day.
  if not exists (select 1 from public.flhas
                 where job_id = p_job_id and employee_id = me and work_date = day) then
    raise exception 'flha_required';
  end if;
  if exists (select 1 from public.safety_meetings where job_id = p_job_id and work_date = day) then
    raise exception 'already_done';
  end if;

  if cardinality(hazard_ids) = 0 and other is null then
    raise exception 'hazard_required';
  end if;
  if length(other) > 500 then
    raise exception 'other_too_long';
  end if;
  if (select count(*) from public.hazards
      where id = any(hazard_ids) and company_id = co and is_active) <> cardinality(hazard_ids) then
    raise exception 'item_not_available';
  end if;

  if topic = '' then
    raise exception 'topic_required';
  end if;
  if length(topic) > 2000 then
    raise exception 'topic_too_long';
  end if;

  if p_attendees is null or jsonb_typeof(p_attendees) <> 'array' or jsonb_array_length(p_attendees) = 0 then
    raise exception 'crew_required';
  end if;
  if (select count(distinct a.employee_id) from jsonb_to_recordset(p_attendees) a(employee_id uuid))
     <> jsonb_array_length(p_attendees) then
    raise exception 'crew_changed';
  end if;
  select count(*) into n
  from jsonb_to_recordset(p_attendees) a(employee_id uuid)
  join public.job_assignments ja on ja.job_id = p_job_id and ja.employee_id = a.employee_id
  join public.employees e on e.id = a.employee_id and e.is_active;
  if n <> jsonb_array_length(p_attendees) then
    raise exception 'crew_changed';
  end if;
  if exists (select 1 from jsonb_to_recordset(p_attendees) a(signature text)
             where a.signature is not null
               and (length(trim(a.signature)) = 0 or length(a.signature) > 200000)) then
    raise exception 'signature_too_big';
  end if;

  begin
    insert into public.safety_meetings (id, company_id, job_id, led_by, work_date, filled_at, topic, other_hazard)
    values (p_id, co, p_job_id, me, day, p_filled_at, topic, other);
  exception when unique_violation then
    raise exception 'already_done';
  end;

  insert into public.safety_meeting_hazards (meeting_id, company_id, hazard_id, name, position)
  select p_id, co, h.id, h.name, row_number() over (order by h.sort_order, h.name)
  from public.hazards h where h.id = any(hazard_ids);

  insert into public.safety_meeting_attendees (meeting_id, company_id, employee_id, name, signature, position)
  select p_id, co, e.id, e.full_name, a.signature, row_number() over (order by e.full_name)
  from jsonb_to_recordset(p_attendees) a(employee_id uuid, signature text)
  join public.employees e on e.id = a.employee_id;

  return p_id;
end;
$$;

revoke all on function public.submit_safety_meeting(uuid, uuid, uuid[], text, text, jsonb, timestamptz)
  from public, anon;
grant execute on function public.submit_safety_meeting(uuid, uuid, uuid[], text, text, jsonb, timestamptz)
  to authenticated;
