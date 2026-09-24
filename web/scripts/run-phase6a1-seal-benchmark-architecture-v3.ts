#!/usr/bin/env npx tsx
/** Seal benchmark architecture package v3 — repairs archv2 audit blocks. Byte-reproducible; never mutates pinned v1 pending artifacts. */
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../..");
const OUT = resolve(REPO, "web/data/milestones/deck-synthesis");
const SEALED_AT = "2026-08-14T21:30:00.000Z";
const PRIVATE_ROSTER_SHA256 = "84ddc57bdb2ac6eca85bd1e7660da3727665ff60fa3873033600381f31adfb1a";
const SELECTION_SEED_V2 = "phase6a1-holdout-prospective-pipeline-v1-commander-roster-seed-v2-20260814";
const SPENT_SELECTION_POLICY_V1_SHA256 = "28df0ec79a7c006ea40faad3599c1fba3194d72279c61ef76b30b954d8922398";
const PROFESSOR_STACK_FREEZE_MANIFEST_V1_SHA256 = "47fb3cf2e1a6d34a7d22e124457db50055fb6194a3fed7cfdaae7871d8297664";
const V8_PRE_GOLD_REAUDIT_SHA256 = "0b554353c311f452c12d00d1e2bb3cb77820387ab633ebe33b64983dc2177315";

const sha = (f: string) => createHash("sha256").update(readFileSync(resolve(OUT, f))).digest("hex");

function writeJson(name: string, value: unknown): string {
  writeFileSync(resolve(OUT, name), JSON.stringify(value, null, 2));
  return sha(name);
}

function copyAudit(src: string, dest: string): void {
  try {
    copyFileSync(src, resolve(OUT, dest));
  } catch {
    /* optional local path */
  }
}

function assertImmutablePin(file: string, expectedSha256: string): void {
  if (!existsSync(resolve(OUT, file))) throw new Error(`Missing immutable artifact: ${file}`);
  const actual = sha(file);
  if (actual !== expectedSha256) {
    throw new Error(`Refusing to seal: ${file} bytes changed (expected ${expectedSha256}, got ${actual})`);
  }
}

assertImmutablePin("phase6a1-professor-plan-professor-stack-freeze-manifest-v1.json", PROFESSOR_STACK_FREEZE_MANIFEST_V1_SHA256);
assertImmutablePin("phase6a1-professor-plan-prospective-commander-selection-policy-v1.json", SPENT_SELECTION_POLICY_V1_SHA256);

writeJson("phase6a1-professor-plan-prospective-commander-selection-policy-v1-spent-sidecar.json", {
  version: "phase6a1-professor-plan-prospective-commander-selection-policy-v1-spent-sidecar",
  recordedAt: SEALED_AT,
  spentArtifact: "phase6a1-professor-plan-prospective-commander-selection-policy-v1.json",
  spentArtifactSha256: SPENT_SELECTION_POLICY_V1_SHA256,
  reason: "Full P01-P24 primary/alternate roster was implementation-visible before two-sided-blind repair.",
  disposition: "SPENT_AS_BLIND_ROSTER_DO_NOT_USE_FOR_PROSPECTIVE_POPULATION",
  replacement: {
    privateRosterVersion: "phase6a1-professor-plan-prospective-commander-roster-private-v2",
    publicSelectionPolicy: "phase6a1-professor-plan-prospective-commander-selection-policy-v2.json",
    privateRosterSha256: PRIVATE_ROSTER_SHA256,
    storage: "benchmark-authority/phase6a1-holdout-prospective-pipeline-v1/private/",
  },
});

