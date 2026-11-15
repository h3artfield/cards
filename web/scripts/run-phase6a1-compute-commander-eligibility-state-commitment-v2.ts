/**
 * Compute commander eligibility-state commitment v2 from the pre-roster verified catalog state.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  COMMANDER_ELIGIBILITY_STATE_ROOT_V2,
  computeCommanderEligibilityStateRootsV2,
} from "./lib/catalog-commander-eligibility-state-root-v2";
import { loadExposedBenchmarkOracleIdsFailClosed } from "./lib/load-exposed-benchmark-oracle-ids-v2";
import { loadDeckResolutionCatalog } from "./lib/load-deck-resolution-catalog";
import {
  buildCatalogVerificationArtifact,
  runCatalogDataStateVerificationCore,
  sha256File,
} from "./lib/verify-pinned-catalog-data-state-v2-core";

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
  runtimeChecks: {
    runtimeCanonicalRoots: Record<string, string>;
    expectedCanonicalRoots: Record<string, string>;
  };
};

async function main(): Promise<void> {
  if (!existsSync(PRE_ROSTER_VERIFICATION_PATH)) {
    throw new Error(
      `FAIL_CLOSED: missing pre-roster catalog verification artifact ${PRE_ROSTER_VERIFICATION_PATH}. Run run-phase6a1-verify-pinned-catalog-data-state-pre-roster-v1.ts first.`,
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

  const core = await runCatalogDataStateVerificationCore({
    repoRoot: REPO,
    commitmentPath: COMMITMENT_V2_PATH,
    verifyPilotCommanders: true,
  });

  if (core.commitmentSha256 !== preRosterVerification.commitmentByteSha256) {
    throw new Error("FAIL_CLOSED: in-process catalog verification commitment SHA != pinned pre-roster artifact");
  }
  for (const key of Object.keys(core.runtimeCanonicalRoots)) {
    const runtime = core.runtimeCanonicalRoots[key as keyof typeof core.runtimeCanonicalRoots];
    const pinned = preRosterVerification.runtimeChecks.runtimeCanonicalRoots[key];
    if (runtime !== pinned) {
      throw new Error(`FAIL_CLOSED: in-process runtime root ${key} != pinned pre-roster artifact (${runtime} != ${pinned})`);
    }
  }

  const catalog = await loadDeckResolutionCatalog({ failClosed: true });
  const exposed = loadExposedBenchmarkOracleIdsFailClosed(catalog);
  const { roots } = computeCommanderEligibilityStateRootsV2(catalog, exposed);

  const commitment = {
    version: "phase6a1-professor-plan-commander-eligibility-state-commitment-v2",
    computedAt: new Date().toISOString(),
    extendsFullCatalogDataStateCommitment: "phase6a1-professor-plan-full-catalog-data-state-commitment-v2.json",
    extendsDeckResolutionDataStatePin: "phase6a1-professor-plan-deck-resolution-data-state-pin-v2.json",
    extendsBenchmarkCommanderEligibilityContract:
      "phase6a1-professor-plan-benchmark-commander-eligibility-contract-pin-v1.json",
    extendsExposedBenchmarkIdentitiesManifest: "phase6a1-exposed-benchmark-identities-manifest-v2.json",
    boundPreRosterCatalogVerification: {
      artifact: "phase6a1-professor-plan-catalog-data-state-verification-pre-roster-v1.json",
      byteSha256: preRosterVerificationSha256,
      commitmentByteSha256: core.commitmentSha256,
      runtimeCanonicalRoots: core.runtimeCanonicalRoots,
    },
    pilotTimeCatalogVerificationPreserved:
      "phase6a1-professor-plan-catalog-data-state-verification-v2.json MUST NOT be overwritten",
    purpose:
      "Deterministic Commander eligibility-state bound to the exact pre-roster full catalog verification state.",
    fullOracleCardCount: catalog.cardCount,
    catalogVersion: catalog.catalogVersion,
    eligibilityStateRootAlgorithm: COMMANDER_ELIGIBILITY_STATE_ROOT_V2,
    expectedEligibilityStateRoots: roots,
    universeStages: {
      eligibleUniverseBeforeFreshness:
        "All paper-eligible single-commander-eligible Oracle IDs before exposed/spent freshness exclusions",
      freshEligibleUniverse:
        "eligibleUniverseBeforeFreshness minus pinned exposed-benchmark oracle IDs; roster generator samples only from this set",
    },
    instruction:
      "Operational readiness and roster-v3 MUST pin this commitment byte SHA, the bound pre-roster catalog verification SHA, and completed eligibility verification v2 artifact.",
  };

  writeFileSync(OUTPUT_PATH, JSON.stringify(commitment, null, 2));

  const inProcessArtifact = buildCatalogVerificationArtifact({
    phase: "pre_roster",
    version: "phase6a1-professor-plan-catalog-data-state-verification-pre-roster-v1",
    verifierScript: "web/scripts/run-phase6a1-verify-pinned-catalog-data-state-pre-roster-v1.ts",
    verifiedAt: new Date().toISOString(),
    core,
  });
  const inProcessSha = createHash("sha256").update(JSON.stringify(inProcessArtifact, null, 2)).digest("hex");
  if (inProcessSha !== preRosterVerificationSha256) {
    console.warn(
      JSON.stringify({
        warning: "Pre-roster verification artifact byte SHA differs from freshly recomputed JSON (timestamps). Root cross-check passed.",
        pinnedSha256: preRosterVerificationSha256,
      }),
    );
  }

  console.log(
    JSON.stringify(
      {
        outputPath: OUTPUT_PATH,
        commitmentSha256: sha256File(OUTPUT_PATH),
        boundPreRosterCatalogVerificationSha256: preRosterVerificationSha256,
        roots,
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
