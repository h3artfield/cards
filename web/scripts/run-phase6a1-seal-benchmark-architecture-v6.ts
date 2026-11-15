#!/usr/bin/env npx tsx
/** Seal benchmark architecture package v6 — repairs archv5 audit blocks. Never mutates v3-pinned bytes. */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../..");
const OUT = resolve(REPO, "web/data/milestones/deck-synthesis");
const SEALED_AT = "2026-08-15T00:00:00.000Z";

const IMMUTABLE = {
  professorStackFreezeManifestV1: "47fb3cf2e1a6d34a7d22e124457db50055fb6194a3fed7cfdaae7871d8297664",
  professorStackFreezeCapturedV1: "be7a8f2c07c47962656215dd93208277d3fdf222b4a1fe627478ce0ab7c44d75",
  operationalReadinessSealV1: "488c4c6d7aa27c87acb667949017b834b829f1b0c2f40442bff6306377fc34f3",
  selectionPolicyV1: "28df0ec79a7c006ea40faad3599c1fba3194d72279c61ef76b30b954d8922398",
  selectionPolicyV2: "4a5a64af8c57cd7b2810319b8ee11ac4d714ee752a1307361241fe0d53a51fb3",
  selectionPolicyV3: "c741bb5374feb58fc9a37a93b0e423c7330b757c347e2df9bfaf9ffc3eb13b73",
  sealedManifestV5: "a62b1796d5a0acfe06bb7ac5839e626473cfa08f782a302112d8f4b460d1d953",
  exposedIdentitiesManifestV2: "899cf2e09dbb60e0b57bf98b00fc6c6f5eaca765cbab26b308d9e7f05b5100ef",
  eligibilityContractPinV1: "f95c754d2b8b308c1abb0f9fecd1241716182eca9de3554f77b1fdac544870fb",
  rosterGeneratorV3Source: "991270999ca72aebcdbb97d8c8af1f5e1e7ad07e80819618798792d4f907ef72",
  canonicalCatalogSliceV2: "e7e5d54bb358da63999d19d38204400a96dcce60ec9754a62a6f1a8e02707b41",
  goldenCatalogLoaderSource: "aaff4526fa3bad0b17fa7ef91b3293ef0c2c7a29f276b56af8d659a93ec29010",
  catalogVersion: "scryfall-oracle_cards:2026-08-05T21:03:08.408+00:00",
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
  ["phase6a1-professor-plan-prospective-commander-selection-policy-v3.json", IMMUTABLE.selectionPolicyV3],
  ["phase6a1-exposed-benchmark-identities-manifest-v2.json", IMMUTABLE.exposedIdentitiesManifestV2],
  ["phase6a1-professor-plan-benchmark-commander-eligibility-contract-pin-v1.json", IMMUTABLE.eligibilityContractPinV1],
  ["phase6a1-benchmark-canonical-catalog-slice-v2.json", IMMUTABLE.canonicalCatalogSliceV2],
  ["phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v5.json", IMMUTABLE.sealedManifestV5],
]) {
  assertImmutable(file, expected);
}

for (const audit of [
  "phase6a1-professor-plan-benchmark-architecture-v3-independent-reaudit-gpt56sol-v1.json",
  "phase6a1-professor-plan-benchmark-architecture-v4-independent-reaudit-gpt56sol-v1.json",
  "phase6a1-professor-plan-benchmark-architecture-v5-independent-reaudit-gpt56sol-v1.json",
]) {
  if (!existsSync(resolve(OUT, audit))) {
    throw new Error(`Missing required audit artifact in milestones: ${audit}`);
  }
}

writeJson("phase6a1-professor-plan-selection-policy-v3-freshness-manifest-v2-override-v1.json", {
  version: "phase6a1-professor-plan-selection-policy-v3-freshness-manifest-v2-override-v1",
  authorizedAt: SEALED_AT,
  immutableArtifact: "phase6a1-professor-plan-prospective-commander-selection-policy-v3.json",
  immutableArtifactSha256: IMMUTABLE.selectionPolicyV3,
  staleFreshnessGateFieldInImmutablePolicy: "phase6a1-exposed-benchmark-identities-manifest-v1.json",
  authoritativeFreshnessManifestForRosterV3AndLater: "phase6a1-exposed-benchmark-identities-manifest-v2.json",
  authoritativeFreshnessManifestSha256: IMMUTABLE.exposedIdentitiesManifestV2,
  instruction:
    "Do not mutate selection-policy-v3. For all roster-v3 and later generation, authority MUST hard-fail against manifest-v2 including spent roster-v2 identities.",
});

