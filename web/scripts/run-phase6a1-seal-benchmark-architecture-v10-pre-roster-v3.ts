#!/usr/bin/env npx tsx
/** Seal pre-roster protocol amendment v10-pre-roster-v3 — single snapshot + write-once. Preserves all prior sealed bytes. */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../..");
const OUT = resolve(REPO, "web/data/milestones/deck-synthesis");
const SEALED_AT = "2026-08-15T05:00:00.000Z";

const IMMUTABLE = {
  sealedManifestV9: "d1be5d5481261248fd1cd9c8f61686762a4faaf98f405d106d6188347e2456a3",
  archv9Zip: "f6d30078de9681e9fbb6bee7cb8a0ebff30eb89a5e59a60fa5e80c64c7a370ff",
  sealedManifestV10PreRoster: "42dd6d238aab19239ec26083f56758bc7d87184de67d13ef6f94daa629d63d6f",
  archv10PreRosterZip: "17489def6f47567f0c5fef9470db2c1e3b09c4a6a6148450bbec82056e354883",
  sealedManifestV10PreRosterV2: "a415ee289aa3b03525b0848261d7a62f37826a558c7d43b5499f5706068965b2",
  archv10PreRosterV2Zip: "3c15a12521f800c1bdf3fb773f85d37de46af011a289ec265815db211c5e8cf1",
  catalogVerifyCoreV2: "5c730063ee44bbddd50ba7e083298bab2a2d54d1e2a6e0e22eada16887b3bdfc",
  preRosterVerifyV1: "7b4e4ee4060d65a5d340e6568c5b5d6ae66802ae1a768ec8a4887e8f97b7b280",
  eligibilityComputeV2: "f7410160743a7f96652d61c4fcc5964d25fc32594c77a03e2485a97c576a6547",
  eligibilityVerifyV2: "7550524f2951ed0c0a76e77c695604be58d6e897a106e4d30f20d618fca0315a",
  pipelineFreezeSpecV11: "6d65d5dfc321cc44b2a3d41bc89d3fd716e195c4f9606f4a701353e523ea3790",
};

const sha = (f: string) => createHash("sha256").update(readFileSync(resolve(OUT, f))).digest("hex");
const shaRepo = (rel: string) => createHash("sha256").update(readFileSync(resolve(REPO, rel))).digest("hex");

function writeJson(name: string, value: unknown): string {
  writeFileSync(resolve(OUT, name), JSON.stringify(value, null, 2));
  return sha(name);
}

function assertImmutable(file: string, expected: string): void {
  if (!existsSync(resolve(OUT, file))) throw new Error(`Missing immutable artifact: ${file}`);
  if (sha(file) !== expected) throw new Error(`Refusing to seal: ${file} changed (${expected})`);
}

function assertRepoSha(rel: string, expected: string): void {
  if (shaRepo(rel) !== expected) throw new Error(`Refusing to seal: ${rel} changed (${expected})`);
}

for (const [file, expected] of [
  ["phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v9.json", IMMUTABLE.sealedManifestV9],
  ["phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v10-pre-roster.json", IMMUTABLE.sealedManifestV10PreRoster],
  ["phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v10-pre-roster-v2.json", IMMUTABLE.sealedManifestV10PreRosterV2],
  ["phase6a1-professor-plan-prospective-pipeline-freeze-spec-v11.json", IMMUTABLE.pipelineFreezeSpecV11],
]) {
  assertImmutable(file, expected);
}

assertRepoSha("web/scripts/lib/verify-pinned-catalog-data-state-v2-core.ts", IMMUTABLE.catalogVerifyCoreV2);
assertRepoSha("web/scripts/run-phase6a1-verify-pinned-catalog-data-state-pre-roster-v1.ts", IMMUTABLE.preRosterVerifyV1);
assertRepoSha("web/scripts/run-phase6a1-compute-commander-eligibility-state-commitment-v2.ts", IMMUTABLE.eligibilityComputeV2);
assertRepoSha("web/scripts/run-phase6a1-verify-commander-eligibility-state-v2.ts", IMMUTABLE.eligibilityVerifyV2);
if (sha("archv10-pre-roster-v2.zip") !== IMMUTABLE.archv10PreRosterV2Zip) {
  throw new Error("Refusing to seal: archv10-pre-roster-v2.zip byte SHA changed");
}

