/**
 * Final eval-0262 identity adjudication → development_set_v15 (if changed).
 * Run: npx tsx scripts/fix-eval-0262-v15.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvLocal } from "./lib/script-env";
import {
  loadGoldenCatalogIndex,
  lookupGoldenByName,
  combinedGoldenOracleText,
  goldenFaceRecords,
  goldenOracleTextHash,
} from "./lib/load-golden-catalog-index";
import {
  computeDatasetContentHash,
  SECOND_PASS_GOLD_REVIEW_VERSION,
  type CatalogEvalCase,
  type EvalDatasetEnvelope,
} from "./lib/eval-provenance-guard";
import { derivePrimitivesFromOracleText } from "./lib/catalog-oracle-gold-completer";
import { evidenceMatchesOracle } from "./oracle-action-eval-shared";
import { TAXONOMY_VERSION } from "./oracle-action-eval-shared";
import { inferDerivedRoles } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";

loadEnvLocal();

const CASE_ID = "eval-0262";
const CANONICAL_NAME = "Brightcap Badger // Fungus Frolic";
const ADVENTURE_FACE_NAME = "Fungus Frolic";
const ADJUDICATOR = "eval-0262-adjudication-v1";

async function main() {
  const catalog = await loadGoldenCatalogIndex();
  const v14Path = resolve(process.cwd(), "data/oracle-action-eval-development-v14.json");
  const v14 = JSON.parse(readFileSync(v14Path, "utf8")) as EvalDatasetEnvelope & {
    cases: CatalogEvalCase[];
    contentHash: string;
  };

  const prior = v14.cases.find((c) => c.id === CASE_ID);
  if (!prior) throw new Error(`${CASE_ID} not in v14`);

  const golden = lookupGoldenByName(catalog, CANONICAL_NAME);
  if (!golden) throw new Error(`${CANONICAL_NAME} not in catalog`);

  const faces = goldenFaceRecords(golden);
  const adventureFace = faces.find((f) => f.faceName === ADVENTURE_FACE_NAME) ?? faces[1];
  if (!adventureFace) throw new Error("Fungus Frolic face not found");

  const oracleText = combinedGoldenOracleText(golden);
  const adventureCorpus = adventureFace.oracleText ?? "";

  // v10 synthetic intent was "Exile target creature" — not present on catalog card.
  // Corrupted seed "Fungal Fortitude" phonetically matches "Fungus Frolic" (Adventure half).
  const v10SyntheticExile = "Exile target creature";
  const catalogHasExile = evidenceMatchesOracle(adventureCorpus, v10SyntheticExile);

  const adjudication = {
    caseId: CASE_ID,
    adjudicatedAt: new Date().toISOString(),
    adjudicator: ADJUDICATOR,
    decision: "resolve_to_brightcap_badger_fungus_frolic",
    rationale: [
      "v10 seed family (NEW_MULTIFACE_CASES eval-0262) is split/adventure layout testing the Adventure component.",
      "Corrupted MULTIFACE_CARD_NAMES paired 'Fungal Fortitude' (standalone Aura) — wrong card entirely.",
      "Phonetic/corruption analysis: Fungal Fortitude → intended Fungus Frolic Adventure spell on Brightcap Badger // Fungus Frolic.",
      "v10 synthetic oracle 'Exile target creature' does NOT match catalog Fungus Frolic (create tokens) nor Fungal Fortitude (aura).",
      "Per policy: resolve identity from recoverable seed intent + catalog; relabel gold from catalog oracle only.",
    ],
    v10SyntheticIntent: {
      layout: "adventure",
      cardFace: "back",
      expectedPrimitive: "exile",
      evidenceContains: v10SyntheticExile,
      matchesCatalog: catalogHasExile,
    },
    catalogCandidates: {
      rejected: {
        name: "Fungal Fortitude",
        oracleId: "cf73d2e7-584f-41d0-8fc7-50d886dcf9fe",
        reason: "Standalone Aura — Flash/enchant/+2/+0/recursion; no Adventure, no exile. v14 resolution was incorrect.",
      },
      accepted: {
        name: CANONICAL_NAME,
        oracleId: golden.oracleId,
        adventureComponent: ADVENTURE_FACE_NAME,
        adventureFaceIndex: adventureFace.faceIndex,
        adventureOracleText: adventureCorpus,
      },
    },
    v14PriorResolution: {
      cardName: prior.cardName,
      oracleId: prior.oracleId,
      matchedBy: "reversed_split_name (resolver bug)",
      primitiveCount: prior.expectedPrimitiveActions.length,
    },
  };

  const backPrimitives = derivePrimitivesFromOracleText(oracleText, "back").filter((p) =>
    evidenceMatchesOracle(adventureCorpus, p.evidenceContains),
  );
  // Primary gold: Adventure spell actions on back face
  const expectedPrimitiveActions = backPrimitives.map((p) => ({
    ...p,
    cardFace: "back" as const,
  }));

  const reviewedAt = new Date().toISOString();
  const repaired: CatalogEvalCase = {
    ...prior,
    category: "split/adventure",
    layout: "adventure",
    oracleId: golden.oracleId,
    oracleText,
    cardName: golden.canonicalName,
    cardFace: "back",
    faceIndex: adventureFace.faceIndex,
    faceName: adventureFace.faceName,
    componentType: "adventure",
    colorIdentity: [...(golden.colorIdentity ?? [])],
    goldenCatalogVersion: catalog.catalogVersion,
    goldenOracleTextHash: goldenOracleTextHash(oracleText),
    expectedPrimitiveActions,
    expectedStructure: {
      minTriggeredAbilities: /\b(When|Whenever|At the beginning of)\b/i.test(
        faces[0]?.oracleText ?? "",
      )
        ? 1
        : undefined,
    },
    expectedRoles: inferDerivedRoles(expectedPrimitiveActions.map((p) => p.actionType)).map((role) => ({
      role,
      fromPrimitiveActions: expectedPrimitiveActions.map((p) => p.actionType),
    })),
    evaluationSetVersion: "development-v15-eval-0262-adjudication",
    goldReviewStatus: "reviewed",
    goldReviewVersion: SECOND_PASS_GOLD_REVIEW_VERSION,
    goldReviewedAt: reviewedAt,
    goldReviewer: ADJUDICATOR,
    goldCompletenessStatus: "complete",
    goldCompletedAt: reviewedAt,
    goldCompleter: ADJUDICATOR,
    invalidPriorTextDisposition: "superseded_complete",
    identityStatus: "catalog_exact",
  };

  const v15Cases = v14.cases.map((c) => (c.id === CASE_ID ? repaired : c));
  const v15Hash = computeDatasetContentHash(v15Cases);

  if (v15Hash === v14.contentHash) {
    console.log(JSON.stringify({ unchanged: true, hash: v15Hash, adjudication }, null, 2));
    return;
  }

  const v15 = {
    ...v14,
    setClassification: "development_set_v15",
    evaluationSetVersion: "development-v15-eval-0262-adjudication",
    contentHash: v15Hash,
    caseCount: v15Cases.length,
    frozenAt: reviewedAt,
    parentClassification: "development_set_v14",
    parentContentHash: v14.contentHash,
    parentSetPath: "data/oracle-action-eval-development-v14.json",
    reviewer: ADJUDICATOR,
    reviewTimestamp: reviewedAt,
    eval0262Adjudication: adjudication,
    cases: v15Cases,
  };

  writeFileSync(resolve(process.cwd(), "data/oracle-action-eval-development-v15.json"), JSON.stringify(v15, null, 2), "utf8");
  writeFileSync(
    resolve(process.cwd(), "data/oracle-action-eval-development-v15-diff.json"),
    JSON.stringify(
      {
        generatedAt: reviewedAt,
        parentDataset: "development_set_v14",
        parentContentHash: v14.contentHash,
        newDataset: "development_set_v15",
        newContentHash: v15Hash,
        changedCaseIds: [CASE_ID],
        adjudication,
        changedGoldFields: {
          [CASE_ID]: {
            cardName: { before: prior.cardName, after: repaired.cardName },
            oracleId: { before: prior.oracleId, after: repaired.oracleId },
            expectedPrimitiveActions: {
              before: prior.expectedPrimitiveActions,
              after: repaired.expectedPrimitiveActions,
            },
          },
        },
      },
      null,
      2,
    ),
    "utf8",
  );

  const manifest = JSON.parse(
    readFileSync(resolve(process.cwd(), "data/oracle-action-eval-sets-manifest.json"), "utf8"),
  ) as Record<string, unknown>;
  manifest.developmentSet = {
    path: "data/oracle-action-eval-development-v15.json",
    classification: "development_set_v15",
    contentHash: v15Hash,
    caseCount: v15Cases.length,
    taxonomyVersion: TAXONOMY_VERSION,
    goldenCatalogVersion: catalog.catalogVersion,
    purpose: "Canonical development set — eval-0262 adjudicated to Brightcap Badger // Fungus Frolic",
    parentClassification: "development_set_v14",
    parentContentHash: v14.contentHash,
    benchmarkStatus: "catalog_clean",
    usableForParserEvaluation: true,
  };
  writeFileSync(
    resolve(process.cwd(), "data/oracle-action-eval-sets-manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf8",
  );

  console.log(
    JSON.stringify(
      {
        v15Hash,
        caseCount: v15Cases.length,
        eval0262: {
          cardName: repaired.cardName,
          adventureComponent: ADVENTURE_FACE_NAME,
          primitives: repaired.expectedPrimitiveActions,
        },
        adjudication,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
