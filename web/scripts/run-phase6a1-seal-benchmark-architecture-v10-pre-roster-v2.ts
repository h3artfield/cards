#!/usr/bin/env npx tsx
/** Seal pre-roster protocol amendment v10-pre-roster-v2 — preserves v9 pilot gate and all v10 bytes. */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../..");
const OUT = resolve(REPO, "web/data/milestones/deck-synthesis");
const SEALED_AT = "2026-08-15T04:00:00.000Z";

const IMMUTABLE = {
  selectionPolicyV3: "c741bb5374feb58fc9a37a93b0e423c7330b757c347e2df9bfaf9ffc3eb13b73",
  sealedManifestV9: "d1be5d5481261248fd1cd9c8f61686762a4faaf98f405d106d6188347e2456a3",
  archv9Zip: "f6d30078de9681e9fbb6bee7cb8a0ebff30eb89a5e59a60fa5e80c64c7a370ff",
  sealedManifestV10PreRoster: "42dd6d238aab19239ec26083f56758bc7d87184de67d13ef6f94daa629d63d6f",
  archv10PreRosterZip: "17489def6f47567f0c5fef9470db2c1e3b09c4a6a6148450bbec82056e354883",
  catalogVerifierScriptV2: "cd1d955377f0fbc97ccff79a1332bf814c2e0b2ec996f2669af0fe9e2eec8340",
  commanderEligibilityStateCommitmentSpecV1: "3d72e8274af398e3f68a39dd6fc0a2f3e5d09a4889fb276068db3e83c4c800b3",
  commanderEligibilityStateVerificationSpecV1: "88118de45aa08b5c0af3324ef8237df9b7ac569ffdcd8bbbc690f7e51e3676fc",
  eligibilityStateRootLibV1: "0252995416ff32343896ae378e91254329f480dcb02267cc83130c7c451cf0bb",
  eligibilityStateComputeScriptV1: "c65355ef7b317280b26fecb662cab31730b033359bbf9d2ce8f0a2ea77aac950",
  eligibilityStateVerifyScriptV1: "b47126449b3f2c10abddf6669e48a40d360a8bbcab94a97264f9825c83f424d0",
  authorityRosterGeneratorSourceAuditSpecV3: "5aa99393fe83a6a4786a32f36b26e74d6cab0399a2ffd8c078d8124fb8c9791d",
  operationalReadinessSealedV2SpecV3: "667f48e8da4d944bc40361427af8e747911000a2adaeaad1cbde98c11d1e2c33",
  pipelineFreezeSpecV10: "127d5e12a59b7bd95d7793fbd71f931bc77352335bf8b9cb5d133a62cdf3d6e0",
};

const sha = (f: string) => createHash("sha256").update(readFileSync(resolve(OUT, f))).digest("hex");
const shaRepo = (rel: string) => createHash("sha256").update(readFileSync(resolve(REPO, rel))).digest("hex");

function writeJson(name: string, value: unknown): string {
  writeFileSync(resolve(OUT, name), JSON.stringify(value, null, 2));
  return sha(name);
}

function assertImmutable(file: string, expected: string): void {
  if (!existsSync(resolve(OUT, file))) throw new Error(`Missing immutable artifact: ${file}`);
  const actual = sha(file);
  if (actual !== expected) throw new Error(`Refusing to seal: ${file} changed (${expected} != ${actual})`);
}

function assertRepoSha(rel: string, expected: string): void {
  const actual = shaRepo(rel);
  if (actual !== expected) throw new Error(`Refusing to seal: ${rel} changed (${expected} != ${actual})`);
}