const selectionPolicyV2Sha = writeJson("phase6a1-professor-plan-prospective-commander-selection-policy-v2.json", {
  version: "phase6a1-professor-plan-prospective-commander-selection-policy-v2",
  authorizedAt: SEALED_AT,
  supersedesSpentPolicy: "phase6a1-professor-plan-prospective-commander-selection-policy-v1.json",
  populationCodename: "holdout-prospective-pipeline-v1",
  caseCountTarget: 24,
  selectionSeed: SELECTION_SEED_V2,
  privateRosterSha256: PRIVATE_ROSTER_SHA256,
  privateRosterStorage: "benchmark-authority/phase6a1-holdout-prospective-pipeline-v1/private/phase6a1-professor-plan-prospective-commander-roster-private-v2.json",
  implementationVisibility: "METADATA_ONLY_BEFORE_CLOSURE_FREEZE",
  publishedBeforeClosureFreeze: ["populationCodename", "caseCountTarget", "selectionPolicyVersion", "selectionSeed", "privateRosterSha256"],
  withheldBeforeClosureFreeze: ["primaryCommander names", "alternatesOrdered names", "per-slot commander identities"],
  replacementPolicy: {
    maxAttemptsPerSlot: 4,
    alternatesPerSlot: 3,
    attemptOrder: ["primary", "alternate[0]", "alternate[1]", "alternate[2]"],
    slotProcessingOrder: "P01_THROUGH_P24",
    globalUniquenessRule:
      "Maintain globalAcceptedCommanderSet across slots in order; skip any candidate already accepted by an earlier slot.",
    rosterConstructionRule:
      "Private roster assigns 24 distinct primaries and 72 distinct alternates (3 per slot) drawn from one seed-ordered eligible pool; no shared alternate list across slots.",
    allowedRejectionCodes: [
      "PROFESSOR_RUN_FAILED",
      "PROFESSOR_OUTPUT_INCOMPLETE",
      "VALIDATOR_V2_REJECTED",
      "STRUCTURAL_INTEGRITY_FAILED",
      "SERIALIZATION_INCOMPATIBLE",
      "COMMANDER_NOT_IN_CATALOG",
      "INFRASTRUCTURE_ERROR",
    ],
    rejectedAttemptLogRequired: [
      "caseId",
      "attemptIndex",
      "commanderIdentity",
      "rejectionCode",
      "rejectionDetail",
      "rawProfessorResultSha256",
      "validatedProfessorResultSha256",
      "attemptTimestamp",
    ],
  },
  instruction: "Commander identities remain authority-private until after production closure code freeze.",
});

writeJson("phase6a1-professor-plan-implementation-visibility-amendment-v2.json", {
  version: "phase6a1-professor-plan-implementation-visibility-amendment-v2",
  authorizedAt: SEALED_AT,
  amendsArchitectureSidecar: "phase6a1-professor-plan-functional-role-closure-architecture-clarification-v1.json",
  amendsSection: "implementationReceives",
  clarifies:
    "Architecture sidecar v1 describes the full benchmark artifact set across the lifecycle. This amendment defines timing for prospective pipeline-v1 visibility only.",
  beforeProductionClosureCodeFreeze: {
    implementationDevelopersReceive: [
      "normative design/schema/sidecars",
      "DEV deterministic unit fixtures",
      "prospective metadata only (population codename, case count, selection policy version, private roster SHA)",
      "evaluation rubric and pass thresholds",
      "blinded adjudication SHA only",
    ],
    implementationDevelopersDoNotReceive: [
      "prospective per-case Professor/validator closure inputs",
      "prospective commander identities",
      "expected closure labels or repair targets",
      "authority adjudication bytes",
    ],
  },
  afterProductionClosureCodeFreeze: {
    evaluationRunnerMayLoad: "hidden prospective per-case Professor/validator closure inputs",
    mustRecord: "closure outputs before opening adjudication",
    then: "open hidden authority adjudication and score per evaluation-a-scoring-rubric-v1",
  },
  authorityAlwaysReceives: "Exact frozen Professor+validator outputs for gold adjudication before implementation sees inputs or labels.",
});

