-- Support for "Sync from kf-erp" on the Carton Types screen. kf-erp's
-- zz_pack_box_size_master._id is the stable identifier we match against on
-- repeat syncs so re-running never creates duplicate carton types.

alter table pack_boxes add column kf_erp_box_id integer unique;
alter table pack_boxes add column kf_erp_synced_at timestamptz;

notify pgrst, 'reload schema';