for (const [file, expected] of [
  ["phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v9.json", IMMUTABLE.sealedManifestV9],
  ["phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v10-pre-roster.json", IMMUTABLE.sealedManifestV10PreRoster],
  ["phase6a1-professor-plan-commander-eligibility-state-commitment-spec-v1.json", IMMUTABLE.commanderEligibilityStateCommitmentSpecV1],
  ["phase6a1-professor-plan-commander-eligibility-state-verification-spec-v1.json", IMMUTABLE.commanderEligibilityStateVerificationSpecV1],
  ["phase6a1-professor-plan-authority-roster-generator-source-audit-spec-v3.json", IMMUTABLE.authorityRosterGeneratorSourceAuditSpecV3],
  ["phase6a1-professor-plan-operational-readiness-sealed-v2-spec-v3.json", IMMUTABLE.operationalReadinessSealedV2SpecV3],
  ["phase6a1-professor-plan-prospective-pipeline-freeze-spec-v10.json", IMMUTABLE.pipelineFreezeSpecV10],
]) {
  assertImmutable(file, expected);
}

assertRepoSha("web/scripts/run-phase6a1-verify-pinned-catalog-data-state-v2.ts", IMMUTABLE.catalogVerifierScriptV2);
assertRepoSha("web/scripts/lib/catalog-commander-eligibility-state-root-v1.ts", IMMUTABLE.eligibilityStateRootLibV1);
assertRepoSha("web/scripts/run-phase6a1-compute-commander-eligibility-state-commitment-v1.ts", IMMUTABLE.eligibilityStateComputeScriptV1);
assertRepoSha("web/scripts/run-phase6a1-verify-commander-eligibility-state-v1.ts", IMMUTABLE.eligibilityStateVerifyScriptV1);

if (!existsSync(resolve(OUT, "archv10-pre-roster.zip"))) {
  throw new Error("Missing archv10-pre-roster.zip");
}
if (sha("archv10-pre-roster.zip") !== IMMUTABLE.archv10PreRosterZip) {
  throw new Error("Refusing to seal: archv10-pre-roster.zip byte SHA changed");
}

for (const audit of [
  "phase6a1-professor-plan-benchmark-architecture-v9-independent-reaudit-gpt56sol-v1.json",
  "phase6a1-professor-plan-benchmark-architecture-v10-pre-roster-independent-reaudit-gpt56sol-v1.json",
]) {
  if (!existsSync(resolve(OUT, audit))) throw new Error(`Missing audit artifact: ${audit}`);
}

const CATALOG_VERIFY_CORE_SHA = shaRepo("web/scripts/lib/verify-pinned-catalog-data-state-v2-core.ts");
const PRE_ROSTER_CATALOG_VERIFY_SHA = shaRepo("web/scripts/run-phase6a1-verify-pinned-catalog-data-state-pre-roster-v1.ts");
const ELIGIBILITY_ROOT_LIB_V2_SHA = shaRepo("web/scripts/lib/catalog-commander-eligibility-state-root-v2.ts");
const EXPOSED_ORACLE_IDS_LIB_SHA = shaRepo("web/scripts/lib/load-exposed-benchmark-oracle-ids-v2.ts");
const ELIGIBILITY_COMPUTE_V2_SHA = shaRepo("web/scripts/run-phase6a1-compute-commander-eligibility-state-commitment-v2.ts");
const ELIGIBILITY_VERIFY_V2_SHA = shaRepo("web/scripts/run-phase6a1-verify-commander-eligibility-state-v2.ts");

