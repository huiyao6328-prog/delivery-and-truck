-- Delivery & Truck — initial schema.
-- Conventions follow the sister kf-erp project: snake_case, uuid primary
-- keys, RLS disabled with select/insert/update/delete granted directly to
-- anon + authenticated (the app enforces access in the Next.js layer via
-- permission_groups, not in Postgres).

-- ── Departments & Employees ────────────────────────────────────────────

create table departments (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

create table permission_groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  created_at  timestamptz not null default now()
);

-- One row per (group, module). access_level controls what that module's
-- pages render for members of the group: 'none' hides the module entirely,
-- 'read' shows data with editing controls hidden, 'edit' is full CRUD.
create table permission_group_functions (
  group_id      uuid not null references permission_groups(id) on delete cascade,
  function_code text not null check (function_code in (
    'employees', 'permissions', 'truck_types', 'trucks',
    'dispatches', 'inspections', 'inspection_settings'
  )),
  access_level  text not null default 'none' check (access_level in ('none', 'read', 'edit')),
  primary key (group_id, function_code)
);

create table employees (
  id             uuid primary key default gen_random_uuid(),
  code           text unique not null,
  full_name      text not null,
  department_id  uuid references departments(id),
  phone          text,
  is_driver      boolean not null default false,
  is_active      boolean not null default true,
  group_id       uuid references permission_groups(id),
  username       text unique,
  password_hash  text,
  last_login_at  timestamptz,
  created_at     timestamptz not null default now()
);

create index idx_employees_department on employees(department_id);
create index idx_employees_group on employees(group_id);

-- ── Trucks ──────────────────────────────────────────────────────────────

create table truck_types (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  max_load_kg  numeric,
  description  text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);

create table trucks (
  id             uuid primary key default gen_random_uuid(),
  plate_no       text unique not null,
  truck_type_id  uuid references truck_types(id),
  length_cm      numeric,
  width_cm       numeric,
  height_cm      numeric,
  max_load_kg    numeric,
  is_active      boolean not null default true,
  note           text,
  created_at     timestamptz not null default now()
);

create index idx_trucks_type on trucks(truck_type_id);

create table dispatches (
  id              uuid primary key default gen_random_uuid(),
  truck_id        uuid references trucks(id),
  driver_id       uuid references employees(id),
  dispatch_date   date not null,
  status          text not null default 'pending'
                  check (status in ('pending', 'in_progress', 'completed', 'cancelled')),
  destination     text,
  purpose         text,
  start_mileage_km numeric,
  end_mileage_km   numeric,
  departure_time  timestamptz,
  return_time     timestamptz,
  note            text,
  created_by      uuid references employees(id),
  created_at      timestamptz not null default now()
);

create index idx_dispatches_truck on dispatches(truck_id);
create index idx_dispatches_driver on dispatches(driver_id);
create index idx_dispatches_date on dispatches(dispatch_date);

-- ── Daily inspection checklist ─────────────────────────────────────────

