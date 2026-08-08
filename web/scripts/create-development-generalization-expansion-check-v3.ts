/**
 * Create sealed expansion-check-v3 holdout.
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
  EXPANSION_CHECK_V3_COUNT,
  EXPANSION_CHECK_V3_SEEDS,
} from "./development-generalization-expansion-check-v3-seeds";
import { assertNoOracleIdOverlap, loadExcludedOracleIds } from "./lib/benchmark-oracle-id-exclusions";

loadEnvLocal();

const TAXONOMY_VERSION = "three-layer-v1.3";
const REVIEWER = "expansion-check-v3-selector";
const CERTIFIER = "development-generalization-expansion-check-v3-builder";

async function main() {
  const catalog = await loadGoldenCatalogIndex();
  const excluded = loadExcludedOracleIds(process.cwd(), [
    "data/oracle-action-eval-development-generalization-expansion-check-v3.json",
  ]);
  const reviewedAt = new Date().toISOString();
  const cases: CatalogEvalCase[] = [];

  for (let i = 0; i < EXPANSION_CHECK_V3_SEEDS.length; i++) {
    const seed = EXPANSION_CHECK_V3_SEEDS[i];
    const id = `dev-exp-chk-v3-${String(i + 1).padStart(3, "0")}`;
    const primitives = seed.primitives.map((p) => ({ ...p, cardFace: p.cardFace ?? seed.face }));
    let testCase = {
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
        split: "expansion-check-v3",
        selectionRule: seed.selectionRule,
        manualReviewConfirmed: seed.manualReviewConfirmed,
      },
    } as OracleActionEvalCaseV2;
    const identity = resolveNamedCardFromCatalog(catalog, seed, REVIEWER);
    const corpus =
      seed.face && identity.oracleText.includes("\n//\n")
        ? identity.oracleText.split("\n//\n")[seed.face === "back" ? 1 : 0] ?? identity.oracleText
        : identity.oracleText;
    for (const p of seed.primitives) {
      assertEvidenceInOracleText(corpus, p.evidenceContains, `${testCase.id}/${seed.name}`);
    }
    testCase = attachCatalogProvenance(testCase, identity) as CatalogEvalCase;
    testCase = {
      ...testCase,
      taxonomyVersion: TAXONOMY_VERSION,
      evaluationSetVersion: "development-generalization-expansion-check-v3",
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

  assertNoOracleIdOverlap(cases, excluded, "development_generalization_expansion_check_v3");

  const stratumCounts = Object.fromEntries(
    [...new Set(EXPANSION_CHECK_V3_SEEDS.map((s) => s.stratum))].map((s) => [
      s,
      EXPANSION_CHECK_V3_SEEDS.filter((x) => x.stratum === s).length,
    ]),
  );

  const envelope: EvalDatasetEnvelope & { cases: CatalogEvalCase[]; checkHoldout: Record<string, unknown> } = {
    setClassification: "development_generalization_expansion_check_v3",
    evaluationSetVersion: "development-generalization-expansion-check-v3",
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
      caseCount: EXPANSION_CHECK_V3_COUNT,
    },
    goldCertification: {
      certifierId: CERTIFIER,
      certifiedAt: reviewedAt,
      casesReviewed: `${cases.length}/${cases.length}`,
      reviewer: REVIEWER,
      goldReviewStatus: "reviewed",
      goldCompletenessStatus: "complete",
      parserExecutionCount: 0,
    },
  };
  envelope.contentHash = computeDatasetContentHash(envelope.cases);
  const outPath = resolve(process.cwd(), "data/oracle-action-eval-development-generalization-expansion-check-v3.json");
  writeFileSync(outPath, `${JSON.stringify(envelope, null, 2)}\n`, "utf8");
  mkdirSync(resolve(process.cwd(), "data/milestones/rc2-development-planning"), { recursive: true });
  writeFileSync(
    resolve(process.cwd(), "data/milestones/rc2-development-planning/expansion-check-v3-selection.json"),
    `${JSON.stringify({ contentHash: envelope.contentHash, caseCount: cases.length, sealed: true, parserExecutionCount: 0, stratumCounts, overlapCheck: "passed" }, null, 2)}\n`,
    "utf8",
  );
  console.log(JSON.stringify({ outPath, caseCount: cases.length, stratumCounts }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
