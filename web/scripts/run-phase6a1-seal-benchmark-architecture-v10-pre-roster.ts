#!/usr/bin/env npx tsx
/** Seal pre-roster protocol amendment v10 — does NOT block spent pilot gate. Preserves all v9 immutables. */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../..");
const OUT = resolve(REPO, "web/data/milestones/deck-synthesis");
const SEALED_AT = "2026-08-15T03:00:00.000Z";

const IMMUTABLE = {
  selectionPolicyV3: "c741bb5374feb58fc9a37a93b0e423c7330b757c347e2df9bfaf9ffc3eb13b73",
  sealedManifestV9: "d1be5d5481261248fd1cd9c8f61686762a4faaf98f405d106d6188347e2456a3",
  archv9Zip: "f6d30078de9681e9fbb6bee7cb8a0ebff30eb89a5e59a60fa5e80c64c7a370ff",
  fullCatalogDataStateCommitmentV1: "542713fbe39017af136ff82a0bd282d3135930bf01ace4b0b8092f1e60673591",
  fullCatalogDataStateCommitmentV2: "91b2a9d055f75130f8889a2e2eca2bb7cbb82edd22a1afd1056ae8d96c0d48b0",
  deckResolutionDataStatePinV1: "3b12c29a6d3ce1e039c192c897f575a0eecba77cf4274c56ff95bdff83eadc82",
  deckResolutionDataStatePinV2: "7e2e72628d52a898fdb5b43fdfe4a68cbec09477f09d639d14437abbd7b63caa",
  deckResolutionTransitiveSourceManifestV1: "2aaf3ce6dfae2a421ee3398639151c51f815f8c0722cd6115e1c384460b61622",
  deckResolutionTransitiveSourceManifestV2: "fea4f85165e92f32a95b8d569193c59eb6c073332772f73e9715aefc2072a20e",
  rosterGeneratorV3Source: "991270999ca72aebcdbb97d8c8af1f5e1e7ad07e80819618798792d4f907ef72",
  eligibilityStateRootLib: "PLACEHOLDER_COMPUTED_AT_SEAL",
  eligibilityStateComputeScript: "PLACEHOLDER_COMPUTED_AT_SEAL",
  eligibilityStateVerifyScript: "PLACEHOLDER_COMPUTED_AT_SEAL",
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
  ["phase6a1-professor-plan-prospective-commander-selection-policy-v3.json", IMMUTABLE.selectionPolicyV3],
  ["phase6a1-professor-plan-full-catalog-data-state-commitment-v1.json", IMMUTABLE.fullCatalogDataStateCommitmentV1],
  ["phase6a1-professor-plan-full-catalog-data-state-commitment-v2.json", IMMUTABLE.fullCatalogDataStateCommitmentV2],
  ["phase6a1-professor-plan-deck-resolution-data-state-pin-v1.json", IMMUTABLE.deckResolutionDataStatePinV1],
  ["phase6a1-professor-plan-deck-resolution-data-state-pin-v2.json", IMMUTABLE.deckResolutionDataStatePinV2],
  ["phase6a1-professor-plan-deck-resolution-transitive-source-manifest-v1.json", IMMUTABLE.deckResolutionTransitiveSourceManifestV1],
  ["phase6a1-professor-plan-deck-resolution-transitive-source-manifest-v2.json", IMMUTABLE.deckResolutionTransitiveSourceManifestV2],
  ["phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v9.json", IMMUTABLE.sealedManifestV9],
]) {
  assertImmutable(file, expected);
}

if (!existsSync(resolve(OUT, "phase6a1-professor-plan-benchmark-architecture-v9-independent-reaudit-gpt56sol-v1.json"))) {
  throw new Error("Missing v9 independent reaudit in milestones");
}

const ELIGIBILITY_ROOT_LIB_SHA = shaRepo("web/scripts/lib/catalog-commander-eligibility-state-root-v1.ts");
const ELIGIBILITY_COMPUTE_SCRIPT_SHA = shaRepo("web/scripts/run-phase6a1-compute-commander-eligibility-state-commitment-v1.ts");
const ELIGIBILITY_VERIFY_SCRIPT_SHA = shaRepo("web/scripts/run-phase6a1-verify-commander-eligibility-state-v1.ts");

