/**
 * Post-Stage-C parser freeze + v137 semantic gold closure before first parser run.
 * parserExecutionCount must remain 0 until eval-granted-v137-transfer-run-1.ts completes.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { loadEnvLocal } from "./lib/script-env";
import { loadGoldenCatalogIndex, combinedGoldenOracleText, goldenOracleTextHash } from "./lib/load-golden-catalog-index";
import {
  assertAllBenchmarkIdentities,
  assertAllBenchmarkTargetValidities,
  type MachineGroundedBenchmarkTarget,
} from "./lib/benchmark-identity";
import {
  assertAllBenchmarkSemanticAdjudications,
  buildSemanticAdjudication,
  validateSemanticRoles,
} from "./lib/benchmark-semantic-adjudication";
import {
  collectRegionLinkedLayer2Records,
  dedupeSemanticGoldActions,
} from "./lib/granted-unique-layer2-gold";
import { ORACLE_ACTION_RC3_PARSER_VERSION } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import { loadAllGoldMigrationsV135 } from "./lib/rc3-gold-migration-v135";

loadEnvLocal();

type V137Case = {
  id: string;
  oracleId: string;
  oracleText: string;
  cardName: string;
  grammarFamily?: string;
  expectedContext: MachineGroundedBenchmarkTarget["expectedContext"];
  expansionLabel: string;
  category: string;
  caseScope?: string;
  goldCompletenessStatus?: string;
  benchmarkTargets: MachineGroundedBenchmarkTarget[];
  [key: string]: unknown;
};

function fileHash(path: string): string {
  if (!existsSync(resolve(path))) return "missing";
  return createHash("sha256").update(readFileSync(resolve(path))).digest("hex");
}

async function main() {
  const catalog = await loadGoldenCatalogIndex();
  const envelopePath = resolve("data/oracle-action-eval-granted-nested-stage-c-v137.json");
  const envelope = JSON.parse(readFileSync(envelopePath, "utf8")) as {
    cases: V137Case[];
    parserExecutionCount: number;
    contentHash?: string;
  };

  if (envelope.parserExecutionCount !== 0) {
    throw new Error(`v137 parserExecutionCount must be 0 before pre-run freeze (got ${envelope.parserExecutionCount})`);
  }

  const correctedCases: V137Case[] = [];
  const semanticRows: Array<ReturnType<typeof validateSemanticRoles>> = [];

  for (const c of envelope.cases) {
    const card = catalog.byOracleId.get(c.oracleId);
    if (!card) throw new Error(`Catalog miss for ${c.id} ${c.oracleId}`);
    const oracleText = combinedGoldenOracleText(card);
    const benchmarkTargets = c.benchmarkTargets.map((t) => ({
      ...t,
      semanticAdjudication: buildSemanticAdjudication(t, oracleText),
    }));

    for (const t of benchmarkTargets) {
      semanticRows.push(validateSemanticRoles(`${c.id}:region`, t, oracleText));
    }

    correctedCases.push({
      ...c,
      oracleText,
      goldenOracleTextHash: goldenOracleTextHash(oracleText),
      caseScope: c.caseScope ?? "full_card",
      goldCompletenessStatus: c.goldCompletenessStatus ?? "complete_within_scope",
      benchmarkTargets,
      selectionRule: benchmarkTargets[0]?.fullRegionSpan?.text ?? c.selectionRule,
      adjudicationStatus: "parser_blind_adjudicated",
      taxonomyVersion: "benchmark-validation-split-v1.1-semantic-gold",
    });
  }

  assertAllBenchmarkIdentities(catalog, correctedCases, "v137-pre-run-identity");
  assertAllBenchmarkTargetValidities(catalog, correctedCases, "v137-pre-run-target");
  assertAllBenchmarkSemanticAdjudications(correctedCases, "v137-pre-run-semantic");

  const rawRecords = collectRegionLinkedLayer2Records(correctedCases);
  const { uniqueSemanticActions, duplicateMembershipsCollapsed } = dedupeSemanticGoldActions(rawRecords);

  const positiveRegions = correctedCases
    .filter((c) => c.expectedContext === "genuine_granted")
    .flatMap((c) => c.benchmarkTargets);
  const certifiedEmptyL2 = positiveRegions.filter((t) => t.semanticAdjudication?.certifiedEmptyLayer2).length;

  const semanticGoldOnly = {
    generatedAt: new Date().toISOString(),
    checkpoint: "granted-nested-stage-c-v137-semantic-gold",
    uniqueLayer2GoldCount: uniqueSemanticActions.length,
    rawRegionLinkedLayer2Count: rawRecords.length,
    duplicateMembershipsCollapsed,
    uniqueSemanticActions,
    cases: correctedCases.map((c) => ({
      caseId: c.id,
      oracleId: c.oracleId,
      cardName: c.cardName,
      caseScope: c.caseScope,
      goldCompletenessStatus: c.goldCompletenessStatus,
      grammarFamily: c.grammarFamily,
      benchmarkTargets: c.benchmarkTargets,
    })),
  };
  const semanticGoldHash = createHash("sha256").update(JSON.stringify(semanticGoldOnly)).digest("hex");

  const updatedEnvelope = {
    ...envelope,
    generatedAt: new Date().toISOString(),
    taxonomyVersion: "benchmark-validation-split-v1.1-semantic-gold",
    parserVersion: ORACLE_ACTION_RC3_PARSER_VERSION,
    parserExecutionCount: 0,
    semanticGoldHash,
    uniqueLayer2GoldCount: uniqueSemanticActions.length,
    rawRegionLinkedLayer2Count: rawRecords.length,
    cases: correctedCases,
    contentHash: createHash("sha256").update(JSON.stringify(correctedCases)).digest("hex"),
  };

  writeFileSync(envelopePath, `${JSON.stringify(updatedEnvelope, null, 2)}\n`);
  writeFileSync(
    resolve("data/milestones/rc3-development/granted-v137-semantic-gold-freeze.json"),
    `${JSON.stringify({ ...semanticGoldOnly, semanticGoldHash }, null, 2)}\n`,
  );

  const gitRoot = execSync("git rev-parse --show-toplevel", { cwd: resolve("."), encoding: "utf8" }).trim();
  const commit = execSync("git rev-parse HEAD", { cwd: gitRoot, encoding: "utf8" }).trim();
  const cleanTreeFull = execSync("git status --porcelain", { cwd: gitRoot, encoding: "utf8" }).trim();
  const grantedPaths = [
    "web/src/lib/deck-builder/golden-catalog/oracle-rc3-transform.ts",
    "web/src/lib/deck-builder/golden-catalog/oracle-rc3-clause-native.ts",
    "web/data/oracle-action-eval-granted-nested-stage-c-v137.json",
  ];
  const grantedTreeDirty = grantedPaths.some((p) =>
    cleanTreeFull.split("\n").some((line) => line.includes(p.replace("web/", ""))),
  );

  const promotionBoundary = JSON.parse(
    readFileSync(resolve("data/milestones/rc3-development/granted-v137-promotion-boundary.json"), "utf8"),
  );

  const parserStateFreeze = {
    generatedAt: new Date().toISOString(),
    checkpoint: "oracle-action-v1.36-rc3-granted-nested-dev",
    tag: "oracle-action-v1.36-rc3-granted-nested-dev",
    parentRegionCompleteCommit: "96f4143561808dadd3403394634bd21e968e05e4",
    note: "Post-Stage-C structural repair — NOT the region-complete parser state",
    parserVersion: ORACLE_ACTION_RC3_PARSER_VERSION,
    parserCommitSha: commit,
    cleanTree: cleanTreeFull.length === 0,
    cleanTreeStatus: cleanTreeFull || "clean",
    grantedParserPathsClean: !grantedTreeDirty,
    blobs: {
      detector: fileHash("src/lib/deck-builder/golden-catalog/oracle-rc3-granted-rules-span-detector.ts"),
      classifier: fileHash("src/lib/deck-builder/golden-catalog/oracle-rc3-granted-rules-classifier.ts"),
      contextRouter: fileHash("src/lib/deck-builder/golden-catalog/oracle-rc3-semantic-context-router.ts"),
      clauseNative: fileHash("src/lib/deck-builder/golden-catalog/oracle-rc3-clause-native.ts"),
      transform: fileHash("src/lib/deck-builder/golden-catalog/oracle-rc3-transform.ts"),
      grantedExtraction: fileHash("src/lib/deck-builder/golden-catalog/oracle-granted-ability-extraction.ts"),
      abilityBlock: fileHash("src/lib/deck-builder/golden-catalog/oracle-rc3-ability-block.ts"),
      semanticMatcher: fileHash("scripts/oracle-action-semantic-matcher.ts"),
      unifiedMatcher: fileHash("scripts/oracle-action-unified-matcher.ts"),
      semanticDedupeImplementation: fileHash("src/lib/deck-builder/golden-catalog/oracle-rc3-clause-native.ts"),
    },
    policyOverlayHash: createHash("sha256").update(JSON.stringify(loadAllGoldMigrationsV135())).digest("hex"),
    benchmarkHash: updatedEnvelope.contentHash,
    semanticGoldHash,
    selectionManifestHash: fileHash("data/milestones/rc3-development/granted-nested-stage-c-v137-selection-manifest.json"),
    promotionBoundaryHash: fileHash("data/milestones/rc3-development/granted-v137-promotion-boundary.json"),
    parserExecutionCount: 0,
    uniqueLayer2GoldCount: uniqueSemanticActions.length,
    rawRegionLinkedLayer2Count: rawRecords.length,
  };

  mkdirSync(resolve("data/milestones/rc3-development"), { recursive: true });
  writeFileSync(
    resolve("data/milestones/rc3-development/granted-v137-parser-state-freeze.json"),
    `${JSON.stringify(parserStateFreeze, null, 2)}\n`,
  );

  const preRunReport = {
    generatedAt: new Date().toISOString(),
    checkpoint: "granted-v137-pre-run-closure",
    promotionBoundary,
    semanticAdjudication: {
      pass: semanticRows.filter((r) => r.status === "valid").length,
      total: semanticRows.length,
      label: `${semanticRows.filter((r) => r.status === "valid").length}/${semanticRows.length} PASS`,
    },
    uniqueLayer2Gold: {
      rawRegionLinkedRecords: rawRecords.length,
      uniqueSemanticActions: uniqueSemanticActions.length,
      duplicateMembershipsCollapsed,
      certifiedEmptyLayer2Count: certifiedEmptyL2,
    },
    caseMetadata: correctedCases.map((c) => ({
      caseId: c.id,
      cardName: c.cardName,
      caseScope: c.caseScope,
      goldCompletenessStatus: c.goldCompletenessStatus,
      certifiedEmptyLayer2: c.benchmarkTargets[0]?.semanticAdjudication?.certifiedEmptyLayer2 ?? false,
      abilityFamily: c.benchmarkTargets[0]?.semanticAdjudication?.layer1Structure?.abilityType,
    })),
    threeGates: {
      assertBenchmarkIdentity: "PASS",
      assertBenchmarkTargetValidity: "PASS",
      assertBenchmarkSemanticAdjudication: "PASS",
    },
    parserStateFreeze,
    parserExecutionCount: 0,
    authorizedNextStep: "single v137 transfer evaluation run (eval-granted-v137-transfer-run-1.ts)",
  };

  writeFileSync(
    resolve("data/milestones/rc3-development/granted-v137-pre-run-closure-report.json"),
    `${JSON.stringify(preRunReport, null, 2)}\n`,
  );

  console.log(JSON.stringify(preRunReport, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
