#!/usr/bin/env npx tsx
/** Seal pre-roster protocol amendment v10-pre-roster-v4 — atomic exclusive-create write-once. Preserves all prior sealed bytes. */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../..");
const OUT = resolve(REPO, "web/data/milestones/deck-synthesis");
const SEALED_AT = "2026-08-15T06:00:00.000Z";

const IMMUTABLE = {
  sealedManifestV9: "d1be5d5481261248fd1cd9c8f61686762a4faaf98f405d106d6188347e2456a3",
  archv9Zip: "f6d30078de9681e9fbb6bee7cb8a0ebff30eb89a5e59a60fa5e80c64c7a370ff",
  sealedManifestV10PreRosterV3: "15da836d9cd9389b5f224d1fa8c5b5232a5e1db6cd3f0b47fc96feefbc92ed31",
  archv10PreRosterV3Zip: "2b3adfaa16fdad38d74b9f1b35a72959e26e44889e3a66733d63cad305f63718",
  writeOnceArtifactLibV1: "bada7467975f85fa6936cb52f324267ec1e7e898ecd31cf98e7a1ebc1eb65f30",
  preRosterVerifyV2: "01268c70a6613d6faf73645dbad1c9d51b5591ab66a4bead65bf276375e982cf",
  eligibilityComputeV3: "3ae8c2c060b5aece99894ad7ef600f775ca43cb17278c5a0755ed57bb7ec7bbc",
  eligibilityVerifyV3: "d2e93c9440992189fd9610ada351c778970e1f58cf8119336149dd465ba1999f",
  pipelineFreezeSpecV12: "f95b6834f145187447d41237c4b694705f24abfe56a23b429394af218c77c0fb",
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
  ["phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v10-pre-roster-v3.json", IMMUTABLE.sealedManifestV10PreRosterV3],
  ["phase6a1-professor-plan-prospective-pipeline-freeze-spec-v12.json", IMMUTABLE.pipelineFreezeSpecV12],
]) {
  assertImmutable(file, expected);
}

assertRepoSha("web/scripts/lib/write-once-milestone-artifact-v1.ts", IMMUTABLE.writeOnceArtifactLibV1);
assertRepoSha("web/scripts/run-phase6a1-verify-pinned-catalog-data-state-pre-roster-v2.ts", IMMUTABLE.preRosterVerifyV2);
assertRepoSha("web/scripts/run-phase6a1-compute-commander-eligibility-state-commitment-v3.ts", IMMUTABLE.eligibilityComputeV3);
assertRepoSha("web/scripts/run-phase6a1-verify-commander-eligibility-state-v3.ts", IMMUTABLE.eligibilityVerifyV3);
if (sha("archv10-pre-roster-v3.zip") !== IMMUTABLE.archv10PreRosterV3Zip) {
  throw new Error("Refusing to seal: archv10-pre-roster-v3.zip byte SHA changed");
}

for (const audit of [
  "phase6a1-professor-plan-benchmark-architecture-v9-independent-reaudit-gpt56sol-v1.json",
  "phase6a1-professor-plan-benchmark-architecture-v10-pre-roster-v3-independent-reaudit-gpt56sol-v1.json",
]) {
  if (!existsSync(resolve(OUT, audit))) throw new Error(`Missing audit artifact: ${audit}`);
}

const WRITE_ONCE_V2_SHA = shaRepo("web/scripts/lib/write-once-milestone-artifact-v2.ts");
const PRE_ROSTER_VERIFY_V3_SHA = shaRepo("web/scripts/run-phase6a1-verify-pinned-catalog-data-state-pre-roster-v3.ts");
const ELIGIBILITY_COMPUTE_V4_SHA = shaRepo("web/scripts/run-phase6a1-compute-commander-eligibility-state-commitment-v4.ts");
const ELIGIBILITY_VERIFY_V4_SHA = shaRepo("web/scripts/run-phase6a1-verify-commander-eligibility-state-v4.ts");