writeJson("phase6a1-professor-plan-commander-eligibility-state-commitment-spec-v1.json", {
  version: "phase6a1-professor-plan-commander-eligibility-state-commitment-spec-v1",
  authorizedAt: SEALED_AT,
  status: "NOT_YET_COMPUTED",
  completedArtifactTarget: "phase6a1-professor-plan-commander-eligibility-state-commitment-v1.json",
  computeScript: "web/scripts/run-phase6a1-compute-commander-eligibility-state-commitment-v1.ts",
  computeScriptByteSha256: ELIGIBILITY_COMPUTE_SCRIPT_SHA,
  eligibilityStateRootLib: "web/scripts/lib/catalog-commander-eligibility-state-root-v1.ts",
  eligibilityStateRootLibByteSha256: ELIGIBILITY_ROOT_LIB_SHA,
  extendsFullCatalogDataStateCommitment: "phase6a1-professor-plan-full-catalog-data-state-commitment-v2.json",
  extendsDeckResolutionDataStatePin: "phase6a1-professor-plan-deck-resolution-data-state-pin-v2.json",
  extendsBenchmarkCommanderEligibilityContract:
    "phase6a1-professor-plan-benchmark-commander-eligibility-contract-pin-v1.json",
  eligibilityStateRootAlgorithm: "phase6a1-commander-eligibility-state-sorted-newline-root-v1",
  eligibilityStateRootAlgorithmDefinition:
    "For each oracleId in sorted order, emit oracleId|paperEligible|commanderFormatStatus|structurallyEligible|canBeSoleCommander|canOccupyCommandZone using deriveCommanderClassification(card.legalities) and pinned paper ledger; sort lines lexicographically; join with single newline; SHA-256. Single-commander-eligible set = rows where paperEligible && commanderFormatStatus=legal && structurallyEligible && canBeSoleCommander; eligible Oracle-ID-set root uses sorted oracleId lines only.",
  bindsRuntimeFields: [
    "card.legalities.commander via commanderFormatStatus",
    "paperEligible",
    "structurallyEligible",
    "canBeSoleCommander",
    "canOccupyCommandZone",
  ],
  expectedRootFields: [
    "fullEligibilityStateRootSha256",
    "singleCommanderEligibleOracleIdCount",
    "singleCommanderEligibleOracleIdSetSha256",
  ],
  captureTiming:
    "Run compute script against the same verified Firestore catalog state immediately after catalog-data-state-verification-v2 PASS and before roster-v3 generation.",
  doesNotBlock: "spent serialization pilot under spec v8",
  requiredBefore: ["operational-readiness-sealed-v2 final authorization", "roster-v3 generation"],
  instruction:
    "Compute and seal commander-eligibility-state-commitment-v1.json from live DeckResolutionCatalog; then run verifier v1 and pin verification artifact byte SHA in operational readiness.",
});

writeJson("phase6a1-professor-plan-commander-eligibility-state-verification-spec-v1.json", {
  version: "phase6a1-professor-plan-commander-eligibility-state-verification-spec-v1",
  authorizedAt: SEALED_AT,
  status: "NOT_YET_CREATED",
  completedArtifactTarget: "phase6a1-professor-plan-commander-eligibility-state-verification-v1.json",
  verifierScript: "web/scripts/run-phase6a1-verify-commander-eligibility-state-v1.ts",
  verifierScriptByteSha256: ELIGIBILITY_VERIFY_SCRIPT_SHA,
  prerequisiteCommitment: "phase6a1-professor-plan-commander-eligibility-state-commitment-v1.json",
  prerequisiteCatalogVerification: "phase6a1-professor-plan-catalog-data-state-verification-v2.json",
  failClosedRequirements: [
    "DeckResolutionCatalog loaded failClosed against pin v2",
    "exactly 38542 Oracle identities",
    "runtime fullEligibilityStateRootSha256 equals committed root",
    "runtime singleCommanderEligibleOracleIdCount equals committed count",
    "runtime singleCommanderEligibleOracleIdSetSha256 equals committed eligible-set root",
    "MUST bind card.legalities.commander-derived commanderFormatStatus, not merely cardStructureHash roots",
  ],
  requiredInOperationalReadinessV2: true,
  requiredBeforeRosterV3: true,
  doesNotBlockSpentSerializationPilot: true,
  instruction:
    "Execute after commander-eligibility-state-commitment-v1.json is computed from verified catalog state and before roster-v3 generation.",
});

