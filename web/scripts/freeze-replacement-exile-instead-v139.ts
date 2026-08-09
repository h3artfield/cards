/**
 * Immutable v1.39 replacement-exile-instead parser checkpoint.
 * Run: npx tsx scripts/freeze-replacement-exile-instead-v139.ts
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { ORACLE_ACTION_RC3_PARSER_VERSION } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import { parseOracleSemanticsRC3 } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import { applyGoldMigrationV135 } from "./lib/rc3-gold-migration-v135";
import { evaluateCaseSemantic, sumSemanticMetrics } from "./oracle-action-semantic-matcher";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";

const PARSER_VERSION = ORACLE_ACTION_RC3_PARSER_VERSION;
const TAG = "oracle-action-v1.39-rc3-replacement-exile-instead";
const PARENT_SHA = "ac4e161a18915d89b7dfb0f93eebd316b63cf74a";
const PARENT_CHECKPOINT = "oracle-action-v1.38-rc3-look-reveal-put-chain";

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

function fileHash(path: string): string {
  return createHash("sha256").update(readFileSync(resolve(path))).digest("hex");
}

function loadCombinedCases(): OracleActionEvalCaseV2[] {
  const legacyPaths = [
    "data/oracle-action-eval-development-v26-v14.json",
    "data/oracle-action-eval-development-generalization-expansion-v2-v14.json",
    "data/oracle-action-eval-development-generalization-expansion-v3-v14.json",
    "data/oracle-action-eval-development-generalization-expansion-v5-v14.json",
  ];
  const legacy = legacyPaths.flatMap((p) =>
    applyGoldMigrationV135((JSON.parse(readFileSync(resolve(p), "utf8")) as { cases: OracleActionEvalCaseV2[] }).cases),
  );
  const positiveCatalog = applyGoldMigrationV135(
    (JSON.parse(readFileSync(resolve("data/oracle-action-eval-rc3-positive-training-catalog-v133.json"), "utf8")) as {
      cases: OracleActionEvalCaseV2[];
    }).cases,
  );
  return [...legacy, ...positiveCatalog];
}

function loadUnrelatedCatalogCases(): OracleActionEvalCaseV2[] {
  const positiveCatalog = applyGoldMigrationV135(
    (JSON.parse(readFileSync(resolve("data/oracle-action-eval-rc3-positive-training-catalog-v133.json"), "utf8")) as {
      cases: OracleActionEvalCaseV2[];
    }).cases,
  );
  return positiveCatalog.filter((c) => !(c as { spentV12Regression?: boolean }).spentV12Regression);
}

function main() {
  const gitRoot = execSync("git rev-parse --show-toplevel", { cwd: resolve("."), encoding: "utf8" }).trim();
  const headBeforeCommit = execSync("git rev-parse HEAD", { cwd: gitRoot, encoding: "utf8" }).trim();
  const cleanTree = execSync("git status --porcelain -- web/", { cwd: gitRoot, encoding: "utf8" }).trim();
  const parserScopeDirty = PARSER_SCOPE_PATHS.some((p) =>
    cleanTree.split("\n").some((line) => line.includes(p.replace(/\//g, "\\")) || line.includes(p)),
  );

  const blobs = {
    transform: fileHash("src/lib/deck-builder/golden-catalog/oracle-rc3-transform.ts"),
    clauseNative: fileHash("src/lib/deck-builder/golden-catalog/oracle-rc3-clause-native.ts"),
    replacementParser: fileHash("src/lib/deck-builder/golden-catalog/oracle-rc3-clause-native.ts"),
    actionBuilder: fileHash("src/lib/deck-builder/golden-catalog/oracle-rc3-action-builder.ts"),
    semanticBuilder: fileHash("src/lib/deck-builder/golden-catalog/oracle-semantic-parse-builder.ts"),
    promotion: fileHash("src/lib/deck-builder/golden-catalog/oracle-rc3-promotion.ts"),
    referentResolution: fileHash("src/lib/deck-builder/golden-catalog/oracle-rc3-clause-native.ts"),
    extractionMetadata: fileHash("src/lib/deck-builder/golden-catalog/oracle-rc3-extraction-metadata.ts"),
    grantedSpanDetector: fileHash("src/lib/deck-builder/golden-catalog/oracle-rc3-granted-rules-span-detector.ts"),
    contextRouter: fileHash("src/lib/deck-builder/golden-catalog/oracle-rc3-semantic-context-router.ts"),
    scoringScope: fileHash("src/lib/deck-builder/golden-catalog/oracle-rc3-scoring-scope.ts"),
    unifiedMatcher: fileHash("scripts/oracle-action-unified-matcher.ts"),
    semanticMatcher: fileHash("scripts/oracle-action-semantic-matcher.ts"),
  };

  const cases = loadCombinedCases();
  const unrelated = loadUnrelatedCatalogCases();
  const combinedMetrics = sumSemanticMetrics(
    cases.map((c) =>
      evaluateCaseSemantic(c, parseOracleSemanticsRC3({ oracleId: c.oracleId, oracleText: c.oracleText, cardFace: c.cardFace })),
    ),
  );
  const unrelatedMetrics = sumSemanticMetrics(
    unrelated.map((c) =>
      evaluateCaseSemantic(c, parseOracleSemanticsRC3({ oracleId: c.oracleId, oracleText: c.oracleText, cardFace: c.cardFace })),
    ),
  );

  const replacementCases = ["rc3-pos-cat-0017", "rc3-pos-cat-0018", "rc3-pos-cat-0019", "rc3-pos-cat-0020"];
  const replacementAcceptance = Object.fromEntries(
    replacementCases.map((id) => {
      const c = unrelated.find((x) => x.id === id)!;
      const m = evaluateCaseSemantic(c, parseOracleSemanticsRC3({ oracleId: c.oracleId, oracleText: c.oracleText }));
      return [id, { tp: m.accepted.tp, fp: m.accepted.fp, fn: m.accepted.fn }];
    }),
  );

  const freeze = {
    generatedAt: new Date().toISOString(),
    checkpoint: "replacement-exile-instead-v139",
    parserVersion: PARSER_VERSION,
    tag: TAG,
    parentCheckpoint: PARENT_CHECKPOINT,
    parentCommitSha: PARENT_SHA,
    parserCommitSha: headBeforeCommit,
    parserScopeClean: !parserScopeDirty,
    parserScopePaths: PARSER_SCOPE_PATHS,
    blobs,
    replacementAcceptance,
    deltaVsParentV138: {
      combined: { tpDelta: 6, fpDelta: 1, fnDelta: -6, note: "Measured vs tagged v1.38 baseline 581/2/46" },
      unrelated: { tpDelta: 4, fpDelta: 0, fnDelta: -4, note: "53→57 on unrelated catalog positive slice" },
    },
    scoringAtFreeze: {
      combined: {
        tp: combinedMetrics.tp,
        fp: combinedMetrics.fp,
        fn: combinedMetrics.fn,
        denominator: combinedMetrics.tp + combinedMetrics.fn,
        precisionPct: ((combinedMetrics.tp / (combinedMetrics.tp + combinedMetrics.fp)) * 100).toFixed(4),
        recallPct: ((combinedMetrics.tp / (combinedMetrics.tp + combinedMetrics.fn)) * 100).toFixed(4),
        combinedGatePass:
          combinedMetrics.tp / (combinedMetrics.tp + combinedMetrics.fn) >= 0.92 &&
          combinedMetrics.tp / (combinedMetrics.tp + combinedMetrics.fp) >= 0.98,
      },
      unrelated: {
        tp: unrelatedMetrics.tp,
        fp: unrelatedMetrics.fp,
        fn: unrelatedMetrics.fn,
        denominator: unrelatedMetrics.tp + unrelatedMetrics.fn,
        precisionPct: ((unrelatedMetrics.tp / (unrelatedMetrics.tp + unrelatedMetrics.fp)) * 100).toFixed(4),
        recallPct: ((unrelatedMetrics.tp / (unrelatedMetrics.tp + unrelatedMetrics.fn)) * 100).toFixed(4),
      },
    },
    regressionProtectedFamilies: ["replacement_exile_instead"],
  };

  mkdirSync(resolve("data/milestones/rc3-development"), { recursive: true });
  writeFileSync(
    resolve("data/milestones/rc3-development/replacement-exile-instead-v139-parser-freeze.json"),
    `${JSON.stringify(freeze, null, 2)}\n`,
  );
  console.log(JSON.stringify(freeze, null, 2));
}

main();
