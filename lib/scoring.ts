/**
 * Stage 1 (virtual shortlisting) evaluation parameters and weights, per
 * client-docs/gIGNITE 2026 Evaluation Parameters Weightage.docx.
 *
 * Judges shortlist on the submitted deck alone, with no interaction with
 * participants, so deck clarity is scored and prototype completion is not.
 * The Grand Finale (Stage 2) isn't covered by this platform yet.
 *
 * Kept in code (not the DB) so a change to the numbers doesn't need a
 * migration, just a deploy. Order here is the order judges see.
 */
export const STAGE1_CRITERIA = [
  {
    key: "problem_relevance",
    label: "Problem Relevance",
    weight: 15,
    description: "How well the solution addresses a genuine, well-articulated problem within the chosen AI theme.",
  },
  {
    key: "ai_approach_technology",
    label: "AI Approach & Technology Usage",
    weight: 40,
    description:
      "Depth and difficulty of the AI techniques used; correctness and robustness of the technology used for creating the solution.",
  },
  {
    key: "deck_clarity",
    label: "Clarity of the Solution Deck",
    weight: 20,
    description: "Clarity of the deck and how well the team explained the problem, solution, and impact.",
  },
  {
    key: "innovation_creativity",
    label: "Innovation & Creativity",
    weight: 15,
    description: "Originality of the approach, novel use of technology, or a creative angle on a known problem.",
  },
  {
    key: "feasibility_scalability",
    label: "Feasibility & Scalability",
    weight: 10,
    description: "Practicality of real-world deployment within 24 hours and scalability to create the prototype.",
  },
] as const;

export type Stage1CriterionKey = (typeof STAGE1_CRITERIA)[number]["key"];

export type Stage1Scores = Record<Stage1CriterionKey, number>;

/** A criterion may genuinely be unscored while a judge is still drafting — see judge_score_drafts.sql. */
export type PartialStage1Scores = Partial<Record<Stage1CriterionKey, number>>;

/** True once every criterion has a valid 1-10 value — the gate for submitScore(), not saveScoreDraft(). */
export function isCompleteStage1Scores(scores: PartialStage1Scores): scores is Stage1Scores {
  return STAGE1_CRITERIA.every((c) => {
    const v = scores[c.key];
    return v !== undefined && v !== null && isValidStage1Score(v);
  });
}

const TOTAL_WEIGHT = STAGE1_CRITERIA.reduce((sum, c) => sum + c.weight, 0); // 100

/** Weighted average across the Stage 1 parameters, on a 1–10 scale. */
export function computeWeightedScore(scores: Stage1Scores): number {
  const weighted = STAGE1_CRITERIA.reduce((sum, c) => sum + scores[c.key] * c.weight, 0);
  return weighted / TOTAL_WEIGHT;
}

export function isValidStage1Score(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 10;
}
