-- Cover the composite foreign keys so deleting an employee stays fast.
create index certifications_company_employee_idx on public.certifications (company_id, employee_id);
create index employee_rates_company_employee_idx on public.employee_rates (company_id, employee_id);
create index employees_role_key_idx on public.employees (role_key);
