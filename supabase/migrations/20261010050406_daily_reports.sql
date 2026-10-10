-- Daily reports: one report per active job per day, built from everything
-- sent that day (time cards, FLHAs, the safety meeting, trucking slips, site
-- photos & notes). The draft becomes available at noon the next day and is
-- worked out live, so fixes made on the other office screens show straight
-- away. An admin finalizes it: the report's content is saved as it stands,
-- a PDF is made and kept on the job, and it never changes again.
--
-- Only finalized reports are stored. Days are in America/Vancouver until each
-- company picks its own time zone.

create table public.daily_reports (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies (id) on delete cascade,
  job_id        uuid not null,
  work_date     date not null,
  -- The report as it stood when finalized (see public.daily_report_content).
  content       jsonb not null,
  finalized_at  timestamptz not null default now(),
  finalized_by  uuid not null,
  -- Where the PDF is in the daily-reports bucket, once it's made.
  pdf_path      text unique,
  unique (company_id, id),
  unique (job_id, work_date),
  foreign key (company_id, job_id) references public.jobs (company_id, id),
  foreign key (company_id, finalized_by) references public.employees (company_id, id)
);

create index daily_reports_company_date_idx on public.daily_reports (company_id, work_date);
create index daily_reports_company_by_idx on public.daily_reports (company_id, finalized_by);

alter table public.daily_reports enable row level security;
revoke all on public.daily_reports from anon, authenticated;
grant select on public.daily_reports to authenticated;

-- Admins only receive reports.
create policy daily_reports_select on public.daily_reports for select to authenticated
  using (company_id = (select private.current_company_id()) and (select private.is_company_admin()));

-- The private bucket for report PDFs (photos included, so allow plenty).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('daily-reports', 'daily-reports', false, 52428800, array['application/pdf']);

create policy daily_reports_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'daily-reports'
              and (storage.foldername(name))[1] = (select private.current_company_id())::text
              and (select private.is_company_admin()));

create policy daily_reports_read on storage.objects for select to authenticated
  using (bucket_id = 'daily-reports'
         and (storage.foldername(name))[1] = (select private.current_company_id())::text
         and (select private.is_company_admin()));

-- A day's report is ready at noon the next day.
create function private.daily_report_ready(p_date date)
returns boolean
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'America/Vancouver') >= (p_date + 1) + time '12:00'
$$;

-- The latest day whose report is ready.
create function private.latest_report_day()
returns date
language sql
stable
set search_path = ''
as $$
  select case when (now() at time zone 'America/Vancouver')::time >= time '12:00'
              then (now() at time zone 'America/Vancouver')::date - 1
              else (now() at time zone 'America/Vancouver')::date - 2 end
$$;

-- Everything in a job's report for a day, as JSON. Times are minutes.
-- Admins only; works from what row level security lets them see.
create function public.daily_report_content(p_job_id uuid, p_date date)
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
  -- The crew: everyone on the job who is switched on, plus anyone who sent
  -- something for it that day.
  crew as (
    select e.id, e.full_name, e.trade, true as on_crew
    from public.job_assignments a join public.employees e on e.id = a.employee_id
    where a.job_id = p_job_id and e.is_active
    union
    select e.id, e.full_name, e.trade, false
    from public.employees e
    where e.company_id = co
      and not exists (select 1 from public.job_assignments a
                      where a.job_id = p_job_id and a.employee_id = e.id and e.is_active)
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

-- The reports for the last p_days days that are ready, newest first: every
-- job that was active that day, plus any job with something sent that day.
-- report_id is set once the report is finalized.
create function public.daily_report_days(p_days integer default 14)
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
         or exists (select 1 from public.site_entries x where x.job_id = j.id and x.work_date = d::date))
  order by d desc, j.name
$$;

-- Finalizes a job's report for a day: saves it as it stands, for good.
create function public.finalize_daily_report(p_job_id uuid, p_date date)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me       uuid := private.current_employee_id();
  co       uuid := private.current_company_id();
  content  jsonb;
  new_id   uuid;
begin
  if me is null or co is null or not private.is_company_admin() then
    raise exception 'no_access';
  end if;
  if p_date is null or not private.daily_report_ready(p_date) then
    raise exception 'not_ready';
  end if;
  if exists (select 1 from public.daily_reports where job_id = p_job_id and work_date = p_date) then
    raise exception 'already_finalized';
  end if;
  content := public.daily_report_content(p_job_id, p_date);

  insert into public.daily_reports (company_id, job_id, work_date, content, finalized_by)
  values (co, p_job_id, p_date, content, me)
  returning id into new_id;
  return new_id;
end;
$$;

-- Records a finalized report's PDF once it's uploaded to
-- daily-reports/<company id>/<report id>.pdf.
create function public.set_daily_report_pdf(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  co    uuid := private.current_company_id();
  path  text;
begin
  if co is null or not private.is_company_admin() then
    raise exception 'no_access';
  end if;
  if not exists (select 1 from public.daily_reports where id = p_id and company_id = co) then
    raise exception 'not_found';
  end if;
  path := co::text || '/' || p_id::text || '.pdf';
  if not exists (select 1 from storage.objects where bucket_id = 'daily-reports' and name = path) then
    raise exception 'pdf_missing';
  end if;
  update public.daily_reports set pdf_path = path where id = p_id and pdf_path is null;
end;
$$;

revoke all on function private.daily_report_ready(date) from public, anon;
grant execute on function private.daily_report_ready(date) to authenticated;
revoke all on function private.latest_report_day() from public, anon;
grant execute on function private.latest_report_day() to authenticated;
revoke all on function public.daily_report_content(uuid, date) from public, anon;
grant execute on function public.daily_report_content(uuid, date) to authenticated;
revoke all on function public.daily_report_days(integer) from public, anon;
grant execute on function public.daily_report_days(integer) to authenticated;
revoke all on function public.finalize_daily_report(uuid, date) from public, anon;
grant execute on function public.finalize_daily_report(uuid, date) to authenticated;
revoke all on function public.set_daily_report_pdf(uuid) from public, anon;
grant execute on function public.set_daily_report_pdf(uuid) to authenticated;