writeJson("phase6a1-professor-plan-catalog-data-state-verification-pre-roster-spec-v1.json", {
  version: "phase6a1-professor-plan-catalog-data-state-verification-pre-roster-spec-v1",
  authorizedAt: SEALED_AT,
  status: "NOT_YET_CREATED",
  completedArtifactTarget: "phase6a1-professor-plan-catalog-data-state-verification-pre-roster-v1.json",
  verifierScript: "web/scripts/run-phase6a1-verify-pinned-catalog-data-state-pre-roster-v1.ts",
  verifierScriptByteSha256: PRE_ROSTER_CATALOG_VERIFY_SHA,
  verificationCoreLib: "web/scripts/lib/verify-pinned-catalog-data-state-v2-core.ts",
  verificationCoreLibByteSha256: CATALOG_VERIFY_CORE_SHA,
  prerequisiteCommitment: "phase6a1-professor-plan-full-catalog-data-state-commitment-v2.json",
  verificationPhase: "pre_roster",
  preservesPilotTimeArtifact: "phase6a1-professor-plan-catalog-data-state-verification-v2.json",
  mustNotOverwritePilotArtifact: true,
  failClosedRequirements: [
    "identical full catalog verification checks as catalog-data-state-verification-v2",
    "separate immutable output artifact path from pilot-time verification",
    "records verificationPhase pre_roster and runtime canonical roots",
  ],
  captureTiming: "After pilot PASS and REPORT AND WAIT, immediately before eligibility commitment capture",
  requiredBefore: ["commander-eligibility-state-commitment-v2 capture"],
  doesNotBlockSpentSerializationPilot: true,
  instruction:
    "Run once after pilot PASS. Eligibility commitment v2 MUST pin this artifact byte SHA and canonical roots; do not overwrite pilot-time verification v2.",
});

writeJson("phase6a1-professor-plan-commander-eligibility-state-commitment-spec-v2.json", {
  version: "phase6a1-professor-plan-commander-eligibility-state-commitment-spec-v2",
  authorizedAt: SEALED_AT,
  supersedes: "phase6a1-professor-plan-commander-eligibility-state-commitment-spec-v1.json",
  status: "NOT_YET_COMPUTED",
  completedArtifactTarget: "phase6a1-professor-plan-commander-eligibility-state-commitment-v2.json",
  computeScript: "web/scripts/run-phase6a1-compute-commander-eligibility-state-commitment-v2.ts",
  computeScriptByteSha256: ELIGIBILITY_COMPUTE_V2_SHA,
  eligibilityStateRootLib: "web/scripts/lib/catalog-commander-eligibility-state-root-v2.ts",
  eligibilityStateRootLibByteSha256: ELIGIBILITY_ROOT_LIB_V2_SHA,
  exposedOracleIdsLib: "web/scripts/lib/load-exposed-benchmark-oracle-ids-v2.ts",
  exposedOracleIdsLibByteSha256: EXPOSED_ORACLE_IDS_LIB_SHA,
  prerequisitePreRosterCatalogVerification:
    "phase6a1-professor-plan-catalog-data-state-verification-pre-roster-v1.json",
  computeMustReRunFullCatalogVerificationInProcess: true,
  computeMustRejectWithoutPreRosterVerificationArtifact: true,
  eligibilityStateRootAlgorithm: "phase6a1-commander-eligibility-state-sorted-newline-root-v2",
  universeStages: {
    eligibleUniverseBeforeFreshness: {
      rule: "paperEligible && commanderFormatStatus=legal && structurallyEligible && canBeSoleCommander",
      rootFields: ["oracleIdCount", "oracleIdSetSha256"],
    },
    freshEligibleUniverse: {
      rule: "eligibleUniverseBeforeFreshness minus pinned exposed-benchmark oracle IDs",
      rootFields: ["oracleIdCount", "oracleIdSetSha256", "excludedOracleIdCount", "exposedIdentitiesManifestByteSha256"],
      rosterSamplingUniverse: true,
    },
  },
  requiredBefore: ["operational-readiness-sealed-v2 final authorization", "roster-v3 generation"],
  doesNotBlockSpentSerializationPilot: true,
  instruction:
    "Compute only after pre-roster catalog verification PASS. Commitment must pin pre-roster verification byte SHA and canonical roots.",
});

