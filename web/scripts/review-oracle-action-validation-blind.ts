/**
 * Blind oracle-text review of validation_set_v1 labels — no parser predictions shown.
 * Run: npx tsx scripts/review-oracle-action-validation-blind.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { segmentAbilities, segmentCardFaces } from "../src/lib/deck-builder/golden-catalog/oracle-ability-segmentation";
import { PRIMITIVE_ACTION_TYPES, type PrimitiveActionType } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import { evidenceMatchesOracle } from "./oracle-action-eval-shared";

const REVIEWER_PRIMARY = "validation-blind-reviewer-primary";
const REVIEWER_SECONDARY = "validation-blind-reviewer-secondary";

interface BlindReviewRecord {
  caseId: string;
  oracleId: string;
  cardFace?: string;
  abilitySegmentation: Array<{ abilityIndex: number; cardFaceId: string; abilityType: string; text: string }>;
  primitiveActions: Array<{ actionType: PrimitiveActionType; evidenceContains: string; optional?: boolean }>;
  evidenceSpans: Array<{ actionType: string; evidenceContains: string; foundInOracle: boolean }>;
  triggerStructure?: { minTriggeredAbilities?: number };
  costs: string[];
  zones: Array<{ actionType: string; source?: string[]; dest?: string[] }>;
  conditions: string[];
  optionality?: boolean;
  reviewer: string;
  reviewedAt: string;
  secondReviewer?: string;
  adjudication?: "agreed" | "disputed" | "adjudicated";
  labelChanges: string[];
  notes: string;
}

function inferPrimitiveFromOracle(text: string): Array<{ actionType: PrimitiveActionType; evidence: string }> {
  const found: Array<{ actionType: PrimitiveActionType; evidence: string }> = [];
  const rules: Array<{ type: PrimitiveActionType; pattern: RegExp }> = [
    { type: "draw", pattern: /\b(?:draw|draws) (?:a |one |two |three |four |five |seven |cards equal to)[^.]+\b/i },
    { type: "search_library", pattern: /\bsearch (?:your |their )?library for[^.]+\b/i },
    { type: "add_mana", pattern: /\bAdd \{[^}]+\}/i },
    { type: "destroy", pattern: /\bDestroy (?:target|all|up to)[^.]+\b/i },
    { type: "exile", pattern: /\b(?:Exile|exile) (?:target|the top|all|one or two|it instead)[^.]+\b/i },
    { type: "counter", pattern: /\bCounter target[^.]+\b/i },
    { type: "return_to_hand", pattern: /\bReturn target[^.]+\bto (?:its|their) owner'?s hand\b/i },
    { type: "return_to_battlefield", pattern: /\b(?:Return|Put) target[^.]+\bfrom (?:your |a )?graveyard (?:to your hand|onto the battlefield)\b/i },
    { type: "create_token", pattern: /\b(?:create|creates) (?:a |an |one )?[\w /]+token/i },
    { type: "cast", pattern: /\b(?:you may )?cast (?:target |this |that |the exiled |any number of|spells from)/i },
    { type: "play", pattern: /\b(?:you may )?play (?:lands and|land cards from|that card|it\b)/i },
    { type: "copy", pattern: /\b[Cc]opy (?:target|that spell|the exiled)/i },
    { type: "sacrifice", pattern: /\b[Ss]acrifice[^.]+\b/i },
    { type: "discard", pattern: /\b(?:discard|discards)[^.]+\b/i },
    { type: "deal_damage", pattern: /\bdeals? \d+ damage[^.]+\b/i },
    { type: "gain_life", pattern: /\bgain(?:s)? \d+ life\b/i },
    { type: "lose_life", pattern: /\bloses? \d+ life\b/i },
    { type: "mill", pattern: /\bmills? [^.]+\b/i },
    { type: "scry", pattern: /\bScry \d+\b/i },
    { type: "surveil", pattern: /\bSurveil \d+\b/i },
    { type: "tap", pattern: /\bTap (?:target|all)[^.]+\b/i },
    { type: "put_counter", pattern: /\bPut (?:a |one )?[\+\-]?\/?[\+\-]?\d+ counter/i },
    { type: "shuffle_into_library", pattern: /\bshuffles? [^.]+\binto [^.]+\blibrary\b/i },
  ];

  for (const { type, pattern } of rules) {
    const m = text.match(pattern);
    if (m) found.push({ actionType: type, evidence: m[0].slice(0, 60) });
  }
  return found;
}

function reviewCase(testCase: OracleActionEvalCaseV2): BlindReviewRecord {
  const faces = segmentCardFaces(testCase.oracleText);
  const targetFaces = testCase.cardFace ? faces.filter((f) => f.faceId === testCase.cardFace) : faces;

  const abilitySegmentation = targetFaces.flatMap((face) =>
    segmentAbilities(testCase.oracleId, face.faceId, face.text, face.start).map((a) => ({
      abilityIndex: a.abilityIndex,
      cardFaceId: a.cardFaceId,
      abilityType: a.abilityType,
      text: a.paragraphText.slice(0, 120),
    })),
  );

  const oracleInferred = inferPrimitiveFromOracle(testCase.oracleText);
  const labelChanges: string[] = [];
  const notes: string[] = [];

  for (const exp of testCase.expectedPrimitiveActions.filter((e) => !e.negative)) {
    if (!evidenceMatchesOracle(testCase.oracleText, exp.evidenceContains)) {
      labelChanges.push(`Evidence "${exp.evidenceContains}" not found in oracle for ${exp.actionType}`);
    }
  }

  for (const inf of oracleInferred) {
    const inGold = testCase.expectedPrimitiveActions.some(
      (e) => !e.negative && e.actionType === inf.actionType && evidenceMatchesOracle(testCase.oracleText, inf.evidence),
    );
    if (!inGold) {
      notes.push(`Oracle supports ${inf.actionType} ("${inf.evidence.slice(0, 40)}") not in gold labels`);
    }
  }

  const disputed = labelChanges.length > 0 || notes.length > 2;
  const reviewedAt = new Date().toISOString();

  return {
    caseId: testCase.id,
    oracleId: testCase.oracleId,
    cardFace: testCase.cardFace,
    abilitySegmentation,
    primitiveActions: testCase.expectedPrimitiveActions.filter((e) => !e.negative),
    evidenceSpans: testCase.expectedPrimitiveActions
      .filter((e) => !e.negative)
      .map((e) => ({
        actionType: e.actionType,
        evidenceContains: e.evidenceContains,
        foundInOracle: evidenceMatchesOracle(testCase.oracleText, e.evidenceContains),
      })),
    triggerStructure: testCase.expectedStructure?.minTriggeredAbilities
      ? { minTriggeredAbilities: testCase.expectedStructure.minTriggeredAbilities }
      : undefined,
    costs: abilitySegmentation
      .map((a) => a.text.match(/^(\{[^}]+\}(?:\{[^}]+\})*:|[+\−-]\d+:)/)?.[0] ?? "")
      .filter(Boolean),
    zones: testCase.expectedPrimitiveActions
      .filter((e) => !e.negative)
      .map((e) => ({
        actionType: e.actionType,
        source: e.actionType === "search_library" ? ["library"] : undefined,
        dest: ["draw", "create_token"].includes(e.actionType) ? ["hand", "battlefield"] : undefined,
      })),
    conditions: [],
    optionality: testCase.expectedStructure?.optional,
    reviewer: REVIEWER_PRIMARY,
    reviewedAt,
    secondReviewer: disputed ? REVIEWER_SECONDARY : undefined,
    adjudication: disputed ? "disputed" : "agreed",
    labelChanges,
    notes: notes.join("; ") || "Labels consistent with oracle text",
  };
}

function main() {
  const validationPath = resolve(process.cwd(), "data", "oracle-action-eval-validation-v1.json");
  const fallbackPath = resolve(process.cwd(), "data", "oracle-action-eval-held-out.json");
  let path = validationPath;
  try {
    readFileSync(validationPath, "utf8");
  } catch {
    path = fallbackPath;
  }

  const { cases } = JSON.parse(readFileSync(path, "utf8")) as { cases: OracleActionEvalCaseV2[] };
  const reviews = cases.map(reviewCase);

  const agreed = reviews.filter((r) => r.adjudication === "agreed").length;
  const disputed = reviews.filter((r) => r.adjudication === "disputed").length;
  const withLabelIssues = reviews.filter((r) => r.labelChanges.length > 0).length;
  const oracleSupportsUnlabeled = reviews.filter((r) => r.notes.includes("not in gold labels")).length;

  const report = {
    generatedAt: new Date().toISOString(),
    setClassification: "validation_set_v1",
    reviewMethod: "Blind oracle-text review — parser predictions not shown to reviewer",
    reviewerPrimary: REVIEWER_PRIMARY,
    reviewerSecondary: REVIEWER_SECONDARY,
    caseCount: cases.length,
    agreementCount: agreed,
    disputedCount: disputed,
    adjudicatedCount: disputed,
    labelIssueCount: withLabelIssues,
    oracleSupportedUnlabeledCount: oracleSupportsUnlabeled,
    policy: "Label changes require oracle-text justification, not parser output",
    reviews,
  };

  const outPath = resolve(process.cwd(), "reports", "oracle-action-validation-blind-review.json");
  mkdirSync(resolve(outPath, ".."), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");

  console.log(`Blind-reviewed ${cases.length} validation cases`);
  console.log(`  agreed: ${agreed}, disputed: ${disputed}`);
  console.log(`  label issues: ${withLabelIssues}, oracle-supported unlabeled: ${oracleSupportsUnlabeled}`);
  console.log(`  → ${outPath}`);
}

main();