writeJson("phase6a1-professor-plan-authority-roster-generator-source-audit-spec-v3.json", {
  version: "phase6a1-professor-plan-authority-roster-generator-source-audit-spec-v3",
  authorizedAt: SEALED_AT,
  supersedes: "phase6a1-professor-plan-authority-roster-generator-source-audit-spec-v2.json",
  attestationArtifact: "phase6a1-professor-plan-authority-roster-generator-source-audit-attestation-v1.json",
  auditedGeneratorSourceByteSha256: IMMUTABLE.rosterGeneratorV3Source,
  extendsDeckResolutionDataStatePin: "phase6a1-professor-plan-deck-resolution-data-state-pin-v2.json",
  extendsDeckResolutionTransitiveSourceManifest:
    "phase6a1-professor-plan-deck-resolution-transitive-source-manifest-v2.json",
  requiredAttestationChecks: [
    "uses phase6a1-exposed-benchmark-identities-manifest-v2 fail-closed freshness including spent roster-v2 identities",
    "uses benchmark-commander-eligibility-v1.single_commander via pinned eligibility contract and verified catalog state",
    "enforces global uniqueness and selection-policy-v3 replacement rules",
    "samples/shuffles from the complete fresh single-commander-eligible universe only",
    "NO hidden commander/theme/archetype/complexity/name filters beyond public eligibility + freshness policy",
    "uses predeclared selection algorithm with cryptographically strong secret seed/randomness",
    "hashes actual private roster FILE bytes for public commitment",
    "does not log seed or commander names to implementation-visible output",
    "material deck-resolution transitive sources match captured clean repository commit or deck-resolution-transitive-source-manifest-v2 pins",
    "uses deck-resolution-data-state-pin-v2 fail-closed loader SHA 55e53a4eca536101aed90e0cf4f51fc97950d13d2c125721a99a809c07d8d84a",
    "roster candidate universe matches commander-eligibility-state-commitment-v1 singleCommanderEligibleOracleIdSet root/count",
  ],
  requiredInOperationalReadinessV2: true,
  requiredBeforeRosterV3: true,
});

writeJson("phase6a1-professor-plan-operational-readiness-sealed-v2-spec-v3.json", {
  version: "phase6a1-professor-plan-operational-readiness-sealed-v2-spec-v3",
  authorizedAt: SEALED_AT,
  supersedes: "phase6a1-professor-plan-operational-readiness-sealed-v2-spec-v2.json",
  status: "NOT_YET_CREATED",
  purpose:
    "Immutable operational readiness seal created only after pilot PASS, stack capture v2, ACL proof, and pre-roster eligibility-state verification.",
  preserveForever: ["phase6a1-professor-plan-operational-readiness-seal-v1.json"],
  completedArtifactTarget: "phase6a1-professor-plan-operational-readiness-sealed-v2.json",
  prerequisite: [
    "serialization-pilot-spec-v8 PASS artifact",
    "professor-stack-freeze-captured-v2.json matching pilot stack pins exactly",
    "commander-eligibility-state-commitment-v1.json computed from verified catalog state",
    "commander-eligibility-state-verification-v1.json PASS",
  ],
  pinsOnCompletion: [
    "professor-stack-freeze-captured-v2.json byte SHA",
    "serialization-pilot-pass-v1.json byte SHA",
    "serialization-pilot-spec-v8.json byte SHA",
    "catalog-data-state-verification-v2.json byte SHA",
    "commander-eligibility-state-commitment-v1.json byte SHA",
    "commander-eligibility-state-verification-v1.json byte SHA",
    "authority-roster-generator-source-audit-spec-v3.json byte SHA",
    "access boundary operational evidence",
    "singleFinalStackIdentity matching pilot PASS artifact exactly",
    "stackPins matching pilot PASS artifact exactly",
    "fullCatalogDataStateCommitment-v2 byte SHA",
    "deckResolutionDataStatePin-v2 byte SHA",
    "deckResolutionTransitiveSourceManifest-v2 byte SHA",
    "benchmark-commander-eligibility-contract-pin-v1.json byte SHA",
    "authority roster generator source byte SHA",
    "authority-roster-generator-source-audit-attestation-v1.json byte SHA",
    "reviewedGeneratorSourceByteSha256 in attestation",
    "capturedRepositoryCommitSha256 matching transitive source closure v2",
    "authority-adjudication-rubric-v4.json byte SHA",
    "exposed-benchmark-identities-manifest-v2.json byte SHA",
    "selection-policy-v3-freshness-manifest-v2-override-v1.json byte SHA",
  ],
  blocksWithout: [
    "commander-eligibility-state-commitment-v1.json with computed roots",
    "commander-eligibility-state-verification-v1.json PASS",
    "authority-roster-generator-source-audit-spec-v3 attestation",
  ],
});