writeJson("phase6a1-professor-plan-commander-eligibility-state-verification-spec-v2.json", {
  version: "phase6a1-professor-plan-commander-eligibility-state-verification-spec-v2",
  authorizedAt: SEALED_AT,
  supersedes: "phase6a1-professor-plan-commander-eligibility-state-verification-spec-v1.json",
  status: "NOT_YET_CREATED",
  completedArtifactTarget: "phase6a1-professor-plan-commander-eligibility-state-verification-v2.json",
  verifierScript: "web/scripts/run-phase6a1-verify-commander-eligibility-state-v2.ts",
  verifierScriptByteSha256: ELIGIBILITY_VERIFY_V2_SHA,
  prerequisiteCommitment: "phase6a1-professor-plan-commander-eligibility-state-commitment-v2.json",
  prerequisitePreRosterCatalogVerification:
    "phase6a1-professor-plan-catalog-data-state-verification-pre-roster-v1.json",
  failClosedRequirements: [
    "re-run full catalog verification in-process and match commitment-bound pre-roster canonical roots",
    "recompute eligibleUniverseBeforeFreshness and freshEligibleUniverse roots/counts",
    "freshEligibleUniverse must use pinned exposed-benchmark-identities-manifest-v2 exclusions only",
  ],
  requiredBeforeRosterV3: true,
  doesNotBlockSpentSerializationPilot: true,
});

writeJson("phase6a1-professor-plan-authority-roster-generator-source-audit-spec-v4.json", {
  version: "phase6a1-professor-plan-authority-roster-generator-source-audit-spec-v4",
  authorizedAt: SEALED_AT,
  supersedes: "phase6a1-professor-plan-authority-roster-generator-source-audit-spec-v3.json",
  attestationArtifact: "phase6a1-professor-plan-authority-roster-generator-source-audit-attestation-v1.json",
  auditedGeneratorSourceByteSha256: "991270999ca72aebcdbb97d8c8af1f5e1e7ad07e80819618798792d4f907ef72",
  extendsDeckResolutionDataStatePin: "phase6a1-professor-plan-deck-resolution-data-state-pin-v2.json",
  extendsDeckResolutionTransitiveSourceManifest:
    "phase6a1-professor-plan-deck-resolution-transitive-source-manifest-v2.json",
  extendsCommanderEligibilityStateCommitment:
    "phase6a1-professor-plan-commander-eligibility-state-commitment-v2.json",
  universeStages: {
    eligibleUniverseBeforeFreshness:
      "MUST equal commander-eligibility-state-commitment-v2 eligibleUniverseBeforeFreshness root/count",
    freshEligibleUniverse:
      "eligibleUniverseBeforeFreshness minus pinned exposed-benchmark oracle IDs; roster generator samples ONLY from this set",
  },
  requiredAttestationChecks: [
    "uses phase6a1-exposed-benchmark-identities-manifest-v2 fail-closed freshness including spent roster-v2 identities",
    "uses benchmark-commander-eligibility-v1.single_commander via pinned eligibility contract and verified catalog state",
    "candidate universe before freshness matches commander-eligibility-state-commitment-v2 eligibleUniverseBeforeFreshness root/count",
    "fresh candidate universe matches commander-eligibility-state-commitment-v2 freshEligibleUniverse root/count after deterministic exposed-oracle subtraction",
    "samples/shuffles from freshEligibleUniverse only, not eligibleUniverseBeforeFreshness",
    "enforces global uniqueness and selection-policy-v3 replacement rules",
    "NO hidden commander/theme/archetype/complexity/name filters beyond public eligibility + freshness policy",
    "uses predeclared selection algorithm with cryptographically strong secret seed/randomness",
    "hashes actual private roster FILE bytes for public commitment",
    "does not log seed or commander names to implementation-visible output",
    "material deck-resolution transitive sources match captured clean repository commit or deck-resolution-transitive-source-manifest-v2 pins",
  ],
  requiredInOperationalReadinessV2: true,
  requiredBeforeRosterV3: true,
});

