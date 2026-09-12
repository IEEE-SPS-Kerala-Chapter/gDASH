/**
 * Stage 1 (virtual shortlisting) evaluation parameters and weights, per
 * gIGNITE_Hackathon_Rules.docx §Evaluation Framework.
 *
 * Only these five parameters carry weight at Stage 1 — User Experience &
 * Design, Team Learning & Growth, and Presentation & Communication are
 * 0%-weighted here and only come into play at the in-person Grand Finale
 * (Stage 2), which this platform doesn't cover yet.
 *
 * The rules doc explicitly notes weightages are "proposed defaults...
 * subject to joint sign-off by Gadgeon and IEEE SPS Kerala Chapter" — kept
 * here in code (not the DB) so a change to the numbers doesn't need a
 * migration, just a deploy.
 */
export const STAGE1_CRITERIA = [
  {
    key: "problem_relevance",
    label: "Problem Relevance",
    weight: 20,
    description: "How well the solution addresses a genuine, well-articulated problem within the chosen AI theme.",
  },
  {
    key: "technical_implementation",
    label: "Technical Implementation",
    weight: 25,
    description: "Depth and difficulty of the AI/ML techniques used; correctness and robustness of the implementation.",
  },
  {
    key: "innovation_creativity",
    label: "Innovation & Creativity",
    weight: 25,
    description: "Originality of the approach, novel use of technology, or a creative angle on a known problem.",
  },
  {
    key: "feasibility_scalability",
    label: "Feasibility & Scalability",
    weight: 15,
    description: "Practicality of real-world deployment and potential to scale beyond the prototype.",
  },
  {
    key: "completion_functionality",
    label: "Completion & Functionality",
    weight: 15,
    description: "Whether the prototype works as demonstrated and how much of the intended scope was achieved.",
  },
] as const;

export type Stage1CriterionKey = (typeof STAGE1_CRITERIA)[number]["key"];

export type Stage1Scores = Record<Stage1CriterionKey, number>;

const TOTAL_WEIGHT = STAGE1_CRITERIA.reduce((sum, c) => sum + c.weight, 0); // 100

/** Weighted average across the Stage 1 parameters, on a 1–10 scale. */
export function computeWeightedScore(scores: Stage1Scores): number {
  const weighted = STAGE1_CRITERIA.reduce((sum, c) => sum + scores[c.key] * c.weight, 0);
  return weighted / TOTAL_WEIGHT;
}

export function isValidStage1Score(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 10;
}
