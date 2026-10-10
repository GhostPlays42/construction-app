-- Site photos & notes: a worker on a job sends one or more photos (each with
-- an optional cost code and caption) and a notes box, after their FLHA.
-- They can send as many as they like through the day. Date, time and who are
-- stamped automatically. Once sent, an entry never changes.
--
-- Photos live in the private "site-photos" storage bucket at
-- <company id>/<entry id>/<photo id>.jpg. The phone uploads them first, then
-- sends the entry through public.submit_site_entry, which checks each photo
-- is there and was uploaded by the sender. Only office admins and the
-- person who sent them can see them.
--
-- The entry and photo ids come from the phone, so sending the same entry
-- twice (for example when a phone retries after losing signal) saves it once.

create table public.site_entries (
  id            uuid primary key,
  company_id    uuid not null references public.companies (id) on delete cascade,
  job_id        uuid not null,
  employee_id   uuid not null,
  -- The day it counts for, in the company's time zone.
  work_date     date not null,
  -- When it was filled in on the phone, and when it reached us.
  filled_at     timestamptz not null,
  submitted_at  timestamptz not null default now(),
  -- Work done, delays, weather, issues.
  notes         text check (notes is null or length(trim(notes)) between 1 and 4000),
  unique (company_id, id),
  foreign key (company_id, job_id) references public.jobs (company_id, id),
  foreign key (company_id, employee_id) references public.employees (company_id, id)
);

create index site_entries_company_date_idx on public.site_entries (company_id, work_date);
create index site_entries_company_job_idx on public.site_entries (company_id, job_id);
create index site_entries_company_employee_idx on public.site_entries (company_id, employee_id);

-- The cost code is copied in, so the photo still reads the same if the list
-- changes later.
create table public.site_photos (
  id            uuid primary key,
  entry_id      uuid not null,
  company_id    uuid not null,
  position      integer not null,
  -- Where the photo is in the site-photos bucket.
  path          text not null unique,
  cost_code_id  uuid,
  code          text,
  code_name     text,
  caption       text check (caption is null or length(trim(caption)) between 1 and 300),
  foreign key (company_id, entry_id) references public.site_entries (company_id, id) on delete cascade,
  foreign key (company_id, cost_code_id) references public.cost_codes (company_id, id)
);

create index site_photos_company_entry_idx on public.site_photos (company_id, entry_id);
create index site_photos_company_cost_code_idx on public.site_photos (company_id, cost_code_id);

alter table public.site_entries enable row level security;
alter table public.site_photos enable row level security;

revoke all on public.site_entries, public.site_photos from anon, authenticated;
grant select on public.site_entries, public.site_photos to authenticated;

-- Admins see every entry in their company; workers see their own.
create policy site_entries_select on public.site_entries for select to authenticated
  using (company_id = (select private.current_company_id())
         and ((select private.is_company_admin())
              or employee_id = (select private.current_employee_id())));

create policy site_photos_select on public.site_photos for select to authenticated
  using (company_id = (select private.current_company_id())
         and ((select private.is_company_admin())
              or exists (select 1 from public.site_entries e
                         where e.id = site_photos.entry_id
                           and e.employee_id = (select private.current_employee_id()))));

-- The private bucket. Phones shrink photos before sending, so 10 MB is plenty.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-photos', 'site-photos', false, 10485760, array['image/jpeg']);

-- Anyone in a company can upload into their company's folder; nobody can
-- change or remove a photo once it's there. Admins see every photo in their
-- company, and workers see the ones they uploaded.
create policy site_photos_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'site-photos'
              and (storage.foldername(name))[1] = (select private.current_company_id())::text
              and (select private.current_employee_id()) is not null);

create policy site_photos_read on storage.objects for select to authenticated
  using (bucket_id = 'site-photos'
         and (storage.foldername(name))[1] = (select private.current_company_id())::text
         and ((select private.is_company_admin()) or owner_id = (select auth.uid())::text));

