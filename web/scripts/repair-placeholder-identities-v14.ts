/**
 * Repair placeholder (_____) identities → development_set_v14, re-gold from catalog.
 * Run: npx tsx scripts/repair-placeholder-identities-v14.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvLocal } from "./lib/script-env";
import {
  loadGoldenCatalogIndex,
  goldenFaceRecords,
  goldenOracleTextHash,
} from "./lib/load-golden-catalog-index";
import {
  computeDatasetContentHash,
  SECOND_PASS_GOLD_REVIEW_VERSION,
  type CatalogEvalCase,
  type EvalDatasetEnvelope,
} from "./lib/eval-provenance-guard";
import {
  buildCatalogResolverIndexes,
  resolveCatalogSeed,
  resolveByOracleTextEvidence,
  classifyUnresolvedSeed,
} from "./lib/catalog-resolver";
import { buildDevelopmentCardNameLookup } from "./lib/dev-case-card-name-lookup";
import { buildFullEvalCardNameLookup } from "./lib/eval-case-card-name-lookup";
import { relabelCaseGold } from "./lib/gold-relabel-engine";
import { derivePrimitivesFromOracleText } from "./lib/catalog-oracle-gold-completer";
import { NEW_MULTIFACE_CASES } from "./oracle-action-eval-multiface-cases";
import { sanitizeGoldPrimitives } from "./lib/gold-sanitize";
import { TAXONOMY_VERSION } from "./oracle-action-eval-shared";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import { inferDerivedRoles } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";

loadEnvLocal();

const PLACEHOLDER_ORACLE_ID = "4e536142-4ebe-4062-887b-5dd123c41d39";
const PLACEHOLDER_NAME = "_____";
const REPAIRER = "placeholder-identity-repair-v1";

function mergeLookups(): Map<string, string> {
  const lookup = buildFullEvalCardNameLookup();
  for (const [k, v] of buildDevelopmentCardNameLookup()) lookup.set(k, v);
  return lookup;
}

function isPlaceholder(c: CatalogEvalCase): boolean {
  return c.cardName === PLACEHOLDER_NAME || c.oracleId === PLACEHOLDER_ORACLE_ID;
}

function multifacePriorGold(caseId: string): OracleActionEvalCaseV2["expectedPrimitiveActions"] {
  return NEW_MULTIFACE_CASES.find((c) => c.id === caseId)?.expectedPrimitiveActions ?? [];
}

async function main() {
  const catalog = await loadGoldenCatalogIndex();
  const indexes = buildCatalogResolverIndexes(catalog);
  const lookup = mergeLookups();
  const reviewedAt = new Date().toISOString();

  const v13 = JSON.parse(
    readFileSync(resolve(process.cwd(), "data/oracle-action-eval-development-v13.json"), "utf8"),
  ) as EvalDatasetEnvelope & { cases: CatalogEvalCase[]; contentHash: string };
  const v10 = JSON.parse(
    readFileSync(resolve(process.cwd(), "data/oracle-action-eval-development-v10.json"), "utf8"),
  ) as { cases: OracleActionEvalCaseV2[] };
  const v10ById = new Map(v10.cases.map((c) => [c.id, c]));

  const repairLog: Record<string, unknown>[] = [];
  const excluded: Array<{ caseId: string; exclusionReason: string; intendedSeed?: string }> = [];
  const stats = {
    reviewed: 0,
    resolved: 0,
    excluded: 0,
    partialName: 0,
    reversedName: 0,
    wrongCompanionFace: 0,
    oracleTextFallback: 0,
    prefixName: 0,
  };

  const v14Cases: CatalogEvalCase[] = [];

  for (const testCase of v13.cases) {
    if (!isPlaceholder(testCase)) {
      v14Cases.push(testCase);
      continue;
    }

    stats.reviewed++;
    const intended = lookup.get(testCase.id);
    const v10Case = v10ById.get(testCase.id);
    let resolution =
      (intended ? resolveCatalogSeed(catalog, indexes, { name: intended, layout: testCase.layout, face: testCase.cardFace }) : null) ??
      (v10Case?.oracleText ? resolveByOracleTextEvidence(catalog, v10Case.oracleText) : null);

    if (!resolution) {
      stats.excluded++;
      excluded.push({
        caseId: testCase.id,
        exclusionReason: "unresolved_seed_identity",
        intendedSeed: intended,
      });
      repairLog.push({
        caseId: testCase.id,
        outcome: "excluded",
        intendedSeed: intended,
        seedClassification: intended ? classifyUnresolvedSeed(intended, catalog, indexes) : "truly_nonexistent",
      });
      continue;
    }

    stats.resolved++;
    if (resolution.matchedBy === "partial_multiface_name" || resolution.matchedBy === "exact_face_name") stats.partialName++;
    if (resolution.matchedBy === "reversed_split_name") stats.reversedName++;
    if (resolution.matchedBy === "wrong_companion_face") stats.wrongCompanionFace++;
    if (resolution.matchedBy === "alias_lookup") stats.oracleTextFallback++;
    if (resolution.matchedBy === "stale_historical_name") stats.prefixName++;

    const faces = goldenFaceRecords(resolution.card);
    const faceMeta = resolution.faceIndex !== undefined ? faces[resolution.faceIndex] : faces[0];

    const base: CatalogEvalCase = {
      ...testCase,
      oracleId: resolution.oracleId,
      oracleText: resolution.oracleText,
      cardName: resolution.canonicalName,
      layout: resolution.layout ?? testCase.layout,
      cardFace: resolution.faceId ?? testCase.cardFace,
      faceIndex: faceMeta?.faceIndex,
      faceName: faceMeta?.faceName,
      colorIdentity: [...(resolution.card.colorIdentity ?? [])],
      goldenCatalogVersion: catalog.catalogVersion,
      goldenOracleTextHash: goldenOracleTextHash(resolution.oracleText),
      identityStatus: "catalog_exact",
      expectedPrimitiveActions: [],
    };

    const priorGold = v10Case?.expectedPrimitiveActions ?? multifacePriorGold(testCase.id);
    const { testCase: relabeled } = relabelCaseGold({
      baseCase: base,
      priorGold,
      reviewer: REPAIRER,
      reviewedAt,
    });

    let primitives = sanitizeGoldPrimitives(relabeled.oracleText, relabeled.expectedPrimitiveActions);
    if (primitives.length === 0) {
      const auto = derivePrimitivesFromOracleText(relabeled.oracleText, relabeled.cardFace);
      if (auto.length) primitives = auto;
    }

    const roles = inferDerivedRoles(primitives.map((p) => p.actionType));
    const repaired: CatalogEvalCase = {
      ...relabeled,
      expectedPrimitiveActions: primitives,
      expectedRoles: roles.length
        ? roles.map((role) => ({ role, fromPrimitiveActions: primitives.map((p) => p.actionType) }))
        : relabeled.expectedRoles,
      goldReviewStatus: "reviewed",
      goldReviewVersion: SECOND_PASS_GOLD_REVIEW_VERSION,
      goldCompletenessStatus: "complete",
      goldCompletedAt: reviewedAt,
      goldCompleter: REPAIRER,
      invalidPriorTextDisposition: "superseded_complete",
      evaluationSetVersion: "development-v14-placeholder-repair",
    };

    v14Cases.push(repaired);
    repairLog.push({
      caseId: testCase.id,
      outcome: "resolved",
      intendedSeed: intended,
      matchedBy: resolution.matchedBy,
      correctedName: resolution.correctedName ?? resolution.canonicalName,
      oracleId: resolution.oracleId,
      primitiveCount: primitives.length,
    });
  }

  v14Cases.sort((a, b) => a.id.localeCompare(b.id));
  const v14Hash = computeDatasetContentHash(v14Cases);

  const v14 = {
    setClassification: "development_set_v14",
    evaluationSetVersion: "development-v14-placeholder-repair",
    contentHash: v14Hash,
    taxonomyVersion: TAXONOMY_VERSION,
    goldReviewVersion: SECOND_PASS_GOLD_REVIEW_VERSION,
    goldenCatalogVersion: catalog.catalogVersion,
    caseCount: v14Cases.length,
    frozenAt: reviewedAt,
    benchmarkStatus: "catalog_clean",
    usableForParserEvaluation: true,
    parentClassification: "development_set_v13",
    parentContentHash: v13.contentHash,
    parentSetPath: "data/oracle-action-eval-development-v13.json",
    reviewer: REPAIRER,
    reviewTimestamp: reviewedAt,
    placeholderIdentityRepair: { stats, excludedCaseIds: excluded.map((e) => e.caseId), repairLog },
    cases: v14Cases,
  };

  writeFileSync(
    resolve(process.cwd(), "data/oracle-action-eval-development-v14.json"),
    JSON.stringify(v14, null, 2),
    "utf8",
  );
  writeFileSync(
    resolve(process.cwd(), "data/oracle-action-eval-excluded-dev-cases.json"),
    JSON.stringify(
      {
        generatedAt: reviewedAt,
        excludedFromActiveBenchmark: excluded,
        note: "Cases excluded after placeholder identity repair — unresolved_seed_identity",
      },
      null,
      2,
    ),
    "utf8",
  );
  writeFileSync(
    resolve(process.cwd(), "reports/placeholder-identity-repair-v14.json"),
    JSON.stringify({ generatedAt: reviewedAt, stats, excluded, repairLog }, null, 2),
    "utf8",
  );

  const manifest = JSON.parse(
    readFileSync(resolve(process.cwd(), "data/oracle-action-eval-sets-manifest.json"), "utf8"),
  ) as Record<string, unknown>;
  manifest.developmentSet = {
    path: "data/oracle-action-eval-development-v14.json",
    classification: "development_set_v14",
    contentHash: v14Hash,
    caseCount: v14Cases.length,
    taxonomyVersion: TAXONOMY_VERSION,
    goldenCatalogVersion: catalog.catalogVersion,
    purpose: "Development set after placeholder identity repair",
    parentClassification: "development_set_v13",
    parentContentHash: v13.contentHash,
    benchmarkStatus: "catalog_clean",
    usableForParserEvaluation: true,
  };
  writeFileSync(
    resolve(process.cwd(), "data/oracle-action-eval-sets-manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf8",
  );

  console.log(JSON.stringify({ v14Hash, caseCount: v14Cases.length, stats, excluded: excluded.length }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
