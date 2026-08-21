-- Same recurring issue as 006/008/012/016: something re-enables Row Level
-- Security on newly created tables after migration, silently blocking the
-- anon-key writes this app relies on (see known-issue note in
-- 工程交接紀錄.md). Confirmed via a real INSERT attempt (a blocked SELECT
-- under RLS just returns an empty set, not an error, so it doesn't show up
-- unless you specifically test a write) that all three tables added in
-- 022 had RLS back on.

alter table accident_reports disable row level security;
alter table customer_complaints disable row level security;
alter table fuel_transactions disable row level security;

notify pgrst, 'reload schema';
