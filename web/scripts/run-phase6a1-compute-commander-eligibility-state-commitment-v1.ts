/**
 * Compute commander eligibility-state roots from live DeckResolutionCatalog for commitment sealing.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  COMMANDER_ELIGIBILITY_STATE_ROOT_V1,
  computeCommanderEligibilityStateRoots,
} from "./lib/catalog-commander-eligibility-state-root-v1";
import { loadDeckResolutionCatalog } from "./lib/load-deck-resolution-catalog";

const HERE = resolve(fileURLToPath(import.meta.url), "..");
const REPO = resolve(HERE, "../..");
const MILESTONES = resolve(REPO, "web/data/milestones/deck-synthesis");
const COMMITMENT_V2_PATH = resolve(MILESTONES, "phase6a1-professor-plan-full-catalog-data-state-commitment-v2.json");
const OUTPUT_PATH = resolve(MILESTONES, "phase6a1-professor-plan-commander-eligibility-state-commitment-v1.json");

function sha256File(absPath: string): string {
  return createHash("sha256").update(readFileSync(absPath)).digest("hex");
}

async function main(): Promise<void> {
  if (!existsSync(COMMITMENT_V2_PATH)) {
    throw new Error(`Missing prerequisite commitment v2: ${COMMITMENT_V2_PATH}`);
  }
  const catalogCommitment = JSON.parse(readFileSync(COMMITMENT_V2_PATH, "utf8")) as {
    catalogVersion: string;
    fullOracleCardCount: number;
  };

  const catalog = await loadDeckResolutionCatalog({ failClosed: true });
  if (catalog.cardCount !== catalogCommitment.fullOracleCardCount) {
    throw new Error(`FAIL_CLOSED: catalog cardCount ${catalog.cardCount} != ${catalogCommitment.fullOracleCardCount}`);
  }
  if (catalog.catalogVersion !== catalogCommitment.catalogVersion) {
    throw new Error(`FAIL_CLOSED: catalogVersion mismatch`);
  }

  const { roots } = computeCommanderEligibilityStateRoots(catalog);
  const commitment = {
    version: "phase6a1-professor-plan-commander-eligibility-state-commitment-v1",
    computedAt: new Date().toISOString(),
    extendsFullCatalogDataStateCommitment: "phase6a1-professor-plan-full-catalog-data-state-commitment-v2.json",
    extendsDeckResolutionDataStatePin: "phase6a1-professor-plan-deck-resolution-data-state-pin-v2.json",
    extendsBenchmarkCommanderEligibilityContract:
      "phase6a1-professor-plan-benchmark-commander-eligibility-contract-pin-v1.json",
    purpose:
      "Deterministic Commander eligibility-state over all Oracle identities, binding live legalities and paper eligibility used by roster generation.",
    fullOracleCardCount: catalog.cardCount,
    catalogVersion: catalog.catalogVersion,
    eligibilityStateRootAlgorithm: COMMANDER_ELIGIBILITY_STATE_ROOT_V1,
    eligibilityStateRootAlgorithmDefinition:
      "For each oracleId in sorted order, emit oracleId|paperEligible|commanderFormatStatus|structurallyEligible|canBeSoleCommander|canOccupyCommandZone; sort lines lexicographically; join with single newline; SHA-256. Single-commander-eligible set = rows where paperEligible && commanderFormatStatus=legal && structurallyEligible && canBeSoleCommander; eligible Oracle-ID-set root uses sorted oracleId lines only.",
    expectedEligibilityStateRoots: roots,
    bindsFieldsIncluding: [
      "card.legalities.commander via deriveCommanderClassification.commanderFormatStatus",
      "paperEligible from pinned paper ledger",
      "structurallyEligible/canBeSoleCommander/canOccupyCommandZone from pinned commander-classification.ts",
    ],
    requiredBefore: ["operational-readiness-sealed-v2 final authorization", "roster-v3 generation"],
    doesNotBlock: "spent serialization pilot under spec v8",
    instruction:
      "Operational readiness and roster-v3 MUST pin this commitment byte SHA and a completed commander-eligibility-state-verification-v1 artifact whose runtime roots match exactly.",
  };

  writeFileSync(OUTPUT_PATH, JSON.stringify(commitment, null, 2));
  console.log(JSON.stringify({ outputPath: OUTPUT_PATH, commitmentSha256: sha256File(OUTPUT_PATH), roots }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