writeJson("phase6a1-professor-plan-catalog-data-state-verification-pre-roster-spec-v3.json", {
  version: "phase6a1-professor-plan-catalog-data-state-verification-pre-roster-spec-v3",
  authorizedAt: SEALED_AT,
  supersedes: "phase6a1-professor-plan-catalog-data-state-verification-pre-roster-spec-v2.json",
  status: "NOT_YET_CREATED",
  completedArtifactTarget: "phase6a1-professor-plan-catalog-data-state-verification-pre-roster-v1.json",
  verifierScript: "web/scripts/run-phase6a1-verify-pinned-catalog-data-state-pre-roster-v3.ts",
  verifierScriptByteSha256: PRE_ROSTER_VERIFY_V3_SHA,
  writeOnceArtifactLib: "web/scripts/lib/write-once-milestone-artifact-v2.ts",
  writeOnceArtifactLibByteSha256: WRITE_ONCE_V2_SHA,
  atomicWriteOnceRequired: true,
  atomicWriteOnceMechanism: "writeFileSync(path, bytes, { flag: 'wx' }); EEXIST => FAIL_CLOSED",
  preservesPilotTimeArtifact: "phase6a1-professor-plan-catalog-data-state-verification-v2.json",
});

writeJson("phase6a1-professor-plan-commander-eligibility-state-commitment-spec-v4.json", {
  version: "phase6a1-professor-plan-commander-eligibility-state-commitment-spec-v4",
  authorizedAt: SEALED_AT,
  supersedes: "phase6a1-professor-plan-commander-eligibility-state-commitment-spec-v3.json",
  status: "NOT_YET_COMPUTED",
  completedArtifactTarget: "phase6a1-professor-plan-commander-eligibility-state-commitment-v2.json",
  computeScript: "web/scripts/run-phase6a1-compute-commander-eligibility-state-commitment-v4.ts",
  computeScriptByteSha256: ELIGIBILITY_COMPUTE_V4_SHA,
  writeOnceArtifactLib: "web/scripts/lib/write-once-milestone-artifact-v2.ts",
  writeOnceArtifactLibByteSha256: WRITE_ONCE_V2_SHA,
  atomicWriteOnceRequired: true,
  singleCatalogLoadCaptureLib: "web/scripts/lib/pre-roster-single-catalog-snapshot-capture-v1.ts",
});

writeJson("phase6a1-professor-plan-commander-eligibility-state-verification-spec-v4.json", {
  version: "phase6a1-professor-plan-commander-eligibility-state-verification-spec-v4",
  authorizedAt: SEALED_AT,
  supersedes: "phase6a1-professor-plan-commander-eligibility-state-verification-spec-v3.json",
  status: "NOT_YET_CREATED",
  completedArtifactTarget: "phase6a1-professor-plan-commander-eligibility-state-verification-v2.json",
  verifierScript: "web/scripts/run-phase6a1-verify-commander-eligibility-state-v4.ts",
  verifierScriptByteSha256: ELIGIBILITY_VERIFY_V4_SHA,
  writeOnceArtifactLib: "web/scripts/lib/write-once-milestone-artifact-v2.ts",
  writeOnceArtifactLibByteSha256: WRITE_ONCE_V2_SHA,
  atomicWriteOnceRequired: true,
});

writeJson("phase6a1-professor-plan-operational-readiness-sealed-v2-spec-v6.json", {
  version: "phase6a1-professor-plan-operational-readiness-sealed-v2-spec-v6",
  authorizedAt: SEALED_AT,
  supersedes: "phase6a1-professor-plan-operational-readiness-sealed-v2-spec-v5.json",
  status: "NOT_YET_CREATED",
  normativeProvenanceRoot: {
    architectureSealedManifestV10PreRosterV4:
      "phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v10-pre-roster-v4.json",
  },
  atomicWriteOnceEvidenceRequired: true,
  pinsOnCompletion: [
    "architecture-sealed-manifest-v10-pre-roster-v4.json byte SHA",
    "web/scripts/lib/write-once-milestone-artifact-v2.ts byte SHA",
    "catalog-data-state-verification-pre-roster-spec-v3.json byte SHA",
    "commander-eligibility-state-commitment-spec-v4.json byte SHA",
    "commander-eligibility-state-verification-spec-v4.json byte SHA",
    "web/scripts/run-phase6a1-verify-pinned-catalog-data-state-pre-roster-v3.ts byte SHA",
    "web/scripts/run-phase6a1-compute-commander-eligibility-state-commitment-v4.ts byte SHA",
    "web/scripts/run-phase6a1-verify-commander-eligibility-state-v4.ts byte SHA",
  ],
});

