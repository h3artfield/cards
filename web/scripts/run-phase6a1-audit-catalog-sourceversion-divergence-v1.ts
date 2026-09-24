/**
 * Read-only divergence audit for non-uniform catalog sourceVersion records.
 * Compares runtime Firestore against committed 38,542-row ledger. No Firestore writes.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deriveCommanderClassification } from "../src/lib/deck-builder/commander-classification";
import { buildCanonicalOracleInput } from "./lib/catalog-population-classifier-v1";
import { CATALOG_SORTED_NEWLINE_ROOT_V1, type LedgerIdentityRow } from "./lib/catalog-sorted-newline-root-v1";
import {
  isCurrentlyCommanderLegal,
  loadDeckResolutionCatalog,
  paperMetaForOracle,
  type DeckResolutionCatalog,
} from "./lib/load-deck-resolution-catalog";
import { combinedGoldenOracleText, goldenOracleTextHash, loadGoldenCatalogIndex } from "./lib/load-golden-catalog-index";
import { writeOnceMilestoneArtifact } from "./lib/write-once-milestone-artifact-v2";

const HERE = resolve(fileURLToPath(import.meta.url), "..");
const REPO = resolve(HERE, "../..");
const MILESTONES = resolve(REPO, "web/data/milestones/deck-synthesis");
const COMMITMENT_PATH = resolve(MILESTONES, "phase6a1-professor-plan-full-catalog-data-state-commitment-v2.json");
const OUTPUT_BASENAME = "phase6a1-professor-plan-catalog-sourceversion-divergence-audit-v1.json";
const OUTPUT_PATH = resolve(
  process.env.PHASE6A1_ARTIFACT_OUTPUT_DIR?.trim() || MILESTONES,
  OUTPUT_BASENAME,
);

type Commitment = {
  catalogVersion: string;
  fullOracleCardCount: number;
  paperEligibilityIdentitiesArtifact: string;
  paperEligibilityIdentitiesByteSha256: string;
  deckResolutionSupplementArtifact: string;
  deckResolutionSupplementByteSha256: string;
  canonicalRootAlgorithm: string;
};

type ExtendedLedgerRow = LedgerIdentityRow & {
  canonicalName: string;
  paperEligible: boolean;
  paperPopulationFrame?: string;
  hasPaperPrinting?: boolean;
  populationCategory?: string;
};

type EligibilitySnapshot = {
  committed: {
    paperEligible: boolean;
    paperPopulationFrame: string | null;
    populationCategory: string | null;
    nonCompetitiveDeckReason: string | null;
  };
  runtime: {
    commanderEligibility: Record<string, unknown> | null;
    commanderEligibilityVersion: string | null;
    legalitiesCommander: string | null;
    commanderFormatStatus: string | null;
    canOccupyCommandZone: boolean | null;
    canBeSoleCommander: boolean | null;
    isCurrentlyCommanderLegal: boolean;
  };
  eligibilityStateChanged: boolean;
};

type DivergenceRecord = {
  oracleId: string;
  name: string;
  committedSourceVersion: string;
  runtimeSourceVersion: string;
  committedOracleTextHash: string;
  runtimeOracleTextHash: string;
  committedCardStructureHash: string;
  runtimeCardStructureHash: string;
  oracleTextHashChanged: boolean;
  cardStructureHashChanged: boolean;
  sourceVersionMismatchOnly: boolean;
  eligibility: EligibilitySnapshot;
  inCommittedLedger: boolean;
  primaryGroup: "A" | "B" | "C" | "D" | "E";
  groupTags: Array<"A" | "B" | "C" | "D" | "E">;
};

function sha256File(absPath: string): string {
  return createHash("sha256").update(readFileSync(absPath)).digest("hex");
}

function loadLedgerRows(paperPath: string): ExtendedLedgerRow[] {
  const rows: ExtendedLedgerRow[] = [];
  for (const line of readFileSync(paperPath, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    rows.push(JSON.parse(line) as ExtendedLedgerRow);
  }
  return rows;
}

function buildEligibilitySnapshot(
  catalog: DeckResolutionCatalog,
  oracleId: string,
  card: import("../src/lib/deck-builder/golden-catalog/schemas").GoldenCatalogOracleCard,
): EligibilitySnapshot {
  const paper = paperMetaForOracle(catalog, oracleId);
  const nonCompetitiveDeckReason = catalog.nonCompetitiveOracleReasons.get(oracleId) ?? null;
  const classification = deriveCommanderClassification(card);
  const runtimeCommanderLegal = isCurrentlyCommanderLegal(card);

  const committed = {
    paperEligible: paper.paperEligible,
    paperPopulationFrame: paper.paperPopulationFrame ?? null,
    populationCategory: paper.populationCategory ?? null,
    nonCompetitiveDeckReason,
  };

  const runtime = {
    commanderEligibility: card.commanderEligibility ? { ...card.commanderEligibility } : null,
    commanderEligibilityVersion: card.commanderEligibilityVersion ?? null,
    legalitiesCommander: card.legalities?.commander ?? null,
    commanderFormatStatus: classification.commanderFormatStatus,
    canOccupyCommandZone: classification.canOccupyCommandZone,
    canBeSoleCommander: classification.canBeSoleCommander,
    isCurrentlyCommanderLegal: runtimeCommanderLegal,
  };

  const commanderRelevant =
    runtime.legalitiesCommander != null ||
    runtimeCommanderLegal ||
    classification.canOccupyCommandZone ||
    classification.canBeSoleCommander;

  const paperVsCommanderConflict =
    committed.paperEligible &&
    runtime.legalitiesCommander === "not_legal" &&
    !runtimeCommanderLegal;

  const eligibilityStateChanged =
    commanderRelevant &&
    (paperVsCommanderConflict || (!committed.paperEligible && runtimeCommanderLegal));

  return { committed, runtime, eligibilityStateChanged };
}

function assignGroups(record: Omit<DivergenceRecord, "primaryGroup" | "groupTags">): Pick<DivergenceRecord, "primaryGroup" | "groupTags"> {
  const tags: Array<"A" | "B" | "C" | "D" | "E"> = [];
  if (!record.inCommittedLedger) tags.push("E");
  if (record.oracleTextHashChanged) tags.push("B");
  if (record.cardStructureHashChanged) tags.push("C");
  if (record.eligibility.eligibilityStateChanged) tags.push("D");
  if (record.sourceVersionMismatchOnly) tags.push("A");
  if (tags.length === 0) tags.push("E");

  let primaryGroup: DivergenceRecord["primaryGroup"] = "A";
  if (!record.inCommittedLedger) primaryGroup = "E";
  else if (record.eligibility.eligibilityStateChanged && !record.oracleTextHashChanged && !record.cardStructureHashChanged) {
    primaryGroup = "D";
  } else if (record.cardStructureHashChanged) primaryGroup = "C";
  else if (record.oracleTextHashChanged) primaryGroup = "B";
  else if (record.sourceVersionMismatchOnly) primaryGroup = "A";
  else primaryGroup = "E";

  return { primaryGroup, groupTags: tags };
}

async function main(): Promise<void> {
  if (!existsSync(COMMITMENT_PATH)) {
    throw new Error(`Missing catalog commitment v2: ${COMMITMENT_PATH}`);
  }
  const commitment = JSON.parse(readFileSync(COMMITMENT_PATH, "utf8")) as Commitment;
  const commitmentSha256 = sha256File(COMMITMENT_PATH);

  if (commitment.canonicalRootAlgorithm !== CATALOG_SORTED_NEWLINE_ROOT_V1) {
    throw new Error(`Unsupported canonicalRootAlgorithm ${commitment.canonicalRootAlgorithm}`);
  }

  const paperPath = resolve(REPO, commitment.paperEligibilityIdentitiesArtifact);
  if (!existsSync(paperPath)) throw new Error(`Missing paper ledger ${paperPath}`);
  if (sha256File(paperPath) !== commitment.paperEligibilityIdentitiesByteSha256) {
    throw new Error("FAIL_CLOSED: paper ledger SHA mismatch vs commitment v2");
  }

  const ledgerRows = loadLedgerRows(paperPath);
  const ledgerByOracleId = new Map<string, ExtendedLedgerRow>();
  for (const row of ledgerRows) ledgerByOracleId.set(row.oracleId, row);

  const [golden, catalog] = await Promise.all([
    loadGoldenCatalogIndex(),
    loadDeckResolutionCatalog({ failClosed: true }),
  ]);

  const mismatched: DivergenceRecord[] = [];
  const runtimeVersionCounts = new Map<string, number>();

  for (const [oracleId, card] of golden.byOracleId.entries()) {
    if (card.sourceVersion === commitment.catalogVersion) continue;
    runtimeVersionCounts.set(card.sourceVersion, (runtimeVersionCounts.get(card.sourceVersion) ?? 0) + 1);

    const ledger = ledgerByOracleId.get(oracleId);
    const oracleText = combinedGoldenOracleText(card);
    const runtimeOracleTextHash = goldenOracleTextHash(oracleText);
    const runtimeCardStructureHash = buildCanonicalOracleInput(card).cardStructureHash;
    const committedOracleTextHash = ledger?.oracleTextHash ?? "MISSING_FROM_LEDGER";
    const committedCardStructureHash = ledger?.cardStructureHash ?? "MISSING_FROM_LEDGER";
    const oracleTextHashChanged = ledger != null && runtimeOracleTextHash !== ledger.oracleTextHash;
    const cardStructureHashChanged = ledger != null && runtimeCardStructureHash !== ledger.cardStructureHash;
    const sourceVersionMismatchOnly =
      ledger != null && !oracleTextHashChanged && !cardStructureHashChanged;

    const base = {
      oracleId,
      name: card.name ?? ledger?.canonicalName ?? "UNKNOWN",
      committedSourceVersion: commitment.catalogVersion,
      runtimeSourceVersion: card.sourceVersion,
      committedOracleTextHash,
      runtimeOracleTextHash,
      committedCardStructureHash,
      runtimeCardStructureHash,
      oracleTextHashChanged,
      cardStructureHashChanged,
      sourceVersionMismatchOnly,
      eligibility: buildEligibilitySnapshot(catalog, oracleId, card),
      inCommittedLedger: ledger != null,
    };
    const groups = assignGroups(base);
    mismatched.push({ ...base, ...groups });
  }

  mismatched.sort((a, b) => a.oracleId.localeCompare(b.oracleId));

  const committedIdsMissingFromRuntime: string[] = [];
  const runtimeIdsAbsentFromCommitment: string[] = [];
  for (const ledgerId of ledgerByOracleId.keys()) {
    if (!golden.byOracleId.has(ledgerId)) committedIdsMissingFromRuntime.push(ledgerId);
  }
  for (const runtimeId of golden.byOracleId.keys()) {
    if (!ledgerByOracleId.has(runtimeId)) runtimeIdsAbsentFromCommitment.push(runtimeId);
  }
  committedIdsMissingFromRuntime.sort();
  runtimeIdsAbsentFromCommitment.sort();

  const groupedTotals = {
    A_sourceVersionMismatchOnly_semanticHashesIdentical: mismatched.filter((r) => r.groupTags.includes("A")).length,
    B_oracleTextHashChanged: mismatched.filter((r) => r.groupTags.includes("B")).length,
    C_cardStructureHashChanged: mismatched.filter((r) => r.groupTags.includes("C")).length,
    D_commanderLegalityOrEligibilityStateChanged: mismatched.filter((r) => r.groupTags.includes("D")).length,
    E_otherAnomaly: mismatched.filter((r) => r.groupTags.includes("E")).length,
  };

  const distinctRuntimeSourceVersions = [...runtimeVersionCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([sourceVersion, count]) => ({ sourceVersion, count }));

  const audit = {
    version: "phase6a1-professor-plan-catalog-sourceversion-divergence-audit-v1",
    auditedAt: new Date().toISOString(),
    disposition: "CATALOG_VERIFIER_V2_FAIL_CLOSED_CONFIRMED_DIAGNOSTIC_ONLY",
    readOnly: true,
    firestoreWrites: false,
    executionBoundary:
      process.env.PHASE6A1_IMPLEMENTATION_CONTAINER === "1"
        ? "PINNED_DOCKER_IMPLEMENTATION_CONTAINER"
        : "HOST",
    auditScript: "web/scripts/run-phase6a1-audit-catalog-sourceversion-divergence-v1.ts",
    commitmentArtifact: "phase6a1-professor-plan-full-catalog-data-state-commitment-v2.json",
    commitmentByteSha256: commitmentSha256,
    committedCatalogVersion: commitment.catalogVersion,
    nonUniformSourceVersionRecordCount: mismatched.length,
    universeChecks: {
      committedLedgerRowCount: ledgerRows.length,
      runtimeFirestoreCardCount: golden.cardCount,
      expectedFullOracleCardCount: commitment.fullOracleCardCount,
      overallCountExactly38542:
        ledgerRows.length === commitment.fullOracleCardCount &&
        golden.cardCount === commitment.fullOracleCardCount,
      all293OracleIdsExistInCommittedLedger: mismatched.every((r) => r.inCommittedLedger),
      committedIdsMissingFromRuntimeCount: committedIdsMissingFromRuntime.length,
      committedIdsMissingFromRuntime: committedIdsMissingFromRuntime.slice(0, 20),
      runtimeIdsAbsentFromCommitmentCount: runtimeIdsAbsentFromCommitment.length,
      runtimeIdsAbsentFromCommitment: runtimeIdsAbsentFromCommitment.slice(0, 20),
    },
    distinctRuntimeSourceVersionsAmong293: distinctRuntimeSourceVersions,
    groupedTotals,
    primaryGroupTotals: {
      A: mismatched.filter((r) => r.primaryGroup === "A").length,
      B: mismatched.filter((r) => r.primaryGroup === "B").length,
      C: mismatched.filter((r) => r.primaryGroup === "C").length,
      D: mismatched.filter((r) => r.primaryGroup === "D").length,
      E: mismatched.filter((r) => r.primaryGroup === "E").length,
    },
    records: mismatched,
    instruction: "REPORT_AND_WAIT",
  };

  writeOnceMilestoneArtifact(OUTPUT_PATH, audit);
  console.log(
    JSON.stringify(
      {
        outputPath: OUTPUT_PATH,
        auditSha256: sha256File(OUTPUT_PATH),
        nonUniformSourceVersionRecordCount: mismatched.length,
        groupedTotals,
        distinctRuntimeSourceVersionsAmong293: distinctRuntimeSourceVersions,
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
