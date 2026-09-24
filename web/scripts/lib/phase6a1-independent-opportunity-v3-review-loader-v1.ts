/**
 * Loader for independent v3 opportunity review (gpt56sol v1).
 */
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

export const INDEPENDENT_OPPORTUNITY_V3_REVIEW_V1_PATH = resolve(
  "data/milestones/deck-synthesis/phase6a1-semantic-opportunity-v3-independent-review-gpt56sol-v1.json",
);

export const INDEPENDENT_OPPORTUNITY_V3_REVIEW_V1_SHA256 =
  "0013e1b024cb94c9d0a3d157fa4e6099b6ca1cc7e1c102dc32289e8c39008b75";

export type IndependentOpportunityV3ReviewVerdict =
  | "ACCEPT"
  | "REFINE"
  | "RETYPE_OPTIONAL"
  | "REFINE_RULE_DEPENDENCY"
  | "RETYPE_CONSTRAINT"
  | "WRONG"
  | "REMOVE_DUPLICATE"
  | "REMOVE_ACTION_RESTATEMENT";

export type NoActionableV3ReviewVerdict = "ACCEPT_NO_ACTIONABLE" | "REJECT_NO_ACTIONABLE_MISSING_CROSS_FACT";

export type IndependentOpportunityV3ReviewRecord = {
  opportunityId: string;
  caseId: string;
  verdict: IndependentOpportunityV3ReviewVerdict;
  reason: string;
  sourceFactIds: string[];
};

export type IndependentNoActionableV3ReviewRecord = {
  caseId: string;
  factId: string;
  verdict: NoActionableV3ReviewVerdict;
  reason: string;
};

export type IndependentOpportunityV3Review = {
  version: string;
  overallVerdict: string;
  population: { cases: number; opportunities: number; noActionableRecords: number };
  opportunityVerdictSummary: Partial<Record<IndependentOpportunityV3ReviewVerdict, number>>;
  noActionableVerdictSummary: Partial<Record<NoActionableV3ReviewVerdict, number>>;
  adjudications: IndependentOpportunityV3ReviewRecord[];
  noActionableAdjudications: IndependentNoActionableV3ReviewRecord[];
  missingOrUnderrepresentedOpportunitiesByCase: Record<string, string[]>;
};

export function loadIndependentOpportunityV3Review(
  path: string = INDEPENDENT_OPPORTUNITY_V3_REVIEW_V1_PATH,
): IndependentOpportunityV3Review {
  if (!existsSync(path)) {
    throw new Error(
      `Independent v3 review not found at ${path}. Expected SHA256 ${INDEPENDENT_OPPORTUNITY_V3_REVIEW_V1_SHA256}`,
    );
  }
  const rawText = readFileSync(path, "utf8");
  const sha = createHash("sha256").update(rawText).digest("hex").toLowerCase();
  if (sha !== INDEPENDENT_OPPORTUNITY_V3_REVIEW_V1_SHA256) {
    throw new Error(`Independent v3 review SHA256 mismatch: got ${sha}, expected ${INDEPENDENT_OPPORTUNITY_V3_REVIEW_V1_SHA256}`);
  }
  return JSON.parse(rawText) as IndependentOpportunityV3Review;
}

export function tryLoadIndependentOpportunityV3Review(): IndependentOpportunityV3Review | null {
  try {
    return loadIndependentOpportunityV3Review();
  } catch {
    return null;
  }
}