writeJson("phase6a1-professor-plan-prospective-pipeline-freeze-spec-v13.json", {
  version: "phase6a1-professor-plan-prospective-pipeline-freeze-spec-v13",
  authorizedAt: SEALED_AT,
  supersedes: "phase6a1-professor-plan-prospective-pipeline-freeze-spec-v12.json",
  pilotGateDecision: "PROTOCOL_V9_PILOT_GATE_PASS_PRESERVED",
  preRosterAmendment: "V10_PRE_ROSTER_V4",
  aclProofWork: "AUTHORIZED",
  catalogVerifierV2Execution: "AUTHORIZED_AFTER_ACL_PROOF_PASS",
  serializationPilot: "AUTHORIZED_AFTER_ACL_PROOF_AND_CATALOG_VERIFIER_V2_PASS",
  postPilotWriters: [
    "run-phase6a1-verify-pinned-catalog-data-state-pre-roster-v3.ts",
    "run-phase6a1-compute-commander-eligibility-state-commitment-v4.ts",
    "run-phase6a1-verify-commander-eligibility-state-v4.ts",
  ],
  atomicWriteOnceLib: "web/scripts/lib/write-once-milestone-artifact-v2.ts",
  prospectiveRosterV3: "NOT_AUTHORIZED_UNTIL_PRE_ROSTER_V4_REPAIRS_COMPLETE",
});

writeJson("phase6a1-professor-plan-v2-benchmark-disposition-v21-architecture.json", {
  version: "phase6a1-professor-plan-v2-benchmark-disposition-v21-architecture",
  recordedAt: SEALED_AT,
  supersedes: "phase6a1-professor-plan-v2-benchmark-disposition-v20-architecture.json",
  pilotGateDecision: "PROTOCOL_V9_PILOT_GATE_PASS_PRESERVED",
  preRosterAmendment: "V10_PRE_ROSTER_V4",
  aclProofWork: "AUTHORIZED",
  instruction: "REPORT AND WAIT",
});

writeJson("phase6a1-professor-plan-post-gold-development-track-v21-architecture.json", {
  version: "phase6a1-professor-plan-post-gold-development-track-v21-architecture",
  updatedAt: SEALED_AT,
  supersedes: "phase6a1-professor-plan-post-gold-development-track-v20-architecture",
  decision: "V10_PRE_ROSTER_V4_AMENDMENT_SEALED",
  normativeArtifacts: {
    pipelineFreezeSpecV13: "phase6a1-professor-plan-prospective-pipeline-freeze-spec-v13.json",
    architectureSealedManifestV10PreRosterV4:
      "phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v10-pre-roster-v4.json",
  },
  instruction: "REPORT AND WAIT",
});

