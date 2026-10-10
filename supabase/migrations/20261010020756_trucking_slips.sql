-- Trucking slips: a worker on a job photographs a trucking slip after their
-- FLHA. The app reads the trucking company, truck #, ticket #, material,
-- loads or tonnage and date from the photo (with Claude), the worker checks
-- or fixes those values, and the office can correct them later. Every
-- office change is logged. The original photo is always kept.
--
-- The photo lives in the private "slip-photos" storage bucket at
-- <company id>/<slip id>.jpg. The phone uploads it first, then sends the
-- slip through public.submit_trucking_slip. With no signal both wait on the
-- phone. Reading happens once the slip has arrived, so a slip sent from a
-- phone with no signal is read later and checked then.
--
-- The slip id comes from the phone, so sending the same slip twice (for
-- example when a phone retries after losing signal) saves it once.

create table public.trucking_slips (
  id               uuid primary key,
  company_id       uuid not null references public.companies (id) on delete cascade,
  job_id           uuid not null,
  employee_id      uuid not null,
  -- The day it counts for, in the company's time zone.
  work_date        date not null,
  -- When the photo was taken on the phone, and when it reached us.
  filled_at        timestamptz not null,
  submitted_at     timestamptz not null default now(),
  -- Where the photo is in the slip-photos bucket.
  photo_path       text not null unique,
  -- Reading the photo: waiting, done, or couldn't be read. What the app read
  -- is kept as it was, next to the values in use.
  read_status      text not null default 'pending' check (read_status in ('pending', 'read', 'failed')),
  read_values      jsonb,
  read_at          timestamptz,
  -- Whether the worker (or the office) has checked the values.
  status           text not null default 'unchecked' check (status in ('unchecked', 'checked')),
  checked_at       timestamptz,
  trucking_company text check (trucking_company is null or length(trucking_company) between 1 and 200),
  truck_number     text check (truck_number is null or length(truck_number) between 1 and 200),
  ticket_number    text check (ticket_number is null or length(ticket_number) between 1 and 200),
  material         text check (material is null or length(material) between 1 and 200),
  loads            numeric(10, 2) check (loads is null or loads between 0 and 100000),
  tonnage          numeric(12, 2) check (tonnage is null or tonnage between 0 and 1000000),
  slip_date        date,
  unique (company_id, id),
  foreign key (company_id, job_id) references public.jobs (company_id, id),
  foreign key (company_id, employee_id) references public.employees (company_id, id)
);

create index trucking_slips_company_date_idx on public.trucking_slips (company_id, work_date);
create index trucking_slips_company_job_idx on public.trucking_slips (company_id, job_id);
create index trucking_slips_company_employee_idx on public.trucking_slips (company_id, employee_id);

-- Every office correction: who, when, which value, old and new.
create table public.trucking_slip_changes (
  id          bigint generated always as identity primary key,
  slip_id     uuid not null,
  company_id  uuid not null,
  changed_by  uuid not null,
  changed_at  timestamptz not null default now(),
  -- Trucking company, Truck #, Ticket #, Material, Loads, Tonnage or Slip date.
  field       text not null,
  old_value   text,
  new_value   text,
  foreign key (company_id, slip_id) references public.trucking_slips (company_id, id) on delete cascade,
  foreign key (company_id, changed_by) references public.employees (company_id, id)
);

create index trucking_slip_changes_company_slip_idx on public.trucking_slip_changes (company_id, slip_id);
create index trucking_slip_changes_company_by_idx on public.trucking_slip_changes (company_id, changed_by);

alter table public.trucking_slips enable row level security;
alter table public.trucking_slip_changes enable row level security;

revoke all on public.trucking_slips, public.trucking_slip_changes from anon, authenticated;
grant select on public.trucking_slips, public.trucking_slip_changes to authenticated;

-- Admins see every slip in their company; workers see their own.
create policy trucking_slips_select on public.trucking_slips for select to authenticated
  using (company_id = (select private.current_company_id())
         and ((select private.is_company_admin())
              or employee_id = (select private.current_employee_id())));

create policy trucking_slip_changes_select on public.trucking_slip_changes for select to authenticated
  using (company_id = (select private.current_company_id()) and (select private.is_company_admin()));

-- The private bucket. Phones shrink photos before sending, so 10 MB is plenty.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('slip-photos', 'slip-photos', false, 10485760, array['image/jpeg']);

-- Anyone in a company can upload into their company's folder; nobody can
-- change or remove a photo once it's there. Admins see every slip photo in
-- their company, and workers see the ones they uploaded.
create policy slip_photos_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'slip-photos'
              and (storage.foldername(name))[1] = (select private.current_company_id())::text
              and (select private.current_employee_id()) is not null);

create policy slip_photos_read on storage.objects for select to authenticated
  using (bucket_id = 'slip-photos'
         and (storage.foldername(name))[1] = (select private.current_company_id())::text
         and ((select private.is_company_admin()) or owner_id = (select auth.uid())::text));

