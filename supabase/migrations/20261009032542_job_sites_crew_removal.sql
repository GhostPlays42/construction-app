-- Part of the job sites change (see the job_sites migration). Applied
-- separately on the live project.

-- Admins take people off a job's crew.
create policy job_assignments_delete on public.job_assignments for delete to authenticated
  using (company_id = (select private.current_company_id())
         and (select private.is_company_admin()));