writeJson("phase6a1-professor-plan-authority-adjudication-disagreement-protocol-v4.json", {
  version: "phase6a1-professor-plan-authority-adjudication-disagreement-protocol-v4",
  authorizedAt: SEALED_AT,
  supersedes: "phase6a1-professor-plan-authority-adjudication-disagreement-protocol-v3.json",
  terminalRule: {
    caseReplacementForbidden: true,
    commanderReplacementForbidden: true,
    whenNoTwoOfThreeMajority: {
      packDisposition: "RETAIN_CASE_IN_FIXED_24_CASE_PACK",
      authorizationDisposition: "GOLD_AMBIGUITY_BLOCK",
      appliesToAllDisputedFields: true,
      includingDisputeFields: [
        "roleApplicability",
        "requiredRoleSatisfaction",
        "closureStatus",
        "repairTargetValidity",
        "harmonyUnderdeterminedHandling",
      ],
      scoring:
        "Informational Evaluation-A scoring may exclude unresolved fields per rubric-v3, but production closure authorization remains BLOCKED while any authority gold field remains unresolved.",
      benchmarkAuthorization:
        "Evaluation-A MUST NOT authorize production closure while ANY field in the pack remains unresolved after the pre-registered A/B/C process.",
      resolutionWithoutReplacement:
        "Record unresolved field(s). Retain case and commander. Resolve via pre-registered tie-break or additional evidence before authorization.",
    },
  },
  prohibition: "Do not replace a case because adjudication is difficult, ambiguous, or inconvenient.",
});

writeJson("phase6a1-professor-plan-evaluation-a-scoring-rubric-v3.json", {
  version: "phase6a1-professor-plan-evaluation-a-scoring-rubric-v3",
  authorizedAt: SEALED_AT,
  supersedes: "phase6a1-professor-plan-evaluation-a-scoring-rubric-v2.json",
  extendsDesignArtifact: "phase6a1-professor-plan-functional-role-closure-design-v3.json",
  extendsStatusPrecedenceSidecar: "phase6a1-professor-plan-functional-role-closure-design-v3-status-precedence-v1.json",
  extendsDisagreementProtocol: "phase6a1-professor-plan-authority-adjudication-disagreement-protocol-v4.json",
  metrics: {
    roleApplicabilityExactness: {
      scope: "per lens per case",
      match: "exact REQUIRED/RECOMMENDED/N/A vs resolved authority gold only",
    },
    requiredRoleSatisfaction: {
      scope: "per REQUIRED role where applicable",
      match: "SATISFIED/MISSING exact vs resolved authority gold only",
    },
    closureStatusExactness: {
      scope: "per lens per case",
      match: "exact status vs resolved authority gold after precedence sidecar",
    },
    repairTargetValidity: {
      scope: "when authority expects GAP_DETECTED",
      rules: [
        "each repairTarget cites fired trigger",
        "missingRole matches authority structural gap",
        "genericGapStatement present",
        "no card/package selection",
      ],
    },
    harmonyUnderdeterminedHandling: {
      scope: "HARMONY lens",
      match: "exact when bridge evidence insufficient",
    },
    evidenceInsufficientHandling: {
      scope: "all lenses when T_EVIDENCE_PARTIAL",
      match: "exact NOT_APPLICABLE + EVIDENCE_INSUFFICIENT closure status only",
    },
  },
  goldAmbiguityAuthorizationBlock: {
    trigger: "ANY authority gold field remains unresolved after pre-registered A/B/C adjudication",
    authorizationDisposition: "GOLD_AMBIGUITY_BLOCK",
    productionClosureAuthorization: "FORBIDDEN until every gold field is resolved",
    caseRetention: "Retain all cases and commanders; replacement forbidden",
    informationalScoring: {
      allowed: true,
      unresolvedFieldTreatment: "Exclude unresolved fields from exact-match numerators/denominators in informational reports only",
      mustReport: ["unresolvedFieldList", "goldAmbiguityAuthorizationBlockActive"],
    },
  },
  aggregation: {
    perCasePass: "Case passes informational exact-match only on resolved gold fields and passes all critical invariants",
    macroPassInformational:
      "Informational macro exact-match requires perCasePass on all 24 cases over resolved gold fields and all critical invariants",
    macroAuthorizationRequires: "ZERO unresolved gold fields AND informational macroPass AND all critical invariants",
    reporting: [
      "per-case matrix",
      "per-metric rollups",
      "critical invariant violations list",
      "unresolved gold field list",
      "goldAmbiguityAuthorizationBlock status",
    ],
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
    {
      id: "GOLD_AMBIGUITY_BLOCKS_AUTHORIZATION",
      rule: "Any unresolved authority gold field after A/B/C adjudication MUST set authorizationDisposition GOLD_AMBIGUITY_BLOCK.",
      failureDisposition: "AUTOMATIC_AUTHORIZATION_BLOCK",
    },
  ],
  passThresholds: {
    macroAuthorizationRequires: {
      unresolvedGoldFieldCount: 0,
      falseClosedWithRequiredGap: 0,
      missingRepairTargetWhenGapDetected: 0,
      proxyOrCardSelectionInRepair: 0,
      perCasePassRateOnResolvedGold: 1,
      closureStatusExactnessRateOnResolvedGold: 1,
      requiredRoleSatisfactionExactnessRateOnResolvedGold: 1,
      roleApplicabilityExactnessRateOnResolvedGold: 1,
    },
    note: "Informational scoring may report partial exactness, but authorization requires zero unresolved gold fields.",
  },
});

