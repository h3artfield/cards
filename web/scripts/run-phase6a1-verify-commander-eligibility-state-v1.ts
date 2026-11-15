/**
 * Fail-closed verification of pinned Commander eligibility-state against live DeckResolutionCatalog.
 * Required before roster-v3 and operational-readiness final authorization; does not block spent pilot.
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
const COMMITMENT_PATH = resolve(MILESTONES, "phase6a1-professor-plan-commander-eligibility-state-commitment-v1.json");
const OUTPUT_PATH = resolve(MILESTONES, "phase6a1-professor-plan-commander-eligibility-state-verification-v1.json");

function sha256File(absPath: string): string {
  return createHash("sha256").update(readFileSync(absPath)).digest("hex");
}

type Commitment = {
  fullOracleCardCount: number;
  catalogVersion: string;
  eligibilityStateRootAlgorithm: string;
  expectedEligibilityStateRoots: {
    fullEligibilityStateRootSha256: string;
    singleCommanderEligibleOracleIdCount: number;
    singleCommanderEligibleOracleIdSetSha256: string;
  };
};

async function main(): Promise<void> {
  if (!existsSync(COMMITMENT_PATH)) {
    throw new Error(`Missing eligibility-state commitment: ${COMMITMENT_PATH}`);
  }
  const commitment = JSON.parse(readFileSync(COMMITMENT_PATH, "utf8")) as Commitment;
  const commitmentSha256 = sha256File(COMMITMENT_PATH);

  if (commitment.eligibilityStateRootAlgorithm !== COMMANDER_ELIGIBILITY_STATE_ROOT_V1) {
    throw new Error(
      `FAIL_CLOSED: unsupported eligibilityStateRootAlgorithm ${commitment.eligibilityStateRootAlgorithm}`,
    );
  }

  const catalog = await loadDeckResolutionCatalog({ failClosed: true });
  if (catalog.cardCount !== commitment.fullOracleCardCount) {
    throw new Error(`FAIL_CLOSED: catalog cardCount ${catalog.cardCount} != ${commitment.fullOracleCardCount}`);
  }
  if (catalog.catalogVersion !== commitment.catalogVersion) {
    throw new Error(`FAIL_CLOSED: catalogVersion ${catalog.catalogVersion} != ${commitment.catalogVersion}`);
  }

  const { roots: runtimeRoots } = computeCommanderEligibilityStateRoots(catalog);
  for (const key of [
    "fullEligibilityStateRootSha256",
    "singleCommanderEligibleOracleIdCount",
    "singleCommanderEligibleOracleIdSetSha256",
  ] as const) {
    if (runtimeRoots[key] !== commitment.expectedEligibilityStateRoots[key]) {
      throw new Error(
        `FAIL_CLOSED: runtime ${key} ${runtimeRoots[key]} != committed ${commitment.expectedEligibilityStateRoots[key]}`,
      );
    }
  }

  const verification = {
    version: "phase6a1-professor-plan-commander-eligibility-state-verification-v1",
    verifiedAt: new Date().toISOString(),
    verifierScript: "web/scripts/run-phase6a1-verify-commander-eligibility-state-v1.ts",
    commitmentArtifact: "phase6a1-professor-plan-commander-eligibility-state-commitment-v1.json",
    commitmentByteSha256: commitmentSha256,
    eligibilityStateRootAlgorithm: COMMANDER_ELIGIBILITY_STATE_ROOT_V1,
    runtimeChecks: {
      fullOracleCardCount: catalog.cardCount,
      catalogVersion: catalog.catalogVersion,
      runtimeEligibilityStateRoots: runtimeRoots,
      expectedEligibilityStateRoots: commitment.expectedEligibilityStateRoots,
      allRootsMatchCommitted: true,
    },
    pass: true,
  };

  writeFileSync(OUTPUT_PATH, JSON.stringify(verification, null, 2));
  console.log(JSON.stringify({ outputPath: OUTPUT_PATH, verificationSha256: sha256File(OUTPUT_PATH) }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
