-- Improvement Progress: tracks the fix for each defect found during a daily
-- inspection, from severity/assignment through repair to sign-off. One row
-- per inspection_results item with status = 'issue'.
--
-- status flow: pending -> in_progress -> pending_review -> closed
-- (a failed verification sends it back to in_progress rather than closing it)

create table improvement_actions (
  id                    uuid primary key default gen_random_uuid(),
  inspection_result_id  uuid not null references inspection_results(id) on delete cascade,
  truck_id              uuid not null references trucks(id),
  status                text not null default 'pending' check (status in ('pending', 'in_progress', 'pending_review', 'closed')),

  -- Stage 2: assessment, assignment & deadline (fleet manager / admin)
  severity              text check (severity in ('critical', 'moderate', 'minor')),
  assigned_to           uuid references employees(id),
  repair_vendor         text,
  deadline              date,
  approving_manager_id  uuid references employees(id),
  dispatch_instruction  text,

  -- Stage 3: remediation & progress (technician)
  dropoff_at            timestamptz,
  work_order_no         text,
  corrective_action     text,
  evidence_photo_url    text,

  -- Stage 4: verification & sign-off (supervisor)
  verification_result   text check (verification_result in ('pass', 'fail')),
  verified_by           text,
  verified_at           date,
  verification_notes    text,

  created_at            timestamptz not null default now()
);

create index idx_improvement_actions_truck on improvement_actions(truck_id);
create index idx_improvement_actions_status on improvement_actions(status);
create unique index idx_improvement_actions_result on improvement_actions(inspection_result_id);

alter table improvement_actions disable row level security;
grant select, insert, update, delete on improvement_actions to anon, authenticated;

-- New back-office module needs its own function_code.
alter table permission_group_functions drop constraint permission_group_functions_function_code_check;
alter table permission_group_functions add constraint permission_group_functions_function_code_check
  check (function_code in (
    'employees', 'permissions', 'truck_types', 'trucks',
    'dispatches', 'inspections', 'inspection_settings',
    'pack_boxes', 'load_calculator', 'truck_owners', 'improvement_progress'
  ));

insert into permission_group_functions (group_id, function_code, access_level)
select pg.id, 'improvement_progress', 'edit'
from permission_groups pg
where pg.name = 'Full Access'
  and not exists (
    select 1 from permission_group_functions pgf
    where pgf.group_id = pg.id and pgf.function_code = 'improvement_progress'
  );

-- Storage bucket for inspection issue photos and repair evidence photos.
-- Same "wide open to anon" model as every other table in this app — see
-- lib/supabase.ts, which uses the public anon key from the browser.
insert into storage.buckets (id, name, public)
values ('inspection-photos', 'inspection-photos', true)
on conflict (id) do nothing;

drop policy if exists "inspection-photos public read" on storage.objects;
create policy "inspection-photos public read" on storage.objects
  for select using (bucket_id = 'inspection-photos');

drop policy if exists "inspection-photos anon write" on storage.objects;
create policy "inspection-photos anon write" on storage.objects
  for insert with check (bucket_id = 'inspection-photos');

notify pgrst, 'reload schema';
