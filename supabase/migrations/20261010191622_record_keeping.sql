-- Record keeping: each company picks how long its records are kept (2, 3, 5,
-- 7 or 10 years, or forever). Once a night the app removes everything with a
-- work date older than that: time cards, FLHAs, safety meetings, trucking
-- slips, site photos & notes, form answers, job chat, dispatch and finalized
-- daily reports, with their photos and PDFs.
--
-- Files can only be removed through the Storage API, so the nightly job
-- (src/app/api/cron/retention) lists them with retention_files, removes them,
-- then calls retention_delete for the rows. retention_delete refuses while
-- any of those files is still there, so a failed night is retried the next.

-- Null keeps records forever. New and existing companies start at 7 years.
alter table public.companies
  add column keep_years integer default 7 check (keep_years in (2, 3, 5, 7, 10));

-- The first work date that's kept: anything before it is old enough to go.
-- Null (keep forever) gives null, which matches nothing.
create function private.keep_cutoff(p_years integer)
returns date
language sql
stable
set search_path = ''
as $$
  select ((now() at time zone 'America/Vancouver')::date - make_interval(years => p_years))::date
$$;

-- Every record of a company from before p_cutoff, by table. Chat counts by the
-- day a message was sent.
create function private.expired(p_company uuid, p_cutoff date)
returns table (kind text, id uuid, job_id uuid)
language sql
stable
set search_path = ''
as $$
  select 'time_cards', t.id, t.job_id from public.time_cards t
   where t.company_id = p_company and t.work_date < p_cutoff
  union all
  select 'flhas', f.id, f.job_id from public.flhas f
   where f.company_id = p_company and f.work_date < p_cutoff
  union all
  select 'safety_meetings', s.id, s.job_id from public.safety_meetings s
   where s.company_id = p_company and s.work_date < p_cutoff
  union all
  select 'trucking_slips', s.id, s.job_id from public.trucking_slips s
   where s.company_id = p_company and s.work_date < p_cutoff
  union all
  select 'site_entries', e.id, e.job_id from public.site_entries e
   where e.company_id = p_company and e.work_date < p_cutoff
  union all
  select 'form_submissions', s.id, s.job_id from public.form_submissions s
   where s.company_id = p_company and s.work_date < p_cutoff
  union all
  select 'chat_messages', m.id, m.job_id from public.chat_messages m
   where m.company_id = p_company and (m.created_at at time zone 'America/Vancouver')::date < p_cutoff
  union all
  select 'daily_reports', r.id, r.job_id from public.daily_reports r
   where r.company_id = p_company and r.work_date < p_cutoff
  union all
  select 'dispatches', d.id, d.job_id from public.dispatches d
   where d.company_id = p_company and d.work_date < p_cutoff
$$;

