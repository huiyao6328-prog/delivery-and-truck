-- Personnel Check items can now be answered as a checkbox (pass/fail
-- toggle) or a text box (free-text answer — empty counts as fail, same
-- "default to fail until confirmed" logic as an unchecked checkbox).

alter table personnel_check_items add column answer_type text not null default 'checkbox'
  check (answer_type in ('checkbox', 'text'));

notify pgrst, 'reload schema';
