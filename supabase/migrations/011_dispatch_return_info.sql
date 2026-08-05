-- Driver self-service dispatch out/return workflow. departure_time /
-- start_mileage_km already existed for "out"; this adds what's needed for
-- "return": fuel level, whether an issue was found, and who actually
-- pressed each button (may differ from the assigned driver_id if someone
-- else records it on their behalf).

alter table dispatches add column fuel_level_on_return text
  check (fuel_level_on_return in ('full', 'three_quarter', 'half', 'quarter', 'empty'));
alter table dispatches add column has_issue boolean not null default false;
alter table dispatches add column issue_note text;
alter table dispatches add column departed_by uuid references employees(id);
alter table dispatches add column returned_by uuid references employees(id);

notify pgrst, 'reload schema';
