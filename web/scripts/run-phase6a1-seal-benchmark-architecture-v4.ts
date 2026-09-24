#!/usr/bin/env npx tsx
/** Seal benchmark architecture package v4 — repairs archv3 audit blocks. Never mutates v3-pinned pending bytes. */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../..");
const OUT = resolve(REPO, "web/data/milestones/deck-synthesis");
const SEALED_AT = "2026-08-14T22:45:00.000Z";

const IMMUTABLE = {
  professorStackFreezeManifestV1: "47fb3cf2e1a6d34a7d22e124457db50055fb6194a3fed7cfdaae7871d8297664",
  professorStackFreezeCapturedV1: "be7a8f2c07c47962656215dd93208277d3fdf222b4a1fe627478ce0ab7c44d75",
  operationalReadinessSealV1: "488c4c6d7aa27c87acb667949017b834b829f1b0c2f40442bff6306377fc34f3",
  selectionPolicyV1: "28df0ec79a7c006ea40faad3599c1fba3194d72279c61ef76b30b954d8922398",
  selectionPolicyV2: "4a5a64af8c57cd7b2810319b8ee11ac4d714ee752a1307361241fe0d53a51fb3",
  v7BenchmarkBlockReaudit: "d4bcc5da8703a335f69e1a3352f185c8ea5cfefffe2ab12f283fbbdeea57bcd6",
  v8v8Bundle: "73b2b9b82f78af206db318f5a5fa237a5509e44ae96abab7e0f230ef2d933f2a",
};

const sha = (f: string) => createHash("sha256").update(readFileSync(resolve(OUT, f))).digest("hex");

function writeJson(name: string, value: unknown): string {
  writeFileSync(resolve(OUT, name), JSON.stringify(value, null, 2));
  return sha(name);
}

function assertImmutable(file: string, expected: string): void {
  if (!existsSync(resolve(OUT, file))) throw new Error(`Missing immutable artifact: ${file}`);
  const actual = sha(file);
  if (actual !== expected) throw new Error(`Refusing to seal: ${file} changed (${expected} != ${actual})`);
}

for (const [file, expected] of [
  ["phase6a1-professor-plan-professor-stack-freeze-manifest-v1.json", IMMUTABLE.professorStackFreezeManifestV1],
  ["phase6a1-professor-plan-professor-stack-freeze-captured-v1.json", IMMUTABLE.professorStackFreezeCapturedV1],
  ["phase6a1-professor-plan-operational-readiness-seal-v1.json", IMMUTABLE.operationalReadinessSealV1],
  ["phase6a1-professor-plan-prospective-commander-selection-policy-v1.json", IMMUTABLE.selectionPolicyV1],
  ["phase6a1-professor-plan-prospective-commander-selection-policy-v2.json", IMMUTABLE.selectionPolicyV2],
]) {
  assertImmutable(file, expected);
}

const requiredAudit = "phase6a1-professor-plan-benchmark-architecture-v3-independent-reaudit-gpt56sol-v1.json";
if (!existsSync(resolve(OUT, requiredAudit))) {
  throw new Error(`Missing required audit artifact in milestones: ${requiredAudit}`);
}

writeJson("phase6a1-professor-plan-prospective-commander-roster-v2-spent-sidecar.json", {
  version: "phase6a1-professor-plan-prospective-commander-roster-v2-spent-sidecar",
  recordedAt: SEALED_AT,
  disposition: "SPENT_AS_BLIND_ROSTER_DO_NOT_USE",
  reasons: [
    "Public selection policy v2 published selectionSeed enabling deterministic reconstruction from implementation-visible golden catalog + exposed history.",
    "archv3 shipped the deterministic generator to implementation-visible review bundle.",
    "Authority runner logged primarySample commander names; producer report repeated sample names.",
    "Advertised commitment used compact JSON hash, not private file byte SHA.",
  ],
  privateRosterArtifact: "benchmark-authority/phase6a1-holdout-prospective-pipeline-v1/private/phase6a1-professor-plan-prospective-commander-roster-private-v2.json",
  doNotPublishCommanderNames: true,
  replacement: "Generate roster v3 only after ACL separation; keep seed authority-private; publish only byte SHA commitment.",
});

