#!/usr/bin/env npx tsx
/** Seal benchmark architecture package v2 — amended pipeline spec + supporting sidecars. Byte-reproducible. */
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../..");
const OUT = resolve(REPO, "web/data/milestones/deck-synthesis");
const SEALED_AT = "2026-08-14T20:15:00.000Z";
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

type Roster = {
  SEED: string;
  slots: Array<{ caseId: string; slotIndex: number; primary: string; alternatesOrdered: string[]; commandZoneConfiguration: string }>;
};

function loadRoster(): Roster {
  const draftPath = resolve(OUT, ".pipeline-v1-roster-draft.json");
  const policyPath = resolve(OUT, "phase6a1-professor-plan-prospective-commander-selection-policy-v1.json");
  if (existsSync(draftPath)) {
    return JSON.parse(readFileSync(draftPath, "utf8")) as Roster;
  }
  if (existsSync(policyPath)) {
    const policy = JSON.parse(readFileSync(policyPath, "utf8")) as {
      selectionSeed: string;
      slots: Array<{
        caseId: string;
        slotIndex: number;
        primaryCommander: string;
        alternatesOrdered: string[];
        commandZoneConfiguration: string;
      }>;
    };
    return {
      SEED: policy.selectionSeed,
      slots: policy.slots.map((s) => ({
        caseId: s.caseId,
        slotIndex: s.slotIndex,
        primary: s.primaryCommander,
        alternatesOrdered: s.alternatesOrdered,
        commandZoneConfiguration: s.commandZoneConfiguration,
      })),
    };
  }
  throw new Error("Missing roster input: .pipeline-v1-roster-draft.json or commander-selection-policy-v1.json");
}

const roster = loadRoster();

const selectionPolicySha = writeJson("phase6a1-professor-plan-prospective-commander-selection-policy-v1.json", {
  version: "phase6a1-professor-plan-prospective-commander-selection-policy-v1",
  authorizedAt: SEALED_AT,
  selectionSeed: roster.SEED,
  populationCodename: "holdout-prospective-pipeline-v1",
  caseCountTarget: 24,
  membershipRule: "Exclude every commander exposed through DEV36, Amendment v8, holdout v2-v8 synthetic, and any implementation-visible benchmark population.",
  slots: roster.slots.map((s) => ({
    caseId: s.caseId,
    slotIndex: s.slotIndex,
    primaryCommander: s.primary,
    alternatesOrdered: s.alternatesOrdered,
    commandZoneConfiguration: s.commandZoneConfiguration,
  })),
  replacementPolicy: {
    maxAttemptsPerSlot: 4,
    attemptOrder: ["primary", "alternate[0]", "alternate[1]", "alternate[2]", "..."],
    forbiddenReplacementReasons: [
      "INCONVENIENT_CLOSURE_ANSWER",
      "UNINTERESTING_STRATEGY",
      "DIFFICULT_TO_ADJUDICATE",
      "LOW_GAP_COUNT",
      "HIGH_GAP_COUNT",
    ],
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
    note: "Every rejected attempt must be logged with hash and objective reason before advancing to the next commander in order.",
  },
  instruction: "This roster is sealed before any Professor population run. Do not substitute commanders for convenience.",
});

