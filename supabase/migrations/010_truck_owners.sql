-- Truck ownership: whether a truck is company-owned (Koufu) or belongs to
-- a contracted trucking company. A lookup table (like truck_types) rather
-- than a free-text field, so the list of owners stays consistent and can
-- be managed from its own back-office screen.

create table truck_owners (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

alter table trucks add column owner_id uuid references truck_owners(id);

alter table truck_owners disable row level security;
grant select, insert, update, delete on truck_owners to anon, authenticated;

-- Seed default owner and backfill every existing truck to it.
insert into truck_owners (name) values ('Koufu');
update trucks set owner_id = (select id from truck_owners where name = 'Koufu') where owner_id is null;

-- New back-office module needs its own function_code.
alter table permission_group_functions drop constraint permission_group_functions_function_code_check;
alter table permission_group_functions add constraint permission_group_functions_function_code_check
  check (function_code in (
    'employees', 'permissions', 'truck_types', 'trucks',
    'dispatches', 'inspections', 'inspection_settings',
    'pack_boxes', 'load_calculator', 'truck_owners'
  ));

insert into permission_group_functions (group_id, function_code, access_level)
select pg.id, 'truck_owners', 'edit'
from permission_groups pg
where pg.name = 'Full Access'
  and not exists (
    select 1 from permission_group_functions pgf
    where pgf.group_id = pg.id and pgf.function_code = 'truck_owners'
  );

notify pgrst, 'reload schema';
