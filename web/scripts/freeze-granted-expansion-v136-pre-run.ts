/**
 * Freeze v136 semantic gold + parser execution provenance before first parser run.
 * parserExecutionCount must remain 0 until this script completes successfully.
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
  CONTEXT_CONTROL_ROUTING_GOLD,
  validateSemanticRoles,
} from "./lib/benchmark-semantic-adjudication";
import {
  extractGrammarFamilyTargets,
  extractContextControlTarget,
  type GrammarFamily,
  type ContextControlKind,
} from "./lib/granted-grammar-family-query";
import { ORACLE_ACTION_RC3_PARSER_VERSION } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import { loadAllGoldMigrationsV135 } from "./lib/rc3-gold-migration-v135";

loadEnvLocal();

type V136Case = {
  id: string;
  oracleId: string;
  oracleText: string;
  cardName: string;
  grammarFamily?: GrammarFamily;
  expectedContext: MachineGroundedBenchmarkTarget["expectedContext"];
  expansionLabel: string;
  category: string;
  benchmarkTargets: MachineGroundedBenchmarkTarget[];
  contextControlKind?: ContextControlKind;
  [key: string]: unknown;
};

function fileHash(path: string): string {
  if (!existsSync(resolve(path))) return "missing";
  return createHash("sha256").update(readFileSync(resolve(path))).digest("hex");
}

function refreshPositiveTargets(c: V136Case, oracleText: string): MachineGroundedBenchmarkTarget[] {
  if (!c.grammarFamily) return c.benchmarkTargets;
  const extracted = extractGrammarFamilyTargets(oracleText, c.grammarFamily);
  return extracted.map((t) => ({
    ...t,
    semanticAdjudication: buildSemanticAdjudication(t, oracleText),
  }));
}

function refreshContextTarget(c: V136Case, oracleText: string, kind: ContextControlKind): MachineGroundedBenchmarkTarget[] {
  const t = extractContextControlTarget(oracleText, kind);
  return t ? [t] : c.benchmarkTargets;
}

function inferContextKind(c: V136Case): ContextControlKind | undefined {
  if (c.category.includes("token_definition")) return "token_definition";
  if (c.category.includes("source_owned_reference")) return "source_owned_reference";
  if (c.category.includes("created_object_capability")) return "created_object_capability";
  if (c.category.includes("reminder_only")) return "reminder_only";
  if (c.category.includes("hard_negative_surface")) return "hard_negative_surface";
  return undefined;
}

async function main() {
  const catalog = await loadGoldenCatalogIndex();
  const envelope = JSON.parse(
    readFileSync(resolve("data/oracle-action-eval-granted-classifier-expansion-v136.json"), "utf8"),
  ) as { cases: V136Case[]; contentHash: string };
  const manifest = JSON.parse(
    readFileSync(resolve("data/milestones/rc3-development/granted-expansion-v136-selection-manifest.json"), "utf8"),
  );

  const correctedCases: V136Case[] = [];
  const coordinatedPredicateCorrections: Array<{ caseId: string; cardName: string; before: string; after: string }> = [];
  const semanticRows: Array<ReturnType<typeof validateSemanticRoles>> = [];

  for (const c of envelope.cases) {
    const card = catalog.byOracleId.get(c.oracleId);
    const oracleText = card ? combinedGoldenOracleText(card) : c.oracleText;
    let benchmarkTargets = c.benchmarkTargets;

    if (c.expectedContext === "genuine_granted" && c.grammarFamily) {
      const oldRecipient = c.benchmarkTargets[0]?.recipientSpan?.text;
      benchmarkTargets = refreshPositiveTargets(c, oracleText);
      const newRecipient = benchmarkTargets[0]?.recipientSpan?.text;
      if (oldRecipient && newRecipient && oldRecipient !== newRecipient) {
        coordinatedPredicateCorrections.push({
          caseId: c.id,
          cardName: c.cardName,
          before: oldRecipient,
          after: newRecipient,
        });
      }
      for (const t of benchmarkTargets) {
        semanticRows.push(validateSemanticRoles(t, oracleText));
        t.semanticAdjudication = buildSemanticAdjudication(t, oracleText);
      }
    } else {
      const kind = inferContextKind(c);
      if (kind) {
        benchmarkTargets = refreshContextTarget(c, oracleText, kind);
        c.contextControlKind = kind;
        c.contextRoutingGold = CONTEXT_CONTROL_ROUTING_GOLD[kind];
      }
    }

    correctedCases.push({
      ...c,
      oracleText,
      goldenOracleTextHash: goldenOracleTextHash(oracleText),
      benchmarkTargets,
      selectionRule: benchmarkTargets[0]?.fullRegionSpan?.text ?? c.selectionRule,
      adjudicationStatus: "parser_blind_adjudicated",
      taxonomyVersion: "benchmark-validation-split-v1.1-semantic-gold",
    });
  }

  assertAllBenchmarkIdentities(catalog, correctedCases, "v136-pre-run-identity");
  assertAllBenchmarkTargetValidities(catalog, correctedCases, "v136-pre-run-target");
  assertAllBenchmarkSemanticAdjudications(correctedCases, "v136-pre-run-semantic");

  const positiveRegions = correctedCases
    .filter((c) => c.expectedContext === "genuine_granted")
    .flatMap((c) => c.benchmarkTargets);
  const layer1Count = positiveRegions.length;
  const layer2Count = positiveRegions.reduce((n, t) => n + (t.semanticAdjudication?.layer2Gold.length ?? 0), 0);
  const certifiedEmptyL2 = positiveRegions.filter((t) => t.semanticAdjudication?.certifiedEmptyLayer2).length;

  const semanticGoldOnly = correctedCases.map((c) => ({
    caseId: c.id,
    oracleId: c.oracleId,
    cardName: c.cardName,
    expectedContext: c.expectedContext,
    grammarFamily: c.grammarFamily,
    contextRoutingGold: (c as { contextRoutingGold?: unknown }).contextRoutingGold,
    benchmarkTargets: c.benchmarkTargets,
  }));

  const semanticGoldHash = createHash("sha256").update(JSON.stringify(semanticGoldOnly)).digest("hex");

  const updatedEnvelope = {
    ...envelope,
    generatedAt: new Date().toISOString(),
    taxonomyVersion: "benchmark-validation-split-v1.1-semantic-gold",
    parserExecutionCount: 0,
    semanticGoldHash,
    cases: correctedCases,
    contentHash: createHash("sha256").update(JSON.stringify(correctedCases)).digest("hex"),
  };

  writeFileSync(
    resolve("data/oracle-action-eval-granted-classifier-expansion-v136.json"),
    `${JSON.stringify(updatedEnvelope, null, 2)}\n`,
  );
  writeFileSync(
    resolve("data/milestones/rc3-development/granted-expansion-v136-semantic-gold.json"),
    `${JSON.stringify({ generatedAt: new Date().toISOString(), semanticGoldHash, cases: semanticGoldOnly }, null, 2)}\n`,
  );

  const gitRoot = execSync("git rev-parse --show-toplevel", { cwd: resolve("."), encoding: "utf8" }).trim();
  const commit = execSync("git rev-parse HEAD", { cwd: gitRoot, encoding: "utf8" }).trim();
  const cleanTree = execSync("git status --porcelain", { cwd: gitRoot, encoding: "utf8" }).trim();

  const parserStateFreeze = {
    generatedAt: new Date().toISOString(),
    parserVersion: ORACLE_ACTION_RC3_PARSER_VERSION,
    parserCommitSha: commit,
    cleanTree: cleanTree.length === 0,
    cleanTreeStatus: cleanTree || "clean",
    blobs: {
      transform: fileHash("src/lib/deck-builder/golden-catalog/oracle-rc3-transform.ts"),
      clauseNative: fileHash("src/lib/deck-builder/golden-catalog/oracle-rc3-clause-native.ts"),
      contextRouter: fileHash("src/lib/deck-builder/golden-catalog/oracle-rc3-semantic-context-router.ts"),
      semanticMatcher: fileHash("scripts/oracle-action-semantic-matcher.ts"),
      unifiedMatcher: fileHash("scripts/oracle-action-unified-matcher.ts"),
      benchmarkIdentity: fileHash("scripts/lib/benchmark-identity.ts"),
      benchmarkSemanticAdjudication: fileHash("scripts/lib/benchmark-semantic-adjudication.ts"),
      grammarFamilyQuery: fileHash("scripts/lib/granted-grammar-family-query.ts"),
    },
    policyOverlayHash: createHash("sha256").update(JSON.stringify(loadAllGoldMigrationsV135())).digest("hex"),
    benchmarkHash: updatedEnvelope.contentHash,
    semanticGoldHash,
    selectionManifestHash: createHash("sha256")
      .update(readFileSync(resolve("data/milestones/rc3-development/granted-expansion-v136-selection-manifest.json")))
      .digest("hex"),
    negativeControlsHash: fileHash("data/oracle-action-eval-granted-negative-controls-v135.json"),
    parserExecutionCount: 0,
  };

  mkdirSync(resolve("data/milestones/rc3-development"), { recursive: true });
  writeFileSync(
    resolve("data/milestones/rc3-development/granted-v136-parser-state-freeze.json"),
    `${JSON.stringify(parserStateFreeze, null, 2)}\n`,
  );

  const preRunReport = {
    generatedAt: new Date().toISOString(),
    checkpoint: "granted-v136-pre-run-closure",
    semanticAdjudication: {
      positiveRegions: positiveRegions.length,
      pass: semanticRows.filter((r) => r.status === "valid").length,
      total: semanticRows.length,
      label: `${semanticRows.filter((r) => r.status === "valid").length}/${semanticRows.length} PASS`,
    },
    coordinatedPredicateAudit: {
      correctedCaseCount: coordinatedPredicateCorrections.length,
      corrections: coordinatedPredicateCorrections,
    },
    stageCGold: {
      layer1GoldRegionCount: layer1Count,
      layer2GoldActionCount: layer2Count,
      certifiedEmptyLayer2Count: certifiedEmptyL2,
    },
    contextControls: Object.entries(CONTEXT_CONTROL_ROUTING_GOLD).map(([kind, gold]) => ({
      kind,
      ...gold,
      frozenCase: correctedCases.find((c) => c.category.includes(kind))?.id,
    })),
    threeGates: {
      assertBenchmarkIdentity: "PASS",
      assertBenchmarkTargetValidity: "PASS",
      assertBenchmarkSemanticAdjudication: "PASS",
    },
    parserStateFreeze,
    parserExecutionCount: 0,
    authorizedNextStep: "single v136 transfer evaluation run",
  };

  writeFileSync(
    resolve("data/milestones/rc3-development/granted-v136-pre-run-closure-report.json"),
    `${JSON.stringify(preRunReport, null, 2)}\n`,
  );

  console.log(JSON.stringify(preRunReport, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