writeJson("phase6a1-professor-plan-authority-adjudication-rubric-v4.json", {
  version: "phase6a1-professor-plan-authority-adjudication-rubric-v4",
  authorizedAt: SEALED_AT,
  supersedes: "phase6a1-professor-plan-authority-adjudication-rubric-v3.json",
  extendsDesignArtifact: "phase6a1-professor-plan-functional-role-closure-design-v3.json",
  extendsStatusPrecedenceSidecar: "phase6a1-professor-plan-functional-role-closure-design-v3-status-precedence-v1.json",
  extendsHarmonyBridgeSufficiencySidecar: "phase6a1-professor-plan-functional-role-closure-harmony-bridge-sufficiency-v1.json",
  extendsRuntimeSchemaSidecar: "phase6a1-semantic-closure-runtime-input-schema-v8.json",
  extendsEvaluationRubric: "phase6a1-professor-plan-evaluation-a-scoring-rubric-v3.json",
  extendsDisagreementProtocol: "phase6a1-professor-plan-authority-adjudication-disagreement-protocol-v4.json",
  independenceRules: [
    "Authority MUST NOT use production closure implementation output to generate gold answers",
    "Authority MUST NOT rewrite Professor strategy, packages, or resource graph",
    "Authority MUST NOT select cards or author replacement packages",
    "Authority adjudicates only on the frozen validated Professor plan",
  ],
  harmonyUnderdeterminedRule: "Apply phase6a1-professor-plan-functional-role-closure-harmony-bridge-sufficiency-v1.json exactly.",
  disagreementResolution: "Apply phase6a1-professor-plan-authority-adjudication-disagreement-protocol-v4.json exactly.",
});

writeJson("phase6a1-professor-plan-golden-catalog-state-pin-spec-v1.json", {
  version: "phase6a1-professor-plan-golden-catalog-state-pin-spec-v1",
  authorizedAt: SEALED_AT,
  purpose:
    "Pin the exact golden-catalog state used for commander eligibility, canonical Oracle facts, and prospective Professor inputs.",
  requiredPins: {
    catalogVersion: IMMUTABLE.catalogVersion,
    canonicalCatalogSliceArtifact: "phase6a1-benchmark-canonical-catalog-slice-v2.json",
    canonicalCatalogSliceByteSha256: IMMUTABLE.canonicalCatalogSliceV2,
    goldenCatalogLoaderSourcePath: "web/scripts/lib/load-golden-catalog-index.ts",
    goldenCatalogLoaderSourceByteSha256: IMMUTABLE.goldenCatalogLoaderSource,
  },
  capturedV2MustInclude: ["goldenCatalogStatePins"],
  operationalReadinessV2MustInclude: ["goldenCatalogStatePins"],
  instruction:
    "Captured-v2 and operational-readiness-v2 MUST record these pins exactly. Any catalog change invalidates readiness and requires new pilot/capture.",
});

