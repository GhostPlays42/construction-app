# Construction App

Multi-company construction management web app: time cards, safety forms, trucking slips, site photos, dispatch and an automatic daily field report.

Built with Next.js, Supabase (Canada region) and Vercel.

## Getting started

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in the Supabase URL and publishable key.
3. `npm run dev` and open http://localhost:3000

## Database

Schema changes live in `supabase/migrations/`. Company data isolation is enforced by row level security and covered by tests:

```bash
npx supabase start   # local database (needs Docker)
npx supabase test db # run the isolation tests
```