writeJson("phase6a1-professor-plan-functional-role-closure-harmony-bridge-sufficiency-v1.json", {
  version: "phase6a1-professor-plan-functional-role-closure-harmony-bridge-sufficiency-v1",
  authorizedAt: SEALED_AT,
  extendsDesignArtifact: "phase6a1-professor-plan-functional-role-closure-design-v3.json",
  purpose: "Public normative criterion for HARMONY CROSS_ENGINE_BRIDGE satisfaction and HARMONY_UNDERDETERMINED.",
  bridgeEdgeDefinition: {
    scope: "frozen validated HARMONY lens resourceGraph only",
    edgeQualifiesWhen: [
      "edge.relationship is a cross-engine bridge relationship recognized by design-v3 HARMONY topology",
      "both endpoints are validated nodes in the frozen HARMONY graph",
      "endpoints belong to distinct engine domains represented in the frozen plan",
    ],
  },
  crossEngineBridgeSufficiency: {
    role: "CROSS_ENGINE_BRIDGE",
    satisfiedWhen:
      "At least two distinct qualifying bridge edges exist in the frozen HARMONY graph for the case.",
    harmonyUnderdeterminedWhen:
      "CROSS_ENGINE_BRIDGE is REQUIRED for the case/lens and fewer than two distinct qualifying bridge edges exist in the frozen HARMONY graph.",
  },
  implementationBinding: "Production closure and authority gold MUST apply this sidecar exactly; no authority-only bridge threshold.",
});

writeJson("phase6a1-professor-plan-authority-adjudication-disagreement-protocol-v1.json", {
  version: "phase6a1-professor-plan-authority-adjudication-disagreement-protocol-v1",
  authorizedAt: SEALED_AT,
  extendsAuthorityRubric: "phase6a1-professor-plan-authority-adjudication-rubric-v2.json",
  procedure: [
    "Reviewer A produces independent per-lens labels and seals them before Reviewer B sees the case.",
    "Reviewer B produces independent per-lens labels.",
    "Compare field-by-field (roleApplicability, satisfaction, closureStatus, repairTargets).",
    "If exact match, seal case adjudication with both reviewer IDs recorded.",
    "If any field differs, log a disagreement record preserving both independent label sets unchanged.",
    "Mandatory consensus session between Reviewer A and Reviewer B on disputed fields only.",
    "If consensus reached, seal reconciled adjudication; preserve original A/B labels in audit trail.",
    "If consensus fails, invoke Reviewer C (third adjudicator) independently on disputed fields only.",
    "Final label for each disputed field = 2-of-3 majority among A/B/C.",
    "If no 2-of-3 majority on a field, case disposition = BLOCKED_PENDING_EVIDENCE; that field is gold-marked EVIDENCE_INSUFFICIENT and the case cannot enter the benchmark until resolved.",
  ],
  prohibitions: [
    "No single-reviewer override for REQUIRED-role or closureStatus fields.",
    "No strategy rewrite or plan mutation during disagreement resolution.",
    "No use of production closure output to break ties.",
  ],
});

writeJson("phase6a1-professor-plan-professor-stack-freeze-captured-v1.json", {
  version: "phase6a1-professor-plan-professor-stack-freeze-captured-v1",
  authorizedAt: SEALED_AT,
  status: "PENDING_CAPTURE",
  supersedesInPlaceMutationOf: "phase6a1-professor-plan-professor-stack-freeze-manifest-v1.json",
  pendingSpecificationArtifact: "phase6a1-professor-plan-professor-stack-freeze-manifest-v1.json",
  pendingSpecificationSha256: PROFESSOR_STACK_FREEZE_MANIFEST_V1_SHA256,
  instruction:
    "Populate this successor artifact once with captured stack pins. Never rewrite professor-stack-freeze-manifest-v1.json bytes after seal.",
  populatedPins: null,
});

writeJson("phase6a1-professor-plan-operational-readiness-seal-v1.json", {
  version: "phase6a1-professor-plan-operational-readiness-seal-v1",
  authorizedAt: SEALED_AT,
  status: "PENDING_OPERATIONAL_PROOF",
  purpose: "Immutable seal after serialization pilot, stack capture, and access-boundary proof — authorizes private prospective generation.",
  requiredPinsOnCompletion: {
    professorStackFreezeCapturedV1: "phase6a1-professor-plan-professor-stack-freeze-captured-v1.json",
    serializationPilotPassArtifact: "authority-recorded PASS artifact with per-case hashes",
    accessBoundaryOperationalEvidence: "separate checkout/ACL proof artifact",
    serializerVersion: "from serialization pilot PASS",
    publishContractSha256: "from serialization pilot PASS",
  },
  onCompletionAuthorizes: "Private 24-case Professor population using authority-private roster v2",
  doesNotAuthorize: "Production closure implementation (requires separate gate after prospective pack is sealed)",
});

