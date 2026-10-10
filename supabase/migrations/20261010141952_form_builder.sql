-- Form builder: the office makes its own forms (inspections, checklists,
-- sign-offs) from a set of question types, and picks the jobs each one is
-- used on. Workers fill them in on those jobs after their FLHA, with or
-- without signal.
--
-- - Each form is used either once per day per job (anyone on the crew sends
--   it) or as many times as needed.
-- - Changing a form's questions makes a new version. Answers already sent
--   keep the version they were answered against, so they always read the
--   way they were filled in.
-- - A form can be put in the daily report, where it gets its own section.
-- - Forms are never deleted, only switched off, so past answers keep them.
--
-- Questions are a JSON array, in order, of
--   {"id": "<uuid>", "type": "...", "label": "...", "required": true/false,
--    "options": ["...", ...]}   -- options only for pick_one and pick_many
-- Types: short, long, number, yes_no, pick_one, pick_many, date, photo,
-- signature.
--
-- Answers are a JSON object keyed by question id. Photo answers are kept as
-- paths in the private "form-photos" bucket
-- (<company id>/<answer id>/<photo id>.jpg); signatures are SVG path data.

create table public.forms (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references public.companies (id) on delete cascade,
  name             text not null check (length(trim(name)) between 1 and 100),
  frequency        text not null default 'many' check (frequency in ('once_daily', 'many')),
  in_daily_report  boolean not null default false,
  -- Used on every job, including jobs added later.
  all_jobs         boolean not null default false,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  unique (company_id, id)
);

create unique index forms_company_name_idx on public.forms (company_id, lower(name));

create table public.form_versions (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null,
  form_id     uuid not null,
  version     integer not null check (version > 0),
  questions   jsonb not null check (jsonb_typeof(questions) = 'array'),
  created_at  timestamptz not null default now(),
  created_by  uuid,
  unique (company_id, id),
  unique (form_id, version),
  foreign key (company_id, form_id) references public.forms (company_id, id) on delete cascade,
  foreign key (company_id, created_by) references public.employees (company_id, id)
);

create index form_versions_company_form_idx on public.form_versions (company_id, form_id);
create index form_versions_company_created_by_idx on public.form_versions (company_id, created_by);

-- The jobs a form is used on (when it isn't on every job).
create table public.form_jobs (
  form_id     uuid not null,
  job_id      uuid not null,
  company_id  uuid not null,
  primary key (form_id, job_id),
  foreign key (company_id, form_id) references public.forms (company_id, id) on delete cascade,
  foreign key (company_id, job_id) references public.jobs (company_id, id) on delete cascade
);

create index form_jobs_company_job_idx on public.form_jobs (company_id, job_id);
create index form_jobs_company_form_idx on public.form_jobs (company_id, form_id);

-- A filled-in form. The id comes from the phone, so sending the same answers
-- twice (for example when a phone retries after losing signal) saves them
-- once. Once sent, answers never change.
create table public.form_submissions (
  id            uuid primary key,
  company_id    uuid not null references public.companies (id) on delete cascade,
  form_id       uuid not null,
  version_id    uuid not null,
  -- The form's name when it was sent.
  form_name     text not null,
  job_id        uuid not null,
  employee_id   uuid not null,
  -- The day it counts for, in the company's time zone.
  work_date     date not null,
  -- Set to work_date for a once-a-day form, so only one can be sent per job
  -- per day.
  once_on       date,
  filled_at     timestamptz not null,
  submitted_at  timestamptz not null default now(),
  answers       jsonb not null check (jsonb_typeof(answers) = 'object'),
  unique (company_id, id),
  unique (form_id, job_id, once_on),
  foreign key (company_id, form_id) references public.forms (company_id, id),
  foreign key (company_id, version_id) references public.form_versions (company_id, id),
  foreign key (company_id, job_id) references public.jobs (company_id, id),
  foreign key (company_id, employee_id) references public.employees (company_id, id)
);

create index form_submissions_company_date_idx on public.form_submissions (company_id, work_date);
create index form_submissions_company_job_idx on public.form_submissions (company_id, job_id);
create index form_submissions_company_form_idx on public.form_submissions (company_id, form_id);
create index form_submissions_company_version_idx on public.form_submissions (company_id, version_id);
create index form_submissions_company_employee_idx on public.form_submissions (company_id, employee_id);

alter table public.forms enable row level security;
alter table public.form_versions enable row level security;
alter table public.form_jobs enable row level security;
alter table public.form_submissions enable row level security;

revoke all on public.forms, public.form_versions, public.form_jobs, public.form_submissions from anon, authenticated;
grant select on public.forms, public.form_versions, public.form_jobs, public.form_submissions to authenticated;

-- The office sees every form and every answer in their company. Workers get
-- their forms through public.my_job_forms and see the answers they sent.
create policy forms_select on public.forms for select to authenticated
  using (company_id = (select private.current_company_id()) and (select private.is_company_admin()));

create policy form_versions_select on public.form_versions for select to authenticated
  using (company_id = (select private.current_company_id()) and (select private.is_company_admin()));

create policy form_jobs_select on public.form_jobs for select to authenticated
  using (company_id = (select private.current_company_id()) and (select private.is_company_admin()));

create policy form_submissions_select on public.form_submissions for select to authenticated
  using (company_id = (select private.current_company_id())
         and ((select private.is_company_admin())
              or employee_id = (select private.current_employee_id())));

-- The private bucket for photos in answers. Phones shrink photos before
-- sending, so 10 MB is plenty.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('form-photos', 'form-photos', false, 10485760, array['image/jpeg']);

-- Anyone in a company can upload into their company's folder; nobody can
-- change or remove a photo once it's there. Admins see every photo in their
-- company, and workers see the ones they uploaded.
create policy form_photos_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'form-photos'
              and (storage.foldername(name))[1] = (select private.current_company_id())::text
              and (select private.current_employee_id()) is not null);

