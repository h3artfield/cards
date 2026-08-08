/**
 * Create development_generalization_expansion_v5 training set (v1.27 structural families).
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
  DEV_GENERALIZATION_EXPANSION_V5_SEEDS,
  EXPANSION_V5_TRAINING_COUNT,
} from "./development-generalization-expansion-v5-seeds";
import { assertNoOracleIdOverlap, loadExcludedOracleIds } from "./lib/benchmark-oracle-id-exclusions";

loadEnvLocal();

const TAXONOMY_VERSION = "three-layer-v1.3";
const REVIEWER = "expansion-v5-structural-miner";
const CERTIFIER = "development-generalization-expansion-v5-builder";

async function main() {
  const catalog = await loadGoldenCatalogIndex();
  const excluded = loadExcludedOracleIds(process.cwd(), [
    "data/oracle-action-eval-development-generalization-expansion-v5.json",
  ]);
  const reviewedAt = new Date().toISOString();
  const cases: CatalogEvalCase[] = [];

  for (let i = 0; i < DEV_GENERALIZATION_EXPANSION_V5_SEEDS.length; i++) {
    const seed = DEV_GENERALIZATION_EXPANSION_V5_SEEDS[i];
    const id = `dev-exp-v5-${String(i + 1).padStart(3, "0")}`;
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
        family: seed.family,
        split: "expansion-training-v5",
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
      evaluationSetVersion: "development-generalization-expansion-v5",
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

  assertNoOracleIdOverlap(cases, excluded, "development_generalization_expansion_v5");

  const envelope: EvalDatasetEnvelope & { cases: CatalogEvalCase[] } = {
    setClassification: "development_generalization_expansion_v5",
    evaluationSetVersion: "development-generalization-expansion-v5",
    taxonomyVersion: TAXONOMY_VERSION,
    contentHash: "",
    cases,
    benchmarkStatus: "catalog_clean",
    usableForParserEvaluation: true,
    parserExecutionCount: 0,
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
  const outPath = resolve(process.cwd(), "data/oracle-action-eval-development-generalization-expansion-v5.json");
  writeFileSync(outPath, `${JSON.stringify(envelope, null, 2)}\n`, "utf8");
  mkdirSync(resolve(process.cwd(), "data/milestones/rc2-development-planning"), { recursive: true });
  writeFileSync(
    resolve(process.cwd(), "data/milestones/rc2-development-planning/expansion-v5-training-selection.json"),
    `${JSON.stringify({ caseCount: cases.length, contentHash: envelope.contentHash }, null, 2)}\n`,
    "utf8",
  );
  console.log(JSON.stringify({ outPath, caseCount: EXPANSION_V5_TRAINING_COUNT, contentHash: envelope.contentHash }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