writeJson("phase6a1-professor-plan-authority-roster-generator-source-audit-spec-v1.json", {
  version: "phase6a1-professor-plan-authority-roster-generator-source-audit-spec-v1",
  authorizedAt: SEALED_AT,
  status: "NOT_YET_CREATED",
  attestationArtifact: "phase6a1-professor-plan-authority-roster-generator-source-audit-attestation-v1.json",
  auditedGeneratorSourcePath:
    "benchmark-authority/phase6a1-holdout-prospective-pipeline-v1/lib/generate-commander-roster-v3.ts",
  auditedGeneratorSourceByteSha256: IMMUTABLE.rosterGeneratorV3Source,
  requiredAttestationChecks: [
    "uses phase6a1-exposed-benchmark-identities-manifest-v2 fail-closed freshness including spent roster-v2 identities",
    "uses benchmark-commander-eligibility-v1.single_commander via pinned eligibility contract",
    "enforces global uniqueness and selection-policy-v3 replacement rules",
    "uses cryptographically strong secret seed/randomness",
    "hashes actual private roster FILE bytes for public commitment",
    "does not log seed or commander names to implementation-visible output",
  ],
  requiredInOperationalReadinessV2: true,
  instruction:
    "Authority-side independent reviewer inspects the pinned private generator source and writes attestation-v1 before roster-commitment WAIT clears.",
});

writeJson("phase6a1-professor-plan-roster-commitment-sealed-wait-spec-v1.json", {
  version: "phase6a1-professor-plan-roster-commitment-sealed-wait-spec-v1",
  authorizedAt: SEALED_AT,
  gate: "ROSTER_COMMITMENT_SEALED_WAIT",
  statusAfterRosterGeneration: "REPORT_AND_WAIT",
  prerequisiteArtifacts: [
    "phase6a1-professor-plan-prospective-commander-roster-commitment-v1.json",
    "phase6a1-professor-plan-authority-roster-generator-source-audit-attestation-v1.json",
  ],
  requiredAuthoritySideAuditChecks: [
    "exactly 24 accepted primary commanders",
    "all accepted primary identities globally unique",
    "all identities fresh against manifest-v2 fail-closed union",
    "all commanders pass canonical eligibility contract on pinned golden-catalog state",
    "replacement and alternate accounting matches selection-policy-v3",
    "private roster file byte SHA matches public roster-commitment-v1",
    "generator source byte SHA matches eligibility-contract-pin and attestation-v1",
  ],
  onAuditPass: "Clear WAIT gate; may proceed to authority-private 24-case Professor population",
  onAuditFail: "Do not run Professor population; repair roster, commitment, or generator audit",
});

writeJson("phase6a1-professor-plan-serialization-pilot-spec-v5.json", {
  version: "phase6a1-professor-plan-serialization-pilot-spec-v5",
  authorizedAt: SEALED_AT,
  supersedes: "phase6a1-professor-plan-serialization-pilot-spec-v4.json",
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
  pipeline: [
    "real Professor production-equivalent run",
    "validator_v2",
    "deterministic serializer to runtime-input-v8",
    "independent diff/review",
  ],
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
    "Deterministic schema validation against runtime-input-v8",
    "Deterministic byte integrity on canonical serialized output",
    "Field-level proof that hypotheses, packages, resource graph, and lens semantics are preserved",
    "Independent reviewer confirms no meaningful semantic loss",
    "Positive and negative Harmony bridge validation cases pass the public >=2-edge rule",
  ],
  harmonyValidationRequired: true,
  pilotFinalityRule: {
    binding:
      "The final PASS artifact MUST pin the exact Professor/validator/retrieval/rules/serializer/publish-contract stack exercised by the passing pilot run.",
    passArtifactMustPin: [
      "repository commitSha256",
      "professor modelId and agentSourceSha256",
      "validatorVersion and validatorSourceSha256",
      "retrievalServiceVersion and corpusVersion",
      "rulesSourceVersion and rulesSnapshotSha256",
      "serializerVersion",
      "publishContractSha256",
      "runtimeSchemaSidecarSha256",
      "goldenCatalogStatePins",
    ],
    capturedV2MustMatchPassArtifactPins: true,
    anyRelevantStackChangeAfterPass: "INVALIDATES_PILOT_REQUIRES_RERUN",
    noPostPassSemanticOrSerializerChangesBeforeCapture:
      "Any semantic or serializer rule change after the final PASS artifact requires a new pilot run and new PASS artifact before captured-v2 or operational-readiness-v2 may be written.",
  },
  passArtifact: {
    artifact: "phase6a1-professor-plan-serialization-pilot-pass-v1.json",
    requiredFields: [
      "pilotSpecVersion",
      "pilotSpecSha256",
      "stackPins",
      "serializerVersion",
      "publishContractSha256",
      "goldenCatalogStatePins",
      "perCommanderResults",
      "independentReviewerAttestation",
      "harmonyValidationResults",
    ],
    perCommanderPassRequires: [
      "validator_v2 PASS",
      "runtime-input-v8 schema PASS",
      "mustPreserve checks PASS",
      "deterministic byte integrity PASS",
    ],
  },
  onPass: {
    writePassArtifactTo: "phase6a1-professor-plan-serialization-pilot-pass-v1.json",
    writeCapturedStackTo: "phase6a1-professor-plan-professor-stack-freeze-captured-v2.json",
    writeOperationalReadinessTo: "phase6a1-professor-plan-operational-readiness-sealed-v2.json",
    neverMutate: [
      "phase6a1-professor-plan-professor-stack-freeze-manifest-v1.json",
      "phase6a1-professor-plan-professor-stack-freeze-captured-v1.json",
      "phase6a1-professor-plan-operational-readiness-seal-v1.json",
    ],
  },
  onFail:
    "Fail closed: do not authorize stack capture, operational readiness, roster v3, or fresh holdout population until serializer is repaired and pilot re-run passes.",
  instruction: "Pilot uses spent commanders only; do not consume pipeline-v1 roster v3 identities.",
});

