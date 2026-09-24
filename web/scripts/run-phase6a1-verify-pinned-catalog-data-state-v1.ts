/**
 * Fail-closed verification of pinned full catalog + deck-resolution state.
 * Produces phase6a1-professor-plan-catalog-data-state-verification-v1.json for pilot/capture binding.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { auditBenchmarkCaseEligibility } from "../src/lib/deck-synthesis/benchmark-commander-eligibility-v1";
import { loadDeckResolutionCatalog } from "./lib/load-deck-resolution-catalog";
import { goldenOracleTextHash, loadGoldenCatalogIndex } from "./lib/load-golden-catalog-index";

const HERE = resolve(fileURLToPath(import.meta.url), "..");
const REPO = resolve(HERE, "../..");
const MILESTONES = resolve(REPO, "web/data/milestones/deck-synthesis");
const COMMITMENT_PATH = resolve(MILESTONES, "phase6a1-professor-plan-full-catalog-data-state-commitment-v1.json");
const OUTPUT_PATH = resolve(MILESTONES, "phase6a1-professor-plan-catalog-data-state-verification-v1.json");

const PILOT_COMMANDERS = [
  "Muldrotha, the Gravetide",
  "Zaxara, the Exemplary",
  "Korvold, Fae-Cursed King",
  "Prosper, Tome-Bound",
  "Omnath, Locus of Rage",
];

function sha256File(absPath: string): string {
  return createHash("sha256").update(readFileSync(absPath)).digest("hex");
}

function sha256Buffer(buf: Buffer | string): string {
  return createHash("sha256").update(buf).digest("hex");
}

type Commitment = {
  catalogVersion: string;
  fullOracleCardCount: number;
  fullCatalogPopulationHash: string;
  fullCatalogCardStructurePopulationHash: string;
  paperEligibilityIdentitiesArtifact: string;
  paperEligibilityIdentitiesByteSha256: string;
  deckResolutionSupplementArtifact: string;
  deckResolutionSupplementByteSha256: string;
};

async function main(): Promise<void> {
  if (!existsSync(COMMITMENT_PATH)) {
    throw new Error(`Missing catalog commitment: ${COMMITMENT_PATH}`);
  }
  const commitment = JSON.parse(readFileSync(COMMITMENT_PATH, "utf8")) as Commitment;
  const commitmentSha256 = sha256File(COMMITMENT_PATH);

  const paperPath = resolve(REPO, commitment.paperEligibilityIdentitiesArtifact);
  const supplementPath = resolve(REPO, commitment.deckResolutionSupplementArtifact);
  if (!existsSync(paperPath)) throw new Error(`FAIL_CLOSED: missing paper ledger ${paperPath}`);
  if (!existsSync(supplementPath)) throw new Error(`FAIL_CLOSED: missing deck-resolution supplement ${supplementPath}`);

  const paperSha256 = sha256File(paperPath);
  const supplementSha256 = sha256File(supplementPath);
  if (paperSha256 !== commitment.paperEligibilityIdentitiesByteSha256) {
    throw new Error(`FAIL_CLOSED: paper ledger SHA mismatch (${paperSha256} != ${commitment.paperEligibilityIdentitiesByteSha256})`);
  }
  if (supplementSha256 !== commitment.deckResolutionSupplementByteSha256) {
    throw new Error(`FAIL_CLOSED: supplement SHA mismatch (${supplementSha256} != ${commitment.deckResolutionSupplementByteSha256})`);
  }

  const golden = await loadGoldenCatalogIndex();
  if (golden.cardCount !== commitment.fullOracleCardCount) {
    throw new Error(`FAIL_CLOSED: catalog cardCount ${golden.cardCount} != ${commitment.fullOracleCardCount}`);
  }

  let mismatchedVersion = 0;
  for (const card of golden.byOracleId.values()) {
    if (card.sourceVersion !== commitment.catalogVersion) mismatchedVersion += 1;
  }
  if (mismatchedVersion > 0) {
    throw new Error(`FAIL_CLOSED: ${mismatchedVersion} catalog records with non-uniform sourceVersion`);
  }

  const catalog = await loadDeckResolutionCatalog({ failClosed: true });
  if (catalog.catalogUniverse.rawCatalogIdentitiesLoaded !== commitment.fullOracleCardCount) {
    throw new Error("FAIL_CLOSED: deck-resolution rawCatalogIdentitiesLoaded mismatch");
  }
  if (catalog.catalogVersion !== commitment.catalogVersion) {
    throw new Error(`FAIL_CLOSED: deck-resolution catalogVersion ${catalog.catalogVersion} != ${commitment.catalogVersion}`);
  }

  const pilotResolution: Array<{ commander: string; resolved: boolean; benchmarkValid: boolean }> = [];
  for (const commander of PILOT_COMMANDERS) {
    const audit = auditBenchmarkCaseEligibility({
      catalog,
      caseId: `pilot-verify-${commander}`,
      set: "PILOT_VERIFY",
      commanders: [commander],
      commandZoneConfiguration: "single_commander",
    });
    pilotResolution.push({
      commander,
      resolved: audit.members.every((m) => m.oracleId != null),
      benchmarkValid: audit.benchmarkValid,
    });
    if (!audit.benchmarkValid) {
      throw new Error(`FAIL_CLOSED: pilot commander failed eligibility resolution: ${commander}`);
    }
  }

  const oracleIdSet = [...golden.byOracleId.keys()].sort();
  const oracleIdSetSha256 = sha256Buffer(oracleIdSet.join("\n"));
  const perRecordOracleTextHashes = [...golden.byOracleId.values()]
    .map((c) => `${c.oracleId}:${goldenOracleTextHash(c.oracleText)}`)
    .sort()
    .join("\n");
  const runtimeOracleTextRootSha256 = sha256Buffer(perRecordOracleTextHashes);

  const verification = {
    version: "phase6a1-professor-plan-catalog-data-state-verification-v1",
    verifiedAt: new Date().toISOString(),
    verifierScript: "web/scripts/run-phase6a1-verify-pinned-catalog-data-state-v1.ts",
    commitmentArtifact: "phase6a1-professor-plan-full-catalog-data-state-commitment-v1.json",
    commitmentByteSha256: commitmentSha256,
    runtimeChecks: {
      fullOracleCardCount: golden.cardCount,
      uniformCatalogVersion: commitment.catalogVersion,
      mismatchedCatalogVersionCount: 0,
      oracleIdSetSha256,
      runtimeOracleTextRootSha256,
      paperEligibilityIdentitiesByteSha256: paperSha256,
      deckResolutionSupplementByteSha256: supplementSha256,
      pinnedPopulationHash: commitment.fullCatalogPopulationHash,
      pinnedCardStructurePopulationHash: commitment.fullCatalogCardStructurePopulationHash,
      deckResolutionCatalogVersion: catalog.catalogVersion,
      deckResolutionPaperIdentitiesAvailable: catalog.catalogUniverse.paperIdentitiesAvailable,
    },
    pilotCommanderResolution: pilotResolution,
    pass: true,
  };

  writeFileSync(OUTPUT_PATH, JSON.stringify(verification, null, 2));
  console.log(JSON.stringify({ outputPath: OUTPUT_PATH, verificationSha256: sha256File(OUTPUT_PATH) }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
