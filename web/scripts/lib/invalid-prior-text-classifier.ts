/**
 * Classify invalid_prior_text relabel outcomes:
 *   A — prior gold was written against wrong/synthetic text; current catalog-backed gold is complete.
 *   B — current gold remains incomplete and requires manual review before evaluation.
 */
import type { ExpectedPrimitiveAction } from "../audit-oracle-action-eval-cases";
import type { GoldRelabelChange } from "./gold-relabel-engine";
import { evidenceMatchesOracle } from "../oracle-action-eval-shared";

export type InvalidPriorTextDisposition = "superseded_complete" | "gold_incomplete";

export interface InvalidPriorTextClassification {
  caseId: string;
  disposition: InvalidPriorTextDisposition;
  invalidPriorCount: number;
  currentGoldPrimitiveCount: number;
  reasons: string[];
}

function evidenceCorpus(oracleText: string, cardFace?: string): string {
  if (!cardFace || !oracleText.includes("\n//\n")) return oracleText;
  const parts = oracleText.split("\n//\n");
  if (cardFace === "back") return parts[1] ?? parts[parts.length - 1] ?? oracleText;
  if (cardFace === "front") return parts[0] ?? oracleText;
  if (cardFace === "left") return parts[0] ?? oracleText;
  if (cardFace === "right") return parts[1] ?? parts[parts.length - 1] ?? oracleText;
  return oracleText;
}

export function classifyInvalidPriorText(input: {
  caseId: string;
  oracleText: string;
  cardFace?: string;
  changes: GoldRelabelChange[];
  currentGold: ExpectedPrimitiveAction[];
  expectedStructure?: { minTriggeredAbilities?: number; minActivatedAbilities?: number; optional?: boolean };
  forbiddenPrimitiveActions?: string[];
}): InvalidPriorTextClassification {
  const invalidChanges = input.changes.filter((c) => c.classification === "invalid_prior_text");
  const reasons: string[] = [];
  const corpus = evidenceCorpus(input.oracleText, input.cardFace);

  if (invalidChanges.length === 0) {
    return {
      caseId: input.caseId,
      disposition: "superseded_complete",
      invalidPriorCount: 0,
      currentGoldPrimitiveCount: input.currentGold.length,
      reasons: [],
    };
  }

  let disposition: InvalidPriorTextDisposition = "superseded_complete";

  for (const gold of input.currentGold) {
    const faceText = gold.cardFace ? evidenceCorpus(input.oracleText, gold.cardFace) : corpus;
    if (!evidenceMatchesOracle(faceText, gold.evidenceContains)) {
      disposition = "gold_incomplete";
      reasons.push(`Current gold ${gold.actionType} evidence not in catalog text`);
    }
  }

  const hasLayer1Only = input.changes.some((c) => c.classification === "layer1_instead_of_layer2");
  const hasNewOrConfirmedGold = input.changes.some(
    (c) => c.classification === "newly_added" || c.classification === "confirmed" || c.classification === "modified",
  );
  const hasAbstentionGold =
    input.currentGold.length === 0 &&
    (hasLayer1Only ||
      (input.forbiddenPrimitiveActions?.length ?? 0) > 0 ||
      (input.expectedStructure?.minTriggeredAbilities ?? 0) > 0);

  if (invalidChanges.length > 0 && input.currentGold.length === 0 && !hasAbstentionGold && !hasNewOrConfirmedGold) {
    disposition = "gold_incomplete";
    reasons.push("Prior gold invalidated but no catalog-backed replacement primitives derived");
  }

  const hasTriggerStructure = (input.expectedStructure?.minTriggeredAbilities ?? 0) > 0;
  const hasTriggerInText = /\b(When|Whenever|At the beginning of)\b/i.test(corpus);
  if (
    hasTriggerStructure &&
    hasTriggerInText &&
    input.currentGold.length === 0 &&
    !hasLayer1Only &&
    !hasAbstentionGold &&
    !hasNewOrConfirmedGold
  ) {
    disposition = "gold_incomplete";
    reasons.push("Oracle text has triggers but current gold has no Layer 2 primitives");
  }

  return {
    caseId: input.caseId,
    disposition,
    invalidPriorCount: invalidChanges.length,
    currentGoldPrimitiveCount: input.currentGold.length,
    reasons,
  };
}

export function summarizeInvalidPriorTextClassifications(
  classifications: InvalidPriorTextClassification[],
): {
  totalInvalidPriorMentions: number;
  supersededComplete: number;
  goldIncomplete: number;
  byCase: InvalidPriorTextClassification[];
} {
  let totalInvalidPriorMentions = 0;
  let supersededComplete = 0;
  let goldIncomplete = 0;
  for (const c of classifications) {
    totalInvalidPriorMentions += c.invalidPriorCount;
    if (c.disposition === "superseded_complete") supersededComplete += 1;
    else goldIncomplete += 1;
  }
  return { totalInvalidPriorMentions, supersededComplete, goldIncomplete, byCase: classifications };
}

/**
 * Human-readable definition for benchmark reports.
 */
export const INVALID_PRIOR_TEXT_DEFINITIONS = {
  invalid_prior_text:
    "Count of prior-gold evidence spans that do not appear in the current catalog oracle text (written against wrong/synthetic text).",
  superseded_complete_A:
    "Prior label invalid, but current catalog-backed gold is complete — do NOT cite invalid_prior_text as cause of low precision.",
  gold_incomplete_B:
    "Current gold remains incomplete after relabel — dataset must stay usableForParserEvaluation=false until manual review.",
} as const;
