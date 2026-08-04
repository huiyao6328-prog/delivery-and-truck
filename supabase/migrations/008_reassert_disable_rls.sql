-- Same recurring gotcha: new tables on this Supabase project auto-enable
-- RLS with zero policies even when the same migration already disabled it.
-- Idempotent -- safe to run even where it already took effect.

alter table truck_inspection_item_exclusions disable row level security;

notify pgrst, 'reload schema';
