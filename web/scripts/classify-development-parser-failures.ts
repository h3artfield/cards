/**
 * Classify development-set parser failures into v1.13 priority families.
 * Run: npx tsx scripts/classify-development-parser-failures.ts
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { loadEnvLocal } from "./lib/script-env";
import {
  extractOracleActionsV1,
} from "../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1";
import { normalizeToPrimitive } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import { matchGoldToActions, primitiveMatchesExpected } from "./oracle-action-unified-matcher";
import { evidenceMatchesOracle, inferSupportedPrimitiveFromEvidence } from "./oracle-action-eval-shared";

loadEnvLocal();

type FailureFamily =
  | "unsupported_accepted_emission"
  | "wrong_primitive_type"
  | "wrong_face_or_zone"
  | "restriction_or_cost_as_action"
  | "condition_or_optionality_mismatch"
  | "duplicate_emission"
  | "missed_extraction"
  | "evaluator_defect"
  | "other";

interface FamilyBucket {
  family: FailureFamily;
  acceptedFp: number;
  needsReviewFp: number;
  fn: number;
  primitives: Set<string>;
  wordingSamples: Set<string>;
  caseIds: Set<string>;
}

function classifyFp(input: {
  testCase: OracleActionEvalCaseV2;
  primitive: string | null;
  evidenceText: string;
  cardFaceId: string;
  expectedTypes: Set<string>;
}): FailureFamily {
  const { testCase, primitive, evidenceText, cardFaceId, expectedTypes } = input;
  const lower = evidenceText.toLowerCase();

  if (testCase.forbiddenPrimitiveActions?.includes(primitive as never)) {
    return "unsupported_accepted_emission";
  }
  if (!primitive || !inferSupportedPrimitiveFromEvidence(testCase.oracleText, evidenceText)) {
    return "unsupported_accepted_emission";
  }
  if (/\b(can't|cannot|don't|do not|instead|as long as|only if|unless)\b/i.test(evidenceText) && !expectedTypes.has(primitive)) {
    return "restriction_or_cost_as_action";
  }
  if (/\bas an additional cost\b|\bpay \{[^}]+\}\b/i.test(evidenceText) && primitive === "sacrifice") {
    return "restriction_or_cost_as_action";
  }
  if (primitive && expectedTypes.has(primitive)) {
    const faceGold = testCase.expectedPrimitiveActions.filter((e) => e.cardFace);
    if (faceGold.length && faceGold.some((e) => e.cardFace && e.cardFace !== cardFaceId)) {
      return "wrong_face_or_zone";
    }
    return "wrong_face_or_zone";
  }
  if (primitive && !expectedTypes.has(primitive)) {
    return "wrong_primitive_type";
  }
  return "other";
}

function rootCause(family: FailureFamily): string {
  switch (family) {
    case "unsupported_accepted_emission":
      return "Parser emits Layer-2 primitive for oracle text that is static, conditional shell, or not an executable action";
    case "wrong_primitive_type":
      return "Evidence span maps to wrong taxonomy primitive (e.g. return_to_hand vs return_to_battlefield, draw vs scry)";
    case "wrong_face_or_zone":
      return "Correct primitive family but attached to wrong card face or ability clause";
    case "restriction_or_cost_as_action":
      return "Instruction/restriction/cost language parsed as standalone executable action";
    case "condition_or_optionality_mismatch":
      return "Optional/may/up-to metadata not aligned with gold";
    case "duplicate_emission":
      return "Same primitive+evidence emitted more than once within ability scope";
    case "missed_extraction":
      return "Gold-supported oracle action not extracted at accepted or needs-review tier";
    case "evaluator_defect":
      return "Evaluator matching issue — rare after unified matcher";
    default:
      return "Unclassified parser/evaluator mismatch";
  }
}

function proposedRule(family: FailureFamily): string {
  switch (family) {
    case "unsupported_accepted_emission":
      return "Add abstention guards for non-action clauses (static abilities, reminder text, replacement preconditions) before primitive assignment";
    case "wrong_primitive_type":
      return "Tighten evidence→primitive mapping rules per verb phrase; prefer zone-specific return primitives";
    case "wrong_face_or_zone":
      return "Require face-scoped segmentation before matching; bind emissions to face-local ability index";
    case "restriction_or_cost_as_action":
      return "Route cost/restriction spans to Layer-1 structure/conditions, not Layer-2 primitives";
    case "condition_or_optionality_mismatch":
      return "Detect may/up-to in evidence span and attach optionalEffect/quantity metadata before acceptance";
    case "duplicate_emission":
      return "Strengthen canonical-key dedup across overlapping evidence spans within same ability";
    case "missed_extraction":
      return "Expand pattern coverage for compound/modal/split oracle constructions without lowering confidence threshold";
    default:
      return "Investigate case-by-case";
  }
}

async function main() {
  const repoRoot = resolve(process.cwd(), "..");
  execSync(
    "git checkout 3eaae76 -- web/src/lib/deck-builder/golden-catalog/oracle-action-parser-v1.ts web/src/lib/deck-builder/golden-catalog/oracle-action-schema.ts",
    { cwd: repoRoot, stdio: "inherit" },
  );

  const devPath = resolve(process.cwd(), "data/oracle-action-eval-development-v16.json");
  let path = devPath;
  try {
    readFileSync(devPath, "utf8");
  } catch {
    path = resolve(process.cwd(), "data/oracle-action-eval-development-v15.json");
  }

  const dev = JSON.parse(readFileSync(path, "utf8")) as { cases: OracleActionEvalCaseV2[] };
  const buckets = new Map<FailureFamily, FamilyBucket>();

  const ensure = (family: FailureFamily): FamilyBucket => {
    if (!buckets.has(family)) {
      buckets.set(family, {
        family,
        acceptedFp: 0,
        needsReviewFp: 0,
        fn: 0,
        primitives: new Set(),
        wordingSamples: new Set(),
        caseIds: new Set(),
      });
    }
    return buckets.get(family)!;
  };

  for (const testCase of dev.cases) {
    const raw = extractOracleActionsV1({
      oracleId: testCase.oracleId,
      oracleText: testCase.oracleText,
      cardFace: testCase.cardFace,
    });
    const expected = testCase.expectedPrimitiveActions.filter((e) => !e.negative);
    const expectedTypes = new Set(expected.map((e) => e.actionType));
    const actions = raw.actions.map((a, index) => ({
      index,
      primitive: normalizeToPrimitive(a.actionType, a.evidenceText),
      evidenceText: a.evidenceText,
      cardFaceId: a.faceId,
      abilityIndex: a.abilityIndex,
      reviewStatus: a.reviewStatus as "accepted" | "needs_review",
      optionalEffect: a.optionalEffect,
      optional: a.optional,
      optionalCost: a.optionalCost,
    }));

    const allTier = matchGoldToActions({ expected, actions, tier: "all" });

    for (const idx of allTier.unmatchedExpectedIndices) {
      const exp = expected[idx];
      const family: FailureFamily = "missed_extraction";
      const b = ensure(family);
      b.fn += 1;
      b.primitives.add(exp.actionType);
      b.wordingSamples.add(exp.evidenceContains.slice(0, 80));
      b.caseIds.add(testCase.id);
    }

    for (const actionIdx of allTier.unmatchedActionIndices) {
      const a = actions[actionIdx];
      const family = classifyFp({
        testCase,
        primitive: a.primitive,
        evidenceText: a.evidenceText,
        cardFaceId: a.cardFaceId,
        expectedTypes,
      });
      const b = ensure(family);
      if (a.reviewStatus === "accepted") b.acceptedFp += 1;
      else b.needsReviewFp += 1;
      if (a.primitive) b.primitives.add(a.primitive);
      b.wordingSamples.add(a.evidenceText.slice(0, 80));
      b.caseIds.add(testCase.id);
    }
  }

  const families = [...buckets.values()]
    .map((b) => ({
      family: b.family,
      acceptedFp: b.acceptedFp,
      needsReviewFp: b.needsReviewFp,
      fn: b.fn,
      totalFp: b.acceptedFp + b.needsReviewFp,
      primitives: [...b.primitives].sort(),
      commonOracleWording: [...b.wordingSamples].slice(0, 8),
      caseCount: b.caseIds.size,
      caseIds: [...b.caseIds].sort().slice(0, 20),
      rootCause: rootCause(b.family),
      proposedRule: proposedRule(b.family),
    }))
    .sort((a, b) => b.acceptedFp - a.acceptedFp || b.totalFp - a.totalFp);

  const report = {
    generatedAt: new Date().toISOString(),
    parserVersion: "oracle-action-v1.12-unified-matcher",
    dataset: path.includes("v15") ? "development_set_v15" : "development_set_v14",
    caseCount: dev.cases.length,
    priorityOrder: "accepted_fp_desc",
    families,
    v113PriorityGuidance: [
      "1. Eliminate unsupported accepted emissions (precision drain)",
      "2. Fix wrong primitive type mappings",
      "3. Fix face/zone attachment",
      "4. Separate restrictions/costs/conditions from actions",
      "5. Then improve recall for missed extractions",
    ],
  };

  const outPath = resolve(process.cwd(), "reports/development-parser-failure-families-v113.json");
  mkdirSync(resolve(outPath, ".."), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");

  execSync(
    "git checkout HEAD -- web/src/lib/deck-builder/golden-catalog/oracle-action-parser-v1.ts web/src/lib/deck-builder/golden-catalog/oracle-action-schema.ts",
    { cwd: repoRoot, stdio: "inherit" },
  );

  console.log(JSON.stringify({ reportPath: outPath, topFamilies: families.slice(0, 5) }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
