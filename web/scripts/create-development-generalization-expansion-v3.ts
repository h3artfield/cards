/**
 * Create development_generalization_expansion_v3 training set.
 * Run: npx tsx scripts/create-development-generalization-expansion-v3.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvLocal } from "./lib/script-env";
import { loadGoldenCatalogIndex } from "./lib/load-golden-catalog-index";
import {
  assertEvidenceInOracleText,
  attachCatalogProvenance,
  resolveNamedCardFromCatalog,
} from "./lib/eval-case-from-catalog";
import {
  computeDatasetContentHash,
  type CatalogEvalCase,
  type EvalDatasetEnvelope,
} from "./lib/eval-provenance-guard";
import { inferDerivedRoles } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import {
  DEV_GENERALIZATION_EXPANSION_V3_SEEDS,
  EXPANSION_V3_TRAINING_COUNT,
} from "./development-generalization-expansion-v3-seeds";
import { assertNoOracleIdOverlap, loadExcludedOracleIds } from "./lib/benchmark-oracle-id-exclusions";

loadEnvLocal();

const TAXONOMY_VERSION = "three-layer-v1.3";
const REVIEWER = "expansion-v3-family-miner";
const CERTIFIER = "development-generalization-expansion-v3-builder";

function buildCase(seed: (typeof DEV_GENERALIZATION_EXPANSION_V3_SEEDS)[number], index: number): OracleActionEvalCaseV2 {
  const id = `dev-exp-v3-${String(index + 1).padStart(3, "0")}`;
  const primitives = seed.primitives.map((p) => ({
    actionType: p.actionType,
    evidenceContains: p.evidenceContains,
    cardFace: p.cardFace ?? seed.face,
    optional: p.optional,
    optionalEffect: p.optionalEffect,
    loyaltyCost: p.loyaltyCost,
  }));

  return {
    id,
    category: seed.category,
    layout: seed.layout,
    cardFace: seed.face,
    oracleId: "",
    oracleText: "",
    expectedStructure: seed.structure,
    expectedPrimitiveActions: primitives,
    forbiddenPrimitiveActions: seed.forbidden,
    expectedRoles: inferDerivedRoles(primitives.map((p) => p.actionType)).map((role) => ({
      role,
      fromPrimitiveActions: primitives.map((p) => p.actionType),
    })),
    expansionMetadata: {
      family: seed.family,
      split: "expansion-training-v3",
      selectionRule: seed.selectionRule,
      layer1Notes: `Family training v3: ${seed.family}`,
      manualReviewConfirmed: seed.manualReviewConfirmed,
    },
  } as OracleActionEvalCaseV2;
}

async function main() {
  const catalog = await loadGoldenCatalogIndex();
  const excluded = loadExcludedOracleIds(process.cwd(), [
    "data/oracle-action-eval-development-generalization-expansion-v3.json",
  ]);
  const reviewedAt = new Date().toISOString();
  const cases: CatalogEvalCase[] = [];

  for (let i = 0; i < DEV_GENERALIZATION_EXPANSION_V3_SEEDS.length; i++) {
    const seed = DEV_GENERALIZATION_EXPANSION_V3_SEEDS[i];
    let testCase = buildCase(seed, i);
    const identity = resolveNamedCardFromCatalog(catalog, seed, REVIEWER);
    const evidenceCorpus =
      seed.face && identity.oracleText.includes("\n//\n")
        ? identity.oracleText.split("\n//\n")[seed.face === "back" ? 1 : 0] ?? identity.oracleText
        : identity.oracleText;

    for (const p of seed.primitives) {
      assertEvidenceInOracleText(
        p.cardFace && identity.oracleText.includes("\n//\n")
          ? identity.oracleText.split("\n//\n")[p.cardFace === "back" ? 1 : 0] ?? identity.oracleText
          : evidenceCorpus,
        p.evidenceContains,
        `${testCase.id}/${seed.name}`,
      );
    }

    testCase = attachCatalogProvenance(testCase, identity) as CatalogEvalCase;
    testCase = {
      ...testCase,
      taxonomyVersion: TAXONOMY_VERSION,
      evaluationSetVersion: "development-generalization-expansion-v3",
      goldReviewVersion: CERTIFIER,
      goldReviewedAt: reviewedAt,
      goldReviewer: REVIEWER,
      goldReviewStatus: "reviewed",
      goldCompletenessStatus: "complete",
      identityStatus: "catalog_exact",
      reviewer: REVIEWER,
    };
    cases.push(testCase);
  }

  assertNoOracleIdOverlap(cases, excluded, "development_generalization_expansion_v3");

  const envelope: EvalDatasetEnvelope & { cases: CatalogEvalCase[]; expansionSplit: Record<string, unknown> } = {
    setClassification: "development_generalization_expansion_v3",
    evaluationSetVersion: "development-generalization-expansion-v3",
    taxonomyVersion: TAXONOMY_VERSION,
    contentHash: "",
    cases,
    benchmarkStatus: "catalog_clean",
    usableForParserEvaluation: true,
    parserExecutionCount: 0,
    expansionSplit: {
      trainingCount: EXPANSION_V3_TRAINING_COUNT,
      trainingOnly: true,
      parentSets: [
        "development_generalization_expansion_v1",
        "development_generalization_expansion_v2",
      ],
      familyCounts: Object.fromEntries(
        [...new Set(DEV_GENERALIZATION_EXPANSION_V3_SEEDS.map((s) => s.family))].map((f) => [
          f,
          DEV_GENERALIZATION_EXPANSION_V3_SEEDS.filter((s) => s.family === f).length,
        ]),
      ),
    },
    goldCertification: {
      certifierId: CERTIFIER,
      certifiedAt: reviewedAt,
      casesReviewed: `${cases.length}/${cases.length}`,
      reviewer: REVIEWER,
      goldReviewStatus: "reviewed",
      goldCompletenessStatus: "complete",
      parserExecutionCount: 0,
      policyNote: "Family-level training mined after expansion-check-v1 milestone #2 diagnosis.",
    },
  };
  envelope.contentHash = computeDatasetContentHash(envelope.cases);

  const outPath = resolve(process.cwd(), "data/oracle-action-eval-development-generalization-expansion-v3.json");
  writeFileSync(outPath, `${JSON.stringify(envelope, null, 2)}\n`, "utf8");

  const freezeDir = resolve(process.cwd(), "data/milestones/rc2-development-planning");
  mkdirSync(freezeDir, { recursive: true });
  writeFileSync(
    resolve(freezeDir, "expansion-v3-training-selection.json"),
    `${JSON.stringify(
      {
        setClassification: "development_generalization_expansion_v3",
        contentHash: envelope.contentHash,
        caseCount: cases.length,
        oracleIds: cases.map((c) => c.oracleId),
        familyCounts: envelope.expansionSplit.familyCounts,
        selectionRules: DEV_GENERALIZATION_EXPANSION_V3_SEEDS.map((s) => ({
          family: s.family,
          name: s.name,
          selectionRule: s.selectionRule,
        })),
        frozenAt: reviewedAt,
        parserExecutionCount: 0,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  console.log(JSON.stringify({ outPath, contentHash: envelope.contentHash, caseCount: cases.length }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
