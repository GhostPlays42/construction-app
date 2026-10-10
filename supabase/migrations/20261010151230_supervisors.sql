-- Supervisors: a role for the person who runs the crew on site. Only
-- supervisors run the safety meeting, and they can run it before their own
-- FLHA. A form the office builds can be set to supervisors only, so other
-- workers never see it.

alter table public.roles add column is_supervisor boolean not null default false;
insert into public.roles (key, name, is_admin, is_supervisor) values ('supervisor', 'Supervisor', false, true);

alter table public.forms add column supervisors_only boolean not null default false;

-- Whether the signed-in person is an active supervisor.
create function private.is_supervisor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select r.is_supervisor
    from public.employees e
    join public.roles r on r.key = e.role_key
    join public.companies c on c.id = e.company_id
    where e.user_id = (select auth.uid())
      and e.is_active
      and c.status <> 'suspended'
  ), false)
$$;
revoke all on function private.is_supervisor() from public, anon;
grant execute on function private.is_supervisor() to authenticated;

-- save_form gains the supervisors-only setting. The old one is moved out of
-- the app's reach (the migration tool can't drop functions), and nothing can
-- call it.
alter function public.save_form(uuid, text, text, boolean, boolean, uuid[], jsonb) rename to save_form_before_supervisors;
alter function public.save_form_before_supervisors(uuid, text, text, boolean, boolean, uuid[], jsonb) set schema private;
revoke all on function private.save_form_before_supervisors(uuid, text, text, boolean, boolean, uuid[], jsonb)
  from public, anon, authenticated;

