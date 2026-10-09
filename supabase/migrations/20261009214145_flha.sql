-- Field level hazard assessments (FLHA): every worker, every job, every day,
-- before any other form.
--
-- An FLHA is a signed safety record, so once submitted it never changes.
-- Workers can't write these tables directly; they submit through
-- public.submit_flha, which checks everything in one place. The names of
-- the cost codes, hazards and PPE picked are copied in, so the record still
-- reads the same if an admin later renames or switches off a list item.
--
-- The id comes from the phone. Sending the same FLHA twice (for example when
-- a phone retries after losing signal) saves it once.

create table public.flhas (
  id             uuid primary key,
  company_id     uuid not null references public.companies (id) on delete cascade,
  job_id         uuid not null,
  employee_id    uuid not null,
  -- The day the FLHA counts for, in the company's time zone.
  work_date      date not null,
  -- When the worker filled it in on the phone, and when it reached us.
  filled_at      timestamptz not null,
  submitted_at   timestamptz not null default now(),
  other_hazard   text,
  other_control  text,
  -- The finger signature as SVG path data.
  signature      text not null check (length(signature) between 1 and 200000),
  unique (company_id, id),
  unique (job_id, employee_id, work_date),
  check ((other_hazard is null) = (other_control is null)),
  foreign key (company_id, job_id) references public.jobs (company_id, id),
  foreign key (company_id, employee_id) references public.employees (company_id, id)
);

create index flhas_company_date_idx on public.flhas (company_id, work_date);
create index flhas_company_job_idx on public.flhas (company_id, job_id);
create index flhas_company_employee_idx on public.flhas (company_id, employee_id);

create table public.flha_tasks (
  flha_id       uuid not null,
  company_id    uuid not null,
  cost_code_id  uuid not null,
  code          text not null,
  name          text not null,
  position      integer not null,
  primary key (flha_id, cost_code_id),
  foreign key (company_id, flha_id) references public.flhas (company_id, id) on delete cascade,
  foreign key (company_id, cost_code_id) references public.cost_codes (company_id, id)
);

create table public.flha_hazards (
  flha_id     uuid not null,
  company_id  uuid not null,
  hazard_id   uuid not null,
  name        text not null,
  control     text not null check (length(trim(control)) > 0),
  position    integer not null,
  primary key (flha_id, hazard_id),
  foreign key (company_id, flha_id) references public.flhas (company_id, id) on delete cascade,
  foreign key (company_id, hazard_id) references public.hazards (company_id, id)
);

create table public.flha_ppe (
  flha_id      uuid not null,
  company_id   uuid not null,
  ppe_item_id  uuid not null,
  name         text not null,
  position     integer not null,
  primary key (flha_id, ppe_item_id),
  foreign key (company_id, flha_id) references public.flhas (company_id, id) on delete cascade,
  foreign key (company_id, ppe_item_id) references public.ppe_items (company_id, id)
);

create index flha_tasks_company_flha_idx on public.flha_tasks (company_id, flha_id);
create index flha_tasks_company_code_idx on public.flha_tasks (company_id, cost_code_id);
create index flha_hazards_company_flha_idx on public.flha_hazards (company_id, flha_id);
create index flha_hazards_company_hazard_idx on public.flha_hazards (company_id, hazard_id);
create index flha_ppe_company_flha_idx on public.flha_ppe (company_id, flha_id);
create index flha_ppe_company_item_idx on public.flha_ppe (company_id, ppe_item_id);

alter table public.flhas enable row level security;
alter table public.flha_tasks enable row level security;
alter table public.flha_hazards enable row level security;
alter table public.flha_ppe enable row level security;
revoke all on public.flhas, public.flha_tasks, public.flha_hazards, public.flha_ppe
  from anon, authenticated;
grant select on public.flhas, public.flha_tasks, public.flha_hazards, public.flha_ppe
  to authenticated;

-- Admins see every FLHA in their company; workers see their own.
create policy flhas_select on public.flhas for select to authenticated
  using (company_id = (select private.current_company_id())
         and ((select private.is_company_admin())
              or employee_id = (select private.current_employee_id())));

create policy flha_tasks_select on public.flha_tasks for select to authenticated
  using (company_id = (select private.current_company_id())
         and ((select private.is_company_admin())
              or exists (select 1 from public.flhas f
                         where f.id = flha_tasks.flha_id
                           and f.employee_id = (select private.current_employee_id()))));

create policy flha_hazards_select on public.flha_hazards for select to authenticated
  using (company_id = (select private.current_company_id())
         and ((select private.is_company_admin())
              or exists (select 1 from public.flhas f
                         where f.id = flha_hazards.flha_id
                           and f.employee_id = (select private.current_employee_id()))));

create policy flha_ppe_select on public.flha_ppe for select to authenticated
  using (company_id = (select private.current_company_id())
         and ((select private.is_company_admin())
              or exists (select 1 from public.flhas f
                         where f.id = flha_ppe.flha_id
                           and f.employee_id = (select private.current_employee_id()))));

