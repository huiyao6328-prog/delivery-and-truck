-- Improvement Progress "Repair" field: split into who's doing the repair
-- (the truck's own owner company, or an external repair shop) plus free
-- text for the name/detail, instead of one plain text box.

alter table improvement_actions add column repair_vendor_type text
  check (repair_vendor_type in ('truck_owner', 'repair_shop'));

notify pgrst, 'reload schema';
