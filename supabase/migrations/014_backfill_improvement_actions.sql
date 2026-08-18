-- Backfill improvement_actions for issues that were reported before this
-- feature existed, so Improvement Progress shows the full backlog, not
-- just issues found from today onward.

insert into improvement_actions (inspection_result_id, truck_id, status)
select ir.id, i.truck_id, 'pending'
from inspection_results ir
join inspections i on i.id = ir.inspection_id
where ir.status = 'issue'
  and not exists (
    select 1 from improvement_actions ia where ia.inspection_result_id = ir.id
  );