writeJson("phase6a1-professor-plan-prospective-commander-selection-policy-v2-spent-sidecar.json", {
  version: "phase6a1-professor-plan-prospective-commander-selection-policy-v2-spent-sidecar",
  recordedAt: SEALED_AT,
  spentArtifact: "phase6a1-professor-plan-prospective-commander-selection-policy-v2.json",
  spentArtifactSha256: IMMUTABLE.selectionPolicyV2,
  disposition: "SPENT_AS_BLIND_METADATA_POLICY",
  reason: "Published selectionSeed plus implementation-visible generator enabled roster reconstruction.",
  replacement: "phase6a1-professor-plan-prospective-commander-selection-policy-v3.json",
});

writeJson("phase6a1-exposed-benchmark-identities-manifest-v1.json", {
  version: "phase6a1-exposed-benchmark-identities-manifest-v1",
  authorizedAt: SEALED_AT,
  failClosed: true,
  instruction: "Authority roster generation must hard-fail if any source is missing or SHA mismatches.",
  sources: [
    { id: "dev36_v2", kind: "population", pathFromMilestones: "phase6a1-professor-plan-dev36-population-v2.json", sha256: "2fae3fa2bab14e24e78a5af2dc8d95ff34260bf2967dff6005a7fa2ef9a8aef7", purpose: "DEV36 spent identities" },
    { id: "holdout24_v2", kind: "population", pathFromMilestones: "phase6a1-professor-plan-holdout24-population-v2.json", sha256: "7135898b431fef76587e4b1cdfc45feb37cc855cbdb12fe20e71f51699e9fb00", purpose: "Holdout24 v2" },
    { id: "holdout24_v3", kind: "population", pathFromMilestones: "phase6a1-professor-plan-holdout24-v3-population-v3.json", sha256: "503681903fcedef74831f9880d8996ec4d3d4413b10f600ff18f0b5c79ff9ab0", purpose: "Holdout24 v3" },
    { id: "holdout_prospective_v4", kind: "population", pathFromMilestones: "phase6a1-professor-plan-holdout-prospective-v4-population-v4.json", sha256: "c8227b0fb21867653c490a1d727d8bcb0ea7fc2fada66bbeed8341b13cbf3b77", purpose: "Synthetic prospective v4" },
    { id: "holdout_prospective_v5", kind: "population", pathFromMilestones: "phase6a1-professor-plan-holdout-prospective-v5-population-v5.json", sha256: "e2c2ed1e0cacb2ac019230a0a0a4a71066a1c900c66b747e8e4c7ffe99837dc1", purpose: "Synthetic prospective v5" },
    { id: "holdout_prospective_v6", kind: "population", pathFromMilestones: "phase6a1-professor-plan-holdout-prospective-v6-population-v6.json", sha256: "1f5b3cae497ffbd784dbe72f9700e86ecfcdd919c4d2cdd93fb41a4dd5bbf6ff", purpose: "Synthetic prospective v6" },
    { id: "holdout_prospective_v7", kind: "population", pathFromMilestones: "phase6a1-professor-plan-holdout-prospective-v7-population-v7.json", sha256: "a9b105994fb1d9786655d9534b551f5ee3179a859ab16b0020a1c11f9482cf7e", purpose: "Synthetic prospective v7" },
    { id: "holdout_prospective_v8", kind: "population", pathFromMilestones: "phase6a1-professor-plan-holdout-prospective-v8-population-v8.json", sha256: "d0e64fccfafffbc58a14f3e068ed1b00b071eff6352f87c93956602320741800", purpose: "Synthetic prospective v8" },
    { id: "amendment_v8_manifest", kind: "amendment_manifest", pathFromMilestones: "phase6a1-professor-plan-experiment-v3-amended-v8/phase6a1-professor-plan-experiment-manifest-v3-amended-v8.json", sha256: "23cc0e5c51d1b41034ceeecfa56d26c67b592bab23dce771238614d02293ff7d", purpose: "Amendment v8 professor population" },
    { id: "spent_selection_policy_v1", kind: "selection_policy", pathFromMilestones: "phase6a1-professor-plan-prospective-commander-selection-policy-v1.json", sha256: IMMUTABLE.selectionPolicyV1, purpose: "Spent public roster v1" },
    { id: "spent_selection_policy_v2", kind: "selection_policy", pathFromMilestones: "phase6a1-professor-plan-prospective-commander-selection-policy-v2.json", sha256: IMMUTABLE.selectionPolicyV2, purpose: "Spent public metadata policy v2" },
  ],
  spentRosterSidecars: [
    { artifact: "phase6a1-professor-plan-prospective-commander-selection-policy-v1-spent-sidecar.json", sha256: sha("phase6a1-professor-plan-prospective-commander-selection-policy-v1-spent-sidecar.json"), reason: "Public roster v1 spent" },
    { artifact: "phase6a1-professor-plan-prospective-commander-roster-v2-spent-sidecar.json", sha256: sha("phase6a1-professor-plan-prospective-commander-roster-v2-spent-sidecar.json"), reason: "Private roster v2 spent" },
    { artifact: "phase6a1-professor-plan-prospective-commander-selection-policy-v2-spent-sidecar.json", sha256: sha("phase6a1-professor-plan-prospective-commander-selection-policy-v2-spent-sidecar.json"), reason: "Public metadata policy v2 spent" },
  ],
  privateSpentRosterFiles: [
    { pathFromAuthorityPrivate: "phase6a1-professor-plan-prospective-commander-roster-private-v2.json", reason: "Deterministically reconstructable + sample-name leak" },
  ],
});

