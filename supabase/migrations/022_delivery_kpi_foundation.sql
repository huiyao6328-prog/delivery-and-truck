-- Foundation for the Delivery Department KPI system:
-- - dispatches.helper_id: a helper (幫手) assigned per-dispatch alongside
--   the driver, not fixed to one truck.
-- - improvement_actions.repair_cost: feeds the Cost KPI category.
-- - accident_reports: traffic accidents/incidents, deliberately separate
--   from improvement_actions (which tracks routine vehicle defects, not
--   collisions). Driver reports once at the scene (occurred_at,
--   reported_at, the "did you do X" safety checklist); everything past
--   that (severity classification, investigation, notifications,
--   verification) is admin-side, mirroring improvement_actions' later
--   stages.
-- - customer_complaints: built fresh here (kf-erp has no complaint data).
-- - fuel_transactions: imported from the Shell fuel card monthly
--   statement (Excel), not driver-entered. receipt_number is unique so
--   re-importing the same statement is a safe no-op for already-imported
--   rows.

alter table dispatches add column helper_id uuid references employees(id);
alter table improvement_actions add column repair_cost numeric;

create table accident_reports (
  id                   uuid primary key default gen_random_uuid(),
  truck_id             uuid not null references trucks(id),
  driver_id            uuid not null references employees(id),
  occurred_at          timestamptz not null,
  reported_at          timestamptz not null default now(),
  location             text,
  description          text not null,
  photo_url            text,
  stopped_safely       boolean not null default false,
  ensured_safety       boolean not null default false,
  notified_manager     boolean not null default false,
  severity_level       text check (severity_level in ('L1', 'L2', 'L3', 'L4')),
  status               text not null default 'pending' check (status in ('pending', 'in_progress', 'pending_review', 'closed')),
  assigned_to          uuid references employees(id),
  notified_insurance   boolean not null default false,
  notified_customer    boolean not null default false,
  root_cause           text,
  corrective_action    text,
  verification_result  text check (verification_result in ('pass', 'fail')),
  verified_by          text,
  verified_at          date,
  verification_notes   text,
  created_at           timestamptz not null default now()
);

create index idx_accident_reports_truck on accident_reports(truck_id);
create index idx_accident_reports_driver on accident_reports(driver_id);
create index idx_accident_reports_status on accident_reports(status);

create table customer_complaints (
  id              uuid primary key default gen_random_uuid(),
  complaint_date  date not null default current_date,
  truck_id        uuid references trucks(id),
  driver_id       uuid references employees(id),
  complaint_type  text not null check (complaint_type in ('attitude', 'late', 'shortage', 'damage', 'paperwork', 'driver', 'company', 'other')),
  description     text not null,
  status          text not null default 'open' check (status in ('open', 'resolved')),
  resolution      text,
  resolved_at     date,
  created_by      uuid references employees(id),
  created_at      timestamptz not null default now()
);

create index idx_customer_complaints_truck on customer_complaints(truck_id);
create index idx_customer_complaints_driver on customer_complaints(driver_id);
create index idx_customer_complaints_date on customer_complaints(complaint_date);

create table fuel_transactions (
  id                 uuid primary key default gen_random_uuid(),
  truck_id           uuid references trucks(id),
  plate_raw          text not null,
  transaction_date   date not null,
  transaction_time   text,
  location           text,
  receipt_number     text not null unique,
  odometer_km        numeric,
  product_code       text,
  quantity_litres    numeric not null,
  unit_price_ex_vat  numeric,
  vat_amount         numeric,
  amount_ex_vat      numeric,
  amount_inc_vat     numeric not null,
  import_batch       text,
  created_at         timestamptz not null default now()
);

create index idx_fuel_transactions_truck on fuel_transactions(truck_id);
create index idx_fuel_transactions_date on fuel_transactions(transaction_date);

alter table accident_reports disable row level security;
alter table customer_complaints disable row level security;
alter table fuel_transactions disable row level security;

grant select, insert, update, delete on accident_reports to anon, authenticated;
grant select, insert, update, delete on customer_complaints to anon, authenticated;
grant select, insert, update, delete on fuel_transactions to anon, authenticated;

alter table permission_group_functions drop constraint permission_group_functions_function_code_check;
alter table permission_group_functions add constraint permission_group_functions_function_code_check
  check (function_code in (
    'employees', 'permissions', 'truck_types', 'trucks',
    'dispatches', 'inspections', 'inspection_settings',
    'pack_boxes', 'load_calculator', 'truck_owners', 'improvement_progress',
    'driver_readiness', 'accidents', 'customer_complaints', 'fuel_costs', 'kpi_dashboard'
  ));

insert into permission_group_functions (group_id, function_code, access_level)
select pg.id, fn, 'edit'
from permission_groups pg
cross join (values ('accidents'), ('customer_complaints'), ('fuel_costs'), ('kpi_dashboard')) as f(fn)
where pg.name = 'Full Access'
  and not exists (
    select 1 from permission_group_functions pgf
    where pgf.group_id = pg.id and pgf.function_code = f.fn
  );

notify pgrst, 'reload schema';