for (const audit of [
  "phase6a1-professor-plan-benchmark-architecture-v9-independent-reaudit-gpt56sol-v1.json",
  "phase6a1-professor-plan-benchmark-architecture-v10-pre-roster-independent-reaudit-gpt56sol-v1.json",
  "phase6a1-professor-plan-benchmark-architecture-v10-pre-roster-v2-independent-reaudit-gpt56sol-v1.json",
]) {
  if (!existsSync(resolve(OUT, audit))) throw new Error(`Missing audit artifact: ${audit}`);
}

const WRITE_ONCE_LIB_SHA = shaRepo("web/scripts/lib/write-once-milestone-artifact-v1.ts");
const SNAPSHOT_LIB_SHA = shaRepo("web/scripts/lib/catalog-verified-runtime-snapshot-v1.ts");
const CAPTURE_LIB_SHA = shaRepo("web/scripts/lib/pre-roster-single-catalog-snapshot-capture-v1.ts");
const CORE_V2_SHA = shaRepo("web/scripts/lib/verify-pinned-catalog-data-state-v2-core-v2.ts");
const PRE_ROSTER_VERIFY_V2_SHA = shaRepo("web/scripts/run-phase6a1-verify-pinned-catalog-data-state-pre-roster-v2.ts");
const ELIGIBILITY_COMPUTE_V3_SHA = shaRepo("web/scripts/run-phase6a1-compute-commander-eligibility-state-commitment-v3.ts");
const ELIGIBILITY_VERIFY_V3_SHA = shaRepo("web/scripts/run-phase6a1-verify-commander-eligibility-state-v3.ts");

writeJson("phase6a1-professor-plan-catalog-data-state-verification-pre-roster-spec-v2.json", {
  version: "phase6a1-professor-plan-catalog-data-state-verification-pre-roster-spec-v2",
  authorizedAt: SEALED_AT,
  supersedes: "phase6a1-professor-plan-catalog-data-state-verification-pre-roster-spec-v1.json",
  status: "NOT_YET_CREATED",
  completedArtifactTarget: "phase6a1-professor-plan-catalog-data-state-verification-pre-roster-v1.json",
  verifierScript: "web/scripts/run-phase6a1-verify-pinned-catalog-data-state-pre-roster-v2.ts",
  verifierScriptByteSha256: PRE_ROSTER_VERIFY_V2_SHA,
  verificationCoreLib: "web/scripts/lib/verify-pinned-catalog-data-state-v2-core-v2.ts",
  verificationCoreLibByteSha256: CORE_V2_SHA,
  singleCatalogLoadCaptureLib: "web/scripts/lib/pre-roster-single-catalog-snapshot-capture-v1.ts",
  singleCatalogLoadCaptureLibByteSha256: CAPTURE_LIB_SHA,
  catalogVerifiedRuntimeSnapshotLib: "web/scripts/lib/catalog-verified-runtime-snapshot-v1.ts",
  catalogVerifiedRuntimeSnapshotLibByteSha256: SNAPSHOT_LIB_SHA,
  writeOnceArtifactLib: "web/scripts/lib/write-once-milestone-artifact-v1.ts",
  writeOnceArtifactLibByteSha256: WRITE_ONCE_LIB_SHA,
  writeOnceCompletedArtifact: true,
  singleCatalogLoadInvariant:
    "One in-memory DeckResolutionCatalog load for canonical verification; records verifiedCatalogSnapshotIdentity including catalogLegalitiesSnapshotIdentitySha256.",
  preservesPilotTimeArtifact: "phase6a1-professor-plan-catalog-data-state-verification-v2.json",
});

