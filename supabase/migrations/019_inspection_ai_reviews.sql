-- Log of AI-assisted inspection checklist reviews, run manually from
-- Inspection Settings or automatically once a month via Vercel Cron.
-- Each run: (1) re-classifies every active checklist item's severity with
-- Gemini and flags any that now disagree with the saved default_severity,
-- and (2) diffs each truck's effective checklist (global items minus its
-- exclusions, plus truck-specific items) against the previous run's
-- snapshot to flag additions/removals. Report-only — nothing here gets
-- auto-applied; an admin reviews the summary and adjusts settings by hand.

create table inspection_ai_reviews (
  id           uuid primary key default gen_random_uuid(),
  run_at       timestamptz not null default now(),
  triggered_by text not null check (triggered_by in ('manual', 'cron')),
  summary      text not null,
  snapshot     jsonb not null,
  created_at   timestamptz not null default now()
);

create index idx_inspection_ai_reviews_run_at on inspection_ai_reviews(run_at desc);

alter table inspection_ai_reviews disable row level security;
grant select, insert, update, delete on inspection_ai_reviews to anon, authenticated;

notify pgrst, 'reload schema';