-- Saves site photos & notes for a job the sender is on. p_photos is a JSON
-- array of {"id": "...", "cost_code_id": "..." or null, "caption": "..." or
-- null}, in the order taken; each photo must already be uploaded. Errors are
-- short codes the app turns into plain words.
create function public.submit_site_entry(
  p_id         uuid,
  p_job_id     uuid,
  p_notes      text,
  p_photos     jsonb,
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
  notes     text := nullif(trim(coalesce(p_notes, '')), '');
  photos    jsonb := coalesce(p_photos, '[]'::jsonb);
  existing  uuid;
  n         integer;
begin
  if me is null or co is null then
    raise exception 'no_access';
  end if;
  if p_id is null then
    raise exception 'missing_id';
  end if;

  -- Already received: a resend of the same entry is fine.
  select employee_id into existing from public.site_entries where id = p_id;
  if found then
    if existing = me then
      return p_id;
    end if;
    raise exception 'missing_id';
  end if;

  -- Filled in on the phone no later than now. A phone can hold an entry for
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
  -- Like every form, it comes after the sender's FLHA for the day.
  if not exists (select 1 from public.flhas
                 where job_id = p_job_id and employee_id = me and work_date = day) then
    raise exception 'flha_required';
  end if;

  if jsonb_typeof(photos) <> 'array' then
    raise exception 'missing_id';
  end if;
  if jsonb_array_length(photos) = 0 and notes is null then
    raise exception 'photo_or_notes_required';
  end if;
  if jsonb_array_length(photos) > 20 then
    raise exception 'too_many_photos';
  end if;
  if length(notes) > 4000 then
    raise exception 'notes_too_long';
  end if;
  if exists (select 1 from jsonb_to_recordset(photos) p(id uuid) where p.id is null)
     or (select count(distinct p.id) from jsonb_to_recordset(photos) p(id uuid))
        <> jsonb_array_length(photos) then
    raise exception 'missing_id';
  end if;
  if exists (select 1 from jsonb_to_recordset(photos) p(caption text)
             where length(trim(coalesce(p.caption, ''))) > 300) then
    raise exception 'caption_too_long';
  end if;
  if exists (select 1 from jsonb_to_recordset(photos) p(cost_code_id uuid)
             where p.cost_code_id is not null
               and not exists (select 1 from public.cost_codes c
                               where c.id = p.cost_code_id and c.company_id = co and c.is_active)) then
    raise exception 'item_not_available';
  end if;
  -- Every photo is uploaded, by the sender, where this entry keeps them.
  select count(*) into n
  from jsonb_to_recordset(photos) p(id uuid)
  join storage.objects o
    on o.bucket_id = 'site-photos'
   and o.name = co::text || '/' || p_id::text || '/' || p.id::text || '.jpg'
   and o.owner_id = (select auth.uid())::text;
  if n <> jsonb_array_length(photos) then
    raise exception 'photo_missing';
  end if;

  insert into public.site_entries (id, company_id, job_id, employee_id, work_date, filled_at, notes)
  values (p_id, co, p_job_id, me, day, p_filled_at, notes);

  insert into public.site_photos (id, entry_id, company_id, position, path, cost_code_id, code, code_name, caption)
  select p.id, p_id, co, p.ord::integer,
         co::text || '/' || p_id::text || '/' || p.id::text || '.jpg',
         c.id, c.code, c.name, nullif(trim(coalesce(p.caption, '')), '')
  from rows from (jsonb_to_recordset(photos) as (id uuid, cost_code_id uuid, caption text))
       with ordinality as p(id, cost_code_id, caption, ord)
  left join public.cost_codes c on c.id = p.cost_code_id;

  return p_id;
end;
$$;

revoke all on function public.submit_site_entry(uuid, uuid, text, jsonb, timestamptz) from public, anon;
grant execute on function public.submit_site_entry(uuid, uuid, text, jsonb, timestamptz) to authenticated;