writeJson("phase6a1-professor-plan-evaluation-a-scoring-rubric-v1.json", {
  version: "phase6a1-professor-plan-evaluation-a-scoring-rubric-v1",
  authorizedAt: SEALED_AT,
  evaluation: "evaluationA_closureAccuracy",
  extendsDesignArtifact: "phase6a1-professor-plan-functional-role-closure-design-v3.json",
  extendsStatusPrecedenceSidecar: "phase6a1-professor-plan-functional-role-closure-design-v3-status-precedence-v1.json",
  metrics: {
    roleApplicabilityExactness: { scope: "per lens per case", match: "exact REQUIRED/RECOMMENDED/N/A vs authority" },
    requiredRoleSatisfaction: { scope: "per REQUIRED role where applicable", match: "SATISFIED/MISSING exact vs authority" },
    closureStatusExactness: { scope: "per lens per case", match: "exact status vs authority after precedence sidecar" },
    repairTargetValidity: {
      scope: "when authority expects GAP_DETECTED",
      rules: ["each repairTarget cites fired trigger", "missingRole matches authority structural gap", "genericGapStatement present", "no card/package selection"],
    },
    harmonyUnderdeterminedHandling: { scope: "HARMONY lens", match: "exact when bridge evidence insufficient" },
    evidenceInsufficientHandling: { scope: "all lenses when T_EVIDENCE_PARTIAL", match: "exact NOT_APPLICABLE + EVIDENCE_INSUFFICIENT" },
  },
  aggregation: {
    perCasePass: "case passes only if all lens metrics pass for that case",
    macroPass: "aggregate pass requires perCasePass on all 24 cases AND all critical invariants",
    reporting: ["per-case matrix", "per-metric rollups", "critical invariant violations list"],
  },
  criticalInvariantsZeroTolerance: [
    {
      id: "FALSE_CLOSED_WITH_REQUIRED_GAP",
      rule: "Closure MUST NOT emit CLOSED when authority adjudication records a MISSING REQUIRED role for that lens.",
      failureDisposition: "AUTOMATIC_MACRO_FAIL",
    },
    {
      id: "MISSING_REPAIR_TARGET_WHEN_GAP_DETECTED",
      rule: "When authority expects GAP_DETECTED, closure MUST emit at least one repairTarget per structural REQUIRED gap.",
      failureDisposition: "AUTOMATIC_MACRO_FAIL",
    },
    {
      id: "PROXY_OR_CARD_SELECTION_IN_REPAIR",
      rule: "repairTargets MUST remain generic; no card names, package IDs, or role-proxy tags.",
      failureDisposition: "AUTOMATIC_MACRO_FAIL",
    },
  ],
  passThresholds: {
    macroAuthorizationRequires: {
      falseClosedWithRequiredGap: 0,
      missingRepairTargetWhenGapDetected: 0,
      proxyOrCardSelectionInRepair: 0,
      perCasePassRate: 1.0,
      closureStatusExactnessRate: 1.0,
      requiredRoleSatisfactionExactnessRate: 1.0,
    },
    note: "Thresholds are sealed before prospective inputs or adjudication are visible to implementation developers.",
  },
});

writeJson("phase6a1-professor-plan-professor-stack-freeze-manifest-v1.json", {
  version: "phase6a1-professor-plan-professor-stack-freeze-manifest-v1",
  authorizedAt: SEALED_AT,
  status: "PENDING_STACK_CAPTURE_BEFORE_POPULATION_RUN",
  purpose: "Pin the exact upstream Professor/validator/RAG stack used for all prospective pipeline-v1 cases.",
  requiredPins: {
    repository: ["commitSha256", "branchOrTag", "dirtyWorktreeStatus"],
    professor: ["modelId", "modelConfigSha256", "promptOrAgentVersion", "agentSourceSha256"],
    validator: ["validatorVersion", "validatorSourceSha256"],
    retrieval: ["retrievalServiceVersion", "rankingConfigSha256", "corpusVersion", "embeddingModelVersion"],
    rules: ["rulesSourceVersion", "rulesSnapshotSha256"],
    tools: ["enabledToolsList", "toolPermissionsPolicySha256"],
    dependencies: ["lockfileSha256", "runtimeEnvironmentDigest"],
    closureInput: ["runtimeSchemaSidecarSha256", "serializerVersion", "publishContractSha256"],
  },
  populationBinding: "All 24 accepted prospective cases MUST reference this manifest SHA unless rejected for INFRASTRUCTURE_ERROR with logged evidence.",
  captureProcedure: "Authority holder captures stack state immediately before first pipeline-v1 Professor run and updates status to STACK_CAPTURED with populated pin values.",
});

