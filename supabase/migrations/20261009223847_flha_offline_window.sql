-- Phones save FLHAs and send them when signal comes back, which on a remote
-- site can be days later. Accept FLHAs filled in up to 14 days ago (was 1).
-- Only that check changes.

create or replace function public.submit_flha(
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

  -- Filled in on the phone no later than now. A phone can hold an FLHA for
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

