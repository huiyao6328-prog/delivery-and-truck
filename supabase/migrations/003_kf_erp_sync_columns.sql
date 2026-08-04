-- Support for one-click "Sync from kf-erp" on the Employees screen.
-- kf-erp's erp_departments.unit_id and erp_employees.code are stable
-- identifiers we match against on repeat syncs so re-running never creates
-- duplicate departments/employees.

alter table departments add column kf_erp_unit_id text unique;
alter table employees add column kf_erp_synced_at timestamptz;

notify pgrst, 'reload schema';