const selectionPolicyV3Sha = writeJson("phase6a1-professor-plan-prospective-commander-selection-policy-v3.json", {
  version: "phase6a1-professor-plan-prospective-commander-selection-policy-v3",
  authorizedAt: SEALED_AT,
  supersedesSpentPolicies: [
    "phase6a1-professor-plan-prospective-commander-selection-policy-v1.json",
    "phase6a1-professor-plan-prospective-commander-selection-policy-v2.json",
  ],
  populationCodename: "holdout-prospective-pipeline-v1",
  caseCountTarget: 24,
  selectionSeedVisibility: "AUTHORITY_PRIVATE_NEVER_PUBLISHED_BEFORE_EVALUATION",
  privateRosterByteSha256: "PENDING_AUTHORITY_GENERATION_AFTER_ACL_PROOF",
  privateRosterStorage: "benchmark-authority/phase6a1-holdout-prospective-pipeline-v1/private/phase6a1-professor-plan-prospective-commander-roster-private-v3.json",
  implementationVisibility: "COMMITMENT_ONLY_BEFORE_CLOSURE_FREEZE",
  publishedBeforeClosureFreeze: ["populationCodename", "caseCountTarget", "selectionPolicyVersion", "privateRosterByteSha256"],
  withheldBeforeClosureFreeze: ["selectionSeed", "commander identities", "deterministic generator source", "primary/alternate names"],
  replacementPolicy: {
    maxAttemptsPerSlot: 4,
    alternatesPerSlot: 3,
    globalUniquenessRule: "Process P01..P24 with globalAcceptedCommanderSet; skip consumed identities.",
    eligibilityContract: "benchmark-commander-eligibility-v1.single_commander",
    freshnessGate: "phase6a1-exposed-benchmark-identities-manifest-v1.json fail-closed union",
  },
  instruction: "Do not generate roster v3 until separate authority access is operationally proven.",
});

