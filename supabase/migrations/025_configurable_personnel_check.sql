-- Generalizes Driver Readiness into a configurable "Personnel Check":
-- - Covers any active employee (driver or helper), not just is_driver=true.
-- - Checklist items are now admin-configurable (personnel_check_items),
--   same snapshot pattern as inspection_items/inspection_results, instead
--   of 5 hardcoded boolean columns.
-- No existing driver_readiness_checks rows exist yet (confirmed before
-- writing this), so it's safe to drop the old fixed columns outright
-- rather than carry them forward unused.

create table personnel_check_items (
  id         uuid primary key default gen_random_uuid(),
  sort_order int not null default 0,
  label      text not null,
  hint       text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

alter table driver_readiness_checks drop column medical_check;
alter table driver_readiness_checks drop column training;
alter table driver_readiness_checks drop column ppe;
alter table driver_readiness_checks drop column fatigue_check;
alter table driver_readiness_checks drop column alcohol_check;

create table driver_readiness_check_results (
  id             uuid primary key default gen_random_uuid(),
  check_id       uuid not null references driver_readiness_checks(id) on delete cascade,
  item_id        uuid references personnel_check_items(id),
  label_snapshot text not null,
  status         text not null check (status in ('pass', 'fail')),
  note           text,
  created_at     timestamptz not null default now()
);

create index idx_driver_readiness_results_check on driver_readiness_check_results(check_id);

alter table personnel_check_items disable row level security;
alter table driver_readiness_check_results disable row level security;
grant select, insert, update, delete on personnel_check_items to anon, authenticated;
grant select, insert, update, delete on driver_readiness_check_results to anon, authenticated;

insert into personnel_check_items (sort_order, label, hint) values
  (1, 'Alcohol Test', 'Breathalyzer clear / no signs of alcohol'),
  (2, 'Mental / Alertness State', 'Alert, focused, fit for duty'),
  (3, 'Physical / Medical Condition', 'No illness or physical condition affecting driving or work'),
  (4, 'Fatigue Level', 'Adequately rested, not showing signs of fatigue'),
  (5, 'Medication Check', 'Not taking medication that impairs driving or work ability'),
  (6, 'PPE Worn', 'Wearing required personal protective equipment'),
  (7, 'License / Certification Valid', 'License and required training/certification current (drivers)');

notify pgrst, 'reload schema';
