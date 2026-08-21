-- Same recurring issue as 006/008/012: something (most likely a Supabase
-- dashboard prompt) re-enables Row Level Security on newly created tables
-- after migration, silently blocking the anon-key reads/writes this app
-- relies on (see known-issue note in 工程交接紀錄.md — RLS is intentionally
-- disabled everywhere; access is enforced in the Next.js layer instead).
-- Confirmed via `select relname, relrowsecurity from pg_class ...` that
-- improvement_actions had RLS back on, hiding all 83 backfilled rows from
-- the app (PostgREST) even though they were visible in the SQL Editor.
-- Re-disabling on it plus the two other tables added this session, since
-- they're equally new and likely hit the same default.

alter table improvement_actions disable row level security;
alter table truck_maintenance_assignments disable row level security;
alter table driver_readiness_checks disable row level security;

notify pgrst, 'reload schema';
