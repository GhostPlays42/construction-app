-- Part of the job sites change (see the job_sites migration). Applied
-- separately on the live project.

-- Replaces a job's crew in one step. Runs as the caller, so the policies
-- above decide whether it is allowed.
create function public.set_job_crew(p_job_id uuid, p_employee_ids uuid[])
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

  -- One statement adds the new crew and takes off anyone no longer listed.
  merge into public.job_assignments t
  using (select distinct e as employee_id
         from unnest(coalesce(p_employee_ids, '{}')) as e) s
  on t.job_id = p_job_id and t.employee_id = s.employee_id
  when not matched by target then
    insert (job_id, employee_id, company_id) values (p_job_id, s.employee_id, job_company)
  when not matched by source and t.job_id = p_job_id then
    delete;
end;
$$;

revoke all on function public.set_job_crew(uuid, uuid[]) from public, anon;
grant execute on function public.set_job_crew(uuid, uuid[]) to authenticated;
