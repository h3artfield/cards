/**
 * Create development_set_v11 — full catalog-backed identity + gold relabel.
 * Run: npx tsx scripts/create-development-set-v11.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvLocal } from "./lib/script-env";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import { DEV_EXPANSION_V9_SEEDS, buildDevV9ExpansionCases } from "./development-set-v9-expansion-seeds";
import { buildDevelopmentCardNameLookup } from "./lib/dev-case-card-name-lookup";
import { resolveNamedCardFromCatalog } from "./lib/eval-case-from-catalog";
import { relabelCaseGold, summarizeRelabelChanges, type GoldRelabelChange } from "./lib/gold-relabel-engine";
import {
  combinedGoldenOracleText,
  loadGoldenCatalogIndex,
  lookupGoldenByName,
  type GoldenCatalogOracleCard,
} from "./lib/load-golden-catalog-index";
import { normalizeOracleName } from "../src/lib/deck-builder/golden-catalog/normalize-name";
import { PRODUCTION_GOLD_REVIEW_VERSION } from "./lib/eval-provenance-guard";
import type { CatalogEvalCase } from "./lib/eval-provenance-guard";
import { computeContentHash, REVIEWER_ID, TAXONOMY_VERSION } from "./oracle-action-eval-shared";

loadEnvLocal();

const V10_HASH = "a285f2b7ffc56ea5a9184e702b922f7afcda6d816f2cf916f2ee14110b360d19";
const REVIEWER = REVIEWER_ID;
const EVALUATION_SET_VERSION = "development-v11-catalog-gold-v1";

function findCatalogByTextHint(
  catalog: Awaited<ReturnType<typeof loadGoldenCatalogIndex>>,
  text: string,
): GoldenCatalogOracleCard | null {
  const trimmed = text.trim();
  for (const len of [80, 50, 30, 20]) {
    const needle = trimmed.slice(0, len).toLowerCase();
    if (needle.length < 8) break;
    for (const card of catalog.byOracleId.values()) {
      if (combinedGoldenOracleText(card).toLowerCase().includes(needle)) {
        return card;
      }
    }
  }
  return null;
}

function resolveCaseIdentity(
  catalog: Awaited<ReturnType<typeof loadGoldenCatalogIndex>>,
  prior: OracleActionEvalCaseV2,
  cardName: string | undefined,
): CatalogEvalCase {
  const syntheticName =
    cardName &&
    (/^(Extra-|Static-|May-|Delayed-|Multi-|CDA-|Reflexive-|Intervening-|Aftermath-|Prototype-|Mutate-|Class-|Transform-)/.test(
      cardName,
    ) ||
      cardName === prior.id);

  let golden: GoldenCatalogOracleCard | null = null;
  if (cardName && !syntheticName) {
    golden = lookupGoldenByName(catalog, cardName);
    if (!golden) {
      const norm = normalizeOracleName(cardName);
      for (const [key, cards] of catalog.byNormalizedName) {
        if (key.startsWith(norm.slice(0, Math.min(12, norm.length))) || norm.startsWith(key.slice(0, 12))) {
          golden = cards[0];
          break;
        }
      }
    }
  }
  if (!golden) golden = findCatalogByTextHint(catalog, prior.oracleText);
  if (!golden) {
    throw new Error(`Cannot resolve catalog identity for ${prior.id} (name=${cardName ?? "none"})`);
  }

  const identity = resolveNamedCardFromCatalog(
    catalog,
    { name: golden.canonicalName, face: prior.cardFace, layout: prior.layout },
    REVIEWER,
  );

  return {
    id: prior.id,
    category: prior.category,
    layout: identity.layout ?? prior.layout,
    oracleId: identity.oracleId,
    oracleText: identity.oracleText,
    cardFace: prior.cardFace,
    cardName: identity.cardName,
    colorIdentity: identity.colorIdentity,
    goldenCatalogVersion: identity.goldenCatalogVersion,
    goldenOracleTextHash: identity.goldenOracleTextHash,
    taxonomyVersion: TAXONOMY_VERSION,
    evaluationSetVersion: EVALUATION_SET_VERSION,
    expectedPrimitiveActions: [],
    forbiddenPrimitiveActions: prior.forbiddenPrimitiveActions,
    expectedStructure: prior.expectedStructure,
    expectedConditions: prior.expectedConditions,
    expectedFaces: undefined,
  };
}

async function main() {
  const catalog = await loadGoldenCatalogIndex();
  const v10Path = resolve(process.cwd(), "data", "oracle-action-eval-development-v10.json");
  const v11Path = resolve(process.cwd(), "data", "oracle-action-eval-development-v11.json");
  const diffPath = resolve(process.cwd(), "data", "oracle-action-eval-development-v11-diff.json");
  const manifestPath = resolve(process.cwd(), "data", "oracle-action-eval-sets-manifest.json");

  const v10 = JSON.parse(readFileSync(v10Path, "utf8")) as {
    cases: OracleActionEvalCaseV2[];
    contentHash: string;
  };
  if (v10.contentHash !== V10_HASH) {
    throw new Error("development_set_v10 hash mismatch");
  }

  const cardNames = buildDevelopmentCardNameLookup();
  const v9Ids = new Set(
    buildDevV9ExpansionCases(1, catalog).map((c) => c.id),
  );
  const reviewedAt = new Date().toISOString();
  const allChanges: Array<{ caseId: string; cardName?: string; changes: GoldRelabelChange[] }> = [];
  const v11Cases: CatalogEvalCase[] = [];
  const unresolved: string[] = [];

  for (const prior of v10.cases) {
    if (v9Ids.has(prior.id)) continue;

    const cardName = cardNames.get(prior.id);
    try {
      const base = resolveCaseIdentity(catalog, prior, cardName);
      const v9SeedIdx = prior.id.match(/^dev-v9-(\d+)$/);
      const seedHint = v9SeedIdx
        ? undefined
        : undefined;

      const { testCase, changes } = relabelCaseGold({
        baseCase: base,
        seedHint: undefined,
        priorGold: prior.expectedPrimitiveActions,
        reviewer: REVIEWER,
        reviewedAt,
      });
      allChanges.push({ caseId: prior.id, cardName: testCase.cardName, changes });
      v11Cases.push(testCase);
    } catch {
      unresolved.push(prior.id);
    }
  }

  const v9Expansion = buildDevV9ExpansionCases(1, catalog);
  for (let i = 0; i < v9Expansion.length; i++) {
    const seed = DEV_EXPANSION_V9_SEEDS[i];
    const prior = v10.cases.find((c) => c.id === v9Expansion[i].id);
    const base = v9Expansion[i] as CatalogEvalCase;
    base.taxonomyVersion = TAXONOMY_VERSION;
    base.evaluationSetVersion = EVALUATION_SET_VERSION;
    const { testCase, changes } = relabelCaseGold({
      baseCase: base,
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
    allChanges.push({ caseId: testCase.id, cardName: testCase.cardName, changes });
    v11Cases.push(testCase);
  }

  const taxonomyPatches: Array<{
    caseId: string;
    apply: (c: CatalogEvalCase) => CatalogEvalCase;
  }> = [
    {
      caseId: "dev-opt-007",
      apply: (c) => {
        const next = structuredClone(c);
        for (const exp of next.expectedPrimitiveActions) {
          if (
            exp.actionType === "search_library" &&
            exp.evidenceContains.includes("put a land card from your hand")
          ) {
            exp.actionType = "put_onto_battlefield";
            exp.sourceZone = "hand";
            exp.destinationZone = "battlefield";
            exp.affectedObject = "land_card";
          }
        }
        return next;
      },
    },
    {
      caseId: "eval-0049",
      apply: (c) => {
        const next = structuredClone(c);
        for (const exp of next.expectedPrimitiveActions) {
          if (
            exp.actionType === "return_to_battlefield" &&
            exp.evidenceContains.includes("graveyard onto the battlefield")
          ) {
            exp.actionType = "put_onto_battlefield";
            exp.sourceZone = "graveyard";
            exp.destinationZone = "battlefield";
          }
        }
        return next;
      },
    },
  ];

  for (const patch of taxonomyPatches) {
    const idx = v11Cases.findIndex((c) => c.id === patch.caseId);
    if (idx >= 0) v11Cases[idx] = patch.apply(v11Cases[idx]);
  }

  v11Cases.sort((a, b) => a.id.localeCompare(b.id));

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

  const v11Hash = computeContentHash(v11Cases);
  const v11 = {
    setClassification: "development_set_v11",
    evaluationVersion: EVALUATION_SET_VERSION,
    evaluationSetVersion: EVALUATION_SET_VERSION,
    contentHash: v11Hash,
    taxonomyVersion: TAXONOMY_VERSION,
    goldReviewVersion: PRODUCTION_GOLD_REVIEW_VERSION,
    goldenCatalogVersion: catalog.catalogVersion,
    caseCount: v11Cases.length,
    frozenAt: reviewedAt,
    benchmarkStatus: "catalog_clean",
    usableForParserEvaluation: true,
    usagePolicy: "Parser tuning — full catalog-backed identity and relabeled gold.",
    parentClassification: "development_set_v10",
    parentContentHash: V10_HASH,
    parentSetPath: "data/oracle-action-eval-development-v10.json",
    reviewer: REVIEWER,
    reviewTimestamp: reviewedAt,
    goldRelabelStatistics: aggregate,
    unresolvedCaseIds: unresolved,
    cases: v11Cases,
  };

  writeFileSync(v11Path, JSON.stringify(v11, null, 2), "utf8");
  writeFileSync(
    diffPath,
    JSON.stringify(
      {
        generatedAt: reviewedAt,
        parentDataset: "development_set_v10",
        parentContentHash: V10_HASH,
        newDataset: "development_set_v11",
        newContentHash: v11Hash,
        goldRelabelStatistics: aggregate,
        unresolvedCaseIds: unresolved,
        caseRelabelEntries: allChanges,
      },
      null,
      2,
    ),
    "utf8",
  );

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
  manifest.developmentSet = {
    path: "data/oracle-action-eval-development-v11.json",
    classification: "development_set_v11",
    contentHash: v11Hash,
    caseCount: v11Cases.length,
    taxonomyVersion: TAXONOMY_VERSION,
    goldReviewVersion: PRODUCTION_GOLD_REVIEW_VERSION,
    goldenCatalogVersion: catalog.catalogVersion,
    purpose: "Catalog-clean development set for parser tuning",
    diffManifest: "data/oracle-action-eval-development-v11-diff.json",
    reviewer: REVIEWER,
    reviewTimestamp: reviewedAt,
    benchmarkStatus: "catalog_clean",
    usableForParserEvaluation: true,
  };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

  console.log("Created development_set_v11");
  console.log(`  hash: ${v11Hash}`);
  console.log(`  cases: ${v11Cases.length}`);
  console.log(`  unresolved: ${unresolved.length}`);
  console.log(`  gold relabel stats:`, aggregate);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