writeJson("phase6a1-professor-plan-synthetic-architecture-pivot-lineage-v1.json", {
  version: "phase6a1-professor-plan-synthetic-architecture-pivot-lineage-v1",
  authorizedAt: SEALED_AT,
  purpose: "Document audit lineage from synthetic benchmark blocks to pipeline-driven prospective architecture.",
  canonicalSyntheticBlockAudit: {
    artifact: "phase6a1-professor-plan-functional-role-closure-v7-preimplementation-reaudit-gpt56sol-v1.json",
    sha256: IMMUTABLE.v7BenchmarkBlockReaudit,
    decision: "BENCHMARK_BLOCK_V7",
  },
  syntheticIntegrityBundleV8: { artifact: "v8v8.zip", sha256: IMMUTABLE.v8v8Bundle },
  architecturePivot: "Synthetic prospective holdout authoring superseded by Professor→Validator→Closure pipeline architecture.",
  notArchitecturePivotAudit: "phase6a1-professor-plan-experiment-v3-amended-v8-pre-gold-reaudit-gpt56sol-v1.json is Amendment v8 experiment integrity, not the architecture pivot audit.",
});

writeJson("phase6a1-professor-plan-professor-stack-freeze-captured-v2-spec-v1.json", {
  version: "phase6a1-professor-plan-professor-stack-freeze-captured-v2-spec-v1",
  authorizedAt: SEALED_AT,
  status: "NOT_YET_CREATED",
  purpose: "Immutable completed stack capture artifact path after pilot/stack capture.",
  preserveForever: ["phase6a1-professor-plan-professor-stack-freeze-manifest-v1.json", "phase6a1-professor-plan-professor-stack-freeze-captured-v1.json"],
  completedArtifactTarget: "phase6a1-professor-plan-professor-stack-freeze-captured-v2.json",
  instruction: "Write captured stack pins once to captured-v2.json. Never overwrite captured-v1 pending placeholder bytes.",
});

writeJson("phase6a1-professor-plan-operational-readiness-sealed-v2-spec-v1.json", {
  version: "phase6a1-professor-plan-operational-readiness-sealed-v2-spec-v1",
  authorizedAt: SEALED_AT,
  status: "NOT_YET_CREATED",
  purpose: "Immutable operational readiness seal created only after pilot PASS, stack capture v2, and ACL proof.",
  preserveForever: ["phase6a1-professor-plan-operational-readiness-seal-v1.json"],
  completedArtifactTarget: "phase6a1-professor-plan-operational-readiness-sealed-v2.json",
  pinsOnCompletion: [
    "professor-stack-freeze-captured-v2.json byte SHA",
    "serialization pilot PASS artifact",
    "access boundary operational evidence",
    "serializerVersion",
    "publishContractSha256",
  ],
});

writeJson("phase6a1-professor-plan-serialization-pilot-spec-v3.json", {
  version: "phase6a1-professor-plan-serialization-pilot-spec-v3",
  authorizedAt: SEALED_AT,
  supersedes: "phase6a1-professor-plan-serialization-pilot-spec-v2.json",
  isBenchmark: false,
  pilotCommandersSource: "ALREADY_EXPOSED_SPENT_COMMANDERS_ONLY",
  harmonyValidationRequired: true,
  harmonyValidationNote: "Include spent real Professor outputs with positive/negative Harmony bridge cases to validate the public >=2-edge rule before prospective roster spend.",
  onPass: {
    writeCapturedStackTo: "phase6a1-professor-plan-professor-stack-freeze-captured-v2.json",
    writeOperationalReadinessTo: "phase6a1-professor-plan-operational-readiness-sealed-v2.json",
    neverMutate: [
      "phase6a1-professor-plan-professor-stack-freeze-manifest-v1.json",
      "phase6a1-professor-plan-professor-stack-freeze-captured-v1.json",
      "phase6a1-professor-plan-operational-readiness-seal-v1.json",
    ],
  },
});

