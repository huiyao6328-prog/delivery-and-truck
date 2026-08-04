-- Support for "Sync from kf-erp" on the Trucks screen. kf-erp's
-- zz_car_master._id ("aid" on the app side) is the stable identifier we
-- match against on repeat syncs so re-running never creates duplicate trucks.

alter table trucks add column kf_erp_aid integer unique;
alter table trucks add column kf_erp_synced_at timestamptz;

notify pgrst, 'reload schema';