-- Categories and items are admin-configurable templates ("inspection
-- settings" in the back office) — driver submissions snapshot the label
-- text at submission time via inspection_results.label_snapshot, so
-- editing a template later never rewrites historical records.
create table inspection_categories (
  id          uuid primary key default gen_random_uuid(),
  sort_order  int not null default 0,
  name        text not null,
  description text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table inspection_items (
  id           uuid primary key default gen_random_uuid(),
  category_id  uuid not null references inspection_categories(id) on delete cascade,
  sort_order   int not null default 0,
  label        text not null,
  hint         text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);

create index idx_inspection_items_category on inspection_items(category_id);

create table inspections (
  id             uuid primary key default gen_random_uuid(),
  truck_id       uuid not null references trucks(id),
  driver_id      uuid not null references employees(id),
  dispatch_id    uuid references dispatches(id),
  inspection_date date not null default current_date,
  odometer_km    numeric,
  overall_result text not null default 'ok' check (overall_result in ('ok', 'issues_found')),
  submitted_at   timestamptz,
  created_at     timestamptz not null default now()
);

create index idx_inspections_truck on inspections(truck_id);
create index idx_inspections_driver on inspections(driver_id);
create index idx_inspections_date on inspections(inspection_date);

create table inspection_results (
  id              uuid primary key default gen_random_uuid(),
  inspection_id   uuid not null references inspections(id) on delete cascade,
  item_id         uuid references inspection_items(id),
  label_snapshot  text not null,
  category_snapshot text not null,
  status          text not null check (status in ('ok', 'issue', 'na')),
  note            text,
  photo_url       text,
  created_at      timestamptz not null default now()
);

create index idx_inspection_results_inspection on inspection_results(inspection_id);

alter table departments disable row level security;
alter table permission_groups disable row level security;
alter table permission_group_functions disable row level security;
alter table employees disable row level security;
alter table truck_types disable row level security;
alter table trucks disable row level security;
alter table dispatches disable row level security;
alter table inspection_categories disable row level security;
alter table inspection_items disable row level security;
alter table inspections disable row level security;
alter table inspection_results disable row level security;

grant select, insert, update, delete on
  departments,
  permission_groups,
  permission_group_functions,
  employees,
  truck_types,
  trucks,
  dispatches,
  inspection_categories,
  inspection_items,
  inspections,
  inspection_results
to anon, authenticated;

-- ── Seed: bootstrap permission group + admin login ─────────────────────
-- Default login is username "admin" / password "truck2026" — change the
-- password (or the username) from the Employees screen after first login.

insert into permission_groups (name, description)
values ('Full Access', 'Edit access to every back-office module. Assign sparingly.');

insert into permission_group_functions (group_id, function_code, access_level)
select pg.id, fn, 'edit'
from permission_groups pg
cross join (values
  ('employees'), ('permissions'), ('truck_types'), ('trucks'),
  ('dispatches'), ('inspections'), ('inspection_settings')
) as f(fn)
where pg.name = 'Full Access';

insert into departments (name) values ('Operations');

insert into employees (code, full_name, department_id, is_driver, group_id, username, password_hash)
select
  '001', 'Admin', d.id, false, pg.id, 'admin',
  '$2b$10$rDBV5xUbh/vV7HguRNmhEOGuOGK2beixRwPAFFSYybBkDKJgiXn.y'
from departments d, permission_groups pg
where d.name = 'Operations' and pg.name = 'Full Access';

-- ── Seed: default inspection checklist (outside-in, bottom-to-top order) ─

insert into inspection_categories (sort_order, name, description) values
  (1, 'Fluids & Fluid Levels', 'Open the hood — check with engine off unless noted'),
  (2, 'Tires & Chassis', 'Walk around — the only part of the truck touching the road'),
  (3, 'Exterior Lights & Body', 'Lights, mirrors, cargo box and tie-downs'),
  (4, 'Cab Gauges & Brakes', 'Start the engine, then test at low speed'),
  (5, 'Safety Equipment & Cargo Tools', 'Required equipment and load-securing gear'),
  (6, 'Vehicle Exterior', 'Final look — condition on record before departure');

insert into inspection_items (category_id, sort_order, label, hint)
select c.id, x.sort_order, x.label, x.hint
from inspection_categories c
join (values
  ('Fluids & Fluid Levels', 1, 'Engine oil', 'Dipstick between Min–Max; not black or sludgy'),
  ('Fluids & Fluid Levels', 2, 'Brake fluid', 'Reservoir at level line; low may mean worn pads or a leak'),
  ('Fluids & Fluid Levels', 3, 'Power steering fluid', 'Reservoir at level line'),
  ('Fluids & Fluid Levels', 4, 'Transmission fluid', 'Check per manufacturer method — some require engine running'),
  ('Fluids & Fluid Levels', 5, 'Fuel (diesel/petrol)', 'Enough in the tank for today''s planned route'),
  ('Fluids & Fluid Levels', 6, 'Engine coolant', 'Reservoir only — never open a hot radiator cap'),
  ('Fluids & Fluid Levels', 7, 'Windshield washer fluid', 'Top up if low'),
  ('Fluids & Fluid Levels', 8, 'Battery water', 'Non-sealed batteries only — cells covered'),

  ('Tires & Chassis', 1, 'Tire pressure', 'All tires, matches load rating — gauge or visual'),
  ('Tires & Chassis', 2, 'Tread depth', '>= 1.6 mm; no cuts, embedded stones, or uneven wear'),
  ('Tires & Chassis', 3, 'Wheel nuts & rims', 'No looseness, rust streaks, or missing nuts'),
  ('Tires & Chassis', 4, 'Undercarriage', 'No fresh oil or coolant stains on the ground'),

  ('Exterior Lights & Body', 1, 'Headlights', 'Low beam and high beam both work'),
  ('Exterior Lights & Body', 2, 'Turn signals', 'All four corners'),
  ('Exterior Lights & Body', 3, 'Brake lights', null),
  ('Exterior Lights & Body', 4, 'Reverse light', null),
  ('Exterior Lights & Body', 5, 'Hazard lights', 'Four-way flashers'),
  ('Exterior Lights & Body', 6, 'Marker / clearance lights', 'Roof line and side markers'),
  ('Exterior Lights & Body', 7, 'Mirrors', 'Clean, correctly angled, not cracked or loose'),
  ('Exterior Lights & Body', 8, 'Cargo doors / tailgate', 'Latches close securely'),
  ('Exterior Lights & Body', 9, 'Tarp & rope', 'Tied down, no tears'),
  ('Exterior Lights & Body', 10, 'Tail lift', 'Moves smoothly, no hydraulic fluid leaks'),

  ('Cab Gauges & Brakes', 1, 'Warning lights clear', 'Check Engine / ABS / air pressure off after start'),
  ('Cab Gauges & Brakes', 2, 'Air brakes', 'Gauge builds pressure normally, no hissing (heavy trucks)'),
  ('Cab Gauges & Brakes', 3, 'Hydraulic brakes', 'Pedal feels firm, not spongy (light trucks)'),
  ('Cab Gauges & Brakes', 4, 'Parking brake', 'Holds the vehicle securely on a slope'),
  ('Cab Gauges & Brakes', 5, 'Horn', 'Sounds clearly'),
  ('Cab Gauges & Brakes', 6, 'Wipers & washer', 'Spray reaches glass, blades clear without streaking'),

  ('Safety Equipment & Cargo Tools', 1, 'Fire extinguisher', 'Present, in-date, pressure gauge in the green'),
  ('Safety Equipment & Cargo Tools', 2, 'Warning triangle', 'Present'),
  ('Safety Equipment & Cargo Tools', 3, 'Reflective vest', 'Present'),
  ('Safety Equipment & Cargo Tools', 4, 'Tie-down straps', 'No fraying, enough for today''s load'),
  ('Safety Equipment & Cargo Tools', 5, 'Chains', 'Present, no broken links'),
  ('Safety Equipment & Cargo Tools', 6, 'Wheel chocks', 'Present'),
  ('Safety Equipment & Cargo Tools', 7, 'Corner protectors', 'Present'),
  ('Safety Equipment & Cargo Tools', 8, 'Tachograph / recorder', 'Running, enough memory or card space'),

  ('Vehicle Exterior', 1, 'Body condition', 'No new dents, scratches, or collision damage'),
  ('Vehicle Exterior', 2, 'Accessories complete', 'Mirrors, mud flaps, plates, decals all present')
) as x(category_name, sort_order, label, hint) on x.category_name = c.name;

notify pgrst, 'reload schema';