writeJson("phase6a1-professor-plan-authority-adjudication-disagreement-protocol-v2.json", {
  version: "phase6a1-professor-plan-authority-adjudication-disagreement-protocol-v2",
  authorizedAt: SEALED_AT,
  supersedes: "phase6a1-professor-plan-authority-adjudication-disagreement-protocol-v1.json",
  terminalRule: {
    caseReplacementForbidden: true,
    commanderReplacementForbidden: true,
    whenNoTwoOfThreeMajority: {
      packDisposition: "RETAIN_CASE_IN_FIXED_24_CASE_PACK",
      disputedFieldGold: "EVIDENCE_INSUFFICIENT",
      scoring: "Evaluation-A scores disputed field as EVIDENCE_INSUFFICIENT per predeclared rubric",
      benchmarkMacro: "May fail macro thresholds; does not authorize dropping or substituting the case/commander",
      resolutionWithoutReplacement: "Entire prospective pack remains BLOCKED_FOR_BENCHMARK_USE until evidence resolves OR evaluation proceeds with EVIDENCE_INSUFFICIENT gold on disputed fields only",
    },
  },
  prohibition: "Do not replace a case because adjudication is difficult, ambiguous, or inconvenient.",
});

const NORMATIVE_SEQUENCE = [
  "Seal protocol repair package v4",
  "Establish and prove separate authority access (implementation cannot read authority-private roster/seed/generator logs)",
  "Generate fresh authority-private roster v3 with secret seed; publish only byte SHA commitment in public policy v3",
  "Run serialization pilot on spent commanders including Harmony validation cases",
  "Write stack capture to professor-stack-freeze-captured-v2.json (new immutable file)",
  "Write operational readiness to operational-readiness-sealed-v2.json (new immutable file)",
  "Authority privately generates 24 real Professor cases",
  "validator_v2 + serialization + authority adjudication + seal hidden pack",
  "Independent benchmark integrity confirmation",
  "ONLY THEN authorize production closure implementation against DEV",
  "Implement closure against DEV; freeze closure code",
  "Evaluation runner loads hidden prospective inputs; run; commit outputs; open gold; score",
];

writeJson("phase6a1-professor-plan-prospective-pipeline-freeze-spec-v4.json", {
  version: "phase6a1-professor-plan-prospective-pipeline-freeze-spec-v4",
  authorizedAt: SEALED_AT,
  supersedes: "phase6a1-professor-plan-prospective-pipeline-freeze-spec-v3.json",
  extendsSelectionPolicy: "phase6a1-professor-plan-prospective-commander-selection-policy-v3.json",
  extendsExposedIdentitiesManifest: "phase6a1-exposed-benchmark-identities-manifest-v1.json",
  extendsCapturedStackCompletedSpec: "phase6a1-professor-plan-professor-stack-freeze-captured-v2-spec-v1.json",
  extendsOperationalReadinessCompletedSpec: "phase6a1-professor-plan-operational-readiness-sealed-v2-spec-v1.json",
  extendsSerializationPilotSpec: "phase6a1-professor-plan-serialization-pilot-spec-v3.json",
  extendsDisagreementProtocol: "phase6a1-professor-plan-authority-adjudication-disagreement-protocol-v2.json",
  immutablePendingArtifacts: {
    professorStackFreezeManifestV1: IMMUTABLE.professorStackFreezeManifestV1,
    professorStackFreezeCapturedV1: IMMUTABLE.professorStackFreezeCapturedV1,
    operationalReadinessSealV1: IMMUTABLE.operationalReadinessSealV1,
  },
  authorityGeneratorVisibility: "AUTHORITY_PRIVATE_ONLY_NOT_IN_IMPLEMENTATION_REVIEW_BUNDLE",
  normativeSequence: NORMATIVE_SEQUENCE,
  productionClosureImplementation: "NOT_AUTHORIZED",
  status: "SPECIFICATION_SEALED_AWAITING_ACL_PROOF_AND_INDEPENDENT_REVIEW",
});

