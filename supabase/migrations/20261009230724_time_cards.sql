-- Time cards: each worker, each job, each day. Start, end and break give the
-- hours worked; work lines split those hours by cost code with a short
-- description; equipment lines record machine hours.
--
-- Workers can't write these tables directly. They send through
-- public.submit_time_card, which checks everything in one place, and can
-- send it again to change it until the office approves it. The office edits
-- through public.update_time_card and approves through
-- public.approve_time_card. Every change after the first send is written to
-- time_card_changes (who, when, old and new).
--
-- Times are in 15-minute steps and hours are stored as whole minutes, so the
-- work lines always add up exactly to the hours worked.
--
-- The id comes from the phone. Sending the same time card twice (for example
-- when a phone retries after losing signal) saves it once.

create table public.time_cards (
  id              uuid primary key,
  company_id      uuid not null references public.companies (id) on delete cascade,
  job_id          uuid not null,
  employee_id     uuid not null,
  -- The day the time card is for, in the company's time zone.
  work_date       date not null,
  start_time      time not null,
  end_time        time not null,
  break_minutes   integer not null default 0,
  -- End minus start minus break. An end before the start is an overnight shift.
  worked_minutes  integer not null,
  status          text not null default 'submitted'
                  check (status in ('submitted', 'approved')),
  -- When the worker last saved it on the phone, and when it first reached us.
  filled_at       timestamptz not null,
  submitted_at    timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  approved_by     uuid,
  approved_at     timestamptz,
  unique (company_id, id),
  unique (job_id, employee_id, work_date),
  check (start_time <> end_time),
  check (extract(epoch from start_time)::integer % 900 = 0),
  check (extract(epoch from end_time)::integer % 900 = 0),
  check (break_minutes >= 0 and break_minutes % 15 = 0),
  check (worked_minutes > 0 and worked_minutes % 15 = 0),
  check ((status = 'approved') = (approved_at is not null)),
  foreign key (company_id, job_id) references public.jobs (company_id, id),
  foreign key (company_id, employee_id) references public.employees (company_id, id),
  foreign key (company_id, approved_by) references public.employees (company_id, id)
);

create index time_cards_company_date_idx on public.time_cards (company_id, work_date);
create index time_cards_company_job_idx on public.time_cards (company_id, job_id);
create index time_cards_company_employee_idx on public.time_cards (company_id, employee_id);
create index time_cards_company_approved_by_idx on public.time_cards (company_id, approved_by);

-- Cost code names are copied in, so the time card still reads the same if an
-- admin later renames or switches off a cost code.
create table public.time_card_lines (
  time_card_id  uuid not null,
  company_id    uuid not null,
  position      integer not null check (position > 0),
  cost_code_id  uuid not null,
  code          text not null,
  name          text not null,
  minutes       integer not null check (minutes > 0 and minutes % 15 = 0),
  description   text not null check (length(trim(description)) between 1 and 500),
  primary key (time_card_id, position),
  foreign key (company_id, time_card_id) references public.time_cards (company_id, id) on delete cascade,
  foreign key (company_id, cost_code_id) references public.cost_codes (company_id, id)
);

create table public.time_card_equipment (
  time_card_id  uuid not null,
  company_id    uuid not null,
  equipment_id  uuid not null,
  -- The machine's name and unit number when the time card was saved.
  name          text not null,
  minutes       integer not null check (minutes > 0 and minutes % 15 = 0),
  position      integer not null,
  primary key (time_card_id, equipment_id),
  foreign key (company_id, time_card_id) references public.time_cards (company_id, id) on delete cascade,
  foreign key (company_id, equipment_id) references public.equipment (company_id, id)
);