const NORMATIVE_SEQUENCE = [
  "Protocol v9 pilot gate PASS — proceed ACL proof only",
  "After ACL proof PASS: catalog-data-state verification v2 must PASS fail-closed",
  "Run spent 5/5 single-stack serialization pilot under spec v8",
  "Preserve verifier v2 artifact + pilot PASS; REPORT AND WAIT",
  "Compute commander-eligibility-state-commitment-v1 from verified Firestore state",
  "Run commander-eligibility-state verification v1; must PASS fail-closed",
  "Complete authority roster generator source audit under spec v3",
  "Write operational-readiness-sealed-v2 under spec v3",
  "Generate roster v3; publish roster-commitment-v1",
  "ROSTER_COMMITMENT_SEALED_WAIT",
  "REPORT AND WAIT until roster audit clears",
  "Authority privately generates 24 real Professor cases",
  "validator_v2 + serialization + authority adjudication + seal hidden pack",
  "Independent benchmark integrity confirmation",
  "ONLY THEN authorize production closure implementation against DEV",
];

writeJson("phase6a1-professor-plan-prospective-pipeline-freeze-spec-v10.json", {
  version: "phase6a1-professor-plan-prospective-pipeline-freeze-spec-v10",
  authorizedAt: SEALED_AT,
  supersedes: "phase6a1-professor-plan-prospective-pipeline-freeze-spec-v9.json",
  extendsSerializationPilotSpec: "phase6a1-professor-plan-serialization-pilot-spec-v8.json",
  extendsHarmonyPilotEvidence: "phase6a1-professor-plan-serialization-pilot-harmony-evidence-v3.json",
  extendsCatalogVerificationSpec: "phase6a1-professor-plan-catalog-data-state-verification-spec-v2.json",
  extendsCommanderEligibilityStateCommitmentSpec:
    "phase6a1-professor-plan-commander-eligibility-state-commitment-spec-v1.json",
  extendsCommanderEligibilityStateVerificationSpec:
    "phase6a1-professor-plan-commander-eligibility-state-verification-spec-v1.json",
  extendsAuthorityRosterGeneratorSourceAuditSpec:
    "phase6a1-professor-plan-authority-roster-generator-source-audit-spec-v3.json",
  extendsOperationalReadinessSealedV2Spec: "phase6a1-professor-plan-operational-readiness-sealed-v2-spec-v3.json",
  pilotGateDecision: "PROTOCOL_V9_PILOT_GATE_PASS_PRE_ROSTER_BLOCK",
  aclProofWork: "AUTHORIZED",
  catalogVerifierV2Execution: "AUTHORIZED_AFTER_ACL_PROOF_PASS",
  serializationPilot: "AUTHORIZED_AFTER_ACL_PROOF_AND_CATALOG_VERIFIER_V2_PASS",
  postPilotAutomaticProgression: "BLOCK_REPORT_AND_WAIT_AFTER_PILOT",
  preRosterRepairsSealedInV10: [
    "commander-eligibility-state commitment/verification contract",
    "authority-roster-generator-source-audit-spec-v3 referencing deck-resolution v2 pins",
  ],
  immutablePendingArtifacts: {
    selectionPolicyV3: IMMUTABLE.selectionPolicyV3,
    sealedManifestV9: IMMUTABLE.sealedManifestV9,
    archv9Zip: IMMUTABLE.archv9Zip,
    fullCatalogDataStateCommitmentV1: IMMUTABLE.fullCatalogDataStateCommitmentV1,
    fullCatalogDataStateCommitmentV2: IMMUTABLE.fullCatalogDataStateCommitmentV2,
  },
  normativeSequence: NORMATIVE_SEQUENCE,
  productionClosureImplementation: "NOT_AUTHORIZED",
  prospectiveRosterV3: "NOT_AUTHORIZED_UNTIL_PRE_ROSTER_REPAIRS_COMPLETE",
  status: "PRE_ROSTER_AMENDMENT_SEALED_AWAITING_ACL_THEN_PILOT",
});