writeJson("phase6a1-professor-plan-serialization-pilot-spec-v2.json", {
  version: "phase6a1-professor-plan-serialization-pilot-spec-v2",
  authorizedAt: SEALED_AT,
  supersedes: "phase6a1-professor-plan-serialization-pilot-spec-v1.json",
  purpose: "Prove real Professor+validator output serializes losslessly to runtime-input-v8 before spending fresh holdout identities.",
  isBenchmark: false,
  pilotCommandersSource: "ALREADY_EXPOSED_SPENT_COMMANDERS_ONLY",
  pilotCommanders: [
    { caseId: "pilot-dev36-08", commander: "Muldrotha, the Gravetide", sourcePool: "dev36-population-v2" },
    { caseId: "pilot-dev36-02", commander: "Zaxara, the Exemplary", sourcePool: "dev36-population-v2" },
    { caseId: "pilot-amendment-v8-01", commander: "Korvold, Fae-Cursed King", sourcePool: "amendment-v8-professor-population" },
    { caseId: "pilot-amendment-v8-02", commander: "Prosper, Tome-Bound", sourcePool: "amendment-v8-professor-population" },
    { caseId: "pilot-dev36-13", commander: "Omnath, Locus of Rage", sourcePool: "dev36-population-v2" },
  ],
  pipeline: ["real Professor production-equivalent run", "validator_v2", "deterministic serializer to runtime-input-v8", "independent diff/review"],
  onPass: {
    writeCapturedStackTo: "phase6a1-professor-plan-professor-stack-freeze-captured-v1.json",
    recordPilotIn: "phase6a1-professor-plan-operational-readiness-seal-v1.json",
    neverMutate: "phase6a1-professor-plan-professor-stack-freeze-manifest-v1.json",
  },
  onFail: "Do not authorize fresh holdout population until serializer is repaired and pilot re-run passes",
});

writeJson("phase6a1-professor-plan-authority-adjudication-rubric-v2.json", {
  version: "phase6a1-professor-plan-authority-adjudication-rubric-v2",
  authorizedAt: SEALED_AT,
  supersedes: "phase6a1-professor-plan-authority-adjudication-rubric-v1.json",
  extendsDesignArtifact: "phase6a1-professor-plan-functional-role-closure-design-v3.json",
  extendsStatusPrecedenceSidecar: "phase6a1-professor-plan-functional-role-closure-design-v3-status-precedence-v1.json",
  extendsHarmonyBridgeSufficiencySidecar: "phase6a1-professor-plan-functional-role-closure-harmony-bridge-sufficiency-v1.json",
  extendsDisagreementProtocol: "phase6a1-professor-plan-authority-adjudication-disagreement-protocol-v1.json",
  extendsRuntimeSchemaSidecar: "phase6a1-semantic-closure-runtime-input-schema-v8.json",
  extendsEvaluationRubric: "phase6a1-professor-plan-evaluation-a-scoring-rubric-v1.json",
  independenceRules: [
    "Authority MUST NOT use production closure implementation output to generate gold answers",
    "Authority MUST NOT rewrite Professor strategy, packages, or resource graph",
    "Authority MUST NOT select cards or author replacement packages",
    "Authority adjudicates only on the frozen validated Professor plan",
  ],
  harmonyUnderdeterminedRule:
    "Apply phase6a1-professor-plan-functional-role-closure-harmony-bridge-sufficiency-v1.json exactly.",
  disagreementResolution:
    "Apply phase6a1-professor-plan-authority-adjudication-disagreement-protocol-v1.json exactly.",
});