writeJson("phase6a1-professor-plan-professor-stack-freeze-captured-v2-spec-v1.json", {
  version: "phase6a1-professor-plan-professor-stack-freeze-captured-v2-spec-v1",
  authorizedAt: SEALED_AT,
  status: "NOT_YET_CREATED",
  purpose: "Immutable completed stack capture artifact path after pilot/stack capture.",
  preserveForever: [
    "phase6a1-professor-plan-professor-stack-freeze-manifest-v1.json",
    "phase6a1-professor-plan-professor-stack-freeze-captured-v1.json",
  ],
  completedArtifactTarget: "phase6a1-professor-plan-professor-stack-freeze-captured-v2.json",
  prerequisite: "serialization-pilot-spec-v5 PASS artifact with pilotFinalityRule satisfied",
  mustMatchPilotPassArtifactStackPins: true,
  mustIncludeGoldenCatalogStatePins: "phase6a1-professor-plan-golden-catalog-state-pin-spec-v1.json",
  instruction:
    "Write captured stack pins once to captured-v2.json immediately from the final passing pilot PASS artifact. Any relevant stack change after PASS invalidates the pilot.",
});

writeJson("phase6a1-professor-plan-operational-readiness-sealed-v2-spec-v1.json", {
  version: "phase6a1-professor-plan-operational-readiness-sealed-v2-spec-v1",
  authorizedAt: SEALED_AT,
  status: "NOT_YET_CREATED",
  purpose: "Immutable operational readiness seal created only after pilot PASS, stack capture v2, and ACL proof.",
  preserveForever: ["phase6a1-professor-plan-operational-readiness-seal-v1.json"],
  completedArtifactTarget: "phase6a1-professor-plan-operational-readiness-sealed-v2.json",
  prerequisite: "serialization-pilot-spec-v5 PASS artifact and professor-stack-freeze-captured-v2.json matching pilot stack pins",
  pinsOnCompletion: [
    "professor-stack-freeze-captured-v2.json byte SHA",
    "serialization-pilot-pass-v1.json byte SHA",
    "serialization-pilot-spec-v5.json byte SHA",
    "access boundary operational evidence",
    "stackPins matching pilot PASS artifact exactly",
    "goldenCatalogStatePins per golden-catalog-state-pin-spec-v1",
    "benchmark-commander-eligibility-contract-pin-v1.json byte SHA",
    "authority roster generator source byte SHA",
    "authority-adjudication-rubric-v4.json byte SHA",
    "exposed-benchmark-identities-manifest-v2.json byte SHA",
    "selection-policy-v3-freshness-manifest-v2-override-v1.json byte SHA",
  ],
  instruction:
    "Operational readiness v2 MUST NOT be written if pilot stack pins and captured-v2 pins diverge.",
});

const NORMATIVE_SEQUENCE = [
  "Seal protocol repair package v6",
  "Establish and prove separate authority access (implementation cannot read authority-private roster/seed/generator logs)",
  "Run serialization pilot on spent commanders including Harmony validation; fail closed on any mismatch",
  "Write professor-stack-freeze-captured-v2.json matching the final passing pilot PASS artifact stack pins exactly",
  "Write operational-readiness-sealed-v2.json including golden-catalog state pins and ACL evidence",
  "Generate fresh authority-private roster v3 with secret seed; publish byte SHA in roster-commitment-v1 successor (never mutate selection-policy-v3)",
  "ROSTER_COMMITMENT_SEALED_WAIT: authority-side independent audit of roster commitment, freshness manifest-v2, eligibility, uniqueness, generator source audit attestation",
  "REPORT AND WAIT until roster-commitment audit clears",
  "Authority privately generates 24 real Professor cases",
  "validator_v2 + serialization + authority adjudication + seal hidden pack",
  "Independent benchmark integrity confirmation",
  "ONLY THEN authorize production closure implementation against DEV",
  "Implement closure against DEV; freeze closure code",
  "Evaluation runner loads hidden prospective inputs; run; commit outputs; open gold; score",
];

