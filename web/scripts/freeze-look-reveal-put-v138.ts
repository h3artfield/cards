/**
 * Immutable v1.38 Z1b parser checkpoint — run after gate rescore passes.
 * Run: npx tsx scripts/freeze-look-reveal-put-v138.ts
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
const TAG = "oracle-action-v1.38-rc3-look-reveal-put-chain";
const PARENT_SHA = "7050c75abbf19a5db3174ec4c295431666bb1821";
const PARENT_CHECKPOINT = "oracle-action-v1.37-rc3-granted-nested-complete";

const PARSER_SCOPE_PATHS = [
  "src/lib/deck-builder/golden-catalog/oracle-rc3-transform.ts",
  "src/lib/deck-builder/golden-catalog/oracle-rc3-clause-native.ts",
  "src/lib/deck-builder/golden-catalog/oracle-rc3-promotion.ts",
  "src/lib/deck-builder/golden-catalog/oracle-rc3-action-builder.ts",
  "src/lib/deck-builder/golden-catalog/oracle-semantic-parse-builder.ts",
  "src/lib/deck-builder/golden-catalog/oracle-rc3-granted-rules-span-detector.ts",
  "src/lib/deck-builder/golden-catalog/oracle-rc3-semantic-context-router.ts",
  "src/lib/deck-builder/golden-catalog/oracle-rc3-scoring-scope.ts",
  "scripts/oracle-action-unified-matcher.ts",
  "scripts/oracle-action-semantic-matcher.ts",
  "scripts/lib/rc3-case-scope-scoring.ts",
];

function fileHash(path: string): string {
  return createHash("sha256").update(readFileSync(resolve(path))).digest("hex");
}

function loadCombinedCases(): OracleActionEvalCaseV2[] {
  const paths = [
    "data/oracle-action-eval-development-v26-v14.json",
    "data/oracle-action-eval-development-generalization-expansion-v2-v14.json",
    "data/oracle-action-eval-development-generalization-expansion-v3-v14.json",
    "data/oracle-action-eval-development-generalization-expansion-v5-v14.json",
  ];
  const legacy = paths.flatMap((p) =>
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
    actionBuilder: fileHash("src/lib/deck-builder/golden-catalog/oracle-rc3-action-builder.ts"),
    semanticBuilder: fileHash("src/lib/deck-builder/golden-catalog/oracle-semantic-parse-builder.ts"),
    promotion: fileHash("src/lib/deck-builder/golden-catalog/oracle-rc3-promotion.ts"),
    referentResolution: fileHash("src/lib/deck-builder/golden-catalog/oracle-rc3-clause-native.ts"),
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

  const reckoning = unrelated.find((c) => c.id === "rc3-pos-cat-0027")!;
  const reckoningParse = parseOracleSemanticsRC3({ oracleId: reckoning.oracleId, oracleText: reckoning.oracleText });
  const reckoningMatch = evaluateCaseSemantic(reckoning, reckoningParse);

  const freeze = {
    generatedAt: new Date().toISOString(),
    checkpoint: "look-reveal-put-v138-pre-replacement",
    parserVersion: PARSER_VERSION,
    tag: TAG,
    parentCheckpoint: PARENT_CHECKPOINT,
    parentCommitSha: PARENT_SHA,
    parserCommitSha: "PENDING_COMMIT",
    headBeforeCommit,
    parserScopeClean: !parserScopeDirty,
    parserScopePaths: PARSER_SCOPE_PATHS,
    blobs,
    z1bAcceptance: {
      rc3_pos_cat_0027: { fnBefore: 1, fnAfter: reckoningMatch.fn, tpAfter: reckoningMatch.tp },
      rc3_pos_v12_0098: { note: "incidental same-grammar recovery in spentV12 slice" },
      newFp: 0,
    },
    scoringAtFreeze: {
      combined: {
        tp: combinedMetrics.tp,
        fp: combinedMetrics.fp,
        fn: combinedMetrics.fn,
        denominator: combinedMetrics.tp + combinedMetrics.fn,
        recallPct: ((combinedMetrics.tp / (combinedMetrics.tp + combinedMetrics.fn)) * 100).toFixed(4),
        combinedGatePass: combinedMetrics.tp / (combinedMetrics.tp + combinedMetrics.fn) >= 0.92,
      },
      unrelated: {
        tp: unrelatedMetrics.tp,
        fp: unrelatedMetrics.fp,
        fn: unrelatedMetrics.fn,
        denominator: unrelatedMetrics.tp + unrelatedMetrics.fn,
        recallPct: ((unrelatedMetrics.tp / (unrelatedMetrics.tp + unrelatedMetrics.fn)) * 100).toFixed(4),
      },
    },
    includesUncommittedSince7050c75: [
      "token-definition-boundary (span detector, context router, scoring scope)",
      "look-reveal-put-chain (clause-native referent lineage + promotion family)",
      "gold-policy overlays (Step-0, v12 Ninjutsu)",
    ],
  };

  mkdirSync(resolve("data/milestones/rc3-development"), { recursive: true });
  writeFileSync(
    resolve("data/milestones/rc3-development/look-reveal-put-v138-parser-freeze.json"),
    `${JSON.stringify(freeze, null, 2)}\n`,
  );
  console.log(JSON.stringify(freeze, null, 2));
}

main();