writeJson("phase6a1-benchmark-authority-access-boundary-evidence-pipeline-v2.json", {
  version: "phase6a1-benchmark-authority-access-boundary-evidence-pipeline-v2",
  authorizedAt: SEALED_AT,
  supersedes: "phase6a1-benchmark-authority-access-boundary-evidence-pipeline-v1.json",
  twoSidedBlindHoldout: true,
  privateRosterPolicy: {
    publicMetadataArtifact: "phase6a1-professor-plan-prospective-commander-selection-policy-v2.json",
    privateRosterArtifact: "phase6a1-professor-plan-prospective-commander-roster-private-v2.json",
    privateRosterStorage: "benchmark-authority/phase6a1-holdout-prospective-pipeline-v1/private/",
    spentPublicRoster: "phase6a1-professor-plan-prospective-commander-selection-policy-v1.json",
  },
  implementationDevelopersBeforeClosureFreeze: {
    mayReceive: [
      "normative design/schema/sidecars",
      "DEV deterministic unit fixtures",
      "population codename, case count, selection policy version, private roster SHA",
      "evaluation rubric and scoring thresholds",
      "blinded adjudication SHA only",
    ],
    mustNotReceive: [
      "commander identities from private roster",
      "prospective per-case Professor/validator closure inputs",
      "prospective blinded adjudication bytes",
      "expected closure labels",
    ],
  },
  accessControlModel: {
    preferred: "Separate authority repository/checkout or ACL-protected storage outside implementation developer access",
    gitignoreAlone: "INSUFFICIENT_AS_SECURITY_BOUNDARY",
    authorityRoot: "benchmark-authority/phase6a1-holdout-prospective-pipeline-v1/private/",
  },
});

const NORMATIVE_SEQUENCE = [
  "Seal protocol repair package (architecture amendment v3)",
  "Run serialization pilot on spent commanders only",
  "Capture Professor stack into professor-stack-freeze-captured-v1 (immutable successor; never mutate pending manifest v1)",
  "Prove separate checkout/ACL access boundary",
  "Seal operational-readiness package",
  "Authority privately generates 24 real Professor cases from authority-private roster v2",
  "validator_v2 + structural integrity + serialization on each accepted case",
  "Authority adjudicates frozen validated outputs only",
  "Seal prospective input pack and hidden adjudication privately",
  "Independent benchmark integrity confirmation",
  "ONLY THEN authorize production closure implementation against DEV",
  "Implement closure against DEV only",
  "FREEZE production closure implementation code",
  "Evaluation runner loads hidden prospective inputs",
  "Run frozen closure implementation and commit outputs",
  "Open hidden authority adjudication",
  "Score per evaluation-a-scoring-rubric-v1",
];

writeJson("phase6a1-professor-plan-prospective-pipeline-freeze-spec-v3.json", {
  version: "phase6a1-professor-plan-prospective-pipeline-freeze-spec-v3",
  authorizedAt: SEALED_AT,
  supersedes: "phase6a1-professor-plan-prospective-pipeline-freeze-spec-v2.json",
  extendsArchitectureSidecar: "phase6a1-professor-plan-functional-role-closure-architecture-clarification-v1.json",
  extendsVisibilityAmendment: "phase6a1-professor-plan-implementation-visibility-amendment-v2.json",
  extendsCommanderSelectionPolicy: "phase6a1-professor-plan-prospective-commander-selection-policy-v2.json",
  extendsEvaluationRubric: "phase6a1-professor-plan-evaluation-a-scoring-rubric-v1.json",
  extendsPendingStackSpecification: "phase6a1-professor-plan-professor-stack-freeze-manifest-v1.json",
  extendsCapturedStackArtifact: "phase6a1-professor-plan-professor-stack-freeze-captured-v1.json",
  extendsOperationalReadinessSeal: "phase6a1-professor-plan-operational-readiness-seal-v1.json",
  extendsSerializationPilotSpec: "phase6a1-professor-plan-serialization-pilot-spec-v2.json",
  extendsAuthorityRubric: "phase6a1-professor-plan-authority-adjudication-rubric-v2.json",
  extendsHarmonyBridgeSufficiencySidecar: "phase6a1-professor-plan-functional-role-closure-harmony-bridge-sufficiency-v1.json",
  extendsDisagreementProtocol: "phase6a1-professor-plan-authority-adjudication-disagreement-protocol-v1.json",
  extendsAccessBoundaryEvidence: "phase6a1-benchmark-authority-access-boundary-evidence-pipeline-v2.json",
  productionClosureImplementation: "NOT_AUTHORIZED",
  normativeSequence: NORMATIVE_SEQUENCE,
  prospectivePackMustExistBeforeClosureImplementation: true,
  status: "SPECIFICATION_SEALED_AWAITING_OPERATIONAL_READINESS_AND_INDEPENDENT_REVIEW",
  instruction: "Do not run fresh 24-commander Professor population until operational readiness seal completes and independent review passes.",
});

