-- On-Time Delivery KPI: adds the "target" side that was missing — until
-- now dispatches only recorded actual departure_time/return_time, with
-- nothing to compare against. delay_reason is a fixed set of categories
-- (not free text) so the on-time calculation can exclude the
-- uncontrollable ones (weather, customer changed the time, road closure,
-- upstream production delay) per the KPI framework's own recommendation.

alter table dispatches add column scheduled_departure_time timestamptz;
alter table dispatches add column scheduled_arrival_time timestamptz;
alter table dispatches add column delay_reason text
  check (delay_reason in ('customer_change', 'weather', 'road_closure', 'production_delay', 'traffic', 'other'));

notify pgrst, 'reload schema';
