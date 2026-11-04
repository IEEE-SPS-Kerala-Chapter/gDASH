-- Stage 1 judging criteria from "gIGNITE 2026 Evaluation Parameters
-- Weightage.docx" (2026-11-05).
--
-- Technical Implementation is now "AI Approach & Technology Usage", and
-- Completion & Functionality is replaced by "Clarity of the Solution Deck"
-- (Stage 1 judges only see the deck, so there is no prototype to judge).
-- The columns are renamed to match. No scores existed yet, so no data is
-- carried over between meanings.
--
-- Weights live in lib/scoring.ts, not here. A rename keeps the table's
-- grants, RLS policies and the 1-10 check constraints (Postgres rewrites
-- the column reference inside each check); only the auto-generated
-- constraint names are renamed below so they match.

alter table judge_scores rename column technical_implementation to ai_approach_technology;
alter table judge_scores rename column completion_functionality to deck_clarity;

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'judge_scores_technical_implementation_check') then
    alter table judge_scores rename constraint judge_scores_technical_implementation_check to judge_scores_ai_approach_technology_check;
  end if;
  if exists (select 1 from pg_constraint where conname = 'judge_scores_completion_functionality_check') then
    alter table judge_scores rename constraint judge_scores_completion_functionality_check to judge_scores_deck_clarity_check;
  end if;
end $$;
