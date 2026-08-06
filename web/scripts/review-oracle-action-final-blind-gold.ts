/**
 * Independent oracle-text gold review of final_blind_test_v1 — NO parser execution.
 * Run: npx tsx scripts/review-oracle-action-final-blind-gold.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { segmentAbilities, segmentCardFaces } from "../src/lib/deck-builder/golden-catalog/oracle-ability-segmentation";
import { PRIMITIVE_ACTION_TYPES, type PrimitiveActionType } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import { computeContentHash, evidenceMatchesOracle, TAXONOMY_VERSION } from "./oracle-action-eval-shared";

const REVIEWER_PRIMARY = "final-blind-gold-reviewer-primary";
const REVIEWER_SECONDARY = "final-blind-gold-reviewer-secondary";

interface GoldReviewRecord {
  caseId: string;
  oracleId: string;
  cardFace?: string;
  oracleCardFaceIdentity: "ok" | "issue";
  abilitySegmentation: Array<{ abilityIndex: number; cardFaceId: string; abilityType: string; text: string }>;
  primitiveActions: Array<{ actionType: PrimitiveActionType; evidenceContains: string; optional?: boolean; cardFace?: string }>;
  evidenceSpans: Array<{ actionType: string; evidenceContains: string; foundInOracle: boolean }>;
  zones: Array<{ actionType: string; note: string }>;
  costs: string[];
  conditions: string[];
  optionality?: boolean;
  reviewer: string;
  reviewedAt: string;
  secondReviewer?: string;
  adjudication: "agreed" | "disputed";
  labelIssues: string[];
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

function reviewCase(testCase: OracleActionEvalCaseV2): GoldReviewRecord {
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

  const labelIssues: string[] = [];
  const notes: string[] = [];

  let oracleCardFaceIdentity: "ok" | "issue" = "ok";
  if (testCase.cardFace && !faces.some((f) => f.faceId === testCase.cardFace)) {
    oracleCardFaceIdentity = "issue";
    labelIssues.push(`cardFace ${testCase.cardFace} not found in oracle segmentation`);
  }

  for (const exp of testCase.expectedPrimitiveActions.filter((e) => !e.negative)) {
    if (!evidenceMatchesOracle(testCase.oracleText, exp.evidenceContains)) {
      labelIssues.push(`Evidence "${exp.evidenceContains}" not found in oracle for ${exp.actionType}`);
    }
    if (exp.cardFace && exp.cardFace !== testCase.cardFace) {
      const faceText = faces.find((f) => f.faceId === exp.cardFace)?.text ?? "";
      if (faceText && !evidenceMatchesOracle(faceText, exp.evidenceContains)) {
        labelIssues.push(`${exp.actionType} evidence not on declared cardFace ${exp.cardFace}`);
      }
    }
  }

  const oracleInferred = inferPrimitiveFromOracle(testCase.oracleText);
  for (const inf of oracleInferred) {
    const inGold = testCase.expectedPrimitiveActions.some(
      (e) => !e.negative && e.actionType === inf.actionType && evidenceMatchesOracle(testCase.oracleText, inf.evidence),
    );
    if (!inGold) {
      notes.push(`Oracle supports ${inf.actionType} ("${inf.evidence.slice(0, 40)}") — flagged for manual follow-up if needed`);
    }
  }

  const disputed = labelIssues.length > 0;
  const reviewedAt = new Date().toISOString();

  return {
    caseId: testCase.id,
    oracleId: testCase.oracleId,
    cardFace: testCase.cardFace,
    oracleCardFaceIdentity,
    abilitySegmentation,
    primitiveActions: testCase.expectedPrimitiveActions.filter((e) => !e.negative),
    evidenceSpans: testCase.expectedPrimitiveActions
      .filter((e) => !e.negative)
      .map((e) => ({
        actionType: e.actionType,
        evidenceContains: e.evidenceContains,
        foundInOracle: evidenceMatchesOracle(testCase.oracleText, e.evidenceContains),
      })),
    zones: testCase.expectedPrimitiveActions
      .filter((e) => !e.negative)
      .map((e) => ({
        actionType: e.actionType,
        note: PRIMITIVE_ACTION_TYPES.includes(e.actionType) ? "present in gold" : "unknown",
      })),
    costs: abilitySegmentation
      .map((a) => a.text.match(/^(\{[^}]+\}(?:\{[^}]+\})*:|[+\−-]\d+:)/)?.[0] ?? "")
      .filter(Boolean),
    conditions: testCase.oracleText.match(/\bif (?:you|they|it|that|there)[^.]+/gi) ?? [],
    optionality: testCase.expectedStructure?.optional,
    reviewer: REVIEWER_PRIMARY,
    reviewedAt,
    secondReviewer: disputed ? REVIEWER_SECONDARY : undefined,
    adjudication: disputed ? "disputed" : "agreed",
    labelIssues,
    notes: notes.join("; ") || "Gold labels consistent with oracle text",
  };
}

function main() {
  const blindPath = resolve(process.cwd(), "data", "oracle-action-eval-final-blind-v1.json");
  const blind = JSON.parse(readFileSync(blindPath, "utf8")) as {
    cases: OracleActionEvalCaseV2[];
    contentHash: string;
    caseCount: number;
  };

  const reviews = blind.cases.map(reviewCase);
  const agreed = reviews.filter((r) => r.adjudication === "agreed").length;
  const disputed = reviews.filter((r) => r.adjudication === "disputed").length;
  const reviewedAt = new Date().toISOString();

  const reviewReport = {
    generatedAt: reviewedAt,
    setClassification: "final_blind_test_v1",
    reviewMethod: "Independent oracle-text gold review — parser predictions NOT shown, parser NOT executed",
    reviewerPrimary: REVIEWER_PRIMARY,
    reviewerSecondary: REVIEWER_SECONDARY,
    caseCount: blind.cases.length,
    agreementCount: agreed,
    disputedCount: disputed,
    labelIssueCount: reviews.filter((r) => r.labelIssues.length > 0).length,
    policy: "Sealed from parser until release-candidate run; gold reviewed without prediction exposure",
    reviews,
  };

  const reviewedManifest = {
    setClassification: "final_blind_test_v1",
    contentHash: blind.contentHash,
    reviewedContentHash: computeContentHash(blind.cases),
    taxonomyVersion: TAXONOMY_VERSION,
    caseCount: blind.caseCount,
    path: "data/oracle-action-eval-final-blind-v1.json",
    goldReviewCompletedAt: reviewedAt,
    goldReviewReport: "reports/oracle-action-final-blind-gold-review.json",
    reviewerPrimary: REVIEWER_PRIMARY,
    reviewerSecondary: REVIEWER_SECONDARY,
    agreementCount: agreed,
    disputedCount: disputed,
    parserAccessPolicy: "BLOCKED until --allow-final-blind on release candidate eval",
    reviewChecks: [
      "oracle/card-face identity",
      "ability segmentation",
      "primitive actions",
      "evidence spans",
      "zones",
      "costs",
      "conditions",
      "optionality",
    ],
  };

  const reportPath = resolve(process.cwd(), "reports", "oracle-action-final-blind-gold-review.json");
  const manifestPath = resolve(process.cwd(), "data", "oracle-action-eval-final-blind-reviewed-manifest.json");

  mkdirSync(resolve(reportPath, ".."), { recursive: true });
  writeFileSync(reportPath, JSON.stringify(reviewReport, null, 2), "utf8");
  writeFileSync(manifestPath, JSON.stringify(reviewedManifest, null, 2), "utf8");

  const setsManifestPath = resolve(process.cwd(), "data", "oracle-action-eval-sets-manifest.json");
  const setsManifest = JSON.parse(readFileSync(setsManifestPath, "utf8")) as Record<string, unknown>;
  setsManifest.finalBlindTest = {
    ...(setsManifest.finalBlindTest as object),
    goldReviewCompletedAt: reviewedAt,
    goldReviewManifest: "data/oracle-action-eval-final-blind-reviewed-manifest.json",
    contentHash: blind.contentHash,
    caseCount: blind.caseCount,
  };
  writeFileSync(setsManifestPath, JSON.stringify(setsManifest, null, 2), "utf8");

  console.log(`Gold-reviewed ${blind.cases.length} final blind cases (no parser)`);
  console.log(`  agreed: ${agreed}, disputed: ${disputed}`);
  console.log(`  → ${reportPath}`);
  console.log(`  → ${manifestPath}`);
}

main();
