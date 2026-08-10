/**
 * Proposed RC3 candidate freeze manifest after v1.39 gold-policy corrections.
 * Run: cd web && npx tsx scripts/freeze-rc3-candidate-v139-manifest.ts
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { ORACLE_ACTION_RC3_PARSER_VERSION } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import { parseOracleSemanticsRC3 } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import { verifySemanticParseIntegrity } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-integrity";
import { applyGoldMigrationV135, loadAllGoldMigrationsV135 } from "./lib/rc3-gold-migration-v135";
import { evaluateCaseSemantic, sumSemanticMetrics } from "./oracle-action-semantic-matcher";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import { DEFAULT_RC3_PROMOTED_FAMILIES } from "../src/lib/deck-builder/golden-catalog/oracle-rc3-promotion";
import { assertCleanWorkingTreeForParserScope } from "./lib/working-tree-provenance-guard-v1";

const PARSER_VERSION = ORACLE_ACTION_RC3_PARSER_VERSION;
const TAG = "oracle-action-v1.39-rc3-replacement-exile-instead";
const PARENT_TAG = "oracle-action-v1.38-rc3-look-reveal-put-chain";
const PARENT_SHA = "ac4e161a18915d89b7dfb0f93eebd316b63cf74a";
const V13_HASH = "9e20260619de3eff9f8be5b579d635bf8756fcefc22efa87d198f98aa079911f";

const PARSER_SCOPE_PATHS = [
  "src/lib/deck-builder/golden-catalog/oracle-rc3-transform.ts",
  "src/lib/deck-builder/golden-catalog/oracle-rc3-clause-native.ts",
  "src/lib/deck-builder/golden-catalog/oracle-rc3-promotion.ts",
  "src/lib/deck-builder/golden-catalog/oracle-rc3-action-builder.ts",
  "src/lib/deck-builder/golden-catalog/oracle-semantic-parse-builder.ts",
  "src/lib/deck-builder/golden-catalog/oracle-rc3-granted-rules-span-detector.ts",
  "src/lib/deck-builder/golden-catalog/oracle-rc3-semantic-context-router.ts",
  "src/lib/deck-builder/golden-catalog/oracle-rc3-scoring-scope.ts",
  "src/lib/deck-builder/golden-catalog/oracle-rc3-extraction-metadata.ts",
  "scripts/oracle-action-unified-matcher.ts",
  "scripts/oracle-action-semantic-matcher.ts",
  "scripts/lib/rc3-case-scope-scoring.ts",
];

const GOLD_MIGRATION_PATHS = [
  "data/milestones/rc3-development/persistent-permission-gold-migration-v135.json",
  "data/milestones/rc3-development/granted-shuffle-gold-migration-v135.json",
  "data/milestones/rc3-development/token-definition-gold-migration-v135.json",
  "data/milestones/rc3-development/land-grant-permission-gold-migration-v137.json",
  "data/milestones/rc3-development/zone-ninjutsu-replacement-gold-migration-v137.json",
  "data/milestones/rc3-development/activated-cost-fall-to-earth-gold-migration-v139.json",
];

const BENCHMARK_PATHS = [
  "data/oracle-action-eval-development-v26-v14.json",
  "data/oracle-action-eval-development-generalization-expansion-v2-v14.json",
  "data/oracle-action-eval-development-generalization-expansion-v3-v14.json",
  "data/oracle-action-eval-development-generalization-expansion-v5-v14.json",
  "data/oracle-action-eval-rc3-positive-training-catalog-v133.json",
];

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(resolve(path))).digest("hex");
}

function gitBlobSha(repoRoot: string, relPath: string): string {
  return execSync(`git hash-object ${relPath}`, { cwd: repoRoot, encoding: "utf8" }).trim();
}

function loadCombinedCases(): OracleActionEvalCaseV2[] {
  return BENCHMARK_PATHS.flatMap((p) =>
    applyGoldMigrationV135(
      (JSON.parse(readFileSync(resolve(p), "utf8")) as { cases: OracleActionEvalCaseV2[] }).cases,
    ),
  );
}

function loadUnrelatedCases(): OracleActionEvalCaseV2[] {
  const catalog = applyGoldMigrationV135(
    (JSON.parse(readFileSync(resolve("data/oracle-action-eval-rc3-positive-training-catalog-v133.json"), "utf8")) as {
      cases: OracleActionEvalCaseV2[];
    }).cases,
  );
  return catalog.filter((c) => !(c as { spentV12Regression?: boolean }).spentV12Regression);
}

function scanCombinedInvariants(cases: OracleActionEvalCaseV2[]) {
  let semanticInvalidActionCount = 0;
  let semanticValidatorViolationCount = 0;
  let activatedCostLayer2Leakage = 0;
  let permissionLeakage = 0;
  let triggerEventActionLeakage = 0;
  let tokenDefinitionCardNativeLeakage = 0;
  let tokenCopyPrimitiveLeakage = 0;
  let crossFaceSemanticLeakage = 0;
  const semanticInvalidCases: string[] = [];

  for (const testCase of cases) {
    const parsed = parseOracleSemanticsRC3({
      oracleId: testCase.oracleId,
      oracleText: testCase.oracleText,
      cardFace: testCase.cardFace,
    });
    semanticInvalidActionCount += parsed.semanticValidation.invalidActionCount;
    semanticValidatorViolationCount += parsed.semanticValidation.invalidCount;
    if (parsed.semanticValidation.invalidCount > 0) semanticInvalidCases.push(testCase.id);

    for (const action of parsed.actions) {
      if (action.reviewStatus !== "accepted") continue;
      const span = action.provenance.actionSpan;
      const text = testCase.oracleText;
      const colon = text.indexOf(":");
      if (
        colon > 0 &&
        /\{[^}]+\}/.test(text.slice(0, colon)) &&
        ["sacrifice", "discard", "tap", "exile"].includes(action.actionType) &&
        span.start < colon &&
        action.executionContext !== "activated_cost"
      ) {
        activatedCostLayer2Leakage++;
      }
      if (
        action.actionType === "cast" &&
        /You may cast[^.\n]*from your (?:graveyard|hand)\b/i.test(text) &&
        /You may cast[^.\n]*from your (?:graveyard|hand)\b/i.test(span.text) &&
        !/without paying|that card|the copy/i.test(span.text)
      ) {
        permissionLeakage++;
      }
      if (action.actionType === "cast" && /Whenever you cast|When you cast|If you cast/i.test(span.text)) {
        triggerEventActionLeakage++;
      }
      if (
        action.executionContext === "token_definition" &&
        action.semanticOwner !== "created_object" &&
        action.cardNativeLayer2Eligible !== false
      ) {
        tokenDefinitionCardNativeLeakage++;
      }
      if (action.actionType === "copy" && /\btoken that'?s a copy of\b/i.test(span.text)) {
        tokenCopyPrimitiveLeakage++;
      }
      if (action.faceId && testCase.cardFace && action.faceId !== testCase.cardFace) {
        crossFaceSemanticLeakage++;
      }
    }
  }

  return {
    semanticInvalidActionCount,
    semanticValidatorViolationCount,
    semanticInvalidCases,
    activatedCostLayer2Leakage,
    permissionLeakage,
    triggerEventActionLeakage,
    tokenDefinitionCardNativeLeakage,
    tokenCopyPrimitiveLeakage,
    crossFaceSemanticLeakage,
  };
}

function main() {
  assertCleanWorkingTreeForParserScope(PARSER_SCOPE_PATHS, "RC3 candidate freeze v139");

  const repoRoot = execSync("git rev-parse --show-toplevel", { cwd: resolve("."), encoding: "utf8" }).trim();
  const parserCommitSha = execSync("git rev-parse HEAD", { cwd: repoRoot, encoding: "utf8" }).trim();
  const cleanTree = execSync("git status --porcelain -- web/", { cwd: repoRoot, encoding: "utf8" }).trim();
  const parserScopeDirty = PARSER_SCOPE_PATHS.some((p) =>
    cleanTree.split("\n").some((line) => line.includes(p.replace(/\//g, "\\")) || line.includes(p)),
  );

  const combinedCases = loadCombinedCases();
  const unrelatedCases = loadUnrelatedCases();
  const combinedMetrics = sumSemanticMetrics(
    combinedCases.map((c) =>
      evaluateCaseSemantic(c, parseOracleSemanticsRC3({ oracleId: c.oracleId, oracleText: c.oracleText, cardFace: c.cardFace })),
    ),
  );
  const unrelatedMetrics = sumSemanticMetrics(
    unrelatedCases.map((c) =>
      evaluateCaseSemantic(c, parseOracleSemanticsRC3({ oracleId: c.oracleId, oracleText: c.oracleText, cardFace: c.cardFace })),
    ),
  );

  const invariants = scanCombinedInvariants(combinedCases);
  const combinedPrecision = combinedMetrics.tp / (combinedMetrics.tp + combinedMetrics.fp);
  const combinedRecall = combinedMetrics.tp / (combinedMetrics.tp + combinedMetrics.fn);
  const unrelatedPrecision = unrelatedMetrics.tp / (unrelatedMetrics.tp + unrelatedMetrics.fp);
  const unrelatedRecall = unrelatedMetrics.tp / (unrelatedMetrics.tp + unrelatedMetrics.fn);

  const gates = {
    combinedDevelopment: {
      precisionTarget: 0.98,
      recallTarget: 0.92,
      semanticInvalidTarget: 0,
      pass:
        combinedPrecision >= 0.98 &&
        combinedRecall >= 0.92 &&
        invariants.semanticValidatorViolationCount === 0,
    },
    unrelatedCatalogPositive: {
      precisionTarget: 0.95,
      recallTarget: 0.9,
      pass: unrelatedPrecision >= 0.95 && unrelatedRecall >= 0.9,
    },
  };

  const goldCorrections = {
    "rc3-pos-cat-0007": {
      cardName: "A-Navigation Orb",
      change: "remove Layer-2 sacrifice; add forbiddenPrimitiveActions sacrifice; activated cost Layer 1 only",
      postCorrectionMetrics: { tp: 3, fp: 0, fn: 0 },
    },
    "dev-exp-v1-012": {
      cardName: "Fall to Earth",
      change: "destroy/gain 4 → exile/gain 3; add landcycling search/put_into_hand/shuffle Layer-2",
      postCorrectionMetrics: { tp: 5, fp: 0, fn: 0 },
    },
  };

  const manifestBody = {
    freezeLabel: "rc3-candidate-v139-proposed",
    status: gates.combinedDevelopment.pass && gates.unrelatedCatalogPositive.pass ? "CANDIDATE_FROZEN" : "BLOCKED_PENDING_INVARIANTS",
    frozenAt: new Date().toISOString(),
    parserVersion: PARSER_VERSION,
    tag: TAG,
    parentCheckpoint: PARENT_TAG,
    parentCommitSha: PARENT_SHA,
    parserCommitSha,
    parserScopeClean: !parserScopeDirty,
    parserScopePaths: PARSER_SCOPE_PATHS,
    parserBlobs: Object.fromEntries(PARSER_SCOPE_PATHS.map((p) => [p.split("/").pop()!, sha256File(p)])),
    taxonomyVersion: "three-layer-v1.4",
    taxonomyV14Hashes: Object.fromEntries(BENCHMARK_PATHS.map((p) => [p, sha256File(p)])),
    goldMigrationOverlay: {
      paths: GOLD_MIGRATION_PATHS,
      hashes: Object.fromEntries(GOLD_MIGRATION_PATHS.map((p) => [p, sha256File(p)])),
      recordCount: loadAllGoldMigrationsV135().length,
      v139Corrections: "activated-cost-fall-to-earth-gold-migration-v139.json",
    },
    evaluators: {
      semanticMatcher: sha256File("scripts/oracle-action-semantic-matcher.ts"),
      unifiedMatcher: sha256File("scripts/oracle-action-unified-matcher.ts"),
      devGateScript: sha256File("scripts/eval-rc3-dev-gate.ts"),
    },
    DEFAULT_RC3_PROMOTED_FAMILIES,
    authoritativeDevelopment: {
      scoringPath: "live_full_semantic_matcher_with_gold_migration_overlay",
      combined: {
        tp: combinedMetrics.tp,
        fp: combinedMetrics.fp,
        fn: combinedMetrics.fn,
        precision: combinedPrecision,
        recall: combinedRecall,
      },
      unrelatedCatalogPositive: {
        tp: unrelatedMetrics.tp,
        fp: unrelatedMetrics.fp,
        fn: unrelatedMetrics.fn,
        precision: unrelatedPrecision,
        recall: unrelatedRecall,
      },
    },
    goldCorrections,
    gates,
    candidateInvariants: {
      ...invariants,
      allRequiredZero:
        invariants.semanticValidatorViolationCount === 0 &&
        invariants.activatedCostLayer2Leakage === 0 &&
        invariants.permissionLeakage === 0 &&
        invariants.triggerEventActionLeakage === 0 &&
        invariants.tokenDefinitionCardNativeLeakage === 0 &&
        invariants.tokenCopyPrimitiveLeakage === 0 &&
        invariants.crossFaceSemanticLeakage === 0,
    },
    regressionFamiliesClosed: [
      "replacement_exile_instead",
      "look_reveal_put_chain",
      "cast_policy",
      "granted_v136_region",
      "granted_v137_nested",
      "granted_v138_transfer",
    ],
    parserTuning: "STOP — no further development optimization after gate pass",
    deferredItems: {
      "rc3-pos-cat-0005_search_chain": "PAUSED — legitimate parser FN, not authorized for development margin",
      "dev-v9-018_ashiok_restriction": "DEFER — Layer-1 restriction misclassified as search_library FP",
      "dev-exp-v5-007_semantic_invalid": "PRE_EXISTING — granted-rules provenance in Spree opt-3; blocks combined formal gate",
    },
    v13: {
      sealed: true,
      parserExecutionCount: 0,
      validationHash: V13_HASH,
      authorized: false,
      note: "Execute only after immutable candidate freeze with all invariants green",
    },
  };

  const serialized = `${JSON.stringify(manifestBody, null, 2)}\n`;
  const manifestContentHash = createHash("sha256").update(serialized).digest("hex");
  const manifest = { ...manifestBody, manifestContentHash };

  mkdirSync(resolve("data/milestones/rc3-development"), { recursive: true });
  const outPath = resolve("data/milestones/rc3-development/rc3-candidate-v139-freeze-manifest.json");
  writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify({ outPath, manifestContentHash, gates, invariants: manifest.candidateInvariants }, null, 2));
}

main();