writeJson("phase6a1-professor-plan-serialization-pilot-spec-v1.json", {
  version: "phase6a1-professor-plan-serialization-pilot-spec-v1",
  authorizedAt: SEALED_AT,
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
  mustPreserve: [
    "hypothesis semantics",
    "package topology",
    "resource relationships",
    "three lens structure",
    "validator status",
    "closure-relevant semantics",
  ],
  passCriteria: [
    "No strategy rewrite during serialization",
    "Structural integrity gates pass on serialized artifact",
    "Independent reviewer confirms no meaningful semantic loss",
  ],
  onPass: "Freeze serializer version and publish contract SHA in professor-stack-freeze-manifest-v1",
  onFail: "Do not authorize fresh holdout population until serializer is repaired and pilot re-run passes",
  instruction: "Pilot uses spent commanders only; do not consume pipeline-v1 roster identities.",
});

writeJson("phase6a1-professor-plan-authority-adjudication-rubric-v1.json", {
  version: "phase6a1-professor-plan-authority-adjudication-rubric-v1",
  authorizedAt: SEALED_AT,
  extendsDesignArtifact: "phase6a1-professor-plan-functional-role-closure-design-v3.json",
  extendsStatusPrecedenceSidecar: "phase6a1-professor-plan-functional-role-closure-design-v3-status-precedence-v1.json",
  extendsRuntimeSchemaSidecar: "phase6a1-semantic-closure-runtime-input-schema-v8.json",
  extendsEvaluationRubric: "phase6a1-professor-plan-evaluation-a-scoring-rubric-v1.json",
  independenceRules: [
    "Authority MUST NOT use production closure implementation output to generate gold answers",
    "Authority MUST NOT rewrite Professor strategy, packages, or resource graph",
    "Authority MUST NOT select cards or author replacement packages",
    "Authority adjudicates only on the frozen validated Professor plan",
  ],
  adjudicationQuestion: "Given exactly what Professor produced, what did Professor cover and what did Professor forget?",
  perLensProcedure: [
    "Identify fired triggers from frozen plan topology and design-v3 trigger registry",
    "Derive roleApplicability from applicability matrix",
    "For each applicable role, determine SATISFIED or MISSING from validated package/resource evidence only",
    "Apply status precedence sidecar to choose closureStatus",
    "Emit generic repairTargets only for REQUIRED missing roles when GAP_DETECTED",
  ],
  ambiguityHandling: {
    HARMONY_UNDERDETERMINED: "When REQUIRED CROSS_ENGINE_BRIDGE is missing and fewer than two bridge edges exist in frozen HARMONY graph",
    EVIDENCE_INSUFFICIENT: "When frozen facts/opportunities mark evidence partial/unavailable per design-v3",
    disagreementEscalation: "Document ambiguity in authority notes; do not alter Professor plan; second reviewer required before sealing case adjudication",
  },
  prohibitedAuthorityActions: [
    "strategy rewrite",
    "package addition/removal",
    "card selection",
    "using closure implementation as oracle for gold labels",
    "rejecting cases because gaps are inconvenient",
  ],
});

writeJson("phase6a1-benchmark-authority-access-boundary-evidence-pipeline-v1.json", {
  version: "phase6a1-benchmark-authority-access-boundary-evidence-pipeline-v1",
  authorizedAt: SEALED_AT,
  supersedes: "phase6a1-benchmark-authority-access-boundary-evidence-v2.json",
  twoSidedBlindHoldout: true,
  implementationDevelopersBeforeClosureFreeze: {
    mayReceive: [
      "normative design/schema/sidecars",
      "DEV deterministic unit fixtures",
      "prospective population manifest metadata (count, codename, roster SHA)",
      "professor-stack-freeze manifest SHA",
      "blinded adjudication SHA only",
      "evaluation rubric and scoring thresholds",
    ],
    mustNotReceive: [
      "prospective per-case Professor/validator closure inputs",
      "prospective blinded adjudication bytes",
      "expected closure labels",
      "authority grading notes",
    ],
  },
  evaluationRunnerAfterClosureFreeze: {
    mayLoad: "hidden prospective inputs at evaluation time only",
    mustRecord: "closure outputs before opening adjudication",
    then: "open sealed adjudication and score per evaluation-a-scoring-rubric-v1",
  },
  accessControlModel: {
    preferred: "Separate authority repository/checkout or ACL-protected storage outside implementation developer access",
    gitignoreAlone: "INSUFFICIENT_AS_SECURITY_BOUNDARY",
    authorityRoot: "benchmark-authority/phase6a1-holdout-prospective-pipeline-v1/private/",
    implementationRoot: "web/data/milestones/deck-synthesis/ (publish pack without inputs or answers pre-freeze)",
  },
  operationalProofRequiredBeforePopulationRun: [
    "Documented separate checkout or ACL policy",
    "Named roles: authority holder vs implementation developers",
    "Verification that implementation CI/users cannot read private prospective inputs pre-freeze",
  ],
});

