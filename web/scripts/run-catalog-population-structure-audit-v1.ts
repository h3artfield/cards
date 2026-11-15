/**
 * P0 — Full catalogOracleCards A–E population-frame audit.
 *
 * Run: cd web && npx tsx scripts/run-catalog-population-structure-audit-v1.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvLocal } from "./lib/script-env";
import { loadGoldenCatalogIndex } from "./lib/load-golden-catalog-index";
import {
  classifyCatalogPopulationRecord,
  summarizeCategoryDetails,
  type CatalogPopulationClassification,
} from "./lib/catalog-population-classifier-v1";

loadEnvLocal();

const OUT_DIR = "data/milestones/catalog-shadow";
const ARTIFACT_PATH = `${OUT_DIR}/catalog-population-structure-audit-v1.json`;
const CLASSIFICATIONS_PATH = `${OUT_DIR}/catalog-population-classifications-firestore-v1.jsonl`;

async function main() {
  const index = await loadGoldenCatalogIndex();
  const cards = [...index.byOracleId.values()].sort((a, b) =>
    a.oracleId.localeCompare(b.oracleId),
  );

  const classifications: CatalogPopulationClassification[] = cards.map((card) =>
    classifyCatalogPopulationRecord(card),
  );

  const categoryCounts = {
    A: classifications.filter((r) => r.category === "A").length,
    B: classifications.filter((r) => r.category === "B").length,
    C: classifications.filter((r) => r.category === "C").length,
    D: classifications.filter((r) => r.category === "D").length,
    E: classifications.filter((r) => r.category === "E").length,
  };

  const legacyEligible = classifications.filter((r) => r.combinedOracleTextPresent).length;
  const correctedEligible = classifications.filter((r) => r.studyPopulationEligible).length;
  const newlyEligible = classifications.filter(
    (r) => r.studyPopulationEligible && !r.combinedOracleTextPresent,
  );

  const preservedTopLevelTextFrame = {
    label: "top-level-text population shadow snapshot (preserved)",
    artifactStem: "catalog-shadow-parse-rc8-firestore-v1",
    eligibleCount: legacyEligible,
    note: "Historical 35,582 frame — combined oracle text non-empty. Not yet 'all parse-eligible Magic cards'.",
  };

  const correctedPopulationFrame = {
    label: "card-structure-aware study population (authoritative after audit)",
    totalCatalogRecords: cards.length,
    legitimateMagicCardOracleIdentities: correctedEligible,
    parserSupportedCardStructures: correctedEligible,
    genuinelyOutOfScope: categoryCounts.D,
    malformedOrIncomplete: categoryCounts.E,
    categoryBreakdown: categoryCounts,
    deltaFromLegacyEligible: correctedEligible - legacyEligible,
    newlyEligibleOracleIds: newlyEligible.map((r) => r.oracleId),
  };

  const report = {
    artifactType: "CatalogPopulationStructureAudit",
    version: "catalog-population-structure-audit-v1",
    generatedAt: new Date().toISOString(),
    source: "firestore",
    collection: "catalogOracleCards",
    catalogVersion: index.catalogVersion,
    totalRecords: cards.length,
    categoryCounts,
    categoryDetails: {
      A: summarizeCategoryDetails(classifications, "A"),
      B: summarizeCategoryDetails(classifications, "B"),
      C: summarizeCategoryDetails(classifications, "C"),
      D: summarizeCategoryDetails(classifications, "D"),
      E: summarizeCategoryDetails(classifications, "E"),
    },
    legacyPopulationFrame: {
      rule: "combinedGoldenOracleText(card) non-empty (top-level OR card_faces join)",
      eligibleCount: legacyEligible,
      excludedCount: cards.length - legacyEligible,
      excludedReason: "no_oracle_text",
    },
    correctedPopulationFrame,
    preservedTopLevelTextFrame,
    canonicalParserInputPolicy: {
      singleFace: "canonical Oracle input from top-level card data",
      multiFace:
        "canonical Oracle input from card_faces[0..n] preserving face identity, name, type line, oracle text",
      blankTextLegitimate: "valid semantic record — zero L2 actions may be correct",
      parserVersion: "frozen RC8 — no grammar changes in this audit",
      goldPolicyVersion: "v1.8 accepted; v1.7 preserved",
    },
    sampleDecision: {
      currentSampleIdentityHash: "e9e6cc4c",
      currentSampleStatus: "provisionally sealed — do not annotate yet",
      recommendation:
        newlyEligible.length > 0
          ? "preserve current sample as superseded; draw corrected parser-blind sample after population v2 freeze"
          : "keep current sample unchanged if all newly excluded are genuinely D/E only",
      newlyEligibleCount: newlyEligible.length,
    },
    authorization: {
      humanAnnotationCurrentSample: "NOT AUTHORIZED",
      correctedFullShadowParse: newlyEligible.length > 0 ? "AUTHORIZED" : "NOT REQUIRED",
      parserChanges: "WAIT",
      rc9: "NOT AUTHORIZED",
      blind: "DO NOT TOUCH",
    },
  };

  mkdirSync(resolve(OUT_DIR), { recursive: true });
  writeFileSync(resolve(ARTIFACT_PATH), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(
    resolve(CLASSIFICATIONS_PATH),
    classifications.map((row) => `${JSON.stringify(row)}\n`).join(""),
  );

  console.log(
    JSON.stringify(
      {
        artifactPath: ARTIFACT_PATH,
        classificationsPath: CLASSIFICATIONS_PATH,
        totalRecords: cards.length,
        categoryCounts,
        legacyEligible,
        correctedEligible,
        newlyEligibleCount: newlyEligible.length,
        sampleRecommendation: report.sampleDecision.recommendation,
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
