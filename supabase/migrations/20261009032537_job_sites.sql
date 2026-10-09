-- Job sites and the crew assigned to them.
--
-- Admins see and manage every job in their company. Everyone else sees only
-- the jobs they are assigned to. Jobs are never deleted; they are marked
-- complete, so their records and reports stay intact.

create table public.jobs (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies (id) on delete cascade,
  name        text not null check (length(trim(name)) > 0),
  job_number  text,
  address     text,
  client      text,
  start_date  date,
  end_date    date,
  -- Only active jobs get a daily report.
  status      text not null default 'active'
              check (status in ('active', 'paused', 'complete')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (company_id, id),
  check (end_date is null or start_date is null or end_date >= start_date)
);

create index jobs_company_id_idx on public.jobs (company_id, status);
create unique index jobs_company_number_key
  on public.jobs (company_id, lower(job_number)) where job_number is not null;

create table public.job_assignments (
  job_id       uuid not null,
  employee_id  uuid not null,
  company_id   uuid not null,
  created_at   timestamptz not null default now(),
  primary key (job_id, employee_id),
  foreign key (company_id, job_id)
    references public.jobs (company_id, id) on delete cascade,
  foreign key (company_id, employee_id)
    references public.employees (company_id, id) on delete cascade
);

create index job_assignments_employee_idx on public.job_assignments (employee_id);
create index job_assignments_company_job_idx on public.job_assignments (company_id, job_id);
create index job_assignments_company_employee_idx on public.job_assignments (company_id, employee_id);

create trigger jobs_touch before update on public.jobs
  for each row execute function private.touch_updated_at();

alter table public.jobs enable row level security;
alter table public.job_assignments enable row level security;
revoke all on public.jobs, public.job_assignments from anon;

create policy jobs_select on public.jobs for select to authenticated
  using (company_id = (select private.current_company_id())
         and ((select private.is_company_admin())
              or exists (select 1 from public.job_assignments a
                         where a.job_id = jobs.id
                           and a.employee_id = (select private.current_employee_id()))));

create policy jobs_insert on public.jobs for insert to authenticated
  with check (company_id = (select private.current_company_id())
              and (select private.is_company_admin()));

create policy jobs_update on public.jobs for update to authenticated
  using (company_id = (select private.current_company_id())
         and (select private.is_company_admin()))
  with check (company_id = (select private.current_company_id())
              and (select private.is_company_admin()));

create policy job_assignments_select on public.job_assignments for select to authenticated
  using (company_id = (select private.current_company_id())
         and ((select private.is_company_admin())
              or employee_id = (select private.current_employee_id())));

create policy job_assignments_insert on public.job_assignments for insert to authenticated
  with check (company_id = (select private.current_company_id())
              and (select private.is_company_admin()));