writeJson("phase6a1-professor-plan-operational-readiness-sealed-v2-spec-v4.json", {
  version: "phase6a1-professor-plan-operational-readiness-sealed-v2-spec-v4",
  authorizedAt: SEALED_AT,
  supersedes: "phase6a1-professor-plan-operational-readiness-sealed-v2-spec-v3.json",
  status: "NOT_YET_CREATED",
  purpose:
    "Self-contained operational readiness seal after pilot PASS, pre-roster catalog re-verification, and eligibility-state verification.",
  preserveForever: ["phase6a1-professor-plan-operational-readiness-seal-v1.json"],
  completedArtifactTarget: "phase6a1-professor-plan-operational-readiness-sealed-v2.json",
  prerequisite: [
    "serialization-pilot-spec-v8 PASS artifact",
    "professor-stack-freeze-captured-v2.json matching pilot stack pins exactly",
    "catalog-data-state-verification-pre-roster-v1.json PASS",
    "commander-eligibility-state-commitment-v2.json computed from bound pre-roster verification",
    "commander-eligibility-state-verification-v2.json PASS",
    "authority-roster-generator-source-audit attestation under spec v4",
  ],
  normativeProvenanceRoot: {
    architectureSealedManifestV10PreRosterV2:
      "phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v10-pre-roster-v2.json",
    note: "Completed readiness seal MUST pin this manifest byte SHA OR explicitly pin every listed source/spec hash below.",
  },
  pinsOnCompletion: [
    "architecture-sealed-manifest-v10-pre-roster-v2.json byte SHA",
    "catalog-data-state-verification-pre-roster-spec-v1.json byte SHA",
    "catalog-data-state-verification-pre-roster-v1.json byte SHA",
    "commander-eligibility-state-commitment-spec-v2.json byte SHA",
    "commander-eligibility-state-verification-spec-v2.json byte SHA",
    "web/scripts/lib/catalog-commander-eligibility-state-root-v2.ts byte SHA",
    "web/scripts/lib/load-exposed-benchmark-oracle-ids-v2.ts byte SHA",
    "web/scripts/lib/verify-pinned-catalog-data-state-v2-core.ts byte SHA",
    "web/scripts/run-phase6a1-compute-commander-eligibility-state-commitment-v2.ts byte SHA",
    "web/scripts/run-phase6a1-verify-commander-eligibility-state-v2.ts byte SHA",
    "web/scripts/run-phase6a1-verify-pinned-catalog-data-state-pre-roster-v1.ts byte SHA",
    "authority-roster-generator-source-audit-spec-v4.json byte SHA",
    "professor-stack-freeze-captured-v2.json byte SHA",
    "serialization-pilot-pass-v1.json byte SHA",
    "serialization-pilot-spec-v8.json byte SHA",
    "catalog-data-state-verification-v2.json byte SHA",
    "commander-eligibility-state-commitment-v2.json byte SHA",
    "commander-eligibility-state-verification-v2.json byte SHA",
    "access boundary operational evidence",
    "singleFinalStackIdentity matching pilot PASS artifact exactly",
    "stackPins matching pilot PASS artifact exactly",
  ],
});

const NORMATIVE_SEQUENCE = [
  "Protocol v9 pilot gate PASS — ACL proof only",
  "After ACL proof PASS: catalog-data-state verification v2 (pilot-time) must PASS fail-closed",
  "Run spent 5/5 single-stack serialization pilot under spec v8",
  "Preserve pilot-time catalog verification v2 + pilot PASS; REPORT AND WAIT",
  "Run NEW pre-roster full catalog verification; preserve separate pre-roster artifact",
  "Compute commander-eligibility-state-commitment-v2 bound to pre-roster verification SHA + roots",
  "Run commander-eligibility-state verification v2; must PASS fail-closed",
  "Complete authority roster generator source audit under spec v4",
  "Write operational-readiness-sealed-v2 under spec v4 with v10-pre-roster-v2 provenance pins",
  "Generate roster v3; publish roster-commitment-v1",
  "ROSTER_COMMITMENT_SEALED_WAIT",
  "REPORT AND WAIT until roster audit clears",
];