writeJson("phase6a1-professor-plan-prospective-pipeline-freeze-spec-v2.json", {
  version: "phase6a1-professor-plan-prospective-pipeline-freeze-spec-v2",
  authorizedAt: SEALED_AT,
  supersedes: "phase6a1-professor-plan-prospective-pipeline-freeze-spec-v1.json",
  extendsArchitectureSidecar: "phase6a1-professor-plan-functional-role-closure-architecture-clarification-v1.json",
  extendsCommanderSelectionPolicy: "phase6a1-professor-plan-prospective-commander-selection-policy-v1.json",
  extendsEvaluationRubric: "phase6a1-professor-plan-evaluation-a-scoring-rubric-v1.json",
  extendsProfessorStackManifest: "phase6a1-professor-plan-professor-stack-freeze-manifest-v1.json",
  extendsSerializationPilotSpec: "phase6a1-professor-plan-serialization-pilot-spec-v1.json",
  extendsAuthorityRubric: "phase6a1-professor-plan-authority-adjudication-rubric-v1.json",
  extendsAccessBoundaryEvidence: "phase6a1-benchmark-authority-access-boundary-evidence-pipeline-v1.json",
  productionClosureImplementation: "NOT_AUTHORIZED",
  twoSidedBlindSequence: [
    "DEV / spent real examples available to implementation",
    "implement closure against DEV only",
    "FREEZE closure implementation code",
    "evaluation runner loads hidden prospective Professor inputs",
    "run frozen closure implementation",
    "commit closure outputs",
    "open hidden authority adjudication",
    "score per evaluation-a-scoring-rubric-v1",
  ],
  implementationVisibilityBeforeClosureFreeze: {
    receives: [
      "normative design/schema/sidecars",
      "DEV deterministic unit fixtures",
      "prospective seal metadata (count, roster SHA, adjudication SHA)",
      "evaluation rubric and pass thresholds",
    ],
    doesNotReceive: [
      "prospective per-case Professor/validator closure inputs",
      "expected closure labels or repair targets",
      "authority adjudication bytes",
    ],
  },
  perCasePipeline: [
    "canonical commander facts",
    "Professor production-equivalent run on frozen stack manifest",
    "validator_v2",
    "structural integrity + serialization to runtime-input-v8",
    "reject or accept per commander selection policy",
    "authority adjudicates frozen validated output only",
    "seal blinded adjudication privately",
  ],
  rejectBeforeFreeze: "REJECT_BEFORE_BENCHMARK_FREEZE with logged rejection code and hashes",
  prerequisiteGatesBeforePopulationRun: [
    "serialization pilot PASS on spent commanders",
    "professor stack manifest STACK_CAPTURED",
    "commander selection policy sealed",
    "evaluation rubric sealed",
    "authority rubric sealed",
    "pipeline-v1 access boundary evidenced",
  ],
  status: "SPECIFICATION_SEALED_AWAITING_PREREQUISITE_COMPLETION_AND_INDEPENDENT_REVIEW",
  instruction: "Do not run fresh 24-commander Professor population until prerequisites complete and independent review passes.",
});