-- Saves a worker's FLHA for a job they're assigned to. p_hazards is a JSON
-- array of {"hazard_id": "...", "control": "..."}. Errors are short codes
-- the app turns into plain words.
create function public.submit_flha(
  p_id             uuid,
  p_job_id         uuid,
  p_cost_code_ids  uuid[],
  p_hazards        jsonb,
  p_other_hazard   text,
  p_other_control  text,
  p_ppe_ids        uuid[],
  p_signature      text,
  p_filled_at      timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me            uuid := private.current_employee_id();
  co            uuid := private.current_company_id();
  day           date;
  other_hazard  text := nullif(trim(coalesce(p_other_hazard, '')), '');
  other_control text := nullif(trim(coalesce(p_other_control, '')), '');
  task_ids      uuid[] := array(select distinct x from unnest(coalesce(p_cost_code_ids, '{}')) x);
  ppe_ids       uuid[] := array(select distinct x from unnest(coalesce(p_ppe_ids, '{}')) x);
  hazard_count  integer;
  existing      uuid;
begin
  if me is null or co is null then
    raise exception 'no_access';
  end if;
  if p_id is null then
    raise exception 'missing_id';
  end if;

  -- Already received: a resend of the same FLHA is fine.
  select employee_id into existing from public.flhas where id = p_id;
  if found then
    if existing = me then
      return p_id;
    end if;
    raise exception 'missing_id';
  end if;

  -- Filled in on the phone no later than now and no earlier than a day ago.
  if p_filled_at is null or p_filled_at > now() + interval '5 minutes'
     or p_filled_at < now() - interval '1 day' then
    raise exception 'bad_time';
  end if;
  day := (p_filled_at at time zone 'America/Vancouver')::date;

  if not exists (select 1
                 from public.jobs j
                 join public.job_assignments a on a.job_id = j.id and a.employee_id = me
                 where j.id = p_job_id and j.company_id = co and j.status = 'active') then
    raise exception 'job_not_available';
  end if;

  if exists (select 1 from public.flhas
             where job_id = p_job_id and employee_id = me and work_date = day) then
    raise exception 'already_done';
  end if;

  if cardinality(task_ids) = 0 then
    raise exception 'task_required';
  end if;
  if (select count(*) from public.cost_codes
      where id = any(task_ids) and company_id = co and is_active) <> cardinality(task_ids) then
    raise exception 'item_not_available';
  end if;

  if p_hazards is null or jsonb_typeof(p_hazards) <> 'array' then
    raise exception 'hazard_required';
  end if;
  if (select count(distinct p.hazard_id) from jsonb_to_recordset(p_hazards) p(hazard_id uuid))
     <> jsonb_array_length(p_hazards) then
    raise exception 'item_not_available';
  end if;
  hazard_count := jsonb_array_length(p_hazards);
  if hazard_count = 0 and other_hazard is null then
    raise exception 'hazard_required';
  end if;
  if exists (select 1 from jsonb_to_recordset(p_hazards) p(control text)
             where trim(coalesce(p.control, '')) = '')
     or (other_hazard is not null and other_control is null) then
    raise exception 'control_required';
  end if;
  if other_hazard is null and other_control is not null then
    other_control := null;
  end if;
  if (select count(*) from public.hazards h
      join jsonb_to_recordset(p_hazards) p(hazard_id uuid) on p.hazard_id = h.id
      where h.company_id = co and h.is_active) <> hazard_count then
    raise exception 'item_not_available';
  end if;

  if cardinality(ppe_ids) = 0 then
    raise exception 'ppe_required';
  end if;
  if (select count(*) from public.ppe_items
      where id = any(ppe_ids) and company_id = co and is_active) <> cardinality(ppe_ids) then
    raise exception 'item_not_available';
  end if;

  if p_signature is null or length(trim(p_signature)) = 0 then
    raise exception 'signature_required';
  end if;
  if length(p_signature) > 200000 then
    raise exception 'signature_too_big';
  end if;

  begin
    insert into public.flhas
      (id, company_id, job_id, employee_id, work_date, filled_at,
       other_hazard, other_control, signature)
    values
      (p_id, co, p_job_id, me, day, p_filled_at, other_hazard, other_control, p_signature);
  exception when unique_violation then
    raise exception 'already_done';
  end;

  insert into public.flha_tasks (flha_id, company_id, cost_code_id, code, name, position)
  select p_id, co, c.id, c.code, c.name,
         row_number() over (order by c.sort_order, c.code)
  from public.cost_codes c where c.id = any(task_ids);

  insert into public.flha_hazards (flha_id, company_id, hazard_id, name, control, position)
  select p_id, co, h.id, h.name, trim(p.control),
         row_number() over (order by h.sort_order, h.name)
  from public.hazards h
  join jsonb_to_recordset(p_hazards) p(hazard_id uuid, control text) on p.hazard_id = h.id;

  insert into public.flha_ppe (flha_id, company_id, ppe_item_id, name, position)
  select p_id, co, i.id, i.name,
         row_number() over (order by i.sort_order, i.name)
  from public.ppe_items i where i.id = any(ppe_ids);

  return p_id;
end;
$$;

revoke all on function public.submit_flha(uuid, uuid, uuid[], jsonb, text, text, uuid[], text, timestamptz)
  from public, anon;
grant execute on function public.submit_flha(uuid, uuid, uuid[], jsonb, text, text, uuid[], text, timestamptz)
  to authenticated;
