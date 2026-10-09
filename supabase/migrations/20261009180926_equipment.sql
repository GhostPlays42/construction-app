-- Equipment, its admin-only rates, and which jobs each machine is on.
--
-- Admins see and manage all of their company's equipment. Everyone else sees
-- only the machines on jobs they're assigned to. Machines are never deleted;
-- they are switched off, so past hours and reports keep pointing at them.
-- "On a job" isn't stored: it comes from being on an active job.

create table public.equipment (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies (id) on delete cascade,
  name            text not null check (length(trim(name)) > 0),
  unit_number     text,
  equipment_type  text,
  make            text,
  model           text,
  ownership       text not null default 'owned'
                  check (ownership in ('owned', 'rented')),
  rental_company  text,
  down_for_repair boolean not null default false,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (company_id, id),
  check (ownership = 'rented' or rental_company is null)
);

create index equipment_company_id_idx on public.equipment (company_id, is_active);
create unique index equipment_company_unit_key
  on public.equipment (company_id, lower(unit_number)) where unit_number is not null;

-- Rates live apart from the machine so only admins can ever read them.
create table public.equipment_rates (
  equipment_id  uuid primary key,
  company_id    uuid not null,
  hourly_rate   numeric(10, 2) not null check (hourly_rate >= 0),
  updated_at    timestamptz not null default now(),
  foreign key (company_id, equipment_id)
    references public.equipment (company_id, id) on delete cascade
);

create index equipment_rates_company_id_idx on public.equipment_rates (company_id);

create table public.job_equipment (
  job_id        uuid not null,
  equipment_id  uuid not null,
  company_id    uuid not null,
  created_at    timestamptz not null default now(),
  primary key (job_id, equipment_id),
  foreign key (company_id, job_id)
    references public.jobs (company_id, id) on delete cascade,
  foreign key (company_id, equipment_id)
    references public.equipment (company_id, id) on delete cascade
);

create index job_equipment_equipment_idx on public.job_equipment (equipment_id);
create index job_equipment_company_job_idx on public.job_equipment (company_id, job_id);
create index job_equipment_company_equipment_idx on public.job_equipment (company_id, equipment_id);

create trigger equipment_touch before update on public.equipment
  for each row execute function private.touch_updated_at();
create trigger equipment_rates_touch before update on public.equipment_rates
  for each row execute function private.touch_updated_at();

alter table public.equipment enable row level security;
alter table public.equipment_rates enable row level security;
alter table public.job_equipment enable row level security;
revoke all on public.equipment, public.equipment_rates, public.job_equipment from anon;
revoke delete on public.equipment from authenticated;

create policy equipment_select on public.equipment for select to authenticated
  using (company_id = (select private.current_company_id())
         and ((select private.is_company_admin())
              or exists (select 1
                         from public.job_equipment je
                         join public.job_assignments a on a.job_id = je.job_id
                         where je.equipment_id = equipment.id
                           and a.employee_id = (select private.current_employee_id()))));

create policy equipment_insert on public.equipment for insert to authenticated
  with check (company_id = (select private.current_company_id())
              and (select private.is_company_admin()));

create policy equipment_update on public.equipment for update to authenticated
  using (company_id = (select private.current_company_id())
         and (select private.is_company_admin()))
  with check (company_id = (select private.current_company_id())
              and (select private.is_company_admin()));

create policy equipment_rates_admin on public.equipment_rates for all to authenticated
  using (company_id = (select private.current_company_id())
         and (select private.is_company_admin()))
  with check (company_id = (select private.current_company_id())
              and (select private.is_company_admin()));

create policy job_equipment_select on public.job_equipment for select to authenticated
  using (company_id = (select private.current_company_id())
         and ((select private.is_company_admin())
              or exists (select 1 from public.job_assignments a
                         where a.job_id = job_equipment.job_id
                           and a.employee_id = (select private.current_employee_id()))));

create policy job_equipment_insert on public.job_equipment for insert to authenticated
  with check (company_id = (select private.current_company_id())
              and (select private.is_company_admin()));

create policy job_equipment_delete on public.job_equipment for delete to authenticated
  using (company_id = (select private.current_company_id())
         and (select private.is_company_admin()));

-- Replaces the equipment on a job in one step. Runs as the caller, so the
-- policies above decide whether it is allowed.
create function public.set_job_equipment(p_job_id uuid, p_equipment_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  job_company uuid;
begin
  select company_id into job_company from public.jobs where id = p_job_id;
  if job_company is null then
    raise exception 'job_not_found';
  end if;

  merge into public.job_equipment t
  using (select distinct e as equipment_id
         from unnest(coalesce(p_equipment_ids, '{}')) as e) s
  on t.job_id = p_job_id and t.equipment_id = s.equipment_id
  when not matched by target then
    insert (job_id, equipment_id, company_id) values (p_job_id, s.equipment_id, job_company)
  when not matched by source and t.job_id = p_job_id then
    delete;
end;
$$;

revoke all on function public.set_job_equipment(uuid, uuid[]) from public, anon;
grant execute on function public.set_job_equipment(uuid, uuid[]) to authenticated;
