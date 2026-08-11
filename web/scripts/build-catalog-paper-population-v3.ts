/**
 * Freeze paper-eligible population v3 from v2 structure audit + paper printing audit.
 *
 * Run: cd web && npx tsx scripts/build-catalog-paper-population-v3.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import type { CatalogPopulationSnapshotV2 } from "./lib/firestore-catalog-population-snapshot-v2";
import { paperPopulationHash } from "./lib/catalog-paper-eligibility-v1";

const OUT_DIR = "data/milestones/catalog-shadow";
const POPULATION_V2_PATH = `${OUT_DIR}/catalog-population-snapshot-firestore-v2.json`;
const PAPER_AUDIT_PATH = `${OUT_DIR}/catalog-paper-eligibility-audit-v1.json`;
const PAPER_IDENTITIES_PATH = `${OUT_DIR}/catalog-paper-eligibility-identities-v1.jsonl`;

type PaperIdentityRow = {
  oracleId: string;
  canonicalName: string;
  populationCategory: string;
  paperPopulationFrame: string;
  hasPaperPrinting: boolean;
  printingCount: number;
  oracleTextHash: string;
  cardStructureHash: string;
  paperEligible: boolean;
};

function main() {
  const v2 = JSON.parse(readFileSync(resolve(POPULATION_V2_PATH), "utf8")) as CatalogPopulationSnapshotV2;
  const audit = JSON.parse(readFileSync(resolve(PAPER_AUDIT_PATH), "utf8")) as {
    paperPopulationV3: { paperEligiblePopulationHash: string };
    populationV2: { legitimateIdentitiesABC: number };
  };
  const paperRows = readFileSync(resolve(PAPER_IDENTITIES_PATH), "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as PaperIdentityRow);
  const paperByOracle = new Map(paperRows.map((r) => [r.oracleId, r]));

  const identities = v2.identities.map((identity) => {
    const paper = paperByOracle.get(identity.oracleId);
    return {
      ...identity,
      paperEligible: paper?.paperEligible ?? false,
      hasPaperPrinting: paper?.hasPaperPrinting ?? false,
      paperPopulationFrame: paper?.paperPopulationFrame ?? "UNKNOWN",
      printingCount: paper?.printingCount ?? 0,
      studyPopulationEligible:
        identity.studyPopulationEligible && (paper?.paperEligible ?? false),
    };
  });

  const paperEligibleIdentities = identities.filter((i) => i.paperEligible);
  const studyEligible = identities.filter((i) => i.studyPopulationEligible);
  const digitalOnlyExcluded = v2.identities.filter((i) => {
    const paper = paperByOracle.get(i.oracleId);
    return i.studyPopulationEligible && paper?.paperPopulationFrame === "DIGITAL_ONLY";
  });

  const populationHash = paperPopulationHash(
    identities.map((i) => ({
      oracleId: i.oracleId,
      oracleTextHash: i.oracleTextHash,
      cardStructureHash: i.cardStructureHash,
      paperEligible: i.paperEligible,
    })),
  );
  if (populationHash !== audit.paperPopulationV3.paperEligiblePopulationHash) {
    throw new Error(
      `Population hash mismatch: ${populationHash} vs audit ${audit.paperPopulationV3.paperEligiblePopulationHash}`,
    );
  }

  const snapshot = {
    artifactType: "CatalogPopulationSnapshot",
    version: "catalog-population-snapshot-v3",
    snapshotAt: new Date().toISOString(),
    source: "firestore",
    collection: "catalogOracleCards",
    syncState: v2.syncState,
    firestoreTotalCatalogOracleCards: v2.firestoreTotalCatalogOracleCards,
    categoryCounts: v2.categoryCounts,
    paperFrame: {
      rule: "paperEligible = oracle identity has >=1 Scryfall default_cards printing with games[] containing 'paper'",
      auditArtifact: PAPER_AUDIT_PATH,
      paperEligibleOracleIds: paperEligibleIdentities.length,
      digitalOnlyExcludedFromStudy: digitalOnlyExcluded.length,
      studyEligibleOracleIds: studyEligible.length,
    },
    supersededPopulationV2: {
      populationHash: v2.populationHash,
      cardStructurePopulationHash: v2.cardStructurePopulationHash,
      legitimateIdentitiesABC: audit.populationV2.legitimateIdentitiesABC,
      artifactPath: POPULATION_V2_PATH,
      status: "SUPERSEDED_BY_PAPER_FRAME_V3",
    },
    legacyFrame: v2.legacyFrame,
    correctedFrame: {
      rule: "card-structure-aware A+B+C AND paperEligible (physical Magic study population)",
      eligibleOracleIds: studyEligible.length,
      excludedOracleIds: v2.firestoreTotalCatalogOracleCards - studyEligible.length,
      outOfScopeCategoryD: v2.correctedFrame.outOfScopeCategoryD,
      malformedCategoryE: v2.correctedFrame.malformedCategoryE,
      digitalOnlyExcluded: digitalOnlyExcluded.length,
    },
    duplicateOracleIds: v2.duplicateOracleIds,
    eligibleOracleIds: studyEligible.length,
    excludedRecords: [
      ...v2.excludedRecords,
      ...digitalOnlyExcluded.map((i) => ({
        oracleId: i.oracleId,
        canonicalName: i.canonicalName,
        category: i.populationCategory,
        reason: "digital_only_no_paper_printing",
      })),
    ],
    catalogVersion: v2.catalogVersion,
    importVersion: v2.importVersion,
    identities,
    populationHash,
    cardStructurePopulationHash: populationHash,
    auditArtifact: PAPER_AUDIT_PATH,
  };

  mkdirSync(resolve(OUT_DIR), { recursive: true });
  const outPath = resolve(OUT_DIR, "catalog-population-snapshot-firestore-v3.json");
  const identitiesPath = resolve(OUT_DIR, "catalog-population-identities-firestore-v3.jsonl");
  writeFileSync(outPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  writeFileSync(identitiesPath, identities.map((r) => JSON.stringify(r)).join("\n") + "\n");

  console.log(
    JSON.stringify(
      {
        outPath,
        identitiesPath,
        populationHash,
        paperEligibleCount: paperEligibleIdentities.length,
        studyEligibleCount: studyEligible.length,
        digitalOnlyExcluded: digitalOnlyExcluded.length,
      },
      null,
      2,
    ),
  );
}

main();
