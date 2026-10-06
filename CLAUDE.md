@AGENTS.md

# Construction App

Multi-company construction management web app (Next.js + Supabase, deployed on Vercel). The full product plan lives outside the repo; decisions are recorded in the project.

## Rules for every change

- Every company-owned table has a `company_id` column and row level security. Access goes through the helpers in the `private` schema (`current_company_id()`, `is_company_admin()`, `is_platform_owner()`); never bypass them from the app.
- Hourly rates are admin-only and live in their own tables.
- Schema changes are migrations in `supabase/migrations/`; add or extend pgTAP tests in `supabase/tests/` and run `npx supabase test db`.
