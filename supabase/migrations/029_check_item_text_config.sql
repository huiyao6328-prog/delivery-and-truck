-- Extra configuration for text-box answer items: a configurable
-- placeholder shown to whoever fills in the check, and a value type
-- (plain text / number / phone) that gets validated before the check can
-- be saved. Unlike checkbox items (which silently count an unconfirmed
-- box as "fail"), a text item with a value type is a hard requirement —
-- the form blocks saving until it's filled in correctly.

alter table personnel_check_items add column text_placeholder text;
alter table personnel_check_items add column text_value_type text
  check (text_value_type in ('text', 'number', 'phone'));

update personnel_check_items set text_value_type = 'text' where answer_type = 'text';

notify pgrst, 'reload schema';
