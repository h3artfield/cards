/**
 * Compute commander eligibility-state commitment v2 from a single verified catalog snapshot (v3 writer).
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertMatchingVerifiedCatalogSnapshotIdentity,
  capturePreRosterSingleCatalogSnapshot,
  COMMANDER_ELIGIBILITY_STATE_ROOT_V2,
} from "./lib/pre-roster-single-catalog-snapshot-capture-v1";
import { writeOnceMilestoneArtifact } from "./lib/write-once-milestone-artifact-v1";
import { sha256File } from "./lib/verify-pinned-catalog-data-state-v2-core-v2";

const HERE = resolve(fileURLToPath(import.meta.url), "..");
const REPO = resolve(HERE, "../..");
const MILESTONES = resolve(REPO, "web/data/milestones/deck-synthesis");
const COMMITMENT_V2_PATH = resolve(MILESTONES, "phase6a1-professor-plan-full-catalog-data-state-commitment-v2.json");
const PRE_ROSTER_VERIFICATION_PATH = resolve(
  MILESTONES,
  "phase6a1-professor-plan-catalog-data-state-verification-pre-roster-v1.json",
);
const OUTPUT_PATH = resolve(MILESTONES, "phase6a1-professor-plan-commander-eligibility-state-commitment-v2.json");

type PreRosterVerification = {
  pass: boolean;
  verificationPhase: string;
  commitmentByteSha256: string;
  verifiedCatalogSnapshotIdentity: {
    catalogVersion: string;
    fullOracleCardCount: number;
    catalogLegalitiesSnapshotIdentitySha256: string;
  };
  runtimeChecks: {
    runtimeCanonicalRoots: Record<string, string>;
  };
};

async function main(): Promise<void> {
  if (!existsSync(PRE_ROSTER_VERIFICATION_PATH)) {
    throw new Error(
      `FAIL_CLOSED: missing pre-roster catalog verification artifact ${PRE_ROSTER_VERIFICATION_PATH}. Run run-phase6a1-verify-pinned-catalog-data-state-pre-roster-v2.ts first.`,
    );
  }

  const preRosterVerification = JSON.parse(readFileSync(PRE_ROSTER_VERIFICATION_PATH, "utf8")) as PreRosterVerification;
  const preRosterVerificationSha256 = sha256File(PRE_ROSTER_VERIFICATION_PATH);
  if (!preRosterVerification.pass) {
    throw new Error("FAIL_CLOSED: pre-roster catalog verification artifact is not PASS");
  }
  if (preRosterVerification.verificationPhase !== "pre_roster") {
    throw new Error("FAIL_CLOSED: expected verificationPhase pre_roster");
  }

  const capture = await capturePreRosterSingleCatalogSnapshot({
    repoRoot: REPO,
    commitmentPath: COMMITMENT_V2_PATH,
    verifyPilotCommanders: true,
  });

  if (capture.catalogVerificationCore.commitmentSha256 !== preRosterVerification.commitmentByteSha256) {
    throw new Error("FAIL_CLOSED: in-process catalog verification commitment SHA != pinned pre-roster artifact");
  }
  for (const key of Object.keys(capture.catalogVerificationCore.runtimeCanonicalRoots)) {
    const runtime =
      capture.catalogVerificationCore.runtimeCanonicalRoots[key as keyof typeof capture.catalogVerificationCore.runtimeCanonicalRoots];
    const pinned = preRosterVerification.runtimeChecks.runtimeCanonicalRoots[key];
    if (runtime !== pinned) {
      throw new Error(`FAIL_CLOSED: in-process runtime root ${key} != pinned pre-roster artifact (${runtime} != ${pinned})`);
    }
  }
  assertMatchingVerifiedCatalogSnapshotIdentity(
    preRosterVerification.verifiedCatalogSnapshotIdentity,
    capture.catalogVerificationCore.verifiedCatalogSnapshotIdentity,
  );

  const commitment = {
    version: "phase6a1-professor-plan-commander-eligibility-state-commitment-v2",
    computedAt: new Date().toISOString(),
    computeScript: "web/scripts/run-phase6a1-compute-commander-eligibility-state-commitment-v3.ts",
    extendsFullCatalogDataStateCommitment: "phase6a1-professor-plan-full-catalog-data-state-commitment-v2.json",
    extendsDeckResolutionDataStatePin: "phase6a1-professor-plan-deck-resolution-data-state-pin-v2.json",
    extendsBenchmarkCommanderEligibilityContract:
      "phase6a1-professor-plan-benchmark-commander-eligibility-contract-pin-v1.json",
    extendsExposedBenchmarkIdentitiesManifest: "phase6a1-exposed-benchmark-identities-manifest-v2.json",
    boundPreRosterCatalogVerification: {
      artifact: "phase6a1-professor-plan-catalog-data-state-verification-pre-roster-v1.json",
      byteSha256: preRosterVerificationSha256,
      commitmentByteSha256: capture.catalogVerificationCore.commitmentSha256,
      runtimeCanonicalRoots: capture.catalogVerificationCore.runtimeCanonicalRoots,
      verifiedCatalogSnapshotIdentity: capture.catalogVerificationCore.verifiedCatalogSnapshotIdentity,
    },
    sharedVerifiedCatalogSnapshotIdentity: capture.catalogVerificationCore.verifiedCatalogSnapshotIdentity,
    singleCatalogLoadInvariant:
      "Canonical catalog verification and Commander eligibility roots were computed from one in-memory DeckResolutionCatalog load with no intervening Firestore reload.",
    pilotTimeCatalogVerificationPreserved:
      "phase6a1-professor-plan-catalog-data-state-verification-v2.json MUST NOT be overwritten",
    purpose:
      "Deterministic Commander eligibility-state bound to the exact pre-roster full catalog verification snapshot.",
    fullOracleCardCount: capture.catalog.cardCount,
    catalogVersion: capture.catalog.catalogVersion,
    eligibilityStateRootAlgorithm: COMMANDER_ELIGIBILITY_STATE_ROOT_V2,
    expectedEligibilityStateRoots: capture.eligibilityStateRoots,
    universeStages: {
      eligibleUniverseBeforeFreshness:
        "All paper-eligible single-commander-eligible Oracle IDs before exposed/spent freshness exclusions",
      freshEligibleUniverse:
        "eligibleUniverseBeforeFreshness minus pinned exposed-benchmark oracle IDs; roster generator samples only from this set",
    },
    instruction:
      "Operational readiness and roster-v3 MUST pin this commitment byte SHA, the bound pre-roster catalog verification SHA, shared snapshot identity, and completed eligibility verification v2 artifact.",
  };

  writeOnceMilestoneArtifact(OUTPUT_PATH, commitment);
  console.log(
    JSON.stringify(
      {
        outputPath: OUTPUT_PATH,
        commitmentSha256: sha256File(OUTPUT_PATH),
        boundPreRosterCatalogVerificationSha256: preRosterVerificationSha256,
        sharedVerifiedCatalogSnapshotIdentity: capture.catalogVerificationCore.verifiedCatalogSnapshotIdentity,
        roots: capture.eligibilityStateRoots,
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