-- A slip's values as text, the way the change log shows them.
create function private.trucking_slip_texts(p_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'Trucking company', s.trucking_company,
    'Truck #', s.truck_number,
    'Ticket #', s.ticket_number,
    'Material', s.material,
    'Loads', trim_scale(s.loads)::text,
    'Tonnage', trim_scale(s.tonnage)::text,
    'Slip date', to_char(s.slip_date, 'Mon FMDD, YYYY'))
  from public.trucking_slips s where s.id = p_id
$$;

-- Checks and saves the values of a slip. Errors are short codes the app
-- turns into plain words.
create function private.save_trucking_slip_values(
  p_id                uuid,
  p_trucking_company  text,
  p_truck_number      text,
  p_ticket_number     text,
  p_material          text,
  p_loads             numeric,
  p_tonnage           numeric,
  p_slip_date         date
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  trucking  text := nullif(trim(coalesce(p_trucking_company, '')), '');
  truck     text := nullif(trim(coalesce(p_truck_number, '')), '');
  ticket    text := nullif(trim(coalesce(p_ticket_number, '')), '');
  mat       text := nullif(trim(coalesce(p_material, '')), '');
begin
  if trucking is null then
    raise exception 'trucking_company_required';
  end if;
  if ticket is null then
    raise exception 'ticket_required';
  end if;
  if greatest(length(trucking), length(truck), length(ticket), length(mat)) > 200 then
    raise exception 'too_long';
  end if;
  if p_loads is null and p_tonnage is null then
    raise exception 'amount_required';
  end if;
  if p_loads < 0 or p_loads > 100000 or p_tonnage < 0 or p_tonnage > 1000000 then
    raise exception 'bad_amount';
  end if;
  if p_slip_date is not null
     and (p_slip_date > current_date + 1 or p_slip_date < current_date - 366) then
    raise exception 'bad_slip_date';
  end if;

  update public.trucking_slips
  set trucking_company = trucking, truck_number = truck, ticket_number = ticket, material = mat,
      loads = round(p_loads, 2), tonnage = round(p_tonnage, 2), slip_date = p_slip_date
  where id = p_id;
end;
$$;

-- Saves a slip a worker photographed on a job they're on. The photo must
-- already be uploaded, by them, where this slip keeps it.
create function public.submit_trucking_slip(
  p_id         uuid,
  p_job_id     uuid,
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
  day       date;
  path      text;
  existing  uuid;
begin
  if me is null or co is null then
    raise exception 'no_access';
  end if;
  if p_id is null then
    raise exception 'missing_id';
  end if;

  -- Already received: a resend of the same slip is fine.
  select employee_id into existing from public.trucking_slips where id = p_id;
  if found then
    if existing = me then
      return p_id;
    end if;
    raise exception 'missing_id';
  end if;

  -- Taken on the phone no later than now. A phone can hold a slip for up to
  -- two weeks without signal; older than that is a wrong phone clock.
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
  -- Like every form, it comes after the sender's FLHA for the day.
  if not exists (select 1 from public.flhas
                 where job_id = p_job_id and employee_id = me and work_date = day) then
    raise exception 'flha_required';
  end if;

  path := co::text || '/' || p_id::text || '.jpg';
  if not exists (select 1 from storage.objects
                 where bucket_id = 'slip-photos' and name = path
                   and owner_id = (select auth.uid())::text) then
    raise exception 'photo_missing';
  end if;

  insert into public.trucking_slips (id, company_id, job_id, employee_id, work_date, filled_at, photo_path)
  values (p_id, co, p_job_id, me, day, p_filled_at, path);
  return p_id;
end;
$$;

-- Saves what the app read from a slip's photo, once. p_values is
-- {"trucking_company": "...", "truck_number": "...", "ticket_number": "...",
-- "material": "...", "loads": 3, "tonnage": 42.5, "slip_date": "2026-10-09"}
-- with any value null; a null p_values means the photo couldn't be read.
-- The values fill in the slip for the worker to check. Called for the
-- sender (from their phone) or an admin.
create function public.save_trucking_slip_reading(p_id uuid, p_values jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me     uuid := private.current_employee_id();
  co     uuid := private.current_company_id();
  slip   public.trucking_slips;
  kept   jsonb;
  amount numeric;
  tons   numeric;
  day    date;
begin
  if me is null or co is null then
    raise exception 'no_access';
  end if;
  select * into slip from public.trucking_slips where id = p_id and company_id = co;
  if not found or (slip.employee_id <> me and not private.is_company_admin()) then
    raise exception 'not_found';
  end if;
  -- Read once; a second reading (two screens open at once) is ignored.
  if slip.read_status <> 'pending' then
    return;
  end if;

  if p_values is null or jsonb_typeof(p_values) <> 'object' then
    update public.trucking_slips set read_status = 'failed', read_at = now() where id = p_id;
    return;
  end if;

  -- Keep only the expected values, as short text, and numbers and a date
  -- that make sense. Anything else is left blank for the worker to fill in.
  select jsonb_object_agg(k, left(trim(p_values ->> k), 200))
  into kept
  from unnest(array['trucking_company', 'truck_number', 'ticket_number', 'material']) k
  where jsonb_typeof(p_values -> k) = 'string' and trim(p_values ->> k) <> '';
  kept := coalesce(kept, '{}'::jsonb);

  if jsonb_typeof(p_values -> 'loads') = 'number' then
    amount := round((p_values ->> 'loads')::numeric, 2);
    if amount between 0 and 100000 then
      kept := kept || jsonb_build_object('loads', trim_scale(amount));
    else
      amount := null;
    end if;
  end if;
  if jsonb_typeof(p_values -> 'tonnage') = 'number' then
    tons := round((p_values ->> 'tonnage')::numeric, 2);
    if tons between 0 and 1000000 then
      kept := kept || jsonb_build_object('tonnage', trim_scale(tons));
    else
      tons := null;
    end if;
  end if;
  begin
    day := (p_values ->> 'slip_date')::date;
    if day > current_date + 1 or day < current_date - 366 then
      day := null;
    end if;
  exception when others then
    day := null;
  end;
  if day is not null then
    kept := kept || jsonb_build_object('slip_date', day);
  end if;

  update public.trucking_slips
  set read_status = 'read', read_at = now(), read_values = kept,
      trucking_company = case when status = 'unchecked' then kept ->> 'trucking_company' else trucking_company end,
      truck_number     = case when status = 'unchecked' then kept ->> 'truck_number' else truck_number end,
      ticket_number    = case when status = 'unchecked' then kept ->> 'ticket_number' else ticket_number end,
      material         = case when status = 'unchecked' then kept ->> 'material' else material end,
      loads            = case when status = 'unchecked' then amount else loads end,
      tonnage          = case when status = 'unchecked' then tons else tonnage end,
      slip_date        = case when status = 'unchecked' then day else slip_date end
  where id = p_id;
end;
$$;

-- The worker confirms or fixes the values of their own slip, once.
create function public.check_trucking_slip(
  p_id                uuid,
  p_trucking_company  text,
  p_truck_number      text,
  p_ticket_number     text,
  p_material          text,
  p_loads             numeric,
  p_tonnage           numeric,
  p_slip_date         date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me    uuid := private.current_employee_id();
  slip  public.trucking_slips;
begin
  if me is null then
    raise exception 'no_access';
  end if;
  select * into slip from public.trucking_slips where id = p_id and employee_id = me;
  if not found then
    raise exception 'not_found';
  end if;
  if slip.status = 'checked' then
    raise exception 'already_checked';
  end if;
  perform private.save_trucking_slip_values(p_id, p_trucking_company, p_truck_number, p_ticket_number,
                                            p_material, p_loads, p_tonnage, p_slip_date);
  update public.trucking_slips set status = 'checked', checked_at = now() where id = p_id;
end;
$$;

-- The office corrects a slip's values. Every change is logged. Saving also
-- counts as checking it, so a slip the worker never checked is settled.
create function public.update_trucking_slip(
  p_id                uuid,
  p_trucking_company  text,
  p_truck_number      text,
  p_ticket_number     text,
  p_material          text,
  p_loads             numeric,
  p_tonnage           numeric,
  p_slip_date         date
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
  after   jsonb;
begin
  if me is null or co is null or not private.is_company_admin() then
    raise exception 'no_access';
  end if;
  if not exists (select 1 from public.trucking_slips where id = p_id and company_id = co) then
    raise exception 'not_found';
  end if;
  before := private.trucking_slip_texts(p_id);
  perform private.save_trucking_slip_values(p_id, p_trucking_company, p_truck_number, p_ticket_number,
                                            p_material, p_loads, p_tonnage, p_slip_date);
  after := private.trucking_slip_texts(p_id);

  insert into public.trucking_slip_changes (slip_id, company_id, changed_by, field, old_value, new_value)
  select p_id, co, me, f.field, before ->> f.field, after ->> f.field
  from unnest(array['Trucking company', 'Truck #', 'Ticket #', 'Material', 'Loads', 'Tonnage', 'Slip date'])
       with ordinality as f(field, n)
  where (before ->> f.field) is distinct from (after ->> f.field)
  order by f.n;

  update public.trucking_slips
  set status = 'checked', checked_at = coalesce(checked_at, now())
  where id = p_id;
end;
$$;

revoke all on function private.trucking_slip_texts(uuid) from public, anon, authenticated;
revoke all on function private.save_trucking_slip_values(uuid, text, text, text, text, numeric, numeric, date)
  from public, anon, authenticated;
revoke all on function public.submit_trucking_slip(uuid, uuid, timestamptz) from public, anon;
grant execute on function public.submit_trucking_slip(uuid, uuid, timestamptz) to authenticated;
revoke all on function public.save_trucking_slip_reading(uuid, jsonb) from public, anon;
grant execute on function public.save_trucking_slip_reading(uuid, jsonb) to authenticated;
revoke all on function public.check_trucking_slip(uuid, text, text, text, text, numeric, numeric, date) from public, anon;
grant execute on function public.check_trucking_slip(uuid, text, text, text, text, numeric, numeric, date) to authenticated;
revoke all on function public.update_trucking_slip(uuid, text, text, text, text, numeric, numeric, date) from public, anon;
grant execute on function public.update_trucking_slip(uuid, text, text, text, text, numeric, numeric, date) to authenticated;