writeJson("phase6a1-professor-plan-v2-benchmark-disposition-v18-architecture.json", {
  version: "phase6a1-professor-plan-v2-benchmark-disposition-v18-architecture",
  recordedAt: SEALED_AT,
  supersedes: "phase6a1-professor-plan-v2-benchmark-disposition-v17-architecture.json",
  architectureCore: "PASS_PRESERVE",
  pilotGateDecision: "PROTOCOL_V9_PILOT_GATE_PASS_PRE_ROSTER_BLOCK",
  auditReferences: {
    architectureV9IndependentReaudit: "phase6a1-professor-plan-benchmark-architecture-v9-independent-reaudit-gpt56sol-v1.json",
    preRosterAmendmentBundleV10: "archv10-pre-roster.zip",
    preRosterAmendmentBundleV10BytePin: "phase6a1-professor-plan-audit-bundle-archv10-pre-roster-byte-pin.json",
  },
  aclProofWork: "AUTHORIZED",
  catalogVerifierV2Execution: "AUTHORIZED_AFTER_ACL_PROOF_PASS",
  serializationPilot: "AUTHORIZED_AFTER_ACL_PROOF_AND_CATALOG_VERIFIER_V2_PASS",
  postPilotProgression: "REPORT_AND_WAIT",
  operationalReadinessFinalSeal: "BLOCKED_UNTIL_PRE_ROSTER_REPAIRS",
  prospectiveRosterV3: "NOT_AUTHORIZED",
  instruction: "REPORT AND WAIT",
});

writeJson("phase6a1-professor-plan-post-gold-development-track-v18-architecture.json", {
  version: "phase6a1-professor-plan-post-gold-development-track-v18-architecture",
  updatedAt: SEALED_AT,
  supersedes: "phase6a1-professor-plan-post-gold-development-track-v17-architecture",
  decision: "PROTOCOL_V9_PILOT_GATE_PASS_PRE_ROSTER_AMENDMENT_V10_SEALED",
  normativeArtifacts: {
    pipelineFreezeSpecV10: "phase6a1-professor-plan-prospective-pipeline-freeze-spec-v10.json",
    commanderEligibilityStateCommitmentSpecV1: "phase6a1-professor-plan-commander-eligibility-state-commitment-spec-v1.json",
    commanderEligibilityStateVerificationSpecV1: "phase6a1-professor-plan-commander-eligibility-state-verification-spec-v1.json",
    authorityRosterGeneratorSourceAuditSpecV3: "phase6a1-professor-plan-authority-roster-generator-source-audit-spec-v3.json",
    operationalReadinessSealedV2SpecV3: "phase6a1-professor-plan-operational-readiness-sealed-v2-spec-v3.json",
    architectureSealedManifestV10PreRoster: "phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v10-pre-roster.json",
  },
  instruction: "REPORT AND WAIT",
});