writeJson("phase6a1-professor-plan-v2-benchmark-disposition-v12-architecture.json", {
  version: "phase6a1-professor-plan-v2-benchmark-disposition-v12-architecture",
  recordedAt: SEALED_AT,
  supersedes: "phase6a1-professor-plan-v2-benchmark-disposition-v11-architecture.json",
  architectureCore: "PASS_PRESERVE",
  privateRosterV2: "SPENT_AS_BLIND_ROSTER",
  selectionPolicyV2: "SPENT_AS_BLIND_METADATA_POLICY",
  selectionPolicyV3: "SEALED_PENDING_ROSTER_GENERATION_AFTER_ACL",
  auditReferences: {
    architectureV3IndependentReaudit: "phase6a1-professor-plan-benchmark-architecture-v3-independent-reaudit-gpt56sol-v1.json",
    syntheticArchitecturePivotLineage: "phase6a1-professor-plan-synthetic-architecture-pivot-lineage-v1.json",
    architectureAmendmentBundleV4: "archv4.zip",
    architectureAmendmentBundleV4BytePin: "phase6a1-professor-plan-audit-bundle-archv4-byte-pin.json",
  },
  prospectiveProfessorPopulation: "NOT_AUTHORIZED_YET",
  productionClosureImplementation: "NOT_AUTHORIZED",
  instruction: "REPORT AND WAIT",
});

writeJson("phase6a1-professor-plan-post-gold-development-track-v12-architecture.json", {
  version: "phase6a1-professor-plan-post-gold-development-track-v12-architecture",
  updatedAt: SEALED_AT,
  supersedes: "phase6a1-professor-plan-post-gold-development-track-v11-architecture",
  decision: "ARCHITECTURE_AMENDMENT_V4_SEALED_WAIT",
  normativeArtifacts: {
    pipelineFreezeSpecV4: "phase6a1-professor-plan-prospective-pipeline-freeze-spec-v4.json",
    selectionPolicyV3: "phase6a1-professor-plan-prospective-commander-selection-policy-v3.json",
    exposedIdentitiesManifestV1: "phase6a1-exposed-benchmark-identities-manifest-v1.json",
    disagreementProtocolV2: "phase6a1-professor-plan-authority-adjudication-disagreement-protocol-v2.json",
    serializationPilotSpecV3: "phase6a1-professor-plan-serialization-pilot-spec-v3.json",
    architectureSealedManifestV4: "phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v4.json",
  },
  instruction: "REPORT AND WAIT",
});

