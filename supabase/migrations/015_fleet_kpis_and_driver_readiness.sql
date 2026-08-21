-- Fleet KPI dashboard + Driver Readiness.
--
-- - truck_owners.is_default marks which owners count as the company's own
--   ("default") fleet, so the dashboard can be scoped to just those trucks
--   rather than every truck (including contracted trucking-company trucks)
--   in the table.
-- - trucks.registration_expiry / insurance_expiry back the "Registration
--   Expiring" / "Insurance Expiring" dashboard KPIs.
-- - employees.license_no / license_expiry are the canonical, editable
--   driver license fields; driver_readiness_checks snapshots them per check
--   (same pattern as inspection_results.label_snapshot) so a later license
--   renewal never rewrites a past check's record.
-- - truck_maintenance_assignments is a standing employee<->truck mapping
--   ("who is responsible for maintaining this truck") — managed on the
--   Employees screen, one person can be assigned several trucks.
-- - driver_readiness_checks is a new, separate-from-inspections daily
--   supervisor confirmation of driver fitness to dispatch.

alter table truck_owners add column is_default boolean not null default false;
update truck_owners set is_default = true where name = 'Koufu';

alter table trucks add column registration_expiry date;
alter table trucks add column insurance_expiry date;

alter table employees add column license_no text;
alter table employees add column license_expiry date;

create table truck_maintenance_assignments (
  id          uuid primary key default gen_random_uuid(),
  truck_id    uuid not null references trucks(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (truck_id, employee_id)
);

create index idx_truck_maintenance_truck on truck_maintenance_assignments(truck_id);
create index idx_truck_maintenance_employee on truck_maintenance_assignments(employee_id);

create table driver_readiness_checks (
  id                       uuid primary key default gen_random_uuid(),
  driver_id                uuid not null references employees(id),
  check_date               date not null default current_date,
  license_no_snapshot      text,
  license_expiry_snapshot  date,
  medical_check            text not null check (medical_check in ('pass', 'fail')),
  training                 text not null check (training in ('pass', 'fail')),
  ppe                      text not null check (ppe in ('pass', 'fail')),
  fatigue_check            text not null check (fatigue_check in ('pass', 'fail')),
  alcohol_check            text not null check (alcohol_check in ('pass', 'fail')),
  overall_result           text not null default 'ok' check (overall_result in ('ok', 'issues_found')),
  note                     text,
  checked_by               uuid references employees(id),
  created_at               timestamptz not null default now()
);

create index idx_driver_readiness_driver on driver_readiness_checks(driver_id);
create index idx_driver_readiness_date on driver_readiness_checks(check_date);

alter table truck_maintenance_assignments disable row level security;
alter table driver_readiness_checks disable row level security;

grant select, insert, update, delete on truck_maintenance_assignments to anon, authenticated;
grant select, insert, update, delete on driver_readiness_checks to anon, authenticated;

-- New back-office module needs its own function_code.
alter table permission_group_functions drop constraint permission_group_functions_function_code_check;
alter table permission_group_functions add constraint permission_group_functions_function_code_check
  check (function_code in (
    'employees', 'permissions', 'truck_types', 'trucks',
    'dispatches', 'inspections', 'inspection_settings',
    'pack_boxes', 'load_calculator', 'truck_owners', 'improvement_progress',
    'driver_readiness'
  ));

insert into permission_group_functions (group_id, function_code, access_level)
select pg.id, 'driver_readiness', 'edit'
from permission_groups pg
where pg.name = 'Full Access'
  and not exists (
    select 1 from permission_group_functions pgf
    where pgf.group_id = pg.id and pgf.function_code = 'driver_readiness'
  );

notify pgrst, 'reload schema';