writeJson("phase6a1-professor-plan-prospective-pipeline-freeze-spec-v6.json", {
  version: "phase6a1-professor-plan-prospective-pipeline-freeze-spec-v6",
  authorizedAt: SEALED_AT,
  supersedes: "phase6a1-professor-plan-prospective-pipeline-freeze-spec-v5.json",
  extendsSelectionPolicy: "phase6a1-professor-plan-prospective-commander-selection-policy-v3.json",
  selectionPolicyV3Preservation: "Never mutate selection-policy-v3 bytes; roster byte SHA publishes via roster-commitment-v1 successor only.",
  extendsFreshnessManifestOverride: "phase6a1-professor-plan-selection-policy-v3-freshness-manifest-v2-override-v1.json",
  extendsExposedIdentitiesManifest: "phase6a1-exposed-benchmark-identities-manifest-v2.json",
  extendsRosterCommitmentCompletedSpec: "phase6a1-professor-plan-prospective-commander-roster-commitment-v1-spec.json",
  extendsRosterCommitmentSealedWaitSpec: "phase6a1-professor-plan-roster-commitment-sealed-wait-spec-v1.json",
  extendsEligibilityContractPin: "phase6a1-professor-plan-benchmark-commander-eligibility-contract-pin-v1.json",
  extendsGoldenCatalogStatePinSpec: "phase6a1-professor-plan-golden-catalog-state-pin-spec-v1.json",
  extendsAuthorityRosterGeneratorSourceAuditSpec: "phase6a1-professor-plan-authority-roster-generator-source-audit-spec-v1.json",
  extendsCapturedStackCompletedSpec: "phase6a1-professor-plan-professor-stack-freeze-captured-v2-spec-v1.json",
  extendsOperationalReadinessCompletedSpec: "phase6a1-professor-plan-operational-readiness-sealed-v2-spec-v1.json",
  extendsSerializationPilotSpec: "phase6a1-professor-plan-serialization-pilot-spec-v5.json",
  extendsDisagreementProtocol: "phase6a1-professor-plan-authority-adjudication-disagreement-protocol-v4.json",
  extendsAuthorityAdjudicationRubric: "phase6a1-professor-plan-authority-adjudication-rubric-v4.json",
  extendsEvaluationRubric: "phase6a1-professor-plan-evaluation-a-scoring-rubric-v3.json",
  immutablePendingArtifacts: {
    professorStackFreezeManifestV1: IMMUTABLE.professorStackFreezeManifestV1,
    professorStackFreezeCapturedV1: IMMUTABLE.professorStackFreezeCapturedV1,
    operationalReadinessSealV1: IMMUTABLE.operationalReadinessSealV1,
    selectionPolicyV3: IMMUTABLE.selectionPolicyV3,
  },
  authorityGeneratorVisibility: "AUTHORITY_PRIVATE_ONLY_NOT_IN_IMPLEMENTATION_REVIEW_BUNDLE",
  normativeSequence: NORMATIVE_SEQUENCE,
  productionClosureImplementation: "NOT_AUTHORIZED",
  status: "SPECIFICATION_SEALED_AWAITING_PROTOCOL_V6_REAUDIT_THEN_ACL_AND_PILOT",
});

writeJson("phase6a1-professor-plan-v2-benchmark-disposition-v14-architecture.json", {
  version: "phase6a1-professor-plan-v2-benchmark-disposition-v14-architecture",
  recordedAt: SEALED_AT,
  supersedes: "phase6a1-professor-plan-v2-benchmark-disposition-v13-architecture.json",
  architectureCore: "PASS_PRESERVE",
  selectionPolicyV3: "SEALED_PRESERVE_BYTES_FOREVER",
  freshnessManifestOverride: "phase6a1-professor-plan-selection-policy-v3-freshness-manifest-v2-override-v1.json",
  auditReferences: {
    architectureV5IndependentReaudit: "phase6a1-professor-plan-benchmark-architecture-v5-independent-reaudit-gpt56sol-v1.json",
    architectureAmendmentBundleV6: "archv6.zip",
    architectureAmendmentBundleV6BytePin: "phase6a1-professor-plan-audit-bundle-archv6-byte-pin.json",
  },
  aclProofWork: "AUTHORIZED",
  serializationPilot: "NOT_AUTHORIZED_YET",
  prospectiveRosterV3: "NOT_AUTHORIZED",
  prospectiveProfessorPopulation: "NOT_AUTHORIZED",
  productionClosureImplementation: "NOT_AUTHORIZED",
  instruction: "REPORT AND WAIT",
});