writeJson("phase6a1-professor-plan-commander-eligibility-state-commitment-spec-v3.json", {
  version: "phase6a1-professor-plan-commander-eligibility-state-commitment-spec-v3",
  authorizedAt: SEALED_AT,
  supersedes: "phase6a1-professor-plan-commander-eligibility-state-commitment-spec-v2.json",
  status: "NOT_YET_COMPUTED",
  completedArtifactTarget: "phase6a1-professor-plan-commander-eligibility-state-commitment-v2.json",
  computeScript: "web/scripts/run-phase6a1-compute-commander-eligibility-state-commitment-v3.ts",
  computeScriptByteSha256: ELIGIBILITY_COMPUTE_V3_SHA,
  singleCatalogLoadCaptureLib: "web/scripts/lib/pre-roster-single-catalog-snapshot-capture-v1.ts",
  singleCatalogLoadCaptureLibByteSha256: CAPTURE_LIB_SHA,
  writeOnceCompletedArtifact: true,
  prerequisitePreRosterCatalogVerification:
    "phase6a1-professor-plan-catalog-data-state-verification-pre-roster-v1.json",
  computeMustUseSameInMemoryCatalogSnapshotAsVerification: true,
  computeMustMatchPreRosterVerifiedCatalogSnapshotIdentity: true,
  computeMustNotReloadFirestoreBetweenVerificationAndEligibilityRoots: true,
  sharedVerifiedCatalogSnapshotIdentityRequired: true,
});

writeJson("phase6a1-professor-plan-commander-eligibility-state-verification-spec-v3.json", {
  version: "phase6a1-professor-plan-commander-eligibility-state-verification-spec-v3",
  authorizedAt: SEALED_AT,
  supersedes: "phase6a1-professor-plan-commander-eligibility-state-verification-spec-v2.json",
  status: "NOT_YET_CREATED",
  completedArtifactTarget: "phase6a1-professor-plan-commander-eligibility-state-verification-v2.json",
  verifierScript: "web/scripts/run-phase6a1-verify-commander-eligibility-state-v3.ts",
  verifierScriptByteSha256: ELIGIBILITY_VERIFY_V3_SHA,
  writeOnceCompletedArtifact: true,
  singleCatalogLoadInvariant: "Verifier uses one in-memory DeckResolutionCatalog load for catalog + eligibility recomputation.",
});

writeJson("phase6a1-professor-plan-operational-readiness-sealed-v2-spec-v5.json", {
  version: "phase6a1-professor-plan-operational-readiness-sealed-v2-spec-v5",
  authorizedAt: SEALED_AT,
  supersedes: "phase6a1-professor-plan-operational-readiness-sealed-v2-spec-v4.json",
  status: "NOT_YET_CREATED",
  normativeProvenanceRoot: {
    architectureSealedManifestV10PreRosterV3:
      "phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v10-pre-roster-v3.json",
  },
  writeOnceCompletedEvidenceRequired: [
    "phase6a1-professor-plan-catalog-data-state-verification-pre-roster-v1.json",
    "phase6a1-professor-plan-commander-eligibility-state-commitment-v2.json",
    "phase6a1-professor-plan-commander-eligibility-state-verification-v2.json",
  ],
  pinsOnCompletion: [
    "architecture-sealed-manifest-v10-pre-roster-v3.json byte SHA",
    "catalog-data-state-verification-pre-roster-spec-v2.json byte SHA",
    "commander-eligibility-state-commitment-spec-v3.json byte SHA",
    "commander-eligibility-state-verification-spec-v3.json byte SHA",
    "web/scripts/lib/write-once-milestone-artifact-v1.ts byte SHA",
    "web/scripts/lib/catalog-verified-runtime-snapshot-v1.ts byte SHA",
    "web/scripts/lib/pre-roster-single-catalog-snapshot-capture-v1.ts byte SHA",
    "web/scripts/lib/verify-pinned-catalog-data-state-v2-core-v2.ts byte SHA",
    "web/scripts/run-phase6a1-verify-pinned-catalog-data-state-pre-roster-v2.ts byte SHA",
    "web/scripts/run-phase6a1-compute-commander-eligibility-state-commitment-v3.ts byte SHA",
    "web/scripts/run-phase6a1-verify-commander-eligibility-state-v3.ts byte SHA",
  ],
});

