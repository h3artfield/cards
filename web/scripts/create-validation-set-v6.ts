/**
 * Create validation_set_v6 — catalog identity + gold relabeled against oracle text.
 * Run: npx tsx scripts/create-validation-set-v6.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvLocal } from "./lib/script-env";
import { HELD_OUT_SEEDS } from "./generate-oracle-action-held-out-set";
import { buildHeldOutCases } from "./generate-oracle-action-held-out-set";
import { loadGoldenCatalogIndex } from "./lib/load-golden-catalog-index";
import { relabelCaseGold, summarizeRelabelChanges, type GoldRelabelChange } from "./lib/gold-relabel-engine";
import { PRODUCTION_GOLD_REVIEW_VERSION } from "./lib/eval-provenance-guard";
import type { CatalogEvalCase } from "./lib/eval-provenance-guard";
import { TAXONOMY_V12_VALIDATION_PATCHES } from "./create-validation-set-v4";
import { computeContentHash, REVIEWER_ID, TAXONOMY_VERSION } from "./oracle-action-eval-shared";

loadEnvLocal();

const V5_HASH = "82753542d712572d9093696d84b826852aad9f27c5a6165ade780e23c205cf81";
const REVIEWER = REVIEWER_ID;
const EVALUATION_SET_VERSION = "validation-v6-catalog-gold-v1";

async function main() {
  const catalog = await loadGoldenCatalogIndex();
  const v5Path = resolve(process.cwd(), "data", "oracle-action-eval-validation-v5.json");
  const v6Path = resolve(process.cwd(), "data", "oracle-action-eval-validation-v6.json");
  const diffPath = resolve(process.cwd(), "data", "oracle-action-eval-validation-v6-diff.json");
  const manifestPath = resolve(process.cwd(), "data", "oracle-action-eval-sets-manifest.json");

  const v5 = JSON.parse(readFileSync(v5Path, "utf8")) as {
    cases: CatalogEvalCase[];
    contentHash: string;
  };
  if (v5.contentHash !== V5_HASH) {
    throw new Error(`validation_set_v5 hash mismatch`);
  }

  const identityCases = buildHeldOutCases(catalog);
  const v5ById = new Map(v5.cases.map((c) => [c.id, c]));
  const reviewedAt = new Date().toISOString();
  const allChanges: Array<{ caseId: string; cardName?: string; changes: GoldRelabelChange[] }> = [];
  const v6Cases: CatalogEvalCase[] = [];

  for (let i = 0; i < identityCases.length; i++) {
    const id = `held-${String(i + 1).padStart(4, "0")}`;
    const identity = identityCases[i] as CatalogEvalCase;
    const prior = v5ById.get(id);
    const seed = HELD_OUT_SEEDS[i];
    const { testCase, changes } = relabelCaseGold({
      baseCase: {
        ...identity,
        taxonomyVersion: TAXONOMY_VERSION,
        evaluationSetVersion: EVALUATION_SET_VERSION,
      },
      seedHint: {
        primitives: seed.primitives,
        forbidden: seed.forbidden,
        structure: seed.structure,
        face: seed.face,
      },
      priorGold: prior?.expectedPrimitiveActions ?? [],
      reviewer: REVIEWER,
      reviewedAt,
    });
    allChanges.push({ caseId: id, cardName: testCase.cardName, changes });
    v6Cases.push(testCase);
  }

  for (const patch of TAXONOMY_V12_VALIDATION_PATCHES) {
    const idx = v6Cases.findIndex((c) => c.id === patch.caseId);
    if (idx >= 0) {
      const before = v6Cases[idx].expectedPrimitiveActions;
      v6Cases[idx] = patch.apply(v6Cases[idx]) as CatalogEvalCase;
      allChanges.push({
        caseId: patch.caseId,
        cardName: patch.cardName,
        changes: [
          {
            classification: "modified",
            field: "expectedPrimitiveActions",
            before,
            after: v6Cases[idx].expectedPrimitiveActions,
            reason: patch.reason,
          },
        ],
      });
    }
  }

  const aggregate = {
    confirmed: 0,
    modified: 0,
    removed: 0,
    newly_added: 0,
    layer1_instead_of_layer2: 0,
    invalid_prior_text: 0,
  };
  for (const entry of allChanges) {
    const counts = summarizeRelabelChanges(entry.changes);
    for (const k of Object.keys(counts) as Array<keyof typeof aggregate>) {
      aggregate[k] += counts[k];
    }
  }

  const v6Hash = computeContentHash(v6Cases);

  const v6 = {
    setClassification: "validation_set_v6",
    evaluationVersion: EVALUATION_SET_VERSION,
    evaluationSetVersion: EVALUATION_SET_VERSION,
    contentHash: v6Hash,
    taxonomyVersion: TAXONOMY_VERSION,
    goldReviewVersion: PRODUCTION_GOLD_REVIEW_VERSION,
    goldenCatalogVersion: catalog.catalogVersion,
    caseCount: v6Cases.length,
    frozenAt: reviewedAt,
    benchmarkStatus: "catalog_clean",
    usableForParserEvaluation: true,
    usagePolicy: "Validation milestone — catalog identity + gold relabeled against catalog oracle text.",
    parentClassification: "validation_set_v5",
    parentContentHash: V5_HASH,
    parentSetPath: "data/oracle-action-eval-validation-v5.json",
    reviewer: REVIEWER,
    reviewTimestamp: reviewedAt,
    goldRelabelStatistics: aggregate,
    cases: v6Cases,
  };

  writeFileSync(v6Path, JSON.stringify(v6, null, 2), "utf8");
  writeFileSync(
    diffPath,
    JSON.stringify(
      {
        generatedAt: reviewedAt,
        parentDataset: "validation_set_v5",
        parentContentHash: V5_HASH,
        newDataset: "validation_set_v6",
        newContentHash: v6Hash,
        goldReviewVersion: PRODUCTION_GOLD_REVIEW_VERSION,
        goldenCatalogVersion: catalog.catalogVersion,
        goldRelabelStatistics: aggregate,
        caseRelabelEntries: allChanges,
      },
      null,
      2,
    ),
    "utf8",
  );

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
  manifest.validationSetV5 = {
    path: "data/oracle-action-eval-validation-v5.json",
    classification: "validation_set_v5",
    contentHash: V5_HASH,
    benchmarkStatus: "invalid_identity",
    usableForParserEvaluation: false,
  };
  manifest.validationSet = {
    path: "data/oracle-action-eval-validation-v6.json",
    classification: "validation_set_v6",
    contentHash: v6Hash,
    caseCount: v6Cases.length,
    taxonomyVersion: TAXONOMY_VERSION,
    goldReviewVersion: PRODUCTION_GOLD_REVIEW_VERSION,
    goldenCatalogVersion: catalog.catalogVersion,
    purpose: "Catalog-clean validation with relabeled gold",
    parentVersion: {
      classification: "validation_set_v5",
      contentHash: V5_HASH,
      path: "data/oracle-action-eval-validation-v5.json",
    },
    diffManifest: "data/oracle-action-eval-validation-v6-diff.json",
    reviewer: REVIEWER,
    reviewTimestamp: reviewedAt,
    benchmarkStatus: "catalog_clean",
    usableForParserEvaluation: true,
  };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

  console.log("Created validation_set_v6");
  console.log(`  hash: ${v6Hash}`);
  console.log(`  gold relabel stats:`, aggregate);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
