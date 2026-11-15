/**
 * Read-only post-repair catalog sourceVersion verification.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCanonicalOracleInput } from "./lib/catalog-population-classifier-v1";
import { type LedgerIdentityRow } from "./lib/catalog-sorted-newline-root-v1";
import { combinedGoldenOracleText, goldenOracleTextHash, loadGoldenCatalogIndex } from "./lib/load-golden-catalog-index";
import { writeOnceMilestoneArtifact } from "./lib/write-once-milestone-artifact-v2";

const HERE = resolve(fileURLToPath(import.meta.url), "..");
const REPO = resolve(HERE, "../..");
const MILESTONES = resolve(REPO, "web/data/milestones/deck-synthesis");
const COMMITMENT_PATH = resolve(MILESTONES, "phase6a1-professor-plan-full-catalog-data-state-commitment-v2.json");
const REPAIR_MANIFEST_PATH = resolve(MILESTONES, "phase6a1-professor-plan-catalog-sourceversion-repair-manifest-v1.json");
const OUTPUT_BASENAME = "phase6a1-professor-plan-catalog-sourceversion-post-repair-verification-v1.json";
const OUTPUT_PATH = resolve(
  process.env.PHASE6A1_ARTIFACT_OUTPUT_DIR?.trim() || MILESTONES,
  OUTPUT_BASENAME,
);

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function loadLedgerRows(paperPath: string): LedgerIdentityRow[] {
  const rows: LedgerIdentityRow[] = [];
  for (const line of readFileSync(paperPath, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    rows.push(JSON.parse(line) as LedgerIdentityRow);
  }
  return rows;
}

async function main(): Promise<void> {
  if (!existsSync(COMMITMENT_PATH)) throw new Error(`Missing commitment v2 ${COMMITMENT_PATH}`);
  if (!existsSync(REPAIR_MANIFEST_PATH)) {
    throw new Error(`Missing repair manifest ${REPAIR_MANIFEST_PATH}`);
  }

  const commitment = JSON.parse(readFileSync(COMMITMENT_PATH, "utf8")) as {
    catalogVersion: string;
    fullOracleCardCount: number;
    paperEligibilityIdentitiesArtifact: string;
  };
  const repairManifestSha256 = sha256File(REPAIR_MANIFEST_PATH);
  const paperPath = resolve(REPO, commitment.paperEligibilityIdentitiesArtifact);
  const ledgerRows = loadLedgerRows(paperPath);
  const ledgerByOracleId = new Map(ledgerRows.map((r) => [r.oracleId, r]));

  const golden = await loadGoldenCatalogIndex();
  let nonUniformSourceVersionCount = 0;
  let matchingCommittedPinCount = 0;
  let oracleTextHashMismatches = 0;
  let cardStructureHashMismatches = 0;
  const committedIdsMissingFromRuntime: string[] = [];
  const runtimeIdsAbsentFromCommitment: string[] = [];

  for (const card of golden.byOracleId.values()) {
    if (card.sourceVersion === commitment.catalogVersion) matchingCommittedPinCount += 1;
    else nonUniformSourceVersionCount += 1;

    const ledger = ledgerByOracleId.get(card.oracleId);
    if (!ledger) {
      runtimeIdsAbsentFromCommitment.push(card.oracleId);
      continue;
    }
    const oracleText = combinedGoldenOracleText(card);
    const runtimeOracleTextHash = goldenOracleTextHash(oracleText);
    const runtimeCardStructureHash = buildCanonicalOracleInput(card).cardStructureHash;
    if (runtimeOracleTextHash !== ledger.oracleTextHash) oracleTextHashMismatches += 1;
    if (runtimeCardStructureHash !== ledger.cardStructureHash) cardStructureHashMismatches += 1;
  }

  for (const ledgerId of ledgerByOracleId.keys()) {
    if (!golden.byOracleId.has(ledgerId)) committedIdsMissingFromRuntime.push(ledgerId);
  }

  const checks = {
    runtimeCards: golden.cardCount,
    expectedCards: commitment.fullOracleCardCount,
    runtimeCardsExactly38542: golden.cardCount === commitment.fullOracleCardCount,
    committedIdsMissingCount: committedIdsMissingFromRuntime.length,
    runtimeIdsExtraCount: runtimeIdsAbsentFromCommitment.length,
    nonUniformSourceVersionCount,
    sourceVersionMatchingCommittedPinCount: matchingCommittedPinCount,
    sourceVersionMatchingCommittedPinExactly38542:
      matchingCommittedPinCount === commitment.fullOracleCardCount,
    oracleTextHashMismatches,
    cardStructureHashMismatches,
  };

  const pass =
    checks.runtimeCardsExactly38542 &&
    checks.committedIdsMissingCount === 0 &&
    checks.runtimeIdsExtraCount === 0 &&
    checks.nonUniformSourceVersionCount === 0 &&
    checks.sourceVersionMatchingCommittedPinExactly38542 &&
    checks.oracleTextHashMismatches === 0 &&
    checks.cardStructureHashMismatches === 0;

  const verification = {
    version: "phase6a1-professor-plan-catalog-sourceversion-post-repair-verification-v1",
    verifiedAt: new Date().toISOString(),
    readOnly: true,
    firestoreWrites: false,
    executionBoundary:
      process.env.PHASE6A1_IMPLEMENTATION_CONTAINER === "1"
        ? "PINNED_DOCKER_IMPLEMENTATION_CONTAINER"
        : "HOST",
    repairManifestArtifact: "phase6a1-professor-plan-catalog-sourceversion-repair-manifest-v1.json",
    repairManifestSha256,
    committedCatalogVersion: commitment.catalogVersion,
    checks,
    pass,
    instruction: pass ? "AUTHORIZED_TO_RERUN_CATALOG_VERIFIER_V2" : "REPORT_AND_WAIT",
  };

  writeOnceMilestoneArtifact(OUTPUT_PATH, verification);
  console.log(JSON.stringify({ outputPath: OUTPUT_PATH, verificationSha256: sha256File(OUTPUT_PATH), pass, checks }, null, 2));
  if (!pass) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
