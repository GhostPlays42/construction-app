-- Part of the job sites change (see the job_sites migration). Applied
-- separately on the live project.

-- Jobs are marked complete, never deleted.
revoke delete on public.jobs from authenticated;