writeJson("phase6a1-professor-plan-v2-benchmark-disposition-v11-architecture.json", {
  version: "phase6a1-professor-plan-v2-benchmark-disposition-v11-architecture",
  recordedAt: SEALED_AT,
  supersedes: "phase6a1-professor-plan-v2-benchmark-disposition-v10-architecture.json",
  architectureSidecarV1: "PASS_PRESERVE",
  implementationVisibilityAmendmentV2: "SEALED",
  pipelineFreezeSpecV2: "SUPERSEDED_BY_V3",
  pipelineFreezeSpecV3: "SEALED_OPERATIONAL_READINESS_PENDING",
  commanderSelectionPolicyV1: "SPENT_AS_BLIND_ROSTER",
  commanderSelectionPolicyV2: "SEALED_METADATA_ONLY",
  professorStackFreezeManifestV1: "PRESERVE_PENDING_BYTES_DO_NOT_MUTATE",
  evaluationAScoringRubricV1: "PASS_PRESERVE",
  auditReferences: {
    architectureV1IndependentReaudit: "phase6a1-professor-plan-benchmark-architecture-v1-independent-reaudit-gpt56sol-v1.json",
    architectureV2IndependentReaudit: "phase6a1-professor-plan-benchmark-architecture-v2-independent-reaudit-gpt56sol-v1.json",
    syntheticBenchmarkPivotContext: "phase6a1-professor-plan-experiment-v3-amended-v8-pre-gold-reaudit-gpt56sol-v1.json",
    syntheticBenchmarkPivotContextSha256: V8_PRE_GOLD_REAUDIT_SHA256,
    syntheticIntegrityBundleV8: "v8v8.zip",
    syntheticIntegrityBundleV8Sha256: "73b2b9b82f78af206db318f5a5fa237a5509e44ae96abab7e0f230ef2d933f2a",
    architectureAmendmentBundleV3: "archv3.zip",
    architectureAmendmentBundleV3Manifest: "phase6a1-professor-plan-audit-bundle-archv3-manifest.json",
  },
  privateRosterV2: {
    privateRosterSha256: PRIVATE_ROSTER_SHA256,
    storage: "benchmark-authority/phase6a1-holdout-prospective-pipeline-v1/private/",
    implementationVisibleCommanderNames: false,
  },
  nextProspectivePopulation: {
    codename: "holdout-prospective-pipeline-v1",
    status: "NOT_AUTHORIZED_YET",
    prerequisites: [
      "serialization pilot PASS",
      "stack captured into professor-stack-freeze-captured-v1",
      "access boundary operationally proven",
      "operational-readiness seal completed",
      "independent review of architecture package v3",
    ],
  },
  productionClosureImplementation: "NOT_AUTHORIZED",
  instruction: "REPORT AND WAIT",
});