create function public.save_form(
  p_id               uuid,
  p_name             text,
  p_frequency        text,
  p_in_daily_report  boolean,
  p_all_jobs         boolean,
  p_job_ids          uuid[],
  p_questions        jsonb,
  p_supervisors_only boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me         uuid := private.current_employee_id();
  co         uuid := private.current_company_id();
  form_name  text := trim(coalesce(p_name, ''));
  job_ids    uuid[] := array(select distinct x from unnest(coalesce(p_job_ids, '{}')) x where x is not null);
  questions  jsonb := '[]'::jsonb;
  q          jsonb;
  qtype      text;
  label      text;
  options    jsonb;
  ids        text[] := '{}';
  fid        uuid := p_id;
  latest     public.form_versions;
begin
  if me is null or co is null or not private.is_company_admin() then
    raise exception 'no_access';
  end if;

  if form_name = '' then
    raise exception 'name_required';
  end if;
  if length(form_name) > 100 then
    raise exception 'name_too_long';
  end if;
  if p_frequency is null or p_frequency not in ('once_daily', 'many') then
    raise exception 'bad_frequency';
  end if;

  if p_questions is null or jsonb_typeof(p_questions) <> 'array' or jsonb_array_length(p_questions) = 0 then
    raise exception 'questions_required';
  end if;
  if jsonb_array_length(p_questions) > 100 then
    raise exception 'too_many_questions';
  end if;

  -- Checks each question and keeps only what a question needs.
  for q in select value from jsonb_array_elements(p_questions) loop
    if jsonb_typeof(q) <> 'object'
       or coalesce(q->>'id', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or (q->>'id') = any(ids)
       or coalesce(jsonb_typeof(q->'required'), 'boolean') <> 'boolean' then
      raise exception 'bad_question';
    end if;
    qtype := q->>'type';
    if qtype is null or qtype not in ('short', 'long', 'number', 'yes_no', 'pick_one', 'pick_many',
                                      'date', 'photo', 'signature') then
      raise exception 'bad_question';
    end if;
    label := trim(coalesce(q->>'label', ''));
    if label = '' then
      raise exception 'label_required';
    end if;
    if length(label) > 300 then
      raise exception 'label_too_long';
    end if;

    options := null;
    if qtype in ('pick_one', 'pick_many') then
      if jsonb_typeof(q->'options') is distinct from 'array'
         or exists (select 1 from jsonb_array_elements(q->'options') o where jsonb_typeof(o) <> 'string') then
        raise exception 'options_required';
      end if;
      select coalesce(jsonb_agg(trim(o) order by ord), '[]'::jsonb) into options
      from jsonb_array_elements_text(q->'options') with ordinality as x(o, ord)
      where trim(o) <> '';
      if jsonb_array_length(options) < 2 then
        raise exception 'options_required';
      end if;
      if jsonb_array_length(options) > 50 then
        raise exception 'too_many_options';
      end if;
      if exists (select 1 from jsonb_array_elements_text(options) o where length(o) > 100) then
        raise exception 'option_too_long';
      end if;
      if (select count(distinct lower(o)) from jsonb_array_elements_text(options) o) <> jsonb_array_length(options) then
        raise exception 'options_repeat';
      end if;
    end if;

    ids := ids || (q->>'id');
    questions := questions || jsonb_build_array(
      jsonb_build_object('id', q->>'id', 'type', qtype, 'label', label,
                         'required', coalesce((q->>'required')::boolean, false))
      || case when options is not null then jsonb_build_object('options', options) else '{}'::jsonb end);
  end loop;

  if (select count(*) from public.jobs where id = any(job_ids) and company_id = co) <> cardinality(job_ids) then
    raise exception 'job_not_found';
  end if;

  begin
    if fid is null then
      insert into public.forms (company_id, name, frequency, in_daily_report, all_jobs, supervisors_only)
      values (co, form_name, p_frequency, coalesce(p_in_daily_report, false), coalesce(p_all_jobs, false),
              coalesce(p_supervisors_only, false))
      returning id into fid;
    else
      update public.forms
      set name = form_name, frequency = p_frequency,
          in_daily_report = coalesce(p_in_daily_report, false), all_jobs = coalesce(p_all_jobs, false),
          supervisors_only = coalesce(p_supervisors_only, false)
      where id = fid and company_id = co;
      if not found then
        raise exception 'not_found';
      end if;
    end if;
  exception when unique_violation then
    raise exception 'name_taken';
  end;

  select * into latest from public.form_versions where form_versions.form_id = fid
  order by version desc limit 1;
  if latest.id is null or latest.questions <> questions then
    insert into public.form_versions (company_id, form_id, version, questions, created_by)
    values (co, fid, coalesce(latest.version, 0) + 1, questions, me);
  end if;

  -- The jobs it's used on: exactly the ones picked.
  merge into public.form_jobs t
  using (select x as job_id from unnest(case when coalesce(p_all_jobs, false) then '{}'::uuid[] else job_ids end) x) s
  on t.form_id = fid and t.job_id = s.job_id
  when not matched then insert (form_id, job_id, company_id) values (fid, s.job_id, co)
  when not matched by source and t.form_id = fid then delete;

  return fid;
end;
$$;

revoke all on function public.save_form(uuid, text, text, boolean, boolean, uuid[], jsonb, boolean) from public, anon;
grant execute on function public.save_form(uuid, text, text, boolean, boolean, uuid[], jsonb, boolean) to authenticated;

-- Supervisor-only forms aren't on other workers' phones.
create or replace function public.my_job_forms()
returns table (
  job_id      uuid,
  form_id     uuid,
  name        text,
  frequency   text,
  version_id  uuid,
  questions   jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select a.job_id, f.id, f.name, f.frequency, v.id, v.questions
  from public.job_assignments a
  join public.jobs j on j.id = a.job_id and j.status = 'active'
  join public.forms f on f.company_id = j.company_id and f.is_active
  join lateral (select id, questions from public.form_versions
                where form_versions.form_id = f.id order by version desc limit 1) v on true
  where a.employee_id = (select private.current_employee_id())
    and a.company_id = (select private.current_company_id())
    and private.form_on_job(f.id, j.id)
    and (not f.supervisors_only or (select private.is_supervisor()))
  order by a.job_id, lower(f.name)
$$;

-- ... and only supervisors can send them.
create or replace function public.submit_form(
  p_id          uuid,
  p_version_id  uuid,
  p_job_id      uuid,
  p_answers     jsonb,
  p_filled_at   timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me         uuid := private.current_employee_id();
  co         uuid := private.current_company_id();
  day        date;
  existing   uuid;
  v          public.form_versions;
  f          public.forms;
  answers    jsonb := coalesce(p_answers, '{}'::jsonb);
  clean      jsonb := '{}'::jsonb;
  q          jsonb;
  qid        text;
  a          jsonb;
  t          text;
  photo_ids  text[] := '{}';
  n          integer;
begin
  if me is null or co is null then
    raise exception 'no_access';
  end if;
  if p_id is null then
    raise exception 'missing_id';
  end if;

  -- Already received: a resend of the same answers is fine.
  select employee_id into existing from public.form_submissions where id = p_id;
  if found then
    if existing = me then
      return p_id;
    end if;
    raise exception 'missing_id';
  end if;

  -- Filled in on the phone no later than now. A phone can hold a form for
  -- up to two weeks without signal; older than that is a wrong phone clock.
  if p_filled_at is null or p_filled_at > now() + interval '5 minutes'
     or p_filled_at < now() - interval '14 days' then
    raise exception 'bad_time';
  end if;
  day := (p_filled_at at time zone 'America/Vancouver')::date;

  if not exists (select 1
                 from public.jobs j
                 join public.job_assignments ja on ja.job_id = j.id and ja.employee_id = me
                 where j.id = p_job_id and j.company_id = co and j.status = 'active') then
    raise exception 'job_not_available';
  end if;

  select * into v from public.form_versions where id = p_version_id and company_id = co;
  if not found then
    raise exception 'form_not_available';
  end if;
  select * into f from public.forms where id = v.form_id;
  if not private.form_on_job(f.id, p_job_id) or (f.supervisors_only and not private.is_supervisor()) then
    raise exception 'form_not_available';
  end if;

  -- Like every form, it comes after the sender's FLHA for the day.
  if not exists (select 1 from public.flhas
                 where job_id = p_job_id and employee_id = me and work_date = day) then
    raise exception 'flha_required';
  end if;
  if f.frequency = 'once_daily'
     and exists (select 1 from public.form_submissions s
                 where s.form_id = f.id and s.job_id = p_job_id and s.once_on = day) then
    raise exception 'already_done';
  end if;

  if jsonb_typeof(answers) <> 'object' then
    raise exception 'bad_answer';
  end if;
  -- Every answer is to one of this version's questions.
  if exists (select 1 from jsonb_object_keys(answers) k
             where not exists (select 1 from jsonb_array_elements(v.questions) x where x->>'id' = k)) then
    raise exception 'bad_answer';
  end if;

  for q in select value from jsonb_array_elements(v.questions) loop
    qid := q->>'id';
    a := answers -> qid;
    -- Blank text and empty lists count as no answer.
    if a is null or jsonb_typeof(a) = 'null'
       or (jsonb_typeof(a) = 'string' and trim(a #>> '{}') = '')
       or (jsonb_typeof(a) = 'array' and jsonb_array_length(a) = 0) then
      if (q->>'required')::boolean then
        raise exception 'answer_required';
      end if;
      continue;
    end if;

    case q->>'type'
    when 'short', 'long' then
      if jsonb_typeof(a) <> 'string' then
        raise exception 'bad_answer';
      end if;
      t := trim(a #>> '{}');
      if length(t) > 4000 or (q->>'type' = 'short' and length(t) > 500) then
        raise exception 'answer_too_long';
      end if;
      a := to_jsonb(t);
    when 'number' then
      if jsonb_typeof(a) <> 'number' or abs((a #>> '{}')::numeric) >= 1e12 then
        raise exception 'bad_answer';
      end if;
    when 'yes_no' then
      if jsonb_typeof(a) <> 'boolean' then
        raise exception 'bad_answer';
      end if;
    when 'pick_one' then
      if jsonb_typeof(a) <> 'string' or not ((q->'options') ? (a #>> '{}')) then
        raise exception 'option_not_available';
      end if;
    when 'pick_many' then
      if jsonb_typeof(a) <> 'array'
         or exists (select 1 from jsonb_array_elements(a) o
                    where jsonb_typeof(o) <> 'string' or not ((q->'options') ? (o #>> '{}')))
         or (select count(distinct o) from jsonb_array_elements_text(a) o) <> jsonb_array_length(a) then
        raise exception 'option_not_available';
      end if;
    when 'date' then
      t := a #>> '{}';
      if jsonb_typeof(a) <> 'string' or t !~ '^\d{4}-\d{2}-\d{2}$' then
        raise exception 'bad_answer';
      end if;
      begin
        perform t::date;
      exception when others then
        raise exception 'bad_answer';
      end;
    when 'photo' then
      if jsonb_typeof(a) <> 'array' or jsonb_array_length(a) > 10 then
        raise exception 'too_many_photos';
      end if;
      if exists (select 1 from jsonb_array_elements(a) o
                 where jsonb_typeof(o) <> 'string'
                    or (o #>> '{}') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then
        raise exception 'missing_id';
      end if;
      photo_ids := photo_ids || array(select jsonb_array_elements_text(a));
      -- Kept as where each photo is in storage.
      select jsonb_agg(co::text || '/' || p_id::text || '/' || o || '.jpg' order by ord)
      into a from jsonb_array_elements_text(a) with ordinality as x(o, ord);
    when 'signature' then
      if jsonb_typeof(a) <> 'string' or length(a #>> '{}') > 200000 then
        raise exception 'signature_too_big';
      end if;
    end case;

    clean := clean || jsonb_build_object(qid, a);
  end loop;

  -- Every photo is different, uploaded by the sender, where these answers keep them.
  if (select count(distinct x) from unnest(photo_ids) x) <> cardinality(photo_ids) then
    raise exception 'missing_id';
  end if;
  select count(*) into n
  from unnest(photo_ids) x
  join storage.objects o
    on o.bucket_id = 'form-photos'
   and o.name = co::text || '/' || p_id::text || '/' || x || '.jpg'
   and o.owner_id = (select auth.uid())::text;
  if n <> cardinality(photo_ids) then
    raise exception 'photo_missing';
  end if;

  begin
    insert into public.form_submissions (id, company_id, form_id, version_id, form_name, job_id, employee_id,
                                         work_date, once_on, filled_at, answers)
    values (p_id, co, f.id, v.id, f.name, p_job_id, me, day,
            case when f.frequency = 'once_daily' then day end, p_filled_at, clean);
  exception when unique_violation then
    raise exception 'already_done';
  end;

  return p_id;
end;
$$;

-- Safety meetings: supervisors only, and no longer after their FLHA.
create or replace function public.submit_safety_meeting(
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
  -- Run by a supervisor; it can come before their own FLHA.
  if not private.is_supervisor() then
    raise exception 'supervisors_only';
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