writeJson("phase6a1-professor-plan-v2-benchmark-disposition-v10-architecture.json", {
  version: "phase6a1-professor-plan-v2-benchmark-disposition-v10-architecture",
  recordedAt: SEALED_AT,
  supersedes: "phase6a1-professor-plan-v2-benchmark-disposition-v9-architecture.json",
  architectureSidecarV1: "PASS_PRESERVE",
  pipelineFreezeSpecV1: "SUPERSEDED_BY_V2",
  pipelineFreezeSpecV2: "SEALED_PREREQUISITES_PENDING",
  auditReferences: {
    architectureV1IndependentReaudit: "phase6a1-professor-plan-benchmark-architecture-v1-independent-reaudit-gpt56sol-v1.json",
    syntheticBenchmarkPivotContext: "phase6a1-professor-plan-functional-role-closure-v7-preimplementation-reaudit-gpt56sol-v1.json",
    syntheticIntegrityBundleV8: "v8v8.zip",
    syntheticIntegrityBundleV8Sha256: "73b2b9b82f78af206db318f5a5fa237a5509e44ae96abab7e0f230ef2d933f2a",
    architectureAmendmentBundleV2: "archv2.zip",
    architectureAmendmentBundleV2Manifest: "phase6a1-professor-plan-audit-bundle-archv2-manifest.json",
  },
  syntheticProspectiveHoldouts: {
    holdoutProspectiveV8Synthetic: {
      status: "SUPERSEDED_BY_PIPELINE_DRIVEN_PROSPECTIVE_ARCHITECTURE",
      doNotOpenBlindedAdjudication: true,
    },
  },
  nextProspectivePopulation: {
    codename: "holdout-prospective-pipeline-v1",
    status: "NOT_AUTHORIZED_YET",
    prerequisites: [
      "serialization pilot PASS",
      "professor stack manifest captured",
      "access boundary operationally proven",
      "independent review of architecture package v2",
    ],
  },
  dev36SemanticFixtures: { status: "DETERMINISTIC_CLOSURE_UNIT_FIXTURES", notGeneralizationEvidence: true },
  evaluations: {
    evaluationA_closureAccuracy: "CURRENT_PROSPECTIVE_TARGET",
    evaluationB_endToEndPlanningImprovement: "DEFERRED",
  },
  productionClosureImplementation: "NOT_AUTHORIZED",
  instruction: "REPORT AND WAIT",
});

