-- Same recurring issue as 006/008/012/016/023 — the 6th time this exact
-- thing has happened. Confirmed via real INSERT attempts (a blocked
-- SELECT under RLS just returns an empty set, not an error) that all
-- three tables added in 025 had RLS back on, which is also why their
-- seed data from 025/026 never became visible.

alter table personnel_check_items disable row level security;
alter table driver_readiness_check_results disable row level security;
alter table role_level_titles disable row level security;

notify pgrst, 'reload schema';