revoke all on function private.keep_cutoff(integer) from public, anon, authenticated;
revoke all on function private.expired(uuid, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The office's setting
-- ---------------------------------------------------------------------------

-- Sets how long the signed-in admin's company keeps records. Null = forever.
create function public.set_keep_years(p_years integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  co  uuid := private.current_company_id();
begin
  if co is null or not private.is_company_admin() then
    raise exception 'no_access';
  end if;
  if p_years is not null and p_years not in (2, 3, 5, 7, 10) then
    raise exception 'bad_years';
  end if;
  update public.companies set keep_years = p_years where id = co;
end;
$$;

-- How many records the signed-in admin's company would lose tonight if it
-- kept them for p_years, by table. Shown before a shorter setting is saved.
create function public.retention_preview(p_years integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  co      uuid := private.current_company_id();
  counts  jsonb;
begin
  if co is null or not private.is_company_admin() then
    raise exception 'no_access';
  end if;
  if p_years is not null and p_years not in (2, 3, 5, 7, 10) then
    raise exception 'bad_years';
  end if;
  select coalesce(jsonb_object_agg(kind, n), '{}'::jsonb) into counts
  from (select e.kind, count(*) as n
        from private.expired(co, private.keep_cutoff(p_years)) e
        group by e.kind) c;
  return counts;
end;
$$;

revoke all on function public.set_keep_years(integer) from public, anon;
grant execute on function public.set_keep_years(integer) to authenticated;
revoke all on function public.retention_preview(integer) from public, anon;
grant execute on function public.retention_preview(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- The nightly cleanup (server only)
-- ---------------------------------------------------------------------------

-- Companies with something old enough to go.
create function public.retention_companies()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.id from public.companies c
  where c.keep_years is not null
    and exists (select 1 from private.expired(c.id, private.keep_cutoff(c.keep_years)))
  order by c.id
$$;

-- Up to p_limit stored files that belong to a company's expired records:
-- slip photos, site photos, form answer photos, chat photos and report PDFs.
-- Paths are the ones the submit functions require (<company>/<id>...).
create function public.retention_files(p_company uuid, p_limit integer default 1000)
returns table (bucket text, name text)
language sql
stable
security definer
set search_path = ''
as $$
  with c as (
    select co.id::text as co, private.keep_cutoff(co.keep_years) as cut
    from public.companies co where co.id = p_company
  ),
  e as (select x.* from c, private.expired(p_company, c.cut) x)
  select f.bucket, f.name from (
    select o.bucket_id as bucket, o.name from c, e
      join storage.objects o on o.bucket_id = 'slip-photos' and o.name = (select co from c) || '/' || e.id || '.jpg'
     where e.kind = 'trucking_slips'
    union all
    select o.bucket_id, o.name from c, e
      join storage.objects o on o.bucket_id = 'site-photos' and o.name like (select co from c) || '/' || e.id || '/%'
     where e.kind = 'site_entries'
    union all
    select o.bucket_id, o.name from c, e
      join storage.objects o on o.bucket_id = 'form-photos' and o.name like (select co from c) || '/' || e.id || '/%'
     where e.kind = 'form_submissions'
    union all
    -- Removed messages forget their photo path, so go by where it was put.
    select o.bucket_id, o.name from c, e
      join storage.objects o on o.bucket_id = 'chat-photos'
                            and o.name = (select co from c) || '/' || e.job_id || '/' || e.id || '.jpg'
     where e.kind = 'chat_messages'
    union all
    select o.bucket_id, o.name from c, e
      join storage.objects o on o.bucket_id = 'daily-reports' and o.name = (select co from c) || '/' || e.id || '.pdf'
     where e.kind = 'daily_reports'
  ) f
  order by f.bucket, f.name
  limit p_limit
$$;

-- Deletes a company's expired records for good (their details go with them)
-- and returns how many of each. Their files must be removed first.
create function public.retention_delete(p_company uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cut    date;
  kinds  text[] := array['daily_reports', 'chat_messages', 'form_submissions', 'site_entries',
                         'trucking_slips', 'safety_meetings', 'time_cards', 'flhas', 'dispatches'];
  k      text;
  n      integer;
  done   jsonb := '{}'::jsonb;
begin
  select private.keep_cutoff(keep_years) into cut from public.companies where id = p_company;
  if cut is null then
    return done;
  end if;
  if exists (select 1 from public.retention_files(p_company, 1)) then
    raise exception 'files_remain';
  end if;

  foreach k in array kinds loop
    execute format('merge into public.%I t
                    using (select e.id from private.expired($1, $2) e where e.kind = $3) s
                    on t.id = s.id
                    when matched then delete', k)
      using p_company, cut, k;
    get diagnostics n = row_count;
    if n > 0 then
      done := done || jsonb_build_object(k, n);
    end if;
  end loop;

  -- What each worker was sent for those days.
  merge into public.schedule_entries t
  using (select 1) s
  on t.company_id = p_company and t.work_date < cut
  when matched then delete;

  return done;
end;
$$;

revoke all on function public.retention_companies() from public, anon, authenticated;
grant execute on function public.retention_companies() to service_role;
revoke all on function public.retention_files(uuid, integer) from public, anon, authenticated;
grant execute on function public.retention_files(uuid, integer) to service_role;
revoke all on function public.retention_delete(uuid) from public, anon, authenticated;
grant execute on function public.retention_delete(uuid) to service_role;