writeJson("phase6a1-professor-plan-prospective-pipeline-freeze-spec-v12.json", {
  version: "phase6a1-professor-plan-prospective-pipeline-freeze-spec-v12",
  authorizedAt: SEALED_AT,
  supersedes: "phase6a1-professor-plan-prospective-pipeline-freeze-spec-v11.json",
  pilotGateDecision: "PROTOCOL_V9_PILOT_GATE_PASS_PRESERVED",
  preRosterAmendment: "V10_PRE_ROSTER_V3",
  aclProofWork: "AUTHORIZED",
  catalogVerifierV2Execution: "AUTHORIZED_AFTER_ACL_PROOF_PASS",
  serializationPilot: "AUTHORIZED_AFTER_ACL_PROOF_AND_CATALOG_VERIFIER_V2_PASS",
  postPilotSequence: [
    "REPORT AND WAIT",
    "run pre-roster catalog verification v2 writer (write-once)",
    "run eligibility commitment v3 writer (write-once, single catalog snapshot)",
    "run eligibility verification v3 writer (write-once, single catalog snapshot)",
  ],
  writeOnceCompletedEvidence: [
    "phase6a1-professor-plan-catalog-data-state-verification-pre-roster-v1.json",
    "phase6a1-professor-plan-commander-eligibility-state-commitment-v2.json",
    "phase6a1-professor-plan-commander-eligibility-state-verification-v2.json",
  ],
  prospectiveRosterV3: "NOT_AUTHORIZED_UNTIL_PRE_ROSTER_V3_REPAIRS_COMPLETE",
});

writeJson("phase6a1-professor-plan-v2-benchmark-disposition-v20-architecture.json", {
  version: "phase6a1-professor-plan-v2-benchmark-disposition-v20-architecture",
  recordedAt: SEALED_AT,
  supersedes: "phase6a1-professor-plan-v2-benchmark-disposition-v19-architecture.json",
  pilotGateDecision: "PROTOCOL_V9_PILOT_GATE_PASS_PRESERVED",
  preRosterAmendment: "V10_PRE_ROSTER_V3",
  aclProofWork: "AUTHORIZED",
  instruction: "REPORT AND WAIT",
});

writeJson("phase6a1-professor-plan-post-gold-development-track-v20-architecture.json", {
  version: "phase6a1-professor-plan-post-gold-development-track-v20-architecture",
  updatedAt: SEALED_AT,
  supersedes: "phase6a1-professor-plan-post-gold-development-track-v19-architecture",
  decision: "V10_PRE_ROSTER_V3_AMENDMENT_SEALED",
  normativeArtifacts: {
    pipelineFreezeSpecV12: "phase6a1-professor-plan-prospective-pipeline-freeze-spec-v12.json",
    architectureSealedManifestV10PreRosterV3:
      "phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v10-pre-roster-v3.json",
  },
  instruction: "REPORT AND WAIT",
});