writeJson("phase6a1-professor-plan-prospective-pipeline-freeze-spec-v11.json", {
  version: "phase6a1-professor-plan-prospective-pipeline-freeze-spec-v11",
  authorizedAt: SEALED_AT,
  supersedes: "phase6a1-professor-plan-prospective-pipeline-freeze-spec-v10.json",
  pilotGateDecision: "PROTOCOL_V9_PILOT_GATE_PASS_PRESERVED",
  preRosterAmendment: "V10_PRE_ROSTER_V2",
  extendsSerializationPilotSpec: "phase6a1-professor-plan-serialization-pilot-spec-v8.json",
  extendsCatalogVerificationSpec: "phase6a1-professor-plan-catalog-data-state-verification-spec-v2.json",
  extendsPreRosterCatalogVerificationSpec:
    "phase6a1-professor-plan-catalog-data-state-verification-pre-roster-spec-v1.json",
  extendsCommanderEligibilityStateCommitmentSpec:
    "phase6a1-professor-plan-commander-eligibility-state-commitment-spec-v2.json",
  extendsCommanderEligibilityStateVerificationSpec:
    "phase6a1-professor-plan-commander-eligibility-state-verification-spec-v2.json",
  extendsAuthorityRosterGeneratorSourceAuditSpec:
    "phase6a1-professor-plan-authority-roster-generator-source-audit-spec-v4.json",
  extendsOperationalReadinessSealedV2Spec: "phase6a1-professor-plan-operational-readiness-sealed-v2-spec-v4.json",
  aclProofWork: "AUTHORIZED",
  catalogVerifierV2Execution: "AUTHORIZED_AFTER_ACL_PROOF_PASS",
  serializationPilot: "AUTHORIZED_AFTER_ACL_PROOF_AND_CATALOG_VERIFIER_V2_PASS",
  postPilotAutomaticProgression: "BLOCK_REPORT_AND_WAIT_AFTER_PILOT",
  immutablePilotTimeCatalogVerification: "phase6a1-professor-plan-catalog-data-state-verification-v2.json",
  preRosterCatalogVerificationArtifact: "phase6a1-professor-plan-catalog-data-state-verification-pre-roster-v1.json",
  normativeSequence: NORMATIVE_SEQUENCE,
  productionClosureImplementation: "NOT_AUTHORIZED",
  prospectiveRosterV3: "NOT_AUTHORIZED_UNTIL_PRE_ROSTER_V2_REPAIRS_COMPLETE",
  status: "PRE_ROSTER_V2_AMENDMENT_SEALED_AWAITING_ACL_THEN_PILOT",
});

writeJson("phase6a1-professor-plan-v2-benchmark-disposition-v19-architecture.json", {
  version: "phase6a1-professor-plan-v2-benchmark-disposition-v19-architecture",
  recordedAt: SEALED_AT,
  supersedes: "phase6a1-professor-plan-v2-benchmark-disposition-v18-architecture.json",
  architectureCore: "PASS_PRESERVE",
  pilotGateDecision: "PROTOCOL_V9_PILOT_GATE_PASS_PRESERVED",
  preRosterAmendment: "V10_PRE_ROSTER_V2",
  auditReferences: {
    architectureV10PreRosterIndependentReaudit:
      "phase6a1-professor-plan-benchmark-architecture-v10-pre-roster-independent-reaudit-gpt56sol-v1.json",
    preRosterAmendmentBundleV10PreRosterV2: "archv10-pre-roster-v2.zip",
    preRosterAmendmentBundleV10PreRosterV2BytePin:
      "phase6a1-professor-plan-audit-bundle-archv10-pre-roster-v2-byte-pin.json",
  },
  aclProofWork: "AUTHORIZED",
  catalogVerifierV2Execution: "AUTHORIZED_AFTER_ACL_PROOF_PASS",
  serializationPilot: "AUTHORIZED_AFTER_ACL_PROOF_AND_CATALOG_VERIFIER_V2_PASS",
  postPilotProgression: "REPORT_AND_WAIT",
  operationalReadinessFinalSeal: "BLOCKED_UNTIL_PRE_ROSTER_V2_REPAIRS",
  prospectiveRosterV3: "NOT_AUTHORIZED",
  instruction: "REPORT AND WAIT",
});

