-- Default severity per checklist item template (e.g. "Fire extinguisher" ->
-- critical), settable from Inspection Settings — either typed by hand or
-- suggested by the Gemini classify-severity API route and then adjusted.
-- When a driver's daily inspection flags this item as an issue, the
-- auto-created improvement_actions row now seeds its severity from this
-- default instead of starting blank (still editable per-case in
-- Improvement Progress).

alter table inspection_items add column default_severity text
  check (default_severity in ('critical', 'moderate', 'minor'));

notify pgrst, 'reload schema';
