-- Admin powers need a second check.
--
-- Admins and platform owners sign in with email and password, then confirm
-- with a code from an authenticator app. Until they do, their session is
-- "aal1" and they get no admin powers: they see only what any worker at
-- their company sees. After the code, the session is "aal2".

create or replace function private.is_company_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select auth.jwt() ->> 'aal') = 'aal2', false)
    and coalesce((
      select r.is_admin
      from public.employees e
      join public.roles r on r.key = e.role_key
      join public.companies c on c.id = e.company_id
      where e.user_id = (select auth.uid())
        and e.is_active
        and c.status <> 'suspended'
    ), false)
$$;

create or replace function private.is_platform_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select auth.jwt() ->> 'aal') = 'aal2', false)
    and exists (
      select 1 from public.platform_owners where user_id = (select auth.uid())
    )
$$;