writeJson("phase6a1-professor-plan-post-gold-development-track-v19-architecture.json", {
  version: "phase6a1-professor-plan-post-gold-development-track-v19-architecture",
  updatedAt: SEALED_AT,
  supersedes: "phase6a1-professor-plan-post-gold-development-track-v18-architecture",
  decision: "V10_PRE_ROSTER_V2_AMENDMENT_SEALED",
  normativeArtifacts: {
    pipelineFreezeSpecV11: "phase6a1-professor-plan-prospective-pipeline-freeze-spec-v11.json",
    preRosterCatalogVerificationSpecV1: "phase6a1-professor-plan-catalog-data-state-verification-pre-roster-spec-v1.json",
    commanderEligibilityStateCommitmentSpecV2: "phase6a1-professor-plan-commander-eligibility-state-commitment-spec-v2.json",
    commanderEligibilityStateVerificationSpecV2: "phase6a1-professor-plan-commander-eligibility-state-verification-spec-v2.json",
    authorityRosterGeneratorSourceAuditSpecV4: "phase6a1-professor-plan-authority-roster-generator-source-audit-spec-v4.json",
    operationalReadinessSealedV2SpecV4: "phase6a1-professor-plan-operational-readiness-sealed-v2-spec-v4.json",
    architectureSealedManifestV10PreRosterV2:
      "phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v10-pre-roster-v2.json",
  },
  instruction: "REPORT AND WAIT",
});

