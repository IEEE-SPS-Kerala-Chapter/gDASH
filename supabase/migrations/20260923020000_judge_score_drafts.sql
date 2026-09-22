-- Client requirement: "Reviewers should be able to save their evaluation as
-- draft and continue later, if required."
--
-- judge_scores' five criterion columns were all NOT NULL, so a judge
-- literally could not persist a partial evaluation -- the client worked
-- around this by silently defaulting every criterion to 5 the moment the
-- form loaded, meaning "Save score" always sent a complete row whether the
-- judge had actually evaluated all five or just opened the page. That
-- wasn't a draft, it was a disguised forced-complete score.
--
-- This drops the NOT NULL constraints (the existing 1-10 range checks
-- already pass a NULL through untouched -- a CHECK only fails on FALSE, not
-- NULL) and adds `status`, so a judge can now genuinely leave criteria
-- blank, save, and come back -- with an explicit, separate "Submit score"
-- action (still requiring all five) for when they're actually done.
-- Existing rows all predate this feature and are already complete by the
-- old constraint, so they backfill straight to 'submitted'.

alter table judge_scores alter column problem_relevance drop not null;
alter table judge_scores alter column technical_implementation drop not null;
alter table judge_scores alter column innovation_creativity drop not null;
alter table judge_scores alter column feasibility_scalability drop not null;
alter table judge_scores alter column completion_functionality drop not null;

alter table judge_scores add column if not exists status text not null default 'draft'
  check (status in ('draft', 'submitted'));

update judge_scores set status = 'submitted' where status = 'draft';
