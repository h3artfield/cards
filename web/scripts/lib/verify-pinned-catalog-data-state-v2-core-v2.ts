/**
 * Shared fail-closed catalog-data-state verification core v2 — single DeckResolutionCatalog load.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { auditBenchmarkCaseEligibility } from "../../src/lib/deck-synthesis/benchmark-commander-eligibility-v1";
import { buildCanonicalOracleInput } from "./catalog-population-classifier-v1";
import {
  buildVerifiedCatalogSnapshotIdentity,
  type VerifiedCatalogSnapshotIdentityV1,
} from "./catalog-verified-runtime-snapshot-v1";
import {
  CATALOG_SORTED_NEWLINE_ROOT_V1,
  computeCatalogCanonicalRootsFromLedger,
  computeCatalogCanonicalRootsFromRuntime,
  type CatalogCanonicalRootsV1,
  type LedgerIdentityRow,
} from "./catalog-sorted-newline-root-v1";
import { combinedGoldenOracleText, goldenOracleTextHash } from "./load-golden-catalog-index";
import { loadDeckResolutionCatalog, type DeckResolutionCatalog } from "./load-deck-resolution-catalog";

export const PILOT_COMMANDERS = [
  "Muldrotha, the Gravetide",
  "Zaxara, the Exemplary",
  "Korvold, Fae-Cursed King",
  "Prosper, Tome-Bound",
  "Omnath, Locus of Rage",
];

export type CatalogDataStateCommitmentV2 = {
  catalogVersion: string;
  fullOracleCardCount: number;
  paperEligibilityIdentitiesArtifact: string;
  paperEligibilityIdentitiesByteSha256: string;
  deckResolutionSupplementArtifact: string;
  deckResolutionSupplementByteSha256: string;
  canonicalRootAlgorithm: string;
  expectedCanonicalRoots: CatalogCanonicalRootsV1;
};

export type CatalogVerificationPhase = "pilot" | "pre_roster";

export type CatalogVerificationCoreResultV2 = {
  commitmentSha256: string;
  commitmentArtifact: string;
  canonicalRootAlgorithm: string;
  ledgerCanonicalRoots: CatalogCanonicalRootsV1;
  runtimeCanonicalRoots: CatalogCanonicalRootsV1;
  verifiedCatalogSnapshotIdentity: VerifiedCatalogSnapshotIdentityV1;
  runtimeChecks: {
    fullOracleCardCount: number;
    uniformCatalogVersion: string;
    mismatchedCatalogVersionCount: number;
    perRecordLedgerCrossCheckPass: boolean;
    expectedCanonicalRoots: CatalogCanonicalRootsV1;
    allCanonicalRootsMatchCommitted: boolean;
    paperEligibilityIdentitiesByteSha256: string;
    deckResolutionSupplementByteSha256: string;
    deckResolutionCatalogVersion: string;
    deckResolutionPaperIdentitiesAvailable: number;
  };
  pilotCommanderResolution: Array<{ commander: string; resolved: boolean; benchmarkValid: boolean }>;
};

export function sha256File(absPath: string): string {
  return createHash("sha256").update(readFileSync(absPath)).digest("hex");
}

export function loadLedgerRows(paperPath: string): LedgerIdentityRow[] {
  const rows: LedgerIdentityRow[] = [];
  for (const line of readFileSync(paperPath, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    rows.push(JSON.parse(line) as LedgerIdentityRow);
  }
  return rows;
}

export async function loadSingleVerifiedDeckResolutionCatalogSnapshot(): Promise<DeckResolutionCatalog> {
  return loadDeckResolutionCatalog({ failClosed: true });
}

export async function runCatalogDataStateVerificationCoreV2(input: {
  repoRoot: string;
  commitmentPath: string;
  catalog: DeckResolutionCatalog;
  verifyPilotCommanders?: boolean;
}): Promise<CatalogVerificationCoreResultV2> {
  const { repoRoot, commitmentPath, catalog } = input;
  const verifyPilotCommanders = input.verifyPilotCommanders ?? true;

  if (!existsSync(commitmentPath)) {
    throw new Error(`Missing catalog commitment v2: ${commitmentPath}`);
  }
  const commitment = JSON.parse(readFileSync(commitmentPath, "utf8")) as CatalogDataStateCommitmentV2;
  const commitmentSha256 = sha256File(commitmentPath);

  if (commitment.canonicalRootAlgorithm !== CATALOG_SORTED_NEWLINE_ROOT_V1) {
    throw new Error(
      `FAIL_CLOSED: unsupported canonicalRootAlgorithm ${commitment.canonicalRootAlgorithm}`,
    );
  }

  const paperPath = resolve(repoRoot, commitment.paperEligibilityIdentitiesArtifact);
  const supplementPath = resolve(repoRoot, commitment.deckResolutionSupplementArtifact);
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
  for (const [key, actual] of Object.entries(ledgerRoots) as Array<[keyof CatalogCanonicalRootsV1, string]>) {
    const expected = commitment.expectedCanonicalRoots[key];
    if (actual !== expected) {
      throw new Error(`FAIL_CLOSED: ledger ${key} ${actual} != committed ${expected}`);
    }
  }

  if (catalog.cardCount !== commitment.fullOracleCardCount) {
    throw new Error(`FAIL_CLOSED: catalog cardCount ${catalog.cardCount} != ${commitment.fullOracleCardCount}`);
  }

  let mismatchedVersion = 0;
  for (const card of catalog.byOracleId.values()) {
    if (card.sourceVersion !== commitment.catalogVersion) mismatchedVersion += 1;
  }
  if (mismatchedVersion > 0) {
    throw new Error(`FAIL_CLOSED: ${mismatchedVersion} catalog records with non-uniform sourceVersion`);
  }

  const perRecordMismatches: string[] = [];
  const runtimeRows: Array<{ oracleId: string; oracleTextHash: string; cardStructureHash: string }> = [];

  for (const [oracleId, card] of catalog.byOracleId.entries()) {
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
    if (!catalog.byOracleId.has(ledgerId)) {
      perRecordMismatches.push(`missing runtime oracleId ${ledgerId}`);
    }
  }

  if (perRecordMismatches.length > 0) {
    throw new Error(
      `FAIL_CLOSED: ${perRecordMismatches.length} per-record mismatches (first 5: ${perRecordMismatches.slice(0, 5).join("; ")})`,
    );
  }

  const runtimeRoots = computeCatalogCanonicalRootsFromRuntime(runtimeRows);
  for (const [key, actual] of Object.entries(runtimeRoots) as Array<[keyof CatalogCanonicalRootsV1, string]>) {
    const expected = commitment.expectedCanonicalRoots[key];
    if (actual !== expected) {
      throw new Error(`FAIL_CLOSED: runtime ${key} ${actual} != committed ${expected}`);
    }
  }

  if (catalog.catalogUniverse.rawCatalogIdentitiesLoaded !== commitment.fullOracleCardCount) {
    throw new Error("FAIL_CLOSED: deck-resolution rawCatalogIdentitiesLoaded mismatch");
  }
  if (catalog.catalogVersion !== commitment.catalogVersion) {
    throw new Error(`FAIL_CLOSED: deck-resolution catalogVersion ${catalog.catalogVersion} != ${commitment.catalogVersion}`);
  }

  const pilotResolution: Array<{ commander: string; resolved: boolean; benchmarkValid: boolean }> = [];
  if (verifyPilotCommanders) {
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
  }

  return {
    commitmentSha256,
    commitmentArtifact: "phase6a1-professor-plan-full-catalog-data-state-commitment-v2.json",
    canonicalRootAlgorithm: CATALOG_SORTED_NEWLINE_ROOT_V1,
    ledgerCanonicalRoots: ledgerRoots,
    runtimeCanonicalRoots: runtimeRoots,
    verifiedCatalogSnapshotIdentity: buildVerifiedCatalogSnapshotIdentity(catalog),
    runtimeChecks: {
      fullOracleCardCount: catalog.cardCount,
      uniformCatalogVersion: commitment.catalogVersion,
      mismatchedCatalogVersionCount: 0,
      perRecordLedgerCrossCheckPass: true,
      expectedCanonicalRoots: commitment.expectedCanonicalRoots,
      allCanonicalRootsMatchCommitted: true,
      paperEligibilityIdentitiesByteSha256: paperSha256,
      deckResolutionSupplementByteSha256: supplementSha256,
      deckResolutionCatalogVersion: catalog.catalogVersion,
      deckResolutionPaperIdentitiesAvailable: catalog.catalogUniverse.paperIdentitiesAvailable,
    },
    pilotCommanderResolution: pilotResolution,
  };
}

export function buildCatalogVerificationArtifactV2(input: {
  phase: CatalogVerificationPhase;
  version: string;
  verifierScript: string;
  verifiedAt: string;
  core: CatalogVerificationCoreResultV2;
}): Record<string, unknown> {
  return {
    version: input.version,
    verificationPhase: input.phase,
    verifiedAt: input.verifiedAt,
    verifierScript: input.verifierScript,
    commitmentArtifact: input.core.commitmentArtifact,
    commitmentByteSha256: input.core.commitmentSha256,
    canonicalRootAlgorithm: input.core.canonicalRootAlgorithm,
    verifiedCatalogSnapshotIdentity: input.core.verifiedCatalogSnapshotIdentity,
    runtimeChecks: {
      ...input.core.runtimeChecks,
      ledgerCanonicalRoots: input.core.ledgerCanonicalRoots,
      runtimeCanonicalRoots: input.core.runtimeCanonicalRoots,
    },
    pilotCommanderResolution: input.core.pilotCommanderResolution,
    pass: true,
  };
}
