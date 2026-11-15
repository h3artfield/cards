/**
 * Fail-closed verification of pinned Commander eligibility-state commitment v2 (v3 writer, single snapshot).
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
const COMMITMENT_PATH = resolve(MILESTONES, "phase6a1-professor-plan-commander-eligibility-state-commitment-v2.json");
const OUTPUT_PATH = resolve(MILESTONES, "phase6a1-professor-plan-commander-eligibility-state-verification-v2.json");

type Commitment = {
  fullOracleCardCount: number;
  catalogVersion: string;
  eligibilityStateRootAlgorithm: string;
  sharedVerifiedCatalogSnapshotIdentity: {
    catalogVersion: string;
    fullOracleCardCount: number;
    catalogLegalitiesSnapshotIdentitySha256: string;
  };
  expectedEligibilityStateRoots: ReturnType<typeof capturePreRosterSingleCatalogSnapshot> extends Promise<infer T>
    ? T extends { eligibilityStateRoots: infer R }
      ? R
      : never
    : never;
  boundPreRosterCatalogVerification: {
    artifact: string;
    byteSha256: string;
    commitmentByteSha256: string;
    runtimeCanonicalRoots: Record<string, string>;
    verifiedCatalogSnapshotIdentity: Commitment["sharedVerifiedCatalogSnapshotIdentity"];
  };
};

async function main(): Promise<void> {
  if (!existsSync(COMMITMENT_PATH)) {
    throw new Error(`Missing eligibility-state commitment v2: ${COMMITMENT_PATH}`);
  }
  const commitment = JSON.parse(readFileSync(COMMITMENT_PATH, "utf8")) as Commitment;
  const commitmentSha256 = sha256File(COMMITMENT_PATH);

  if (commitment.eligibilityStateRootAlgorithm !== COMMANDER_ELIGIBILITY_STATE_ROOT_V2) {
    throw new Error(
      `FAIL_CLOSED: unsupported eligibilityStateRootAlgorithm ${commitment.eligibilityStateRootAlgorithm}`,
    );
  }

  const preRosterPath = resolve(MILESTONES, commitment.boundPreRosterCatalogVerification.artifact);
  if (!existsSync(preRosterPath)) {
    throw new Error(`FAIL_CLOSED: missing bound pre-roster catalog verification ${preRosterPath}`);
  }
  const preRosterSha256 = sha256File(preRosterPath);
  if (preRosterSha256 !== commitment.boundPreRosterCatalogVerification.byteSha256) {
    throw new Error("FAIL_CLOSED: bound pre-roster catalog verification SHA mismatch");
  }

  const capture = await capturePreRosterSingleCatalogSnapshot({
    repoRoot: REPO,
    commitmentPath: resolve(MILESTONES, "phase6a1-professor-plan-full-catalog-data-state-commitment-v2.json"),
    verifyPilotCommanders: true,
  });

  if (capture.catalogVerificationCore.commitmentSha256 !== commitment.boundPreRosterCatalogVerification.commitmentByteSha256) {
    throw new Error("FAIL_CLOSED: in-process catalog commitment SHA != commitment-bound pre-roster artifact");
  }
  for (const key of Object.keys(capture.catalogVerificationCore.runtimeCanonicalRoots)) {
    const runtime =
      capture.catalogVerificationCore.runtimeCanonicalRoots[key as keyof typeof capture.catalogVerificationCore.runtimeCanonicalRoots];
    const bound = commitment.boundPreRosterCatalogVerification.runtimeCanonicalRoots[key];
    if (runtime !== bound) {
      throw new Error(`FAIL_CLOSED: in-process catalog root ${key} != commitment-bound pre-roster roots");
    }
  }
  assertMatchingVerifiedCatalogSnapshotIdentity(
    commitment.boundPreRosterCatalogVerification.verifiedCatalogSnapshotIdentity,
    capture.catalogVerificationCore.verifiedCatalogSnapshotIdentity,
  );
  assertMatchingVerifiedCatalogSnapshotIdentity(
    commitment.sharedVerifiedCatalogSnapshotIdentity,
    capture.catalogVerificationCore.verifiedCatalogSnapshotIdentity,
  );

  const runtimeRoots = capture.eligibilityStateRoots;
  for (const key of ["fullEligibilityStateRootSha256"] as const) {
    if (runtimeRoots[key] !== commitment.expectedEligibilityStateRoots[key]) {
      throw new Error(`FAIL_CLOSED: runtime ${key} mismatch`);
    }
  }
  for (const stage of ["eligibleUniverseBeforeFreshness", "freshEligibleUniverse"] as const) {
    for (const field of ["oracleIdCount", "oracleIdSetSha256"] as const) {
      if (runtimeRoots[stage][field] !== commitment.expectedEligibilityStateRoots[stage][field]) {
        throw new Error(`FAIL_CLOSED: runtime ${stage}.${field} mismatch`);
      }
    }
  }
  if (
    runtimeRoots.freshEligibleUniverse.exposedIdentitiesManifestByteSha256 !==
    commitment.expectedEligibilityStateRoots.freshEligibleUniverse.exposedIdentitiesManifestByteSha256
  ) {
    throw new Error("FAIL_CLOSED: freshEligibleUniverse exposed manifest SHA mismatch");
  }

  const verification = {
    version: "phase6a1-professor-plan-commander-eligibility-state-verification-v2",
    verifiedAt: new Date().toISOString(),
    verifierScript: "web/scripts/run-phase6a1-verify-commander-eligibility-state-v3.ts",
    commitmentArtifact: "phase6a1-professor-plan-commander-eligibility-state-commitment-v2.json",
    commitmentByteSha256: commitmentSha256,
    boundPreRosterCatalogVerificationByteSha256: preRosterSha256,
    sharedVerifiedCatalogSnapshotIdentity: capture.catalogVerificationCore.verifiedCatalogSnapshotIdentity,
    singleCatalogLoadInvariantVerified: true,
    eligibilityStateRootAlgorithm: COMMANDER_ELIGIBILITY_STATE_ROOT_V2,
    runtimeChecks: {
      fullOracleCardCount: capture.catalog.cardCount,
      catalogVersion: capture.catalog.catalogVersion,
      inProcessCatalogVerificationPass: true,
      runtimeEligibilityStateRoots: runtimeRoots,
      expectedEligibilityStateRoots: commitment.expectedEligibilityStateRoots,
      allRootsMatchCommitted: true,
    },
    pass: true,
  };

  writeOnceMilestoneArtifact(OUTPUT_PATH, verification);
  console.log(JSON.stringify({ outputPath: OUTPUT_PATH, verificationSha256: sha256File(OUTPUT_PATH) }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