writeJson("phase6a1-professor-plan-post-gold-development-track-v11-architecture.json", {
  version: "phase6a1-professor-plan-post-gold-development-track-v11-architecture",
  updatedAt: SEALED_AT,
  supersedes: "phase6a1-professor-plan-post-gold-development-track-v10-architecture",
  decision: "ARCHITECTURE_AMENDMENT_V3_SEALED_WAIT",
  normativeArtifacts: {
    architectureSidecarV1: "phase6a1-professor-plan-functional-role-closure-architecture-clarification-v1.json",
    implementationVisibilityAmendmentV2: "phase6a1-professor-plan-implementation-visibility-amendment-v2.json",
    pipelineFreezeSpecV3: "phase6a1-professor-plan-prospective-pipeline-freeze-spec-v3.json",
    commanderSelectionPolicyV2: "phase6a1-professor-plan-prospective-commander-selection-policy-v2.json",
    harmonyBridgeSufficiencySidecar: "phase6a1-professor-plan-functional-role-closure-harmony-bridge-sufficiency-v1.json",
    authorityDisagreementProtocol: "phase6a1-professor-plan-authority-adjudication-disagreement-protocol-v1.json",
    evaluationAScoringRubric: "phase6a1-professor-plan-evaluation-a-scoring-rubric-v1.json",
    professorStackFreezeManifestV1Pending: "phase6a1-professor-plan-professor-stack-freeze-manifest-v1.json",
    professorStackFreezeCapturedV1: "phase6a1-professor-plan-professor-stack-freeze-captured-v1.json",
    operationalReadinessSealV1: "phase6a1-professor-plan-operational-readiness-seal-v1.json",
    serializationPilotSpecV2: "phase6a1-professor-plan-serialization-pilot-spec-v2.json",
    authorityAdjudicationRubricV2: "phase6a1-professor-plan-authority-adjudication-rubric-v2.json",
    accessBoundaryEvidencePipelineV2: "phase6a1-benchmark-authority-access-boundary-evidence-pipeline-v2.json",
    benchmarkDispositionV11: "phase6a1-professor-plan-v2-benchmark-disposition-v11-architecture.json",
    architectureSealedManifestV3: "phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v3.json",
  },
  gateDisposition: {
    amendmentV8: "FROZEN_FINAL",
    goldComparisonV1: "SEALED_FINAL",
    corpusIngest: "BLOCKED",
    closureImplementation: "NOT_AUTHORIZED",
    prospectiveProfessorPopulation: "NOT_AUTHORIZED_YET",
  },
  instruction: "REPORT AND WAIT",
});

copyAudit(
  "C:/Users/h3art/Downloads/phase6a1-professor-plan-benchmark-architecture-v2-independent-reaudit-gpt56sol-v1.json",
  "phase6a1-professor-plan-benchmark-architecture-v2-independent-reaudit-gpt56sol-v1.json",
);

