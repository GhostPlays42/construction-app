-- Foundation: companies, roles, employees, and company data isolation.
--
-- Every company-owned table carries company_id and is protected by row level
-- security. Access is decided by the helper functions in the private schema,
-- which look up the signed-in user's active employee record. An inactive
-- employee resolves to no company, so their access stops on the next request.

create extension if not exists citext;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.companies (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) > 0),
  status      text not null default 'trial'
              check (status in ('trial', 'active', 'suspended')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Extendable list of roles. More can be added later without code changes to
-- the tables that reference it.
create table public.roles (
  key         text primary key check (key ~ '^[a-z_]+$'),
  name        text not null,
  is_admin    boolean not null default false,
  created_at  timestamptz not null default now()
);

insert into public.roles (key, name, is_admin) values
  ('admin', 'Admin', true),
  ('employee', 'Employee', false);

-- People who run the platform itself (the owner view across all companies).
create table public.platform_owners (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now()
);

-- One record per person in a company. user_id links to their login once an
-- admin has created it; a login belongs to exactly one company.
create table public.employees (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies (id) on delete cascade,
  user_id     uuid unique references auth.users (id) on delete set null,
  full_name   text not null check (length(trim(full_name)) > 0),
  phone       text,
  email       citext,
  role_key    text not null default 'employee' references public.roles (key),
  trade       text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (company_id, id)
);

create index employees_company_id_idx on public.employees (company_id);
create unique index employees_company_phone_key
  on public.employees (company_id, phone) where phone is not null;
create unique index employees_company_email_key
  on public.employees (company_id, email) where email is not null;

-- Hourly rates live in their own table so only admins can ever read them.
create table public.employee_rates (
  employee_id  uuid primary key,
  company_id   uuid not null,
  hourly_rate  numeric(10, 2) not null check (hourly_rate >= 0),
  updated_at   timestamptz not null default now(),
  foreign key (company_id, employee_id)
    references public.employees (company_id, id) on delete cascade
);

create index employee_rates_company_id_idx on public.employee_rates (company_id);

create table public.certifications (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null,
  employee_id  uuid not null,
  name         text not null check (length(trim(name)) > 0),
  expires_on   date,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  foreign key (company_id, employee_id)
    references public.employees (company_id, id) on delete cascade
);

create index certifications_company_id_idx on public.certifications (company_id);
create index certifications_employee_id_idx on public.certifications (employee_id);
create index certifications_expires_on_idx on public.certifications (company_id, expires_on);

-- ---------------------------------------------------------------------------
-- Access helpers
-- ---------------------------------------------------------------------------

-- The signed-in user's company, or null if they have no active employee
-- record or their company is suspended.
create function private.current_company_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select e.company_id
  from public.employees e
  join public.companies c on c.id = e.company_id
  where e.user_id = (select auth.uid())
    and e.is_active
    and c.status <> 'suspended'
$$;

create function private.current_employee_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select e.id
  from public.employees e
  join public.companies c on c.id = e.company_id
  where e.user_id = (select auth.uid())
    and e.is_active
    and c.status <> 'suspended'
$$;

create function private.is_company_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select r.is_admin
    from public.employees e
    join public.roles r on r.key = e.role_key
    join public.companies c on c.id = e.company_id
    where e.user_id = (select auth.uid())
      and e.is_active
      and c.status <> 'suspended'
  ), false)
$$;

create function private.is_platform_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.platform_owners where user_id = (select auth.uid())
  )
$$;

revoke all on all functions in schema private from public;
grant execute on all functions in schema private to authenticated;

-- Keep updated_at current.
create function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger companies_touch before update on public.companies
  for each row execute function private.touch_updated_at();
create trigger employees_touch before update on public.employees
  for each row execute function private.touch_updated_at();
create trigger employee_rates_touch before update on public.employee_rates
  for each row execute function private.touch_updated_at();
create trigger certifications_touch before update on public.certifications
  for each row execute function private.touch_updated_at();

-- An admin may not move a record to another company or change who a login
-- belongs to; only the platform owner can.
create function private.guard_employee_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.company_id <> old.company_id
     and not (select private.is_platform_owner()) then
    raise exception 'employees cannot be moved between companies';
  end if;
  return new;
end;
$$;

create trigger employees_guard before update on public.employees
  for each row execute function private.guard_employee_update();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.companies       enable row level security;
alter table public.roles           enable row level security;
alter table public.platform_owners enable row level security;
alter table public.employees       enable row level security;
alter table public.employee_rates  enable row level security;
alter table public.certifications  enable row level security;

-- Nothing here is readable without signing in.
revoke all on public.companies, public.roles, public.platform_owners,
  public.employees, public.employee_rates, public.certifications from anon;

-- Companies: members see their own; the platform owner sees and manages all.
-- Companies are created by the sign-up flow (a later step), not directly.
create policy companies_select on public.companies for select to authenticated
  using (id = (select private.current_company_id())
         or (select private.is_platform_owner()));

create policy companies_update_owner on public.companies for update to authenticated
  using ((select private.is_platform_owner()))
  with check ((select private.is_platform_owner()));

-- Roles: a shared list everyone signed in can read.
create policy roles_select on public.roles for select to authenticated
  using (true);

-- Platform owners: you can see whether you are one.
create policy platform_owners_select_self on public.platform_owners
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Employees: everyone in a company sees the company's people (needed for crew
-- lists); only that company's admins add, change or remove them.
create policy employees_select on public.employees for select to authenticated
  using (company_id = (select private.current_company_id())
         or (select private.is_platform_owner()));

create policy employees_insert on public.employees for insert to authenticated
  with check (company_id = (select private.current_company_id())
              and (select private.is_company_admin()));

create policy employees_update on public.employees for update to authenticated
  using (company_id = (select private.current_company_id())
         and (select private.is_company_admin()))
  with check (company_id = (select private.current_company_id())
              and (select private.is_company_admin()));

create policy employees_delete on public.employees for delete to authenticated
  using (company_id = (select private.current_company_id())
         and (select private.is_company_admin()));

-- Hourly rates: admins of the company only.
create policy employee_rates_admin on public.employee_rates for all to authenticated
  using (company_id = (select private.current_company_id())
         and (select private.is_company_admin()))
  with check (company_id = (select private.current_company_id())
              and (select private.is_company_admin()));

-- Certifications: admins manage them; an employee can see their own.
create policy certifications_select on public.certifications for select to authenticated
  using (company_id = (select private.current_company_id())
         and ((select private.is_company_admin())
              or employee_id = (select private.current_employee_id())));

create policy certifications_insert on public.certifications for insert to authenticated
  with check (company_id = (select private.current_company_id())
              and (select private.is_company_admin()));

create policy certifications_update on public.certifications for update to authenticated
  using (company_id = (select private.current_company_id())
         and (select private.is_company_admin()))
  with check (company_id = (select private.current_company_id())
              and (select private.is_company_admin()));

create policy certifications_delete on public.certifications for delete to authenticated
  using (company_id = (select private.current_company_id())
         and (select private.is_company_admin()));
