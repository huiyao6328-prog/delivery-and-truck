-- Role hierarchy level per employee: 1 = highest authority (only one
-- person may hold it — e.g. the department head), 4 = lowest. Feeds the
-- upcoming per-role KPI system (主管/副主管/司機/幫手 map roughly to
-- levels 1-4) but is independent of permission_groups, which controls
-- back-office access, not organizational rank.

alter table employees add column role_level int check (role_level in (1, 2, 3, 4));

-- Only one employee may ever hold level 1 at a time.
create unique index idx_employees_role_level_1 on employees(role_level) where role_level = 1;

notify pgrst, 'reload schema';
