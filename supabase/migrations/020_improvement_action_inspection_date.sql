-- Store the originating inspection's date directly on improvement_actions
-- instead of joining through inspection_results -> inspections on every
-- page load. Snapshot-style, same reasoning as inspection_results'
-- label_snapshot: the date a defect was found shouldn't change later.

alter table improvement_actions add column inspection_date date;

notify pgrst, 'reload schema';
