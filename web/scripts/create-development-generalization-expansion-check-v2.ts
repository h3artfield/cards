/**
 * Create sealed expansion-check-v2 holdout (~22 cases).
 * Run: npx tsx scripts/create-development-generalization-expansion-check-v2.ts
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
  EXPANSION_CHECK_V2_COUNT,
  EXPANSION_CHECK_V2_SEEDS,
} from "./development-generalization-expansion-check-v2-seeds";
import { assertNoOracleIdOverlap, loadExcludedOracleIds } from "./lib/benchmark-oracle-id-exclusions";

loadEnvLocal();

const TAXONOMY_VERSION = "three-layer-v1.3";
const REVIEWER = "expansion-check-v2-selector";
const CERTIFIER = "development-generalization-expansion-check-v2-builder";

function buildCase(seed: (typeof EXPANSION_CHECK_V2_SEEDS)[number], index: number): OracleActionEvalCaseV2 {
  const id = `dev-exp-chk-v2-${String(index + 1).padStart(3, "0")}`;
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
      family: seed.stratum,
      split: "expansion-check-v2",
      selectionRule: seed.selectionRule,
      layer1Notes: `Check v2 stratum: ${seed.stratum}`,
      manualReviewConfirmed: seed.manualReviewConfirmed,
    },
  } as OracleActionEvalCaseV2;
}

async function main() {
  const catalog = await loadGoldenCatalogIndex();
  const excluded = loadExcludedOracleIds();
  const reviewedAt = new Date().toISOString();
  const cases: CatalogEvalCase[] = [];

  for (let i = 0; i < EXPANSION_CHECK_V2_SEEDS.length; i++) {
    const seed = EXPANSION_CHECK_V2_SEEDS[i];
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
      evaluationSetVersion: "development-generalization-expansion-check-v2",
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

  assertNoOracleIdOverlap(cases, excluded, "development_generalization_expansion_check_v2");

  const stratumCounts = Object.fromEntries(
    [...new Set(EXPANSION_CHECK_V2_SEEDS.map((s) => s.stratum))].map((s) => [
      s,
      EXPANSION_CHECK_V2_SEEDS.filter((x) => x.stratum === s).length,
    ]),
  );

  const envelope: EvalDatasetEnvelope & { cases: CatalogEvalCase[]; checkHoldout: Record<string, unknown> } = {
    setClassification: "development_generalization_expansion_check_v2",
    evaluationSetVersion: "development-generalization-expansion-check-v2",
    taxonomyVersion: TAXONOMY_VERSION,
    contentHash: "",
    cases,
    benchmarkStatus: "catalog_clean",
    usableForParserEvaluation: true,
    parserExecutionCount: 0,
    sealed: true,
    checkHoldout: {
      sealed: true,
      parserExecutionCount: 0,
      selectedBeforeParserTuning: true,
      frozenAt: reviewedAt,
      stratumCounts,
      caseCount: EXPANSION_CHECK_V2_COUNT,
    },
    goldCertification: {
      certifierId: CERTIFIER,
      certifiedAt: reviewedAt,
      casesReviewed: `${cases.length}/${cases.length}`,
      reviewer: REVIEWER,
      goldReviewStatus: "reviewed",
      goldCompletenessStatus: "complete",
      parserExecutionCount: 0,
      policyNote: "Fresh sealed check after expansion-check-v1 spent. Do not tune against before milestone gate.",
    },
  };
  envelope.contentHash = computeDatasetContentHash(envelope.cases);

  const outPath = resolve(process.cwd(), "data/oracle-action-eval-development-generalization-expansion-check-v2.json");
  writeFileSync(outPath, `${JSON.stringify(envelope, null, 2)}\n`, "utf8");

  const freezeDir = resolve(process.cwd(), "data/milestones/rc2-development-planning");
  mkdirSync(freezeDir, { recursive: true });
  writeFileSync(
    resolve(freezeDir, "expansion-check-v2-selection.json"),
    `${JSON.stringify(
      {
        setClassification: "development_generalization_expansion_check_v2",
        contentHash: envelope.contentHash,
        caseCount: cases.length,
        sealed: true,
        parserExecutionCount: 0,
        stratumCounts,
        oracleIds: cases.map((c) => c.oracleId),
        caseIds: cases.map((c) => c.id),
        overlapCheck: "passed",
        frozenAt: reviewedAt,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  console.log(
    JSON.stringify(
      { outPath, contentHash: envelope.contentHash, caseCount: cases.length, stratumCounts },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