create policy form_photos_read on storage.objects for select to authenticated
  using (bucket_id = 'form-photos'
         and (storage.foldername(name))[1] = (select private.current_company_id())::text
         and ((select private.is_company_admin()) or owner_id = (select auth.uid())::text));

-- Creates a form (p_id null) or saves changes to one. When the questions
-- differ from the latest version's, they become a new version. p_job_ids are
-- the jobs it's used on; ignored when p_all_jobs. Returns the form's id.
-- Errors are short codes the app turns into plain words.
create function public.save_form(
  p_id               uuid,
  p_name             text,
  p_frequency        text,
  p_in_daily_report  boolean,
  p_all_jobs         boolean,
  p_job_ids          uuid[],
  p_questions        jsonb
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
      insert into public.forms (company_id, name, frequency, in_daily_report, all_jobs)
      values (co, form_name, p_frequency, coalesce(p_in_daily_report, false), coalesce(p_all_jobs, false))
      returning id into fid;
    else
      update public.forms
      set name = form_name, frequency = p_frequency,
          in_daily_report = coalesce(p_in_daily_report, false), all_jobs = coalesce(p_all_jobs, false)
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

-- Switches a form off (workers stop seeing it) or back on.
create function public.set_form_active(p_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.current_company_id() is null or not private.is_company_admin() then
    raise exception 'no_access';
  end if;
  update public.forms set is_active = coalesce(p_active, false)
  where id = p_id and company_id = private.current_company_id();
  if not found then
    raise exception 'not_found';
  end if;
end;
$$;

-- Whether a form is switched on and used on a job.
create function private.form_on_job(p_form_id uuid, p_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.forms f
                 where f.id = p_form_id and f.is_active
                   and (f.all_jobs or exists (select 1 from public.form_jobs fj
                                              where fj.form_id = f.id and fj.job_id = p_job_id)))
$$;

-- The forms on each active job the signed-in worker is on, with the latest
-- version's questions, for their phone.
create function public.my_job_forms()
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
  order by a.job_id, lower(f.name)
$$;

-- Recent answers the worker's phone needs to know about: the ones they sent,
-- and once-a-day forms sent by anyone on their jobs (so the crew sees it's
-- done).
create function public.my_form_submissions(p_since date)
returns table (
  id          uuid,
  form_id     uuid,
  job_id      uuid,
  work_date   date,
  filled_at   timestamptz,
  sent_by     text,
  mine        boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.form_id, s.job_id, s.work_date, s.filled_at, e.full_name,
         s.employee_id = (select private.current_employee_id())
  from public.form_submissions s
  join public.employees e on e.id = s.employee_id
  where s.company_id = (select private.current_company_id())
    and s.work_date >= p_since
    and (s.employee_id = (select private.current_employee_id())
         or (s.once_on is not null and private.on_job(s.job_id)))
  order by s.filled_at
$$;

-- Saves a filled-in form for a job the sender is on. p_version_id is the
-- version the phone showed; p_answers is keyed by question id. A photo
-- answer is a list of photo ids, each already uploaded to
-- form-photos/<company id>/<p_id>/<photo id>.jpg. Errors are short codes the
-- app turns into plain words.
create function public.submit_form(
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
  if not private.form_on_job(f.id, p_job_id) then
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

revoke all on function public.save_form(uuid, text, text, boolean, boolean, uuid[], jsonb) from public, anon;
grant execute on function public.save_form(uuid, text, text, boolean, boolean, uuid[], jsonb) to authenticated;
revoke all on function public.set_form_active(uuid, boolean) from public, anon;
grant execute on function public.set_form_active(uuid, boolean) to authenticated;
revoke all on function private.form_on_job(uuid, uuid) from public, anon;
grant execute on function private.form_on_job(uuid, uuid) to authenticated;
revoke all on function public.my_job_forms() from public, anon;
grant execute on function public.my_job_forms() to authenticated;
revoke all on function public.my_form_submissions(date) from public, anon;
grant execute on function public.my_form_submissions(date) to authenticated;
revoke all on function public.submit_form(uuid, uuid, uuid, jsonb, timestamptz) from public, anon;
grant execute on function public.submit_form(uuid, uuid, uuid, jsonb, timestamptz) to authenticated;

-- Days with answers to a form show in the reports list too.
create or replace function public.daily_report_days(p_days integer default 14)
returns table (
  job_id        uuid,
  job_name      text,
  job_number    text,
  work_date     date,
  report_id     uuid,
  finalized_at  timestamptz,
  has_pdf       boolean
)
language sql
stable
set search_path = ''
as $$
  select j.id, j.name, j.job_number, d::date, r.id, r.finalized_at, r.pdf_path is not null
  from generate_series(private.latest_report_day() - (least(greatest(p_days, 1), 90) - 1),
                       private.latest_report_day(), interval '1 day') d
  cross join public.jobs j
  left join public.daily_reports r on r.job_id = j.id and r.work_date = d::date
  where j.company_id = (select private.current_company_id())
    and (select private.is_company_admin())
    and (r.id is not null
         or (j.status = 'active'
             and coalesce(j.start_date, (j.created_at at time zone 'America/Vancouver')::date) <= d::date
             and (j.end_date is null or j.end_date >= d::date))
         or exists (select 1 from public.time_cards x where x.job_id = j.id and x.work_date = d::date)
         or exists (select 1 from public.flhas x where x.job_id = j.id and x.work_date = d::date)
         or exists (select 1 from public.safety_meetings x where x.job_id = j.id and x.work_date = d::date)
         or exists (select 1 from public.trucking_slips x where x.job_id = j.id and x.work_date = d::date)
         or exists (select 1 from public.site_entries x where x.job_id = j.id and x.work_date = d::date)
         or exists (select 1 from public.form_submissions x where x.job_id = j.id and x.work_date = d::date))
  order by d desc, j.name
$$;

-- The daily report gets a section for each form put in it, and lists
-- once-a-day report forms that weren't sent as missing.
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
  ),
  -- Forms put in the daily report, and what was sent on them that day.
  report_forms as (
    select f.id, f.name, f.frequency, f.created_at
    from public.forms f
    where f.company_id = co and f.in_daily_report
  ),
  answered as (
    select s.*, e.full_name, v.questions
    from public.form_submissions s
    join report_forms rf on rf.id = s.form_id
    join public.employees e on e.id = s.employee_id
    join public.form_versions v on v.id = s.version_id
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

    -- Each answer with the question it was answered against, in order.
    'forms', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', rf.name,
               'entries', (select jsonb_agg(jsonb_build_object(
                                    'sent_by', s.full_name, 'filled_at', s.filled_at,
                                    'answers', (select coalesce(jsonb_agg(jsonb_build_object(
                                                         'label', q.value->>'label', 'type', q.value->>'type',
                                                         'value', s.answers -> (q.value->>'id'))
                                                       order by q.ord), '[]'::jsonb)
                                                from jsonb_array_elements(s.questions) with ordinality as q(value, ord)))
                                  order by s.filled_at)
                           from answered s where s.form_id = rf.id))
             order by lower(rf.name))
      from report_forms rf where exists (select 1 from answered s where s.form_id = rf.id)), '[]'::jsonb),

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
        union all
        select 6, 'No ' || rf.name
        from report_forms rf
        where rf.frequency = 'once_daily'
          and (rf.created_at at time zone 'America/Vancouver')::date <= p_date
          and private.form_on_job(rf.id, p_job_id)
          and not exists (select 1 from answered s where s.form_id = rf.id)
      ) m), '[]'::jsonb)
  )
  into result;

  return result;
end;
$$;
