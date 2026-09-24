/**
 * Fail-closed verification of pinned full catalog + deck-resolution state (v2).
 * Proves runtime Firestore content matches committed ledger roots — not merely count/version/file SHAs.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeOnceMilestoneArtifact } from "./lib/write-once-milestone-artifact-v2";
import { auditBenchmarkCaseEligibility } from "../src/lib/deck-synthesis/benchmark-commander-eligibility-v1";
import { buildCanonicalOracleInput } from "./lib/catalog-population-classifier-v1";
import {
  CATALOG_SORTED_NEWLINE_ROOT_V1,
  computeCatalogCanonicalRootsFromLedger,
  computeCatalogCanonicalRootsFromRuntime,
  type LedgerIdentityRow,
} from "./lib/catalog-sorted-newline-root-v1";
import { loadDeckResolutionCatalog } from "./lib/load-deck-resolution-catalog";
import { combinedGoldenOracleText, goldenOracleTextHash, loadGoldenCatalogIndex } from "./lib/load-golden-catalog-index";

const HERE = resolve(fileURLToPath(import.meta.url), "..");
const REPO = resolve(HERE, "../..");
const MILESTONES = resolve(REPO, "web/data/milestones/deck-synthesis");
const COMMITMENT_PATH = resolve(MILESTONES, "phase6a1-professor-plan-full-catalog-data-state-commitment-v2.json");
const OUTPUT_BASENAME = "phase6a1-professor-plan-catalog-data-state-verification-v2.json";
const OUTPUT_PATH = resolve(
  process.env.PHASE6A1_ARTIFACT_OUTPUT_DIR?.trim() || MILESTONES,
  OUTPUT_BASENAME,
);

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

type Commitment = {
  catalogVersion: string;
  fullOracleCardCount: number;
  paperEligibilityIdentitiesArtifact: string;
  paperEligibilityIdentitiesByteSha256: string;
  deckResolutionSupplementArtifact: string;
  deckResolutionSupplementByteSha256: string;
  canonicalRootAlgorithm: string;
  expectedCanonicalRoots: {
    oracleIdSetSha256: string;
    oracleIdOracleTextHashRootSha256: string;
    oracleIdCardStructureHashRootSha256: string;
  };
};

function loadLedgerRows(paperPath: string): LedgerIdentityRow[] {
  const rows: LedgerIdentityRow[] = [];
  for (const line of readFileSync(paperPath, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    const parsed = JSON.parse(line) as LedgerIdentityRow;
    rows.push(parsed);
  }
  return rows;
}

async function main(): Promise<void> {
  if (!existsSync(COMMITMENT_PATH)) {
    throw new Error(`Missing catalog commitment v2: ${COMMITMENT_PATH}`);
  }
  const commitment = JSON.parse(readFileSync(COMMITMENT_PATH, "utf8")) as Commitment;
  const commitmentSha256 = sha256File(COMMITMENT_PATH);

  if (commitment.canonicalRootAlgorithm !== CATALOG_SORTED_NEWLINE_ROOT_V1) {
    throw new Error(
      `FAIL_CLOSED: unsupported canonicalRootAlgorithm ${commitment.canonicalRootAlgorithm}`,
    );
  }

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

  const ledgerRows = loadLedgerRows(paperPath);
  if (ledgerRows.length !== commitment.fullOracleCardCount) {
    throw new Error(
      `FAIL_CLOSED: ledger row count ${ledgerRows.length} != ${commitment.fullOracleCardCount}`,
    );
  }

  const ledgerByOracleId = new Map<string, LedgerIdentityRow>();
  for (const row of ledgerRows) {
    if (ledgerByOracleId.has(row.oracleId)) {
      throw new Error(`FAIL_CLOSED: duplicate ledger oracleId ${row.oracleId}`);
    }
    ledgerByOracleId.set(row.oracleId, row);
  }

  const ledgerRoots = computeCatalogCanonicalRootsFromLedger(ledgerRows);
  for (const [key, actual] of Object.entries(ledgerRoots) as Array<[keyof typeof ledgerRoots, string]>) {
    const expected = commitment.expectedCanonicalRoots[key];
    if (actual !== expected) {
      throw new Error(`FAIL_CLOSED: ledger ${key} ${actual} != committed ${expected}`);
    }
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

  const perRecordMismatches: string[] = [];
  const runtimeRows: Array<{ oracleId: string; oracleTextHash: string; cardStructureHash: string }> = [];

  for (const [oracleId, card] of golden.byOracleId.entries()) {
    const ledger = ledgerByOracleId.get(oracleId);
    if (!ledger) {
      perRecordMismatches.push(`extra runtime oracleId ${oracleId}`);
      continue;
    }
    const oracleText = combinedGoldenOracleText(card);
    const runtimeOracleTextHash = goldenOracleTextHash(oracleText);
    const runtimeCardStructureHash = buildCanonicalOracleInput(card).cardStructureHash;
    if (runtimeOracleTextHash !== ledger.oracleTextHash) {
      perRecordMismatches.push(`oracleTextHash mismatch ${oracleId}`);
    }
    if (runtimeCardStructureHash !== ledger.cardStructureHash) {
      perRecordMismatches.push(`cardStructureHash mismatch ${oracleId}`);
    }
    runtimeRows.push({
      oracleId,
      oracleTextHash: runtimeOracleTextHash,
      cardStructureHash: runtimeCardStructureHash,
    });
  }

  for (const ledgerId of ledgerByOracleId.keys()) {
    if (!golden.byOracleId.has(ledgerId)) {
      perRecordMismatches.push(`missing runtime oracleId ${ledgerId}`);
    }
  }

  if (perRecordMismatches.length > 0) {
    throw new Error(
      `FAIL_CLOSED: ${perRecordMismatches.length} per-record mismatches (first 5: ${perRecordMismatches.slice(0, 5).join("; ")})`,
    );
  }

  const runtimeRoots = computeCatalogCanonicalRootsFromRuntime(runtimeRows);
  for (const [key, actual] of Object.entries(runtimeRoots) as Array<[keyof typeof runtimeRoots, string]>) {
    const expected = commitment.expectedCanonicalRoots[key];
    if (actual !== expected) {
      throw new Error(`FAIL_CLOSED: runtime ${key} ${actual} != committed ${expected}`);
    }
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

  const verification = {
    version: "phase6a1-professor-plan-catalog-data-state-verification-v2",
    verifiedAt: new Date().toISOString(),
    executionBoundary: process.env.PHASE6A1_IMPLEMENTATION_CONTAINER === "1" ? "PINNED_DOCKER_IMPLEMENTATION_CONTAINER" : "HOST",
    verifierScript: "web/scripts/run-phase6a1-verify-pinned-catalog-data-state-v2.ts",
    commitmentArtifact: "phase6a1-professor-plan-full-catalog-data-state-commitment-v2.json",
    commitmentByteSha256: commitmentSha256,
    canonicalRootAlgorithm: CATALOG_SORTED_NEWLINE_ROOT_V1,
    runtimeChecks: {
      fullOracleCardCount: golden.cardCount,
      uniformCatalogVersion: commitment.catalogVersion,
      mismatchedCatalogVersionCount: 0,
      perRecordLedgerCrossCheckPass: true,
      ledgerCanonicalRoots: ledgerRoots,
      runtimeCanonicalRoots: runtimeRoots,
      expectedCanonicalRoots: commitment.expectedCanonicalRoots,
      allCanonicalRootsMatchCommitted: true,
      paperEligibilityIdentitiesByteSha256: paperSha256,
      deckResolutionSupplementByteSha256: supplementSha256,
      deckResolutionCatalogVersion: catalog.catalogVersion,
      deckResolutionPaperIdentitiesAvailable: catalog.catalogUniverse.paperIdentitiesAvailable,
    },
    pilotCommanderResolution: pilotResolution,
    pass: true,
  };

  writeOnceMilestoneArtifact(OUTPUT_PATH, verification);
  console.log(JSON.stringify({ outputPath: OUTPUT_PATH, verificationSha256: sha256File(OUTPUT_PATH) }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