writeJson("phase6a1-professor-plan-post-gold-development-track-v14-architecture.json", {
  version: "phase6a1-professor-plan-post-gold-development-track-v14-architecture",
  updatedAt: SEALED_AT,
  supersedes: "phase6a1-professor-plan-post-gold-development-track-v13-architecture",
  decision: "ARCHITECTURE_AMENDMENT_V6_SEALED_WAIT",
  normativeArtifacts: {
    pipelineFreezeSpecV6: "phase6a1-professor-plan-prospective-pipeline-freeze-spec-v6.json",
    freshnessManifestOverrideV1: "phase6a1-professor-plan-selection-policy-v3-freshness-manifest-v2-override-v1.json",
    serializationPilotSpecV5: "phase6a1-professor-plan-serialization-pilot-spec-v5.json",
    disagreementProtocolV4: "phase6a1-professor-plan-authority-adjudication-disagreement-protocol-v4.json",
    evaluationAScoringRubricV3: "phase6a1-professor-plan-evaluation-a-scoring-rubric-v3.json",
    authorityAdjudicationRubricV4: "phase6a1-professor-plan-authority-adjudication-rubric-v4.json",
    goldenCatalogStatePinSpecV1: "phase6a1-professor-plan-golden-catalog-state-pin-spec-v1.json",
    rosterCommitmentSealedWaitSpecV1: "phase6a1-professor-plan-roster-commitment-sealed-wait-spec-v1.json",
    authorityRosterGeneratorSourceAuditSpecV1: "phase6a1-professor-plan-authority-roster-generator-source-audit-spec-v1.json",
    architectureSealedManifestV6: "phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v6.json",
  },
  instruction: "REPORT AND WAIT",
});