create table public.time_card_changes (
  id            bigint generated always as identity primary key,
  time_card_id  uuid not null,
  company_id    uuid not null,
  changed_by    uuid not null,
  changed_at    timestamptz not null default now(),
  -- Which part changed: Start, End, Break, Work, Equipment or Status.
  field         text not null,
  old_value     text,
  new_value     text,
  foreign key (company_id, time_card_id) references public.time_cards (company_id, id) on delete cascade,
  foreign key (company_id, changed_by) references public.employees (company_id, id)
);

create index time_card_lines_company_card_idx on public.time_card_lines (company_id, time_card_id);
create index time_card_lines_company_code_idx on public.time_card_lines (company_id, cost_code_id);
create index time_card_equipment_company_card_idx on public.time_card_equipment (company_id, time_card_id);
create index time_card_equipment_company_equipment_idx on public.time_card_equipment (company_id, equipment_id);
create index time_card_changes_company_card_idx on public.time_card_changes (company_id, time_card_id);
create index time_card_changes_company_by_idx on public.time_card_changes (company_id, changed_by);

alter table public.time_cards enable row level security;
alter table public.time_card_lines enable row level security;
alter table public.time_card_equipment enable row level security;
alter table public.time_card_changes enable row level security;

revoke all on public.time_cards, public.time_card_lines, public.time_card_equipment,
  public.time_card_changes from anon, authenticated;
grant select on public.time_cards, public.time_card_lines, public.time_card_equipment,
  public.time_card_changes to authenticated;

-- Admins see every time card in their company; workers see their own. Only
-- admins see the change history.
create policy time_cards_select on public.time_cards for select to authenticated
  using (company_id = (select private.current_company_id())
         and ((select private.is_company_admin())
              or employee_id = (select private.current_employee_id())));

create policy time_card_lines_select on public.time_card_lines for select to authenticated
  using (company_id = (select private.current_company_id())
         and ((select private.is_company_admin())
              or exists (select 1 from public.time_cards t
                         where t.id = time_card_lines.time_card_id
                           and t.employee_id = (select private.current_employee_id()))));

create policy time_card_equipment_select on public.time_card_equipment for select to authenticated
  using (company_id = (select private.current_company_id())
         and ((select private.is_company_admin())
              or exists (select 1 from public.time_cards t
                         where t.id = time_card_equipment.time_card_id
                           and t.employee_id = (select private.current_employee_id()))));

create policy time_card_changes_select on public.time_card_changes for select to authenticated
  using (company_id = (select private.current_company_id())
         and (select private.is_company_admin()));