const pins: Record<string, { artifact: string; sha256: string }> = {
  pipelineFreezeSpecV4: { artifact: "phase6a1-professor-plan-prospective-pipeline-freeze-spec-v4.json", sha256: sha("phase6a1-professor-plan-prospective-pipeline-freeze-spec-v4.json") },
  selectionPolicyV3: { artifact: "phase6a1-professor-plan-prospective-commander-selection-policy-v3.json", sha256: selectionPolicyV3Sha },
  exposedIdentitiesManifestV1: { artifact: "phase6a1-exposed-benchmark-identities-manifest-v1.json", sha256: sha("phase6a1-exposed-benchmark-identities-manifest-v1.json") },
  rosterV2SpentSidecar: { artifact: "phase6a1-professor-plan-prospective-commander-roster-v2-spent-sidecar.json", sha256: sha("phase6a1-professor-plan-prospective-commander-roster-v2-spent-sidecar.json") },
  selectionPolicyV2SpentSidecar: { artifact: "phase6a1-professor-plan-prospective-commander-selection-policy-v2-spent-sidecar.json", sha256: sha("phase6a1-professor-plan-prospective-commander-selection-policy-v2-spent-sidecar.json") },
  disagreementProtocolV2: { artifact: "phase6a1-professor-plan-authority-adjudication-disagreement-protocol-v2.json", sha256: sha("phase6a1-professor-plan-authority-adjudication-disagreement-protocol-v2.json") },
  serializationPilotSpecV3: { artifact: "phase6a1-professor-plan-serialization-pilot-spec-v3.json", sha256: sha("phase6a1-professor-plan-serialization-pilot-spec-v3.json") },
  capturedV2Spec: { artifact: "phase6a1-professor-plan-professor-stack-freeze-captured-v2-spec-v1.json", sha256: sha("phase6a1-professor-plan-professor-stack-freeze-captured-v2-spec-v1.json") },
  operationalReadinessSealedV2Spec: { artifact: "phase6a1-professor-plan-operational-readiness-sealed-v2-spec-v1.json", sha256: sha("phase6a1-professor-plan-operational-readiness-sealed-v2-spec-v1.json") },
  syntheticPivotLineageV1: { artifact: "phase6a1-professor-plan-synthetic-architecture-pivot-lineage-v1.json", sha256: sha("phase6a1-professor-plan-synthetic-architecture-pivot-lineage-v1.json") },
  benchmarkDispositionV12: { artifact: "phase6a1-professor-plan-v2-benchmark-disposition-v12-architecture.json", sha256: sha("phase6a1-professor-plan-v2-benchmark-disposition-v12-architecture.json") },
  developmentTrackV12: { artifact: "phase6a1-professor-plan-post-gold-development-track-v12-architecture.json", sha256: sha("phase6a1-professor-plan-post-gold-development-track-v12-architecture.json") },
  architectureReauditV3: { artifact: requiredAudit, sha256: sha(requiredAudit) },
  implementationVisibilityAmendmentV2: { artifact: "phase6a1-professor-plan-implementation-visibility-amendment-v2.json", sha256: sha("phase6a1-professor-plan-implementation-visibility-amendment-v2.json") },
  harmonyBridgeSufficiencyV1: { artifact: "phase6a1-professor-plan-functional-role-closure-harmony-bridge-sufficiency-v1.json", sha256: sha("phase6a1-professor-plan-functional-role-closure-harmony-bridge-sufficiency-v1.json") },
  evaluationAScoringRubricV1: { artifact: "phase6a1-professor-plan-evaluation-a-scoring-rubric-v1.json", sha256: sha("phase6a1-professor-plan-evaluation-a-scoring-rubric-v1.json") },
  professorStackFreezeManifestV1Pending: { artifact: "phase6a1-professor-plan-professor-stack-freeze-manifest-v1.json", sha256: IMMUTABLE.professorStackFreezeManifestV1 },
  professorStackFreezeCapturedV1Pending: { artifact: "phase6a1-professor-plan-professor-stack-freeze-captured-v1.json", sha256: IMMUTABLE.professorStackFreezeCapturedV1 },
  operationalReadinessSealV1Pending: { artifact: "phase6a1-professor-plan-operational-readiness-seal-v1.json", sha256: IMMUTABLE.operationalReadinessSealV1 },
};

writeJson("phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v4.json", {
  version: "phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v4",
  sealedAt: SEALED_AT,
  supersedes: "phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v3.json",
  decision: "ARCHITECTURE_AMENDMENT_V4_SEALED_WAIT",
  byteReproducibleSealScript: "web/scripts/run-phase6a1-seal-benchmark-architecture-v4.ts",
  archv4BundleBytePinArtifact: "phase6a1-professor-plan-audit-bundle-archv4-byte-pin.json",
  immutablePendingArtifacts: {
    professorStackFreezeManifestV1: IMMUTABLE.professorStackFreezeManifestV1,
    professorStackFreezeCapturedV1: IMMUTABLE.professorStackFreezeCapturedV1,
    operationalReadinessSealV1: IMMUTABLE.operationalReadinessSealV1,
  },
  pins,
  instruction: "REPORT AND WAIT — prove ACL, generate secret roster v3, run pilot, seal operational-readiness-v2.",
});

console.log(JSON.stringify({ manifestSha256: sha("phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v4.json"), pins }, null, 2));