const pins: Record<string, { artifact: string; sha256: string }> = {
  pipelineFreezeSpecV6: {
    artifact: "phase6a1-professor-plan-prospective-pipeline-freeze-spec-v6.json",
    sha256: sha("phase6a1-professor-plan-prospective-pipeline-freeze-spec-v6.json"),
  },
  selectionPolicyV3Immutable: {
    artifact: "phase6a1-professor-plan-prospective-commander-selection-policy-v3.json",
    sha256: IMMUTABLE.selectionPolicyV3,
  },
  freshnessManifestOverrideV1: {
    artifact: "phase6a1-professor-plan-selection-policy-v3-freshness-manifest-v2-override-v1.json",
    sha256: sha("phase6a1-professor-plan-selection-policy-v3-freshness-manifest-v2-override-v1.json"),
  },
  exposedIdentitiesManifestV2: {
    artifact: "phase6a1-exposed-benchmark-identities-manifest-v2.json",
    sha256: IMMUTABLE.exposedIdentitiesManifestV2,
  },
  disagreementProtocolV4: {
    artifact: "phase6a1-professor-plan-authority-adjudication-disagreement-protocol-v4.json",
    sha256: sha("phase6a1-professor-plan-authority-adjudication-disagreement-protocol-v4.json"),
  },
  evaluationAScoringRubricV3: {
    artifact: "phase6a1-professor-plan-evaluation-a-scoring-rubric-v3.json",
    sha256: sha("phase6a1-professor-plan-evaluation-a-scoring-rubric-v3.json"),
  },
  authorityAdjudicationRubricV4: {
    artifact: "phase6a1-professor-plan-authority-adjudication-rubric-v4.json",
    sha256: sha("phase6a1-professor-plan-authority-adjudication-rubric-v4.json"),
  },
  serializationPilotSpecV5: {
    artifact: "phase6a1-professor-plan-serialization-pilot-spec-v5.json",
    sha256: sha("phase6a1-professor-plan-serialization-pilot-spec-v5.json"),
  },
  goldenCatalogStatePinSpecV1: {
    artifact: "phase6a1-professor-plan-golden-catalog-state-pin-spec-v1.json",
    sha256: sha("phase6a1-professor-plan-golden-catalog-state-pin-spec-v1.json"),
  },
  rosterCommitmentSealedWaitSpecV1: {
    artifact: "phase6a1-professor-plan-roster-commitment-sealed-wait-spec-v1.json",
    sha256: sha("phase6a1-professor-plan-roster-commitment-sealed-wait-spec-v1.json"),
  },
  authorityRosterGeneratorSourceAuditSpecV1: {
    artifact: "phase6a1-professor-plan-authority-roster-generator-source-audit-spec-v1.json",
    sha256: sha("phase6a1-professor-plan-authority-roster-generator-source-audit-spec-v1.json"),
  },
  eligibilityContractPinV1: {
    artifact: "phase6a1-professor-plan-benchmark-commander-eligibility-contract-pin-v1.json",
    sha256: IMMUTABLE.eligibilityContractPinV1,
  },
  canonicalCatalogSliceV2: {
    artifact: "phase6a1-benchmark-canonical-catalog-slice-v2.json",
    sha256: IMMUTABLE.canonicalCatalogSliceV2,
  },
  capturedV2Spec: {
    artifact: "phase6a1-professor-plan-professor-stack-freeze-captured-v2-spec-v1.json",
    sha256: sha("phase6a1-professor-plan-professor-stack-freeze-captured-v2-spec-v1.json"),
  },
  operationalReadinessSealedV2Spec: {
    artifact: "phase6a1-professor-plan-operational-readiness-sealed-v2-spec-v1.json",
    sha256: sha("phase6a1-professor-plan-operational-readiness-sealed-v2-spec-v1.json"),
  },
  rosterCommitmentSpecV1: {
    artifact: "phase6a1-professor-plan-prospective-commander-roster-commitment-v1-spec.json",
    sha256: sha("phase6a1-professor-plan-prospective-commander-roster-commitment-v1-spec.json"),
  },
  benchmarkDispositionV14: {
    artifact: "phase6a1-professor-plan-v2-benchmark-disposition-v14-architecture.json",
    sha256: sha("phase6a1-professor-plan-v2-benchmark-disposition-v14-architecture.json"),
  },
  developmentTrackV14: {
    artifact: "phase6a1-professor-plan-post-gold-development-track-v14-architecture.json",
    sha256: sha("phase6a1-professor-plan-post-gold-development-track-v14-architecture.json"),
  },
  architectureReauditV5: {
    artifact: "phase6a1-professor-plan-benchmark-architecture-v5-independent-reaudit-gpt56sol-v1.json",
    sha256: sha("phase6a1-professor-plan-benchmark-architecture-v5-independent-reaudit-gpt56sol-v1.json"),
  },
  professorStackFreezeManifestV1Pending: {
    artifact: "phase6a1-professor-plan-professor-stack-freeze-manifest-v1.json",
    sha256: IMMUTABLE.professorStackFreezeManifestV1,
  },
  professorStackFreezeCapturedV1Pending: {
    artifact: "phase6a1-professor-plan-professor-stack-freeze-captured-v1.json",
    sha256: IMMUTABLE.professorStackFreezeCapturedV1,
  },
  operationalReadinessSealV1Pending: {
    artifact: "phase6a1-professor-plan-operational-readiness-seal-v1.json",
    sha256: IMMUTABLE.operationalReadinessSealV1,
  },
};

writeJson("phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v6.json", {
  version: "phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v6",
  sealedAt: SEALED_AT,
  supersedes: "phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v5.json",
  decision: "ARCHITECTURE_AMENDMENT_V6_SEALED_WAIT",
  byteReproducibleSealScript: "web/scripts/run-phase6a1-seal-benchmark-architecture-v6.ts",
  archv6BundleBytePinArtifact: "phase6a1-professor-plan-audit-bundle-archv6-byte-pin.json",
  immutablePendingArtifacts: {
    professorStackFreezeManifestV1: IMMUTABLE.professorStackFreezeManifestV1,
    professorStackFreezeCapturedV1: IMMUTABLE.professorStackFreezeCapturedV1,
    operationalReadinessSealV1: IMMUTABLE.operationalReadinessSealV1,
    selectionPolicyV3: IMMUTABLE.selectionPolicyV3,
  },
  preservedV5Repairs: {
    sealedManifestV5Sha256: IMMUTABLE.sealedManifestV5,
    note: "All successful v5 repairs preserved; v6 amends authorization, pilot finality, freshness override, roster WAIT gate, catalog pin, and generator audit only.",
  },
  pins,
  instruction:
    "REPORT AND WAIT — await protocol v6 reaudit, then ACL proof and spent serialization/Harmony pilot under spec v5 with pilot-finality binding.",
});

console.log(JSON.stringify({ manifestSha256: sha("phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v6.json"), pins }, null, 2));