const pins: Record<string, { artifact: string; sha256: string }> = {
  pipelineFreezeSpecV12: {
    artifact: "phase6a1-professor-plan-prospective-pipeline-freeze-spec-v12.json",
    sha256: sha("phase6a1-professor-plan-prospective-pipeline-freeze-spec-v12.json"),
  },
  preRosterCatalogVerificationSpecV2: {
    artifact: "phase6a1-professor-plan-catalog-data-state-verification-pre-roster-spec-v2.json",
    sha256: sha("phase6a1-professor-plan-catalog-data-state-verification-pre-roster-spec-v2.json"),
  },
  commanderEligibilityStateCommitmentSpecV3: {
    artifact: "phase6a1-professor-plan-commander-eligibility-state-commitment-spec-v3.json",
    sha256: sha("phase6a1-professor-plan-commander-eligibility-state-commitment-spec-v3.json"),
  },
  commanderEligibilityStateVerificationSpecV3: {
    artifact: "phase6a1-professor-plan-commander-eligibility-state-verification-spec-v3.json",
    sha256: sha("phase6a1-professor-plan-commander-eligibility-state-verification-spec-v3.json"),
  },
  writeOnceArtifactLib: {
    artifact: "web/scripts/lib/write-once-milestone-artifact-v1.ts",
    sha256: WRITE_ONCE_LIB_SHA,
  },
  catalogVerifiedRuntimeSnapshotLib: {
    artifact: "web/scripts/lib/catalog-verified-runtime-snapshot-v1.ts",
    sha256: SNAPSHOT_LIB_SHA,
  },
  singleCatalogLoadCaptureLib: {
    artifact: "web/scripts/lib/pre-roster-single-catalog-snapshot-capture-v1.ts",
    sha256: CAPTURE_LIB_SHA,
  },
  catalogVerificationCoreLibV2: {
    artifact: "web/scripts/lib/verify-pinned-catalog-data-state-v2-core-v2.ts",
    sha256: CORE_V2_SHA,
  },
  preRosterCatalogVerifierScriptV2: {
    artifact: "web/scripts/run-phase6a1-verify-pinned-catalog-data-state-pre-roster-v2.ts",
    sha256: PRE_ROSTER_VERIFY_V2_SHA,
  },
  eligibilityStateComputeScriptV3: {
    artifact: "web/scripts/run-phase6a1-compute-commander-eligibility-state-commitment-v3.ts",
    sha256: ELIGIBILITY_COMPUTE_V3_SHA,
  },
  eligibilityStateVerifyScriptV3: {
    artifact: "web/scripts/run-phase6a1-verify-commander-eligibility-state-v3.ts",
    sha256: ELIGIBILITY_VERIFY_V3_SHA,
  },
  operationalReadinessSealedV2SpecV5: {
    artifact: "phase6a1-professor-plan-operational-readiness-sealed-v2-spec-v5.json",
    sha256: sha("phase6a1-professor-plan-operational-readiness-sealed-v2-spec-v5.json"),
  },
  architectureReauditV10PreRosterV2: {
    artifact: "phase6a1-professor-plan-benchmark-architecture-v10-pre-roster-v2-independent-reaudit-gpt56sol-v1.json",
    sha256: sha("phase6a1-professor-plan-benchmark-architecture-v10-pre-roster-v2-independent-reaudit-gpt56sol-v1.json"),
  },
  benchmarkDispositionV20: {
    artifact: "phase6a1-professor-plan-v2-benchmark-disposition-v20-architecture.json",
    sha256: sha("phase6a1-professor-plan-v2-benchmark-disposition-v20-architecture.json"),
  },
  developmentTrackV20: {
    artifact: "phase6a1-professor-plan-post-gold-development-track-v20-architecture.json",
    sha256: sha("phase6a1-professor-plan-post-gold-development-track-v20-architecture.json"),
  },
  preservedSealedManifestV10PreRosterV2: {
    artifact: "phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v10-pre-roster-v2.json",
    sha256: IMMUTABLE.sealedManifestV10PreRosterV2,
  },
  preservedArchv10PreRosterV2Zip: {
    artifact: "archv10-pre-roster-v2.zip",
    sha256: IMMUTABLE.archv10PreRosterV2Zip,
  },
  preservedSealedManifestV9: {
    artifact: "phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v9.json",
    sha256: IMMUTABLE.sealedManifestV9,
  },
};

writeJson("phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v10-pre-roster-v3.json", {
  version: "phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v10-pre-roster-v3",
  sealedAt: SEALED_AT,
  supersedes: "phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v10-pre-roster-v2.json",
  decision: "PRE_ROSTER_V3_AMENDMENT_SEALED_WAIT",
  doesNotReopenPilotGate: "PROTOCOL_V9_PILOT_GATE_PASS_PRESERVED",
  repairs: [
    "single in-memory DeckResolutionCatalog snapshot for canonical verification + eligibility roots",
    "verifiedCatalogSnapshotIdentity including catalogLegalitiesSnapshotIdentitySha256",
    "write-once guards on completed pre-roster evidence artifacts",
  ],
  byteReproducibleSealScript: "web/scripts/run-phase6a1-seal-benchmark-architecture-v10-pre-roster-v3.ts",
  archv10PreRosterV3BundleBytePinArtifact: "phase6a1-professor-plan-audit-bundle-archv10-pre-roster-v3-byte-pin.json",
  pins,
  instruction: "REPORT AND WAIT",
});

console.log(
  JSON.stringify({ manifestSha256: sha("phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v10-pre-roster-v3.json"), pins }, null, 2),
);
