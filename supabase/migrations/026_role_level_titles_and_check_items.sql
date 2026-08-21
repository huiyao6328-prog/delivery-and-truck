-- Job title per role_level (1=Supervisor, 2=Staff, 3=Driver, 4=Helper),
-- kept as its own small config table rather than a column on employees so
-- the mapping stays editable in one place (Settings screen) instead of
-- needing to update every employee if a title changes.

create table role_level_titles (
  role_level int primary key check (role_level in (1, 2, 3, 4)),
  title      text not null
);

insert into role_level_titles (role_level, title) values
  (1, 'Supervisor'),
  (2, 'Staff'),
  (3, 'Driver'),
  (4, 'Helper');

alter table role_level_titles disable row level security;
grant select, insert, update, delete on role_level_titles to anon, authenticated;

-- Round out Personnel Readiness Check to 10 items (7 already seeded in 025).
insert into personnel_check_items (sort_order, label, hint) values
  (8, 'Uniform & Appearance', 'Proper uniform, grooming standards met'),
  (9, 'Communication Device', 'Phone / radio charged and working'),
  (10, 'Route / Task Briefing', 'Briefed on today''s route and assignment');

-- New back-office module needs its own function_code.
alter table permission_group_functions drop constraint permission_group_functions_function_code_check;
alter table permission_group_functions add constraint permission_group_functions_function_code_check
  check (function_code in (
    'employees', 'permissions', 'truck_types', 'trucks',
    'dispatches', 'inspections', 'inspection_settings',
    'pack_boxes', 'load_calculator', 'truck_owners', 'improvement_progress',
    'driver_readiness', 'accidents', 'customer_complaints', 'fuel_costs', 'kpi_dashboard',
    'role_titles'
  ));

insert into permission_group_functions (group_id, function_code, access_level)
select pg.id, 'role_titles', 'edit'
from permission_groups pg
where pg.name = 'Full Access'
  and not exists (
    select 1 from permission_group_functions pgf
    where pgf.group_id = pg.id and pgf.function_code = 'role_titles'
  );

notify pgrst, 'reload schema';
