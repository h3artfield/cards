/**
 * Create development_set_v12 — v11 active cases + catalog-resolved formerly-unresolved cases.
 * Permanently excluded cases remain out of the active benchmark.
 * Run: npx tsx scripts/create-development-set-v12.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvLocal } from "./lib/script-env";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import { resolveNamedCardFromCatalog } from "./lib/eval-case-from-catalog";
import { relabelCaseGold, summarizeRelabelChanges, type GoldRelabelChange } from "./lib/gold-relabel-engine";
import { loadGoldenCatalogIndex, goldenFaceRecords } from "./lib/load-golden-catalog-index";
import type { CatalogEvalCase } from "./lib/eval-provenance-guard";
import {
  PERMANENTLY_EXCLUDED_DEV_CASES,
  RESOLVED_DEV_CASE_CATALOG_MAP,
} from "./lib/unresolved-dev-case-resolutions";
import { classifyInvalidPriorText } from "./lib/invalid-prior-text-classifier";
import { sanitizeGoldPrimitives } from "./lib/gold-sanitize";
import { computeContentHash, REVIEWER_ID, TAXONOMY_VERSION } from "./oracle-action-eval-shared";

loadEnvLocal();

const EVALUATION_SET_VERSION = "development-v12-catalog-gold-v1";

async function main() {
  const catalog = await loadGoldenCatalogIndex();
  const v11Path = resolve(process.cwd(), "data", "oracle-action-eval-development-v11.json");
  const v10Path = resolve(process.cwd(), "data", "oracle-action-eval-development-v10.json");
  const v12Path = resolve(process.cwd(), "data", "oracle-action-eval-development-v12.json");
  const diffPath = resolve(process.cwd(), "data", "oracle-action-eval-development-v12-diff.json");
  const excludedPath = resolve(process.cwd(), "data", "oracle-action-eval-excluded-dev-cases.json");
  const manifestPath = resolve(process.cwd(), "data", "oracle-action-eval-sets-manifest.json");

  const v11 = JSON.parse(readFileSync(v11Path, "utf8")) as {
    cases: CatalogEvalCase[];
    contentHash: string;
    unresolvedCaseIds: string[];
  };
  const v10 = JSON.parse(readFileSync(v10Path, "utf8")) as { cases: OracleActionEvalCaseV2[] };
  const reviewedAt = new Date().toISOString();
  const REVIEWER = REVIEWER_ID;

  const v12Cases: CatalogEvalCase[] = v11.cases.map((c) => ({
    ...c,
    evaluationSetVersion: EVALUATION_SET_VERSION,
    goldReviewStatus: undefined,
    identityStatus: undefined,
  }));

  const allChanges: Array<{ caseId: string; cardName?: string; changes: GoldRelabelChange[] }> = [];
  const resolvedIds: string[] = [];
  const resolutionErrors: Array<{ caseId: string; error: string }> = [];

  for (const resolution of RESOLVED_DEV_CASE_CATALOG_MAP) {
    const prior = v10.cases.find((c) => c.id === resolution.caseId);
    if (!prior) {
      resolutionErrors.push({ caseId: resolution.caseId, error: "not found in v10" });
      continue;
    }

    try {
      const identity = resolveNamedCardFromCatalog(
        catalog,
        {
          name: resolution.catalogCardName,
          face: resolution.cardFace,
          layout: prior.layout,
        },
        REVIEWER,
      );

      const golden = catalog.byOracleId.get(identity.oracleId)!;
      const faces = goldenFaceRecords(golden);
      const faceMeta = resolution.faceIndex !== undefined ? faces[resolution.faceIndex] : undefined;

      const base: CatalogEvalCase = {
        id: prior.id,
        category: prior.category,
        layout: identity.layout ?? prior.layout,
        oracleId: identity.oracleId,
        oracleText: identity.oracleText,
        cardName: identity.cardName,
        cardFace: resolution.cardFace ?? prior.cardFace,
        faceIndex: resolution.faceIndex ?? faceMeta?.faceIndex,
        faceName: resolution.faceName ?? faceMeta?.faceName,
        componentType: resolution.componentType,
        colorIdentity: identity.colorIdentity,
        goldenCatalogVersion: identity.goldenCatalogVersion,
        goldenOracleTextHash: identity.goldenOracleTextHash,
        taxonomyVersion: TAXONOMY_VERSION,
        evaluationSetVersion: EVALUATION_SET_VERSION,
        expectedPrimitiveActions: [],
        forbiddenPrimitiveActions: prior.forbiddenPrimitiveActions,
        expectedStructure: prior.expectedStructure,
        expectedConditions: prior.expectedConditions,
      };

      const { testCase, changes } = relabelCaseGold({
        baseCase: base,
        seedHint: resolution.seedHint,
        priorGold: prior.expectedPrimitiveActions,
        reviewer: REVIEWER,
        reviewedAt,
      });

      testCase.expectedPrimitiveActions = sanitizeGoldPrimitives(
        testCase.oracleText,
        testCase.expectedPrimitiveActions,
      );

      const invalidClass = classifyInvalidPriorText({
        caseId: testCase.id,
        oracleText: testCase.oracleText,
        cardFace: testCase.cardFace,
        changes,
        currentGold: testCase.expectedPrimitiveActions,
        expectedStructure: testCase.expectedStructure,
        forbiddenPrimitiveActions: testCase.forbiddenPrimitiveActions,
      });
      testCase.invalidPriorTextDisposition = invalidClass.disposition;

      allChanges.push({ caseId: testCase.id, cardName: testCase.cardName, changes });
      v12Cases.push(testCase);
      resolvedIds.push(resolution.caseId);
    } catch (err) {
      resolutionErrors.push({
        caseId: resolution.caseId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (resolutionErrors.length > 0) {
    console.error("Resolution errors:", resolutionErrors);
    throw new Error(`${resolutionErrors.length} cases failed catalog resolution`);
  }

  v12Cases.sort((a, b) => a.id.localeCompare(b.id));

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

  const v12Hash = computeContentHash(v12Cases);
  const v12 = {
    setClassification: "development_set_v12",
    evaluationVersion: EVALUATION_SET_VERSION,
    evaluationSetVersion: EVALUATION_SET_VERSION,
    contentHash: v12Hash,
    taxonomyVersion: TAXONOMY_VERSION,
    goldReviewVersion: null,
    goldenCatalogVersion: catalog.catalogVersion,
    caseCount: v12Cases.length,
    frozenAt: reviewedAt,
    benchmarkStatus: "catalog_clean",
    usableForParserEvaluation: false,
    usagePolicy:
      "Parser tuning blocked until second-pass gold review completes (goldReviewStatus=reviewed for all cases).",
    parentClassification: "development_set_v11",
    parentContentHash: v11.contentHash,
    parentSetPath: "data/oracle-action-eval-development-v11.json",
    reviewer: REVIEWER,
    reviewTimestamp: reviewedAt,
    goldRelabelStatistics: aggregate,
    resolvedFromV11Excluded: resolvedIds,
    permanentlyExcludedCaseIds: PERMANENTLY_EXCLUDED_DEV_CASES.map((e) => e.caseId),
    cases: v12Cases,
  };

  writeFileSync(v12Path, JSON.stringify(v12, null, 2), "utf8");
  writeFileSync(
    diffPath,
    JSON.stringify(
      {
        generatedAt: reviewedAt,
        parentDataset: "development_set_v11",
        parentContentHash: v11.contentHash,
        newDataset: "development_set_v12",
        newContentHash: v12Hash,
        resolvedCaseIds: resolvedIds,
        permanentlyExcluded: PERMANENTLY_EXCLUDED_DEV_CASES,
        resolutionErrors,
        newlyResolvedRelabelEntries: allChanges,
      },
      null,
      2,
    ),
    "utf8",
  );
  writeFileSync(
    excludedPath,
    JSON.stringify(
      {
        generatedAt: reviewedAt,
        excludedFromActiveBenchmark: PERMANENTLY_EXCLUDED_DEV_CASES,
        note: "These v10 cases have no catalogOracleCards representative and must not be counted in identity audit exact-match claims.",
      },
      null,
      2,
    ),
    "utf8",
  );

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
  manifest.developmentSet = {
    path: "data/oracle-action-eval-development-v12.json",
    classification: "development_set_v12",
    contentHash: v12Hash,
    caseCount: v12Cases.length,
    taxonomyVersion: TAXONOMY_VERSION,
    goldenCatalogVersion: catalog.catalogVersion,
    purpose: "Catalog-clean development set — pending second-pass gold review",
    diffManifest: "data/oracle-action-eval-development-v12-diff.json",
    excludedCasesManifest: "data/oracle-action-eval-excluded-dev-cases.json",
    benchmarkStatus: "catalog_clean",
    usableForParserEvaluation: false,
  };
  if (!manifest.benchmarkReconstruction) manifest.benchmarkReconstruction = {};
  (manifest.benchmarkReconstruction as Record<string, unknown>).developmentSetV12 = {
    resolvedCount: resolvedIds.length,
    permanentlyExcludedCount: PERMANENTLY_EXCLUDED_DEV_CASES.length,
  };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

  console.log("Created development_set_v12");
  console.log(`  hash: ${v12Hash}`);
  console.log(`  cases: ${v12Cases.length} (v11=${v11.cases.length} + resolved=${resolvedIds.length})`);
  console.log(`  permanently excluded: ${PERMANENTLY_EXCLUDED_DEV_CASES.length}`);
  console.log(`  usableForParserEvaluation: false (gold review pending)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
