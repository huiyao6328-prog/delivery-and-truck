-- Same gotcha we hit twice already today: some Supabase projects auto-enable
-- RLS with zero policies on newly created tables, silently hiding all rows
-- from anon/authenticated even though an earlier `disable row level
-- security` in the same migration should have covered it. Re-asserting it
-- as its own standalone statement fixes it. Idempotent -- safe to run even
-- on tables where it already took effect.

alter table pack_boxes disable row level security;
alter table load_calculations disable row level security;

notify pgrst, 'reload schema';