-- Hours as people read them: 480 -> "8h", 450 -> "7.5h".
create function private.hours_text(p_minutes integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select trim(trailing '.' from trim(trailing '0' from to_char(p_minutes / 60.0, 'FM9999990.00'))) || 'h'
$$;

-- A time card's parts as text, for the change history.
create function private.time_card_texts(p_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'Start', to_char(t.start_time, 'FMHH12:MI a.m.'),
    'End', to_char(t.end_time, 'FMHH12:MI a.m.'),
    'Break', t.break_minutes || ' min',
    'Work', (select string_agg(l.code || ' ' || l.name || ', ' || private.hours_text(l.minutes)
                               || ', ' || l.description, E'\n' order by l.position)
             from public.time_card_lines l where l.time_card_id = t.id),
    'Equipment', (select string_agg(e.name || ', ' || private.hours_text(e.minutes), E'\n'
                                    order by e.position)
                  from public.time_card_equipment e where e.time_card_id = t.id))
  from public.time_cards t where t.id = p_id
$$;

-- Writes one history row per part that differs between two time_card_texts.
create function private.log_time_card_changes(p_id uuid, p_company uuid, p_by uuid,
                                               p_old jsonb, p_new jsonb)
returns void
language sql
set search_path = ''
as $$
  insert into public.time_card_changes (time_card_id, company_id, changed_by, field, old_value, new_value)
  select p_id, p_company, p_by, f.field, p_old ->> f.field, p_new ->> f.field
  from unnest(array['Start', 'End', 'Break', 'Work', 'Equipment']) with ordinality as f(field, n)
  where (p_old ->> f.field) is distinct from (p_new ->> f.field)
  order by f.n
$$;

-- Checks and saves the hours, work lines and equipment of a time card that
-- already exists. p_lines is a JSON array of
-- {"cost_code_id": "...", "minutes": 240, "description": "..."} and
-- p_equipment of {"equipment_id": "...", "minutes": 120}. Workers may pick
-- active cost codes and active machines on the job; the office may also keep
-- ones already on the card. Errors are short codes the app turns into words.
create function private.save_time_card_details(
  p_id          uuid,
  p_start       time,
  p_end         time,
  p_break       integer,
  p_lines       jsonb,
  p_equipment   jsonb,
  p_by_office   boolean
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  card    public.time_cards;
  worked  integer;
  n       integer;
begin
  select * into card from public.time_cards where id = p_id;

  if p_start is null or p_end is null or p_start = p_end
     or extract(epoch from p_start)::integer % 900 <> 0
     or extract(epoch from p_end)::integer % 900 <> 0 then
    raise exception 'bad_times';
  end if;
  if p_break is null or p_break < 0 or p_break % 15 <> 0 then
    raise exception 'bad_break';
  end if;
  worked := (extract(epoch from (p_end - p_start))::integer / 60 + 1440) % 1440 - p_break;
  if worked <= 0 then
    raise exception 'bad_break';
  end if;

  -- Work lines.
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'line_required';
  end if;
  if jsonb_array_length(p_lines) > 30 then
    raise exception 'too_many_lines';
  end if;
  if exists (select 1 from jsonb_to_recordset(p_lines) l(minutes integer)
             where l.minutes is null or l.minutes <= 0 or l.minutes % 15 <> 0) then
    raise exception 'line_hours';
  end if;
  if exists (select 1 from jsonb_to_recordset(p_lines) l(description text)
             where length(trim(coalesce(l.description, ''))) = 0) then
    raise exception 'description_required';
  end if;
  if exists (select 1 from jsonb_to_recordset(p_lines) l(description text)
             where length(trim(l.description)) > 500) then
    raise exception 'description_too_long';
  end if;
  if (select sum(l.minutes) from jsonb_to_recordset(p_lines) l(minutes integer)) <> worked then
    raise exception 'hours_dont_match';
  end if;
  select count(*) into n
  from jsonb_to_recordset(p_lines) l(cost_code_id uuid)
  join public.cost_codes c on c.id = l.cost_code_id and c.company_id = card.company_id
  where c.is_active
     or (p_by_office and exists (select 1 from public.time_card_lines x
                                 where x.time_card_id = p_id and x.cost_code_id = c.id));
  if n <> jsonb_array_length(p_lines) then
    raise exception 'item_not_available';
  end if;

  -- Equipment lines.
  if p_equipment is null or jsonb_typeof(p_equipment) <> 'array' then
    raise exception 'item_not_available';
  end if;
  if jsonb_array_length(p_equipment) > 30 then
    raise exception 'too_many_lines';
  end if;
  if (select count(distinct e.equipment_id) from jsonb_to_recordset(p_equipment) e(equipment_id uuid))
     <> jsonb_array_length(p_equipment) then
    raise exception 'item_not_available';
  end if;
  if exists (select 1 from jsonb_to_recordset(p_equipment) e(minutes integer)
             where e.minutes is null or e.minutes <= 0 or e.minutes % 15 <> 0) then
    raise exception 'equipment_hours';
  end if;
  if exists (select 1 from jsonb_to_recordset(p_equipment) e(minutes integer)
             where e.minutes > worked) then
    raise exception 'equipment_too_long';
  end if;
  select count(*) into n
  from jsonb_to_recordset(p_equipment) e(equipment_id uuid)
  join public.equipment m on m.id = e.equipment_id and m.company_id = card.company_id
  where (m.is_active
         and (p_by_office
              or exists (select 1 from public.job_equipment je
                         where je.job_id = card.job_id and je.equipment_id = m.id)))
     or (p_by_office and exists (select 1 from public.time_card_equipment x
                                 where x.time_card_id = p_id and x.equipment_id = m.id));
  if n <> jsonb_array_length(p_equipment) then
    raise exception 'item_not_available';
  end if;

  update public.time_cards
     set start_time = p_start, end_time = p_end, break_minutes = p_break,
         worked_minutes = worked, updated_at = now()
   where id = p_id;

  merge into public.time_card_lines t
  using (select l.ordinality::integer as position, c.id as cost_code_id, c.code, c.name,
                (l.value ->> 'minutes')::integer as minutes, trim(l.value ->> 'description') as description
         from jsonb_array_elements(p_lines) with ordinality as l(value, ordinality)
         join public.cost_codes c on c.id = (l.value ->> 'cost_code_id')::uuid) s
  on t.time_card_id = p_id and t.position = s.position
  when matched then
    update set cost_code_id = s.cost_code_id, code = s.code, name = s.name,
               minutes = s.minutes, description = s.description
  when not matched by target then
    insert (time_card_id, company_id, position, cost_code_id, code, name, minutes, description)
    values (p_id, card.company_id, s.position, s.cost_code_id, s.code, s.name, s.minutes, s.description)
  when not matched by source and t.time_card_id = p_id then
    delete;

  merge into public.time_card_equipment t
  using (select m.id as equipment_id,
                m.name || coalesce(' #' || m.unit_number, '') as name,
                (e.value ->> 'minutes')::integer as minutes, e.ordinality::integer as position
         from jsonb_array_elements(p_equipment) with ordinality as e(value, ordinality)
         join public.equipment m on m.id = (e.value ->> 'equipment_id')::uuid) s
  on t.time_card_id = p_id and t.equipment_id = s.equipment_id
  when matched then
    update set minutes = s.minutes, position = s.position
  when not matched by target then
    insert (time_card_id, company_id, equipment_id, name, minutes, position)
    values (p_id, card.company_id, s.equipment_id, s.name, s.minutes, s.position)
  when not matched by source and t.time_card_id = p_id then
    delete;
end;
$$;

revoke all on function private.save_time_card_details(uuid, time, time, integer, jsonb, jsonb, boolean)
  from public, anon, authenticated;
revoke all on function private.log_time_card_changes(uuid, uuid, uuid, jsonb, jsonb)
  from public, anon, authenticated;
revoke all on function private.time_card_texts(uuid) from public, anon, authenticated;

-- A worker sends their time card for a job they're on, after that day's
-- FLHA. Sending again with the same id changes it, until the office approves
-- it. An older copy arriving after a newer one is ignored.
create function public.submit_time_card(
  p_id         uuid,
  p_job_id     uuid,
  p_work_date  date,
  p_start      time,
  p_end        time,
  p_break      integer,
  p_lines      jsonb,
  p_equipment  jsonb,
  p_filled_at  timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me        uuid := private.current_employee_id();
  co        uuid := private.current_company_id();
  existing  public.time_cards;
  filled_on date;
  before    jsonb;
begin
  if me is null or co is null then
    raise exception 'no_access';
  end if;
  if p_id is null then
    raise exception 'missing_id';
  end if;

  -- Filled in on the phone no later than now. A phone can hold a time card
  -- for up to two weeks without signal; older than that is a wrong clock.
  if p_filled_at is null or p_filled_at > now() + interval '5 minutes'
     or p_filled_at < now() - interval '14 days' then
    raise exception 'bad_time';
  end if;

  select * into existing from public.time_cards where id = p_id;
  if found then
    if existing.employee_id <> me or existing.job_id <> p_job_id
       or existing.work_date <> p_work_date then
      raise exception 'missing_id';
    end if;
    -- The same copy again, or an older one: nothing to change.
    if p_filled_at <= existing.filled_at then
      return p_id;
    end if;
    if existing.status = 'approved' then
      raise exception 'already_approved';
    end if;
  else
    -- The day it's for is the day it was filled in, or the day before for
    -- a shift that ran past midnight.
    filled_on := (p_filled_at at time zone 'America/Vancouver')::date;
    if p_work_date is null or p_work_date not in (filled_on, filled_on - 1) then
      raise exception 'bad_time';
    end if;
  end if;

  if not exists (select 1
                 from public.jobs j
                 join public.job_assignments a on a.job_id = j.id and a.employee_id = me
                 where j.id = p_job_id and j.company_id = co and j.status = 'active') then
    raise exception 'job_not_available';
  end if;
  if not exists (select 1 from public.flhas
                 where job_id = p_job_id and employee_id = me and work_date = p_work_date) then
    raise exception 'flha_required';
  end if;

  if existing.id is null then
    begin
      -- Placeholder hours; save_time_card_details sets the real ones.
      insert into public.time_cards
        (id, company_id, job_id, employee_id, work_date, start_time, end_time,
         break_minutes, worked_minutes, filled_at)
      values
        (p_id, co, p_job_id, me, p_work_date, '00:00', '00:15', 0, 15, p_filled_at);
    exception when unique_violation then
      raise exception 'already_done';
    end;
  else
    before := private.time_card_texts(p_id);
    update public.time_cards set filled_at = p_filled_at where id = p_id;
  end if;

  perform private.save_time_card_details(p_id, p_start, p_end, p_break,
                                         p_lines, p_equipment, false);
  if before is not null then
    perform private.log_time_card_changes(p_id, co, me, before, private.time_card_texts(p_id));
  end if;
  return p_id;
end;
$$;

-- The office changes a time card's hours, work lines or equipment. Approved
-- or not, every change is recorded.
create function public.update_time_card(
  p_id         uuid,
  p_start      time,
  p_end        time,
  p_break      integer,
  p_lines      jsonb,
  p_equipment  jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me      uuid := private.current_employee_id();
  co      uuid := private.current_company_id();
  before  jsonb;
begin
  if me is null or co is null or not private.is_company_admin() then
    raise exception 'no_access';
  end if;
  if not exists (select 1 from public.time_cards where id = p_id and company_id = co) then
    raise exception 'not_found';
  end if;
  before := private.time_card_texts(p_id);
  perform private.save_time_card_details(p_id, p_start, p_end, p_break,
                                         p_lines, p_equipment, true);
  perform private.log_time_card_changes(p_id, co, me, before, private.time_card_texts(p_id));
end;
$$;

-- The office approves a time card. The worker can't change it after this.
create function public.approve_time_card(p_id uuid)
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
  update public.time_cards
     set status = 'approved', approved_by = me, approved_at = now(), updated_at = now()
   where id = p_id and company_id = co and status = 'submitted';
  if not found then
    if exists (select 1 from public.time_cards where id = p_id and company_id = co) then
      return;
    end if;
    raise exception 'not_found';
  end if;
  insert into public.time_card_changes (time_card_id, company_id, changed_by, field, old_value, new_value)
  values (p_id, co, me, 'Status', 'Sent', 'Approved');
end;
$$;

revoke all on function public.submit_time_card(uuid, uuid, date, time, time, integer, jsonb, jsonb, timestamptz)
  from public, anon;
grant execute on function public.submit_time_card(uuid, uuid, date, time, time, integer, jsonb, jsonb, timestamptz)
  to authenticated;
revoke all on function public.update_time_card(uuid, time, time, integer, jsonb, jsonb) from public, anon;
grant execute on function public.update_time_card(uuid, time, time, integer, jsonb, jsonb) to authenticated;
revoke all on function public.approve_time_card(uuid) from public, anon;
grant execute on function public.approve_time_card(uuid) to authenticated;
