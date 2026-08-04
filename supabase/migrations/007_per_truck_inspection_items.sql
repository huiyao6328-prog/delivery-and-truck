-- Per-truck inspection checklist customization. The 6 categories stay a
-- shared/global structure (categories are the "main" thing, per the
-- request) but items can now be tailored per truck:
--   - inspection_items.truck_id = null  -> global default item, shown for
--     every truck unless explicitly excluded for that truck.
--   - inspection_items.truck_id = <id>  -> extra item that only exists for
--     that one truck (added from the truck's own checklist page).
-- truck_inspection_item_exclusions records which global items a specific
-- truck has turned off. updated_by/updated_at on inspection_items and
-- excluded_by/excluded_at on the exclusions table are the "who modified
-- this" audit trail the request asked for.

alter table inspection_items add column truck_id uuid references trucks(id) on delete cascade;
alter table inspection_items add column updated_by uuid references employees(id);
alter table inspection_items add column updated_at timestamptz;

create table truck_inspection_item_exclusions (
  truck_id     uuid not null references trucks(id) on delete cascade,
  item_id      uuid not null references inspection_items(id) on delete cascade,
  excluded_by  uuid references employees(id),
  excluded_at  timestamptz not null default now(),
  primary key (truck_id, item_id)
);

create index idx_inspection_items_truck on inspection_items(truck_id);

alter table truck_inspection_item_exclusions disable row level security;

grant select, insert, update, delete on truck_inspection_item_exclusions to anon, authenticated;

notify pgrst, 'reload schema';
