-- Fix-up: 001's RLS-disable + grant + seed statements never took effect
-- (all target tables still had RLS enabled, so the seed inserts were
-- silently blocked). Safe to run more than once — the disable/grant
-- statements are idempotent, and the seed inserts only add rows because
-- the tables are currently empty.

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
select 'Full Access', 'Edit access to every back-office module. Assign sparingly.'
where not exists (select 1 from permission_groups where name = 'Full Access');

insert into permission_group_functions (group_id, function_code, access_level)
select pg.id, fn, 'edit'
from permission_groups pg
cross join (values
  ('employees'), ('permissions'), ('truck_types'), ('trucks'),
  ('dispatches'), ('inspections'), ('inspection_settings')
) as f(fn)
where pg.name = 'Full Access'
  and not exists (
    select 1 from permission_group_functions pgf
    where pgf.group_id = pg.id and pgf.function_code = fn
  );

insert into departments (name)
select 'Operations'
where not exists (select 1 from departments where name = 'Operations');

insert into employees (code, full_name, department_id, is_driver, group_id, username, password_hash)
select
  '001', 'Admin', d.id, false, pg.id, 'admin',
  '$2b$10$rDBV5xUbh/vV7HguRNmhEOGuOGK2beixRwPAFFSYybBkDKJgiXn.y'
from departments d, permission_groups pg
where d.name = 'Operations' and pg.name = 'Full Access'
  and not exists (select 1 from employees where code = '001');

-- ── Seed: default inspection checklist (outside-in, bottom-to-top order) ─

insert into inspection_categories (sort_order, name, description)
select * from (values
  (1, 'Fluids & Fluid Levels', 'Open the hood — check with engine off unless noted'),
  (2, 'Tires & Chassis', 'Walk around — the only part of the truck touching the road'),
  (3, 'Exterior Lights & Body', 'Lights, mirrors, cargo box and tie-downs'),
  (4, 'Cab Gauges & Brakes', 'Start the engine, then test at low speed'),
  (5, 'Safety Equipment & Cargo Tools', 'Required equipment and load-securing gear'),
  (6, 'Vehicle Exterior', 'Final look — condition on record before departure')
) as x(sort_order, name, description)
where not exists (select 1 from inspection_categories where name = x.name);

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
) as x(category_name, sort_order, label, hint) on x.category_name = c.name
where not exists (
  select 1 from inspection_items i where i.category_id = c.id and i.label = x.label
);

notify pgrst, 'reload schema';