const pins: Record<string, { artifact: string; sha256: string }> = {
  pipelineFreezeSpecV10: {
    artifact: "phase6a1-professor-plan-prospective-pipeline-freeze-spec-v10.json",
    sha256: sha("phase6a1-professor-plan-prospective-pipeline-freeze-spec-v10.json"),
  },
  commanderEligibilityStateCommitmentSpecV1: {
    artifact: "phase6a1-professor-plan-commander-eligibility-state-commitment-spec-v1.json",
    sha256: sha("phase6a1-professor-plan-commander-eligibility-state-commitment-spec-v1.json"),
  },
  commanderEligibilityStateVerificationSpecV1: {
    artifact: "phase6a1-professor-plan-commander-eligibility-state-verification-spec-v1.json",
    sha256: sha("phase6a1-professor-plan-commander-eligibility-state-verification-spec-v1.json"),
  },
  commanderEligibilityStateRootLib: {
    artifact: "web/scripts/lib/catalog-commander-eligibility-state-root-v1.ts",
    sha256: ELIGIBILITY_ROOT_LIB_SHA,
  },
  commanderEligibilityStateComputeScript: {
    artifact: "web/scripts/run-phase6a1-compute-commander-eligibility-state-commitment-v1.ts",
    sha256: ELIGIBILITY_COMPUTE_SCRIPT_SHA,
  },
  commanderEligibilityStateVerifyScript: {
    artifact: "web/scripts/run-phase6a1-verify-commander-eligibility-state-v1.ts",
    sha256: ELIGIBILITY_VERIFY_SCRIPT_SHA,
  },
  authorityRosterGeneratorSourceAuditSpecV3: {
    artifact: "phase6a1-professor-plan-authority-roster-generator-source-audit-spec-v3.json",
    sha256: sha("phase6a1-professor-plan-authority-roster-generator-source-audit-spec-v3.json"),
  },
  operationalReadinessSealedV2SpecV3: {
    artifact: "phase6a1-professor-plan-operational-readiness-sealed-v2-spec-v3.json",
    sha256: sha("phase6a1-professor-plan-operational-readiness-sealed-v2-spec-v3.json"),
  },
  architectureReauditV9: {
    artifact: "phase6a1-professor-plan-benchmark-architecture-v9-independent-reaudit-gpt56sol-v1.json",
    sha256: sha("phase6a1-professor-plan-benchmark-architecture-v9-independent-reaudit-gpt56sol-v1.json"),
  },
  benchmarkDispositionV18: {
    artifact: "phase6a1-professor-plan-v2-benchmark-disposition-v18-architecture.json",
    sha256: sha("phase6a1-professor-plan-v2-benchmark-disposition-v18-architecture.json"),
  },
  developmentTrackV18: {
    artifact: "phase6a1-professor-plan-post-gold-development-track-v18-architecture.json",
    sha256: sha("phase6a1-professor-plan-post-gold-development-track-v18-architecture.json"),
  },
  preservedSealedManifestV9: {
    artifact: "phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v9.json",
    sha256: IMMUTABLE.sealedManifestV9,
  },
  preservedArchv9Zip: {
    artifact: "archv9.zip",
    sha256: IMMUTABLE.archv9Zip,
  },
};

writeJson("phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v10-pre-roster.json", {
  version: "phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v10-pre-roster",
  sealedAt: SEALED_AT,
  supersedes: "phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v9.json",
  decision: "PRE_ROSTER_AMENDMENT_V10_SEALED_WAIT",
  doesNotSupersedePilotGate: "PROTOCOL_V9_PILOT_GATE_PASS remains in force; this amendment adds pre-roster blockers only",
  byteReproducibleSealScript: "web/scripts/run-phase6a1-seal-benchmark-architecture-v10-pre-roster.ts",
  archv10PreRosterBundleBytePinArtifact: "phase6a1-professor-plan-audit-bundle-archv10-pre-roster-byte-pin.json",
  preservedV9PilotGate: {
    sealedManifestV9Sha256: IMMUTABLE.sealedManifestV9,
    archv9ZipSha256: IMMUTABLE.archv9Zip,
    note: "All v9 P0 repairs and pilot authorization preserved unchanged.",
  },
  pins,
  instruction:
    "REPORT AND WAIT — ACL proof, then catalog verifier v2, then spent pilot; pre-roster repairs required before roster-v3 and operational-readiness final seal.",
});

console.log(
  JSON.stringify(
    { manifestSha256: sha("phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v10-pre-roster.json"), pins },
    null,
    2,
  ),
);
