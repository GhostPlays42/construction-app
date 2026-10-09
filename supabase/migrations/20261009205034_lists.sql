-- The admin-managed lists crews pick from: cost codes, hazards and PPE.
--
-- Everyone in a company can read their company's lists (crews need them for
-- time cards, safety meetings and FLHAs, and old entries need the names of
-- items since switched off). Only admins change them. Items are switched off,
-- never deleted, so past entries keep pointing at them.

create table public.cost_codes (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies (id) on delete cascade,
  code        text not null check (length(trim(code)) > 0),
  name        text not null check (length(trim(name)) > 0),
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (company_id, id)
);

create unique index cost_codes_company_code_key on public.cost_codes (company_id, lower(code));
create index cost_codes_company_order_idx on public.cost_codes (company_id, sort_order);

create table public.hazards (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies (id) on delete cascade,
  name        text not null check (length(trim(name)) > 0),
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (company_id, id)
);

create unique index hazards_company_name_key on public.hazards (company_id, lower(name));
create index hazards_company_order_idx on public.hazards (company_id, sort_order);

create table public.ppe_items (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies (id) on delete cascade,
  name        text not null check (length(trim(name)) > 0),
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (company_id, id)
);

create unique index ppe_items_company_name_key on public.ppe_items (company_id, lower(name));
create index ppe_items_company_order_idx on public.ppe_items (company_id, sort_order);

create trigger cost_codes_touch before update on public.cost_codes
  for each row execute function private.touch_updated_at();
create trigger hazards_touch before update on public.hazards
  for each row execute function private.touch_updated_at();
create trigger ppe_items_touch before update on public.ppe_items
  for each row execute function private.touch_updated_at();

alter table public.cost_codes enable row level security;
alter table public.hazards enable row level security;
alter table public.ppe_items enable row level security;
revoke all on public.cost_codes, public.hazards, public.ppe_items from anon;
revoke delete on public.cost_codes, public.hazards, public.ppe_items from authenticated;

create policy cost_codes_select on public.cost_codes for select to authenticated
  using (company_id = (select private.current_company_id()));
create policy cost_codes_insert on public.cost_codes for insert to authenticated
  with check (company_id = (select private.current_company_id())
              and (select private.is_company_admin()));
create policy cost_codes_update on public.cost_codes for update to authenticated
  using (company_id = (select private.current_company_id())
         and (select private.is_company_admin()))
  with check (company_id = (select private.current_company_id())
              and (select private.is_company_admin()));

create policy hazards_select on public.hazards for select to authenticated
  using (company_id = (select private.current_company_id()));
create policy hazards_insert on public.hazards for insert to authenticated
  with check (company_id = (select private.current_company_id())
              and (select private.is_company_admin()));
create policy hazards_update on public.hazards for update to authenticated
  using (company_id = (select private.current_company_id())
         and (select private.is_company_admin()))
  with check (company_id = (select private.current_company_id())
              and (select private.is_company_admin()));

create policy ppe_items_select on public.ppe_items for select to authenticated
  using (company_id = (select private.current_company_id()));
create policy ppe_items_insert on public.ppe_items for insert to authenticated
  with check (company_id = (select private.current_company_id())
              and (select private.is_company_admin()));
create policy ppe_items_update on public.ppe_items for update to authenticated
  using (company_id = (select private.current_company_id())
         and (select private.is_company_admin()))
  with check (company_id = (select private.current_company_id())
              and (select private.is_company_admin()));

-- A new company starts with common hazards and PPE it can edit. Cost codes
-- start empty: every company uses its own.
create function private.add_starter_lists(p_company_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.hazards (company_id, name, sort_order)
  select p_company_id, h.name, h.ord
  from unnest(array[
    'Overhead power lines',
    'Underground utilities',
    'Moving equipment and traffic',
    'Working at heights',
    'Trenching and excavation',
    'Slips, trips and falls',
    'Pinch points',
    'Noise',
    'Dust and silica',
    'Weather (heat, cold, wind)',
    'Manual lifting',
    'Hand and power tools',
    'Confined space',
    'Hazardous materials'
  ]) with ordinality as h(name, ord)
  on conflict do nothing;

  insert into public.ppe_items (company_id, name, sort_order)
  select p_company_id, p.name, p.ord
  from unnest(array[
    'Hard hat',
    'Safety glasses',
    'Hi-vis vest',
    'Steel-toe boots',
    'Gloves',
    'Hearing protection',
    'Respirator or dust mask',
    'Fall protection harness',
    'Face shield'
  ]) with ordinality as p(name, ord)
  on conflict do nothing;
$$;

revoke all on function private.add_starter_lists(uuid) from public, anon, authenticated;

create function private.starter_lists_for_new_company()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.add_starter_lists(new.id);
  return new;
end;
$$;

revoke all on function private.starter_lists_for_new_company() from public, anon, authenticated;

create trigger companies_starter_lists
  after insert on public.companies
  for each row execute function private.starter_lists_for_new_company();

-- Companies that already exist get the same starter lists.
select private.add_starter_lists(id) from public.companies;