const pins: Record<string, { artifact: string; sha256: string }> = {
  pipelineFreezeSpecV11: {
    artifact: "phase6a1-professor-plan-prospective-pipeline-freeze-spec-v11.json",
    sha256: sha("phase6a1-professor-plan-prospective-pipeline-freeze-spec-v11.json"),
  },
  preRosterCatalogVerificationSpecV1: {
    artifact: "phase6a1-professor-plan-catalog-data-state-verification-pre-roster-spec-v1.json",
    sha256: sha("phase6a1-professor-plan-catalog-data-state-verification-pre-roster-spec-v1.json"),
  },
  preRosterCatalogVerifierScript: {
    artifact: "web/scripts/run-phase6a1-verify-pinned-catalog-data-state-pre-roster-v1.ts",
    sha256: PRE_ROSTER_CATALOG_VERIFY_SHA,
  },
  catalogVerificationCoreLib: {
    artifact: "web/scripts/lib/verify-pinned-catalog-data-state-v2-core.ts",
    sha256: CATALOG_VERIFY_CORE_SHA,
  },
  commanderEligibilityStateCommitmentSpecV2: {
    artifact: "phase6a1-professor-plan-commander-eligibility-state-commitment-spec-v2.json",
    sha256: sha("phase6a1-professor-plan-commander-eligibility-state-commitment-spec-v2.json"),
  },
  commanderEligibilityStateVerificationSpecV2: {
    artifact: "phase6a1-professor-plan-commander-eligibility-state-verification-spec-v2.json",
    sha256: sha("phase6a1-professor-plan-commander-eligibility-state-verification-spec-v2.json"),
  },
  eligibilityStateRootLibV2: {
    artifact: "web/scripts/lib/catalog-commander-eligibility-state-root-v2.ts",
    sha256: ELIGIBILITY_ROOT_LIB_V2_SHA,
  },
  exposedOracleIdsLibV2: {
    artifact: "web/scripts/lib/load-exposed-benchmark-oracle-ids-v2.ts",
    sha256: EXPOSED_ORACLE_IDS_LIB_SHA,
  },
  eligibilityStateComputeScriptV2: {
    artifact: "web/scripts/run-phase6a1-compute-commander-eligibility-state-commitment-v2.ts",
    sha256: ELIGIBILITY_COMPUTE_V2_SHA,
  },
  eligibilityStateVerifyScriptV2: {
    artifact: "web/scripts/run-phase6a1-verify-commander-eligibility-state-v2.ts",
    sha256: ELIGIBILITY_VERIFY_V2_SHA,
  },
  authorityRosterGeneratorSourceAuditSpecV4: {
    artifact: "phase6a1-professor-plan-authority-roster-generator-source-audit-spec-v4.json",
    sha256: sha("phase6a1-professor-plan-authority-roster-generator-source-audit-spec-v4.json"),
  },
  operationalReadinessSealedV2SpecV4: {
    artifact: "phase6a1-professor-plan-operational-readiness-sealed-v2-spec-v4.json",
    sha256: sha("phase6a1-professor-plan-operational-readiness-sealed-v2-spec-v4.json"),
  },
  architectureReauditV10PreRoster: {
    artifact: "phase6a1-professor-plan-benchmark-architecture-v10-pre-roster-independent-reaudit-gpt56sol-v1.json",
    sha256: sha("phase6a1-professor-plan-benchmark-architecture-v10-pre-roster-independent-reaudit-gpt56sol-v1.json"),
  },
  benchmarkDispositionV19: {
    artifact: "phase6a1-professor-plan-v2-benchmark-disposition-v19-architecture.json",
    sha256: sha("phase6a1-professor-plan-v2-benchmark-disposition-v19-architecture.json"),
  },
  developmentTrackV19: {
    artifact: "phase6a1-professor-plan-post-gold-development-track-v19-architecture.json",
    sha256: sha("phase6a1-professor-plan-post-gold-development-track-v19-architecture.json"),
  },
  preservedSealedManifestV10PreRoster: {
    artifact: "phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v10-pre-roster.json",
    sha256: IMMUTABLE.sealedManifestV10PreRoster,
  },
  preservedArchv10PreRosterZip: {
    artifact: "archv10-pre-roster.zip",
    sha256: IMMUTABLE.archv10PreRosterZip,
  },
  preservedSealedManifestV9: {
    artifact: "phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v9.json",
    sha256: IMMUTABLE.sealedManifestV9,
  },
};

writeJson("phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v10-pre-roster-v2.json", {
  version: "phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v10-pre-roster-v2",
  sealedAt: SEALED_AT,
  supersedes: "phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v10-pre-roster.json",
  decision: "PRE_ROSTER_V2_AMENDMENT_SEALED_WAIT",
  doesNotReopenPilotGate: "PROTOCOL_V9_PILOT_GATE_PASS_PRESERVED",
  byteReproducibleSealScript: "web/scripts/run-phase6a1-seal-benchmark-architecture-v10-pre-roster-v2.ts",
  archv10PreRosterV2BundleBytePinArtifact: "phase6a1-professor-plan-audit-bundle-archv10-pre-roster-v2-byte-pin.json",
  preservedV10PreRoster: {
    sealedManifestV10PreRosterSha256: IMMUTABLE.sealedManifestV10PreRoster,
    archv10PreRosterZipSha256: IMMUTABLE.archv10PreRosterZip,
  },
  preservedV9PilotGate: {
    sealedManifestV9Sha256: IMMUTABLE.sealedManifestV9,
    archv9ZipSha256: IMMUTABLE.archv9Zip,
  },
  pins,
  instruction:
    "REPORT AND WAIT — ACL proof, pilot-time catalog verifier v2, spent pilot, then pre-roster re-verification and eligibility capture bound to that state.",
});

console.log(
  JSON.stringify(
    { manifestSha256: sha("phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v10-pre-roster-v2.json"), pins },
    null,
    2,
  ),
);
