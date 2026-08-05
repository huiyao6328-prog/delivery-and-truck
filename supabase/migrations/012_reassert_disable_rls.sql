alter table truck_owners disable row level security;

notify pgrst, 'reload schema';