const pins: Record<string, { artifact: string; sha256: string }> = {
  architectureSidecarV1: { artifact: "phase6a1-professor-plan-functional-role-closure-architecture-clarification-v1.json", sha256: sha("phase6a1-professor-plan-functional-role-closure-architecture-clarification-v1.json") },
  implementationVisibilityAmendmentV2: { artifact: "phase6a1-professor-plan-implementation-visibility-amendment-v2.json", sha256: sha("phase6a1-professor-plan-implementation-visibility-amendment-v2.json") },
  pipelineFreezeSpecV3: { artifact: "phase6a1-professor-plan-prospective-pipeline-freeze-spec-v3.json", sha256: sha("phase6a1-professor-plan-prospective-pipeline-freeze-spec-v3.json") },
  commanderSelectionPolicyV2: { artifact: "phase6a1-professor-plan-prospective-commander-selection-policy-v2.json", sha256: selectionPolicyV2Sha },
  spentSelectionPolicyV1Sidecar: { artifact: "phase6a1-professor-plan-prospective-commander-selection-policy-v1-spent-sidecar.json", sha256: sha("phase6a1-professor-plan-prospective-commander-selection-policy-v1-spent-sidecar.json") },
  harmonyBridgeSufficiencySidecar: { artifact: "phase6a1-professor-plan-functional-role-closure-harmony-bridge-sufficiency-v1.json", sha256: sha("phase6a1-professor-plan-functional-role-closure-harmony-bridge-sufficiency-v1.json") },
  authorityDisagreementProtocol: { artifact: "phase6a1-professor-plan-authority-adjudication-disagreement-protocol-v1.json", sha256: sha("phase6a1-professor-plan-authority-adjudication-disagreement-protocol-v1.json") },
  evaluationAScoringRubricV1: { artifact: "phase6a1-professor-plan-evaluation-a-scoring-rubric-v1.json", sha256: sha("phase6a1-professor-plan-evaluation-a-scoring-rubric-v1.json") },
  professorStackFreezeManifestV1Pending: { artifact: "phase6a1-professor-plan-professor-stack-freeze-manifest-v1.json", sha256: PROFESSOR_STACK_FREEZE_MANIFEST_V1_SHA256 },
  professorStackFreezeCapturedV1: { artifact: "phase6a1-professor-plan-professor-stack-freeze-captured-v1.json", sha256: sha("phase6a1-professor-plan-professor-stack-freeze-captured-v1.json") },
  operationalReadinessSealV1: { artifact: "phase6a1-professor-plan-operational-readiness-seal-v1.json", sha256: sha("phase6a1-professor-plan-operational-readiness-seal-v1.json") },
  serializationPilotSpecV2: { artifact: "phase6a1-professor-plan-serialization-pilot-spec-v2.json", sha256: sha("phase6a1-professor-plan-serialization-pilot-spec-v2.json") },
  authorityAdjudicationRubricV2: { artifact: "phase6a1-professor-plan-authority-adjudication-rubric-v2.json", sha256: sha("phase6a1-professor-plan-authority-adjudication-rubric-v2.json") },
  accessBoundaryEvidencePipelineV2: { artifact: "phase6a1-benchmark-authority-access-boundary-evidence-pipeline-v2.json", sha256: sha("phase6a1-benchmark-authority-access-boundary-evidence-pipeline-v2.json") },
  benchmarkDispositionV11: { artifact: "phase6a1-professor-plan-v2-benchmark-disposition-v11-architecture.json", sha256: sha("phase6a1-professor-plan-v2-benchmark-disposition-v11-architecture.json") },
  developmentTrackV11: { artifact: "phase6a1-professor-plan-post-gold-development-track-v11-architecture.json", sha256: sha("phase6a1-professor-plan-post-gold-development-track-v11-architecture.json") },
  designV3: { artifact: "phase6a1-professor-plan-functional-role-closure-design-v3.json", sha256: sha("phase6a1-professor-plan-functional-role-closure-design-v3.json") },
  statusPrecedenceSidecar: { artifact: "phase6a1-professor-plan-functional-role-closure-design-v3-status-precedence-v1.json", sha256: sha("phase6a1-professor-plan-functional-role-closure-design-v3-status-precedence-v1.json") },
  runtimeSchemaSidecar: { artifact: "phase6a1-semantic-closure-runtime-input-schema-v8.json", sha256: sha("phase6a1-semantic-closure-runtime-input-schema-v8.json") },
  architectureReauditV2: { artifact: "phase6a1-professor-plan-benchmark-architecture-v2-independent-reaudit-gpt56sol-v1.json", sha256: existsSync(resolve(OUT, "phase6a1-professor-plan-benchmark-architecture-v2-independent-reaudit-gpt56sol-v1.json")) ? sha("phase6a1-professor-plan-benchmark-architecture-v2-independent-reaudit-gpt56sol-v1.json") : "MISSING" },
  privateRosterV2Sha256: { artifact: "authority-private/phase6a1-professor-plan-prospective-commander-roster-private-v2.json", sha256: PRIVATE_ROSTER_SHA256 },
};

writeJson("phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v3.json", {
  version: "phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v3",
  sealedAt: SEALED_AT,
  supersedes: "phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v2.json",
  decision: "ARCHITECTURE_AMENDMENT_V3_SEALED_WAIT",
  productionClosureImplementation: "NOT_AUTHORIZED",
  prospectiveProfessorPopulation: "NOT_AUTHORIZED_YET",
  byteReproducibleSealScript: "web/scripts/run-phase6a1-seal-benchmark-architecture-v3.ts",
  immutablePendingArtifacts: {
    professorStackFreezeManifestV1: PROFESSOR_STACK_FREEZE_MANIFEST_V1_SHA256,
    spentCommanderSelectionPolicyV1: SPENT_SELECTION_POLICY_V1_SHA256,
  },
  pins,
  instruction: "REPORT AND WAIT — complete serialization pilot, immutable stack capture, ACL proof, then operational-readiness review.",
});

console.log(JSON.stringify({ manifestSha256: sha("phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v3.json"), pins }, null, 2));