writeJson("phase6a1-professor-plan-post-gold-development-track-v10-architecture.json", {
  version: "phase6a1-professor-plan-post-gold-development-track-v10-architecture",
  updatedAt: SEALED_AT,
  supersedes: "phase6a1-professor-plan-post-gold-development-track-v9-architecture",
  decision: "ARCHITECTURE_AMENDMENT_SEALED_WAIT",
  normativeArtifacts: {
    architectureSidecarV1: "phase6a1-professor-plan-functional-role-closure-architecture-clarification-v1.json",
    pipelineFreezeSpecV2: "phase6a1-professor-plan-prospective-pipeline-freeze-spec-v2.json",
    commanderSelectionPolicy: "phase6a1-professor-plan-prospective-commander-selection-policy-v1.json",
    evaluationAScoringRubric: "phase6a1-professor-plan-evaluation-a-scoring-rubric-v1.json",
    professorStackFreezeManifest: "phase6a1-professor-plan-professor-stack-freeze-manifest-v1.json",
    serializationPilotSpec: "phase6a1-professor-plan-serialization-pilot-spec-v1.json",
    authorityAdjudicationRubric: "phase6a1-professor-plan-authority-adjudication-rubric-v1.json",
    accessBoundaryEvidencePipelineV1: "phase6a1-benchmark-authority-access-boundary-evidence-pipeline-v1.json",
    benchmarkDispositionV10: "phase6a1-professor-plan-v2-benchmark-disposition-v10-architecture.json",
    architectureSealedManifestV2: "phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v2.json",
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
  "C:/Users/h3art/Downloads/phase6a1-professor-plan-benchmark-architecture-v1-independent-reaudit-gpt56sol-v1.json",
  "phase6a1-professor-plan-benchmark-architecture-v1-independent-reaudit-gpt56sol-v1.json",
);

const pins: Record<string, { artifact: string; sha256: string }> = {
  architectureSidecarV1: { artifact: "phase6a1-professor-plan-functional-role-closure-architecture-clarification-v1.json", sha256: sha("phase6a1-professor-plan-functional-role-closure-architecture-clarification-v1.json") },
  pipelineFreezeSpecV2: { artifact: "phase6a1-professor-plan-prospective-pipeline-freeze-spec-v2.json", sha256: sha("phase6a1-professor-plan-prospective-pipeline-freeze-spec-v2.json") },
  commanderSelectionPolicy: { artifact: "phase6a1-professor-plan-prospective-commander-selection-policy-v1.json", sha256: selectionPolicySha },
  evaluationAScoringRubric: { artifact: "phase6a1-professor-plan-evaluation-a-scoring-rubric-v1.json", sha256: sha("phase6a1-professor-plan-evaluation-a-scoring-rubric-v1.json") },
  professorStackFreezeManifest: { artifact: "phase6a1-professor-plan-professor-stack-freeze-manifest-v1.json", sha256: sha("phase6a1-professor-plan-professor-stack-freeze-manifest-v1.json") },
  serializationPilotSpec: { artifact: "phase6a1-professor-plan-serialization-pilot-spec-v1.json", sha256: sha("phase6a1-professor-plan-serialization-pilot-spec-v1.json") },
  authorityAdjudicationRubric: { artifact: "phase6a1-professor-plan-authority-adjudication-rubric-v1.json", sha256: sha("phase6a1-professor-plan-authority-adjudication-rubric-v1.json") },
  accessBoundaryEvidencePipelineV1: { artifact: "phase6a1-benchmark-authority-access-boundary-evidence-pipeline-v1.json", sha256: sha("phase6a1-benchmark-authority-access-boundary-evidence-pipeline-v1.json") },
  benchmarkDispositionV10: { artifact: "phase6a1-professor-plan-v2-benchmark-disposition-v10-architecture.json", sha256: sha("phase6a1-professor-plan-v2-benchmark-disposition-v10-architecture.json") },
  developmentTrackV10: { artifact: "phase6a1-professor-plan-post-gold-development-track-v10-architecture.json", sha256: sha("phase6a1-professor-plan-post-gold-development-track-v10-architecture.json") },
  designV3: { artifact: "phase6a1-professor-plan-functional-role-closure-design-v3.json", sha256: sha("phase6a1-professor-plan-functional-role-closure-design-v3.json") },
  statusPrecedenceSidecar: { artifact: "phase6a1-professor-plan-functional-role-closure-design-v3-status-precedence-v1.json", sha256: sha("phase6a1-professor-plan-functional-role-closure-design-v3-status-precedence-v1.json") },
  runtimeSchemaSidecar: { artifact: "phase6a1-semantic-closure-runtime-input-schema-v8.json", sha256: sha("phase6a1-semantic-closure-runtime-input-schema-v8.json") },
  architectureReauditV1: { artifact: "phase6a1-professor-plan-benchmark-architecture-v1-independent-reaudit-gpt56sol-v1.json", sha256: existsSync(resolve(OUT, "phase6a1-professor-plan-benchmark-architecture-v1-independent-reaudit-gpt56sol-v1.json")) ? sha("phase6a1-professor-plan-benchmark-architecture-v1-independent-reaudit-gpt56sol-v1.json") : "MISSING" },
};

writeJson("phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v2.json", {
  version: "phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v2",
  sealedAt: SEALED_AT,
  supersedes: "phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v1.json",
  decision: "ARCHITECTURE_AMENDMENT_SEALED_WAIT",
  productionClosureImplementation: "NOT_AUTHORIZED",
  prospectiveProfessorPopulation: "NOT_AUTHORIZED_YET",
  byteReproducibleSealScript: "web/scripts/run-phase6a1-seal-benchmark-architecture-v2.ts",
  pins,
  instruction: "REPORT AND WAIT — complete serialization pilot, stack capture, and access-boundary proof before population run.",
});

console.log(JSON.stringify({ manifestSha256: sha("phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v2.json"), pins }, null, 2));
