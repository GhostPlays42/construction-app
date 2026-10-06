-- Keep extensions out of the public API schema, and make sure the platform's
-- auto-RLS helper (present on hosted projects) cannot be called over the API.

alter extension citext set schema extensions;

do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end;
$$;