const pins: Record<string, { artifact: string; sha256: string }> = {
  pipelineFreezeSpecV13: {
    artifact: "phase6a1-professor-plan-prospective-pipeline-freeze-spec-v13.json",
    sha256: sha("phase6a1-professor-plan-prospective-pipeline-freeze-spec-v13.json"),
  },
  preRosterCatalogVerificationSpecV3: {
    artifact: "phase6a1-professor-plan-catalog-data-state-verification-pre-roster-spec-v3.json",
    sha256: sha("phase6a1-professor-plan-catalog-data-state-verification-pre-roster-spec-v3.json"),
  },
  commanderEligibilityStateCommitmentSpecV4: {
    artifact: "phase6a1-professor-plan-commander-eligibility-state-commitment-spec-v4.json",
    sha256: sha("phase6a1-professor-plan-commander-eligibility-state-commitment-spec-v4.json"),
  },
  commanderEligibilityStateVerificationSpecV4: {
    artifact: "phase6a1-professor-plan-commander-eligibility-state-verification-spec-v4.json",
    sha256: sha("phase6a1-professor-plan-commander-eligibility-state-verification-spec-v4.json"),
  },
  writeOnceArtifactLibV2: {
    artifact: "web/scripts/lib/write-once-milestone-artifact-v2.ts",
    sha256: WRITE_ONCE_V2_SHA,
  },
  preRosterCatalogVerifierScriptV3: {
    artifact: "web/scripts/run-phase6a1-verify-pinned-catalog-data-state-pre-roster-v3.ts",
    sha256: PRE_ROSTER_VERIFY_V3_SHA,
  },
  eligibilityStateComputeScriptV4: {
    artifact: "web/scripts/run-phase6a1-compute-commander-eligibility-state-commitment-v4.ts",
    sha256: ELIGIBILITY_COMPUTE_V4_SHA,
  },
  eligibilityStateVerifyScriptV4: {
    artifact: "web/scripts/run-phase6a1-verify-commander-eligibility-state-v4.ts",
    sha256: ELIGIBILITY_VERIFY_V4_SHA,
  },
  operationalReadinessSealedV2SpecV6: {
    artifact: "phase6a1-professor-plan-operational-readiness-sealed-v2-spec-v6.json",
    sha256: sha("phase6a1-professor-plan-operational-readiness-sealed-v2-spec-v6.json"),
  },
  architectureReauditV10PreRosterV3: {
    artifact: "phase6a1-professor-plan-benchmark-architecture-v10-pre-roster-v3-independent-reaudit-gpt56sol-v1.json",
    sha256: sha("phase6a1-professor-plan-benchmark-architecture-v10-pre-roster-v3-independent-reaudit-gpt56sol-v1.json"),
  },
  benchmarkDispositionV21: {
    artifact: "phase6a1-professor-plan-v2-benchmark-disposition-v21-architecture.json",
    sha256: sha("phase6a1-professor-plan-v2-benchmark-disposition-v21-architecture.json"),
  },
  developmentTrackV21: {
    artifact: "phase6a1-professor-plan-post-gold-development-track-v21-architecture.json",
    sha256: sha("phase6a1-professor-plan-post-gold-development-track-v21-architecture.json"),
  },
  preservedWriteOnceArtifactLibV1: {
    artifact: "web/scripts/lib/write-once-milestone-artifact-v1.ts",
    sha256: IMMUTABLE.writeOnceArtifactLibV1,
  },
  preservedSealedManifestV10PreRosterV3: {
    artifact: "phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v10-pre-roster-v3.json",
    sha256: IMMUTABLE.sealedManifestV10PreRosterV3,
  },
  preservedArchv10PreRosterV3Zip: {
    artifact: "archv10-pre-roster-v3.zip",
    sha256: IMMUTABLE.archv10PreRosterV3Zip,
  },
  preservedSealedManifestV9: {
    artifact: "phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v9.json",
    sha256: IMMUTABLE.sealedManifestV9,
  },
};

writeJson("phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v10-pre-roster-v4.json", {
  version: "phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v10-pre-roster-v4",
  sealedAt: SEALED_AT,
  supersedes: "phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v10-pre-roster-v3.json",
  decision: "PRE_ROSTER_V4_AMENDMENT_SEALED_WAIT",
  doesNotReopenPilotGate: "PROTOCOL_V9_PILOT_GATE_PASS_PRESERVED",
  repair: "Atomic exclusive-create write-once via write-once-milestone-artifact-v2 (wx flag; EEXIST => FAIL_CLOSED)",
  byteReproducibleSealScript: "web/scripts/run-phase6a1-seal-benchmark-architecture-v10-pre-roster-v4.ts",
  archv10PreRosterV4BundleBytePinArtifact: "phase6a1-professor-plan-audit-bundle-archv10-pre-roster-v4-byte-pin.json",
  pins,
  instruction: "REPORT AND WAIT",
});

console.log(
  JSON.stringify({ manifestSha256: sha("phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v10-pre-roster-v4.json"), pins }, null, 2),
);
