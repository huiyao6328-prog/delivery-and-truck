-- Load Calculator: how many cartons of a product fit in a truck, or which
-- truck fits a mixed load. Ported from kf-erp's src/app/(dashboard)/vehicle/calculator
-- (a real, in-use feature there) — same math, adapted to this app's own
-- trucks table instead of zz_car_master, and centimetres throughout instead
-- of kf-erp's millimetres (trucks.length_cm/width_cm/height_cm are already cm).

create table pack_boxes (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  length_cm         numeric,
  width_cm          numeric,
  height_cm         numeric,
  weight_kg         numeric,
  gross_weight_kg   numeric,
  packing_qty       numeric,
  packing_qty_unit  text,
  note              text,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now()
);

-- History of Load Calculator runs (both "single carton capacity" and "load
-- planning" tabs). One row per saved calculation; the per-carton breakdown
-- itself is jsonb rather than a child table since it's write-once
-- historical data, never queried/filtered by its internal fields.
create table load_calculations (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  created_by      uuid references employees(id),
  mode            text not null check (mode in ('single', 'plan')),
  truck_plate_no  text,
  total_price     numeric,
  items           jsonb not null default '[]'::jsonb
);

alter table pack_boxes disable row level security;
alter table load_calculations disable row level security;

grant select, insert, update, delete on pack_boxes, load_calculations to anon, authenticated;

-- New back-office modules need their own function_codes.
alter table permission_group_functions drop constraint permission_group_functions_function_code_check;
alter table permission_group_functions add constraint permission_group_functions_function_code_check
  check (function_code in (
    'employees', 'permissions', 'truck_types', 'trucks',
    'dispatches', 'inspections', 'inspection_settings',
    'pack_boxes', 'load_calculator'
  ));

insert into permission_group_functions (group_id, function_code, access_level)
select pg.id, fn, 'edit'
from permission_groups pg
cross join (values ('pack_boxes'), ('load_calculator')) as f(fn)
where pg.name = 'Full Access'
  and not exists (
    select 1 from permission_group_functions pgf
    where pgf.group_id = pg.id and pgf.function_code = fn
  );

notify pgrst, 'reload schema';
