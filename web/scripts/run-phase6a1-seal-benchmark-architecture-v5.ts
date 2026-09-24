#!/usr/bin/env npx tsx
/** Seal benchmark architecture package v5 — repairs archv4 audit blocks. Never mutates v3-pinned bytes. */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../..");
const OUT = resolve(REPO, "web/data/milestones/deck-synthesis");
const AUTHORITY_PRIVATE = resolve(
  REPO,
  "benchmark-authority/phase6a1-holdout-prospective-pipeline-v1/private",
);
const SEALED_AT = "2026-08-14T23:30:00.000Z";

const IMMUTABLE = {
  professorStackFreezeManifestV1: "47fb3cf2e1a6d34a7d22e124457db50055fb6194a3fed7cfdaae7871d8297664",
  professorStackFreezeCapturedV1: "be7a8f2c07c47962656215dd93208277d3fdf222b4a1fe627478ce0ab7c44d75",
  operationalReadinessSealV1: "488c4c6d7aa27c87acb667949017b834b829f1b0c2f40442bff6306377fc34f3",
  selectionPolicyV1: "28df0ec79a7c006ea40faad3599c1fba3194d72279c61ef76b30b954d8922398",
  selectionPolicyV2: "4a5a64af8c57cd7b2810319b8ee11ac4d714ee752a1307361241fe0d53a51fb3",
  selectionPolicyV3: "c741bb5374feb58fc9a37a93b0e423c7330b757c347e2df9bfaf9ffc3eb13b73",
  v7BenchmarkBlockReaudit: "d4bcc5da8703a335f69e1a3352f185c8ea5cfefffe2ab12f283fbbdeea57bcd6",
  v8BenchmarkBlockReaudit: "e255cf0297e2b3a1f75d525d85f093f9f04884e4fe1e739fbb77de71714a63d1",
  v8v8Bundle: "73b2b9b82f78af206db318f5a5fa237a5509e44ae96abab7e0f230ef2d933f2a",
  eligibilityContractSource: "1281074656bd7005be282263744dc8bb7500482d10a08fbfce15c1e399e20c17",
  rosterGeneratorV3Source: "991270999ca72aebcdbb97d8c8af1f5e1e7ad07e80819618798792d4f907ef72",
};

const SPENT_PRIVATE_ROSTER_V2 = "phase6a1-professor-plan-prospective-commander-roster-private-v2.json";
const SPENT_PRIVATE_ROSTER_V2_ABS = resolve(AUTHORITY_PRIVATE, SPENT_PRIVATE_ROSTER_V2);

const sha = (f: string) => createHash("sha256").update(readFileSync(resolve(OUT, f))).digest("hex");
const shaAbs = (abs: string) => createHash("sha256").update(readFileSync(abs)).digest("hex");

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
]) {
  assertImmutable(file, expected);
}

const requiredAudits = [
  "phase6a1-professor-plan-benchmark-architecture-v3-independent-reaudit-gpt56sol-v1.json",
  "phase6a1-professor-plan-benchmark-architecture-v4-independent-reaudit-gpt56sol-v1.json",
];
for (const audit of requiredAudits) {
  if (!existsSync(resolve(OUT, audit))) {
    throw new Error(`Missing required audit artifact in milestones: ${audit}`);
  }
}

if (!existsSync(SPENT_PRIVATE_ROSTER_V2_ABS)) {
  throw new Error(`Missing spent private roster v2 for byte SHA pin: ${SPENT_PRIVATE_ROSTER_V2_ABS}`);
}
const spentPrivateRosterV2ByteSha256 = shaAbs(SPENT_PRIVATE_ROSTER_V2_ABS);

type SpentRosterSlot = {
  primaryCommander?: string;
  alternatesOrdered?: string[];
};

const spentRosterV2 = JSON.parse(readFileSync(SPENT_PRIVATE_ROSTER_V2_ABS, "utf8")) as {
  slots?: SpentRosterSlot[];
};
const spentRosterV2Identities: string[] = [];
for (const slot of spentRosterV2.slots ?? []) {
  if (slot.primaryCommander) spentRosterV2Identities.push(slot.primaryCommander);
  for (const alt of slot.alternatesOrdered ?? []) spentRosterV2Identities.push(alt);
}
if (spentRosterV2Identities.length !== 96) {
  throw new Error(`Expected 96 spent roster v2 identities, got ${spentRosterV2Identities.length}`);
}

const exposedManifestV1 = JSON.parse(
  readFileSync(resolve(OUT, "phase6a1-exposed-benchmark-identities-manifest-v1.json"), "utf8"),
) as {
  sources: Array<Record<string, unknown>>;
  spentRosterSidecars: Array<Record<string, unknown>>;
  privateSpentRosterFiles: Array<Record<string, unknown>>;
};

writeJson("phase6a1-professor-plan-prospective-commander-roster-v2-spent-identities-v1.json", {
  version: "phase6a1-professor-plan-prospective-commander-roster-v2-spent-identities-v1",
  recordedAt: SEALED_AT,
  disposition: "SPENT_PUBLISHED_FOR_AUDITABLE_EXCLUSION",
  sourcePrivateRosterFile: `benchmark-authority/phase6a1-holdout-prospective-pipeline-v1/private/${SPENT_PRIVATE_ROSTER_V2}`,
  sourcePrivateRosterFileByteSha256: spentPrivateRosterV2ByteSha256,
  identityCount: spentRosterV2Identities.length,
  commanderIdentities: spentRosterV2Identities,
  instruction: "All identities are spent; authority freshness gate must reject any of these in prospective roster v3.",
});

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
  privateRosterArtifact: `benchmark-authority/phase6a1-holdout-prospective-pipeline-v1/private/${SPENT_PRIVATE_ROSTER_V2}`,
  privateRosterFileByteSha256: spentPrivateRosterV2ByteSha256,
  publishedIdentitiesArtifact: "phase6a1-professor-plan-prospective-commander-roster-v2-spent-identities-v1.json",
  replacement: "Generate roster v3 only after ACL separation, spent pilot PASS, and stack/readiness seal; publish byte SHA in roster-commitment-v1 successor.",
});

writeJson("phase6a1-exposed-benchmark-identities-manifest-v2.json", {
  version: "phase6a1-exposed-benchmark-identities-manifest-v2",
  authorizedAt: SEALED_AT,
  supersedes: "phase6a1-exposed-benchmark-identities-manifest-v1.json",
  failClosed: true,
  instruction:
    "Authority roster generation must hard-fail if any source is missing or SHA mismatches. Private spent roster v2 file byte SHA is mandatory.",
  sources: exposedManifestV1.sources,
  spentRosterSidecars: [
    ...exposedManifestV1.spentRosterSidecars.filter(
      (s) => (s as { artifact?: string }).artifact !== "phase6a1-professor-plan-prospective-commander-roster-v2-spent-sidecar.json",
    ),
    {
      artifact: "phase6a1-professor-plan-prospective-commander-roster-v2-spent-sidecar.json",
      sha256: sha("phase6a1-professor-plan-prospective-commander-roster-v2-spent-sidecar.json"),
      reason: "Private roster v2 spent with file byte SHA",
    },
    {
      artifact: "phase6a1-professor-plan-prospective-commander-roster-v2-spent-identities-v1.json",
      sha256: sha("phase6a1-professor-plan-prospective-commander-roster-v2-spent-identities-v1.json"),
      reason: "Published spent roster v2 identities for auditable exclusion",
    },
  ],
  privateSpentRosterFiles: [
    {
      pathFromAuthorityPrivate: SPENT_PRIVATE_ROSTER_V2,
      fileByteSha256: spentPrivateRosterV2ByteSha256,
      publishedIdentitiesArtifact: "phase6a1-professor-plan-prospective-commander-roster-v2-spent-identities-v1.json",
      reason: "Deterministically reconstructable + sample-name leak; byte SHA now pinned",
    },
  ],
});

writeJson("phase6a1-professor-plan-benchmark-commander-eligibility-contract-pin-v1.json", {
  version: "phase6a1-professor-plan-benchmark-commander-eligibility-contract-pin-v1",
  authorizedAt: SEALED_AT,
  contractId: "benchmark-commander-eligibility-v1.single_commander",
  sourcePathFromRepo: "web/src/lib/deck-synthesis/benchmark-commander-eligibility-v1.ts",
  sourceByteSha256: IMMUTABLE.eligibilityContractSource,
  requiredChecks: ["commanderFormatStatus", "structurallyEligible", "canOccupyCommandZone"],
  authorityGeneratorSourcePath:
    "benchmark-authority/phase6a1-holdout-prospective-pipeline-v1/lib/generate-commander-roster-v3.ts",
  authorityGeneratorSourceByteSha256: IMMUTABLE.rosterGeneratorV3Source,
  auditRequirement:
    "Authority-side independent source review verifies generate-commander-roster-v3 uses auditBenchmarkCaseEligibility from the pinned contract without exposing seed or roster names to implementation developers.",
});

writeJson("phase6a1-professor-plan-prospective-commander-roster-commitment-v1-spec.json", {
  version: "phase6a1-professor-plan-prospective-commander-roster-commitment-v1-spec",
  authorizedAt: SEALED_AT,
  status: "NOT_YET_CREATED",
  purpose:
    "Immutable public roster commitment successor created only after roster v3 generation. Never mutate selection-policy-v3 bytes.",
  preserveForever: ["phase6a1-professor-plan-prospective-commander-selection-policy-v3.json"],
  completedArtifactTarget: "phase6a1-professor-plan-prospective-commander-roster-commitment-v1.json",
  requiredFields: [
    "populationCodename",
    "caseCount",
    "selectionPolicyVersion",
    "selectionPolicyByteSha256",
    "privateRosterStoragePath",
    "privateRosterFileByteSha256",
  ],
  instruction:
    "After ACL proof, spent pilot PASS, stack capture v2, and operational readiness v2, generate roster v3 and write commitment-v1 with actual private roster FILE byte SHA.",
});

writeJson("phase6a1-professor-plan-authority-adjudication-disagreement-protocol-v3.json", {
  version: "phase6a1-professor-plan-authority-adjudication-disagreement-protocol-v3",
  authorizedAt: SEALED_AT,
  supersedes: "phase6a1-professor-plan-authority-adjudication-disagreement-protocol-v2.json",
  terminalRule: {
    caseReplacementForbidden: true,
    commanderReplacementForbidden: true,
    whenNoTwoOfThreeMajority: {
      packDisposition: "RETAIN_CASE_IN_FIXED_24_CASE_PACK",
      disputedFieldGold: "DISPUTED_UNSCORABLE",
      scoring:
        "Apply phase6a1-professor-plan-evaluation-a-scoring-rubric-v2.json disputedFieldTerminalTreatment exactly. Do not overload closure status EVIDENCE_INSUFFICIENT as a generic field label.",
      benchmarkMacro:
        "Disputed unscorable fields are excluded from exact-match denominators; macro may still pass on all scorable fields. Does not authorize dropping or substituting the case/commander.",
      resolutionWithoutReplacement:
        "Case remains in the fixed 24-case pack. Authority records DISPUTED_UNSCORABLE gold on the disputed field only. Evaluation proceeds under rubric-v2 denominator rules.",
    },
  },
  prohibition: "Do not replace a case because adjudication is difficult, ambiguous, or inconvenient.",
});

writeJson("phase6a1-professor-plan-evaluation-a-scoring-rubric-v2.json", {
  version: "phase6a1-professor-plan-evaluation-a-scoring-rubric-v2",
  authorizedAt: SEALED_AT,
  supersedes: "phase6a1-professor-plan-evaluation-a-scoring-rubric-v1.json",
  extendsDesignArtifact: "phase6a1-professor-plan-functional-role-closure-design-v3.json",
  extendsStatusPrecedenceSidecar: "phase6a1-professor-plan-functional-role-closure-design-v3-status-precedence-v1.json",
  extendsDisagreementProtocol: "phase6a1-professor-plan-authority-adjudication-disagreement-protocol-v3.json",
  metrics: {
    roleApplicabilityExactness: {
      scope: "per lens per case",
      match: "exact REQUIRED/RECOMMENDED/N/A vs authority on scorable fields only",
    },
    requiredRoleSatisfaction: {
      scope: "per REQUIRED role where applicable",
      match: "SATISFIED/MISSING exact vs authority on scorable fields only",
    },
    closureStatusExactness: {
      scope: "per lens per case",
      match: "exact status vs authority after precedence sidecar",
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
  disputedFieldTerminalTreatment: {
    goldValue: "DISPUTED_UNSCORABLE",
    appliesToMetrics: ["roleApplicabilityExactness", "requiredRoleSatisfaction"],
    allowedOnFields: ["roleApplicability", "requiredRoleSatisfaction"],
    forbiddenOnFields: ["closureStatus", "repairTargetValidity", "harmonyUnderdeterminedHandling"],
    scoring: {
      excludeFromExactMatchDenominator: true,
      excludeFromExactMatchNumerator: true,
      doesNotCountAsPassOrFailForExactMatch: true,
      reporting: "List each DISPUTED_UNSCORABLE field in the per-case matrix with tag DISPUTED_UNSCORABLE",
    },
    perCasePass:
      "Case passes if all scorable (non-DISPUTED_UNSCORABLE) metric checks pass and all critical invariants pass for that case.",
    macroPass:
      "Aggregate pass requires perCasePass on all 24 cases, all critical invariants zero-tolerance, and 1.0 exactness on all scorable fields across the pack.",
  },
  aggregation: {
    perCasePass: "case passes only if all scorable lens metrics pass for that case and critical invariants hold",
    macroPass: "aggregate pass requires perCasePass on all 24 cases AND all critical invariants",
    reporting: ["per-case matrix", "per-metric rollups", "critical invariant violations list", "disputed unscorable field list"],
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
      perCasePassRate: 1,
      closureStatusExactnessRate: 1,
      requiredRoleSatisfactionExactnessRate: 1,
      roleApplicabilityExactnessRate: 1,
      note: "Rates computed over scorable fields only; DISPUTED_UNSCORABLE fields excluded from denominators.",
    },
    note: "Thresholds are sealed before prospective inputs or adjudication are visible to implementation developers.",
  },
});

writeJson("phase6a1-professor-plan-authority-adjudication-rubric-v3.json", {
  version: "phase6a1-professor-plan-authority-adjudication-rubric-v3",
  authorizedAt: SEALED_AT,
  supersedes: "phase6a1-professor-plan-authority-adjudication-rubric-v2.json",
  extendsDesignArtifact: "phase6a1-professor-plan-functional-role-closure-design-v3.json",
  extendsStatusPrecedenceSidecar: "phase6a1-professor-plan-functional-role-closure-design-v3-status-precedence-v1.json",
  extendsHarmonyBridgeSufficiencySidecar: "phase6a1-professor-plan-functional-role-closure-harmony-bridge-sufficiency-v1.json",
  extendsRuntimeSchemaSidecar: "phase6a1-semantic-closure-runtime-input-schema-v8.json",
  extendsEvaluationRubric: "phase6a1-professor-plan-evaluation-a-scoring-rubric-v2.json",
  extendsDisagreementProtocol: "phase6a1-professor-plan-authority-adjudication-disagreement-protocol-v3.json",
  independenceRules: [
    "Authority MUST NOT use production closure implementation output to generate gold answers",
    "Authority MUST NOT rewrite Professor strategy, packages, or resource graph",
    "Authority MUST NOT select cards or author replacement packages",
    "Authority adjudicates only on the frozen validated Professor plan",
  ],
  harmonyUnderdeterminedRule: "Apply phase6a1-professor-plan-functional-role-closure-harmony-bridge-sufficiency-v1.json exactly.",
  disagreementResolution: "Apply phase6a1-professor-plan-authority-adjudication-disagreement-protocol-v3.json exactly.",
});

writeJson("phase6a1-professor-plan-serialization-pilot-spec-v4.json", {
  version: "phase6a1-professor-plan-serialization-pilot-spec-v4",
  authorizedAt: SEALED_AT,
  supersedes: "phase6a1-professor-plan-serialization-pilot-spec-v3.json",
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
  harmonyValidationNote:
    "Include spent real Professor outputs with positive/negative Harmony bridge cases to validate the public >=2-edge rule before prospective roster spend.",
  passArtifact: {
    artifact: "phase6a1-professor-plan-serialization-pilot-pass-v1.json",
    requiredFields: [
      "pilotSpecVersion",
      "pilotSpecSha256",
      "serializerVersion",
      "publishContractSha256",
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
  onFail: "Fail closed: do not authorize stack capture, operational readiness, roster v3, or fresh holdout population until serializer is repaired and pilot re-run passes.",
  instruction: "Pilot uses spent commanders only; do not consume pipeline-v1 roster v3 identities.",
});

writeJson("phase6a1-professor-plan-synthetic-architecture-pivot-lineage-v2.json", {
  version: "phase6a1-professor-plan-synthetic-architecture-pivot-lineage-v2",
  authorizedAt: SEALED_AT,
  supersedes: "phase6a1-professor-plan-synthetic-architecture-pivot-lineage-v1.json",
  purpose: "Document audit lineage from synthetic benchmark blocks to pipeline-driven prospective architecture.",
  canonicalSyntheticBlockAudit: {
    artifact: "phase6a1-professor-plan-functional-role-closure-v7-preimplementation-reaudit-gpt56sol-v1.json",
    sha256: IMMUTABLE.v7BenchmarkBlockReaudit,
    decision: "BENCHMARK_BLOCK_V7",
  },
  architecturePivotTriggerAudit: {
    artifact: "phase6a1-professor-plan-functional-role-closure-v8-preimplementation-reaudit-gpt56sol-v1.json",
    sha256: IMMUTABLE.v8BenchmarkBlockReaudit,
    decision: "BENCHMARK_BLOCK_V8",
    note: "Canonical pivot trigger audit SHA pinned; artifact may be authority-external if not present in repo bundle.",
  },
  syntheticIntegrityBundleV8: { artifact: "v8v8.zip", sha256: IMMUTABLE.v8v8Bundle },
  architecturePivot: "Synthetic prospective holdout authoring superseded by Professor→Validator→Closure pipeline architecture.",
  notArchitecturePivotAudit:
    "phase6a1-professor-plan-experiment-v3-amended-v8-pre-gold-reaudit-gpt56sol-v1.json is Amendment v8 experiment integrity, not the architecture pivot audit.",
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
  prerequisite: "serialization-pilot-spec-v4 PASS artifact",
  instruction: "Write captured stack pins once to captured-v2.json after spent pilot PASS. Never overwrite captured-v1 pending placeholder bytes.",
});

writeJson("phase6a1-professor-plan-operational-readiness-sealed-v2-spec-v1.json", {
  version: "phase6a1-professor-plan-operational-readiness-sealed-v2-spec-v1",
  authorizedAt: SEALED_AT,
  status: "NOT_YET_CREATED",
  purpose: "Immutable operational readiness seal created only after pilot PASS, stack capture v2, and ACL proof.",
  preserveForever: ["phase6a1-professor-plan-operational-readiness-seal-v1.json"],
  completedArtifactTarget: "phase6a1-professor-plan-operational-readiness-sealed-v2.json",
  prerequisite: "serialization-pilot-spec-v4 PASS artifact and professor-stack-freeze-captured-v2.json",
  pinsOnCompletion: [
    "professor-stack-freeze-captured-v2.json byte SHA",
    "serialization-pilot-pass-v1.json byte SHA",
    "serialization-pilot-spec-v4.json byte SHA",
    "access boundary operational evidence",
    "serializerVersion",
    "publishContractSha256",
    "benchmark-commander-eligibility-contract-pin-v1.json byte SHA",
    "authority roster generator source byte SHA",
    "authority-adjudication-rubric-v3.json byte SHA",
    "exposed-benchmark-identities-manifest-v2.json byte SHA",
  ],
});

const NORMATIVE_SEQUENCE = [
  "Seal protocol repair package v5",
  "Establish and prove separate authority access (implementation cannot read authority-private roster/seed/generator logs)",
  "Run serialization pilot on spent commanders including Harmony validation; fail closed on any mismatch",
  "Finalize and freeze semantic + serializer rules informed by pilot results",
  "Write stack capture to professor-stack-freeze-captured-v2.json (new immutable file)",
  "Write operational readiness to operational-readiness-sealed-v2.json (new immutable file)",
  "Generate fresh authority-private roster v3 with secret seed; publish only byte SHA in roster-commitment-v1 successor (never mutate selection-policy-v3)",
  "Authority privately generates 24 real Professor cases",
  "validator_v2 + serialization + authority adjudication + seal hidden pack",
  "Independent benchmark integrity confirmation",
  "ONLY THEN authorize production closure implementation against DEV",
  "Implement closure against DEV; freeze closure code",
  "Evaluation runner loads hidden prospective inputs; run; commit outputs; open gold; score",
];

writeJson("phase6a1-professor-plan-prospective-pipeline-freeze-spec-v5.json", {
  version: "phase6a1-professor-plan-prospective-pipeline-freeze-spec-v5",
  authorizedAt: SEALED_AT,
  supersedes: "phase6a1-professor-plan-prospective-pipeline-freeze-spec-v4.json",
  extendsSelectionPolicy: "phase6a1-professor-plan-prospective-commander-selection-policy-v3.json",
  selectionPolicyV3Preservation: "Never mutate selection-policy-v3 bytes; roster byte SHA publishes via roster-commitment-v1 successor only.",
  extendsExposedIdentitiesManifest: "phase6a1-exposed-benchmark-identities-manifest-v2.json",
  extendsRosterCommitmentCompletedSpec: "phase6a1-professor-plan-prospective-commander-roster-commitment-v1-spec.json",
  extendsEligibilityContractPin: "phase6a1-professor-plan-benchmark-commander-eligibility-contract-pin-v1.json",
  extendsCapturedStackCompletedSpec: "phase6a1-professor-plan-professor-stack-freeze-captured-v2-spec-v1.json",
  extendsOperationalReadinessCompletedSpec: "phase6a1-professor-plan-operational-readiness-sealed-v2-spec-v1.json",
  extendsSerializationPilotSpec: "phase6a1-professor-plan-serialization-pilot-spec-v4.json",
  extendsDisagreementProtocol: "phase6a1-professor-plan-authority-adjudication-disagreement-protocol-v3.json",
  extendsAuthorityAdjudicationRubric: "phase6a1-professor-plan-authority-adjudication-rubric-v3.json",
  extendsEvaluationRubric: "phase6a1-professor-plan-evaluation-a-scoring-rubric-v2.json",
  immutablePendingArtifacts: {
    professorStackFreezeManifestV1: IMMUTABLE.professorStackFreezeManifestV1,
    professorStackFreezeCapturedV1: IMMUTABLE.professorStackFreezeCapturedV1,
    operationalReadinessSealV1: IMMUTABLE.operationalReadinessSealV1,
    selectionPolicyV3: IMMUTABLE.selectionPolicyV3,
  },
  authorityGeneratorVisibility: "AUTHORITY_PRIVATE_ONLY_NOT_IN_IMPLEMENTATION_REVIEW_BUNDLE",
  normativeSequence: NORMATIVE_SEQUENCE,
  productionClosureImplementation: "NOT_AUTHORIZED",
  status: "SPECIFICATION_SEALED_AWAITING_ACL_PROOF_PILOT_AND_INDEPENDENT_REVIEW",
});

writeJson("phase6a1-professor-plan-v2-benchmark-disposition-v13-architecture.json", {
  version: "phase6a1-professor-plan-v2-benchmark-disposition-v13-architecture",
  recordedAt: SEALED_AT,
  supersedes: "phase6a1-professor-plan-v2-benchmark-disposition-v12-architecture.json",
  architectureCore: "PASS_PRESERVE",
  privateRosterV2: "SPENT_AS_BLIND_ROSTER_BYTE_SHA_PINNED",
  selectionPolicyV2: "SPENT_AS_BLIND_METADATA_POLICY",
  selectionPolicyV3: "SEALED_PRESERVE_BYTES_FOREVER",
  rosterCommitmentSuccessor: "phase6a1-professor-plan-prospective-commander-roster-commitment-v1-spec.json",
  auditReferences: {
    architectureV3IndependentReaudit: "phase6a1-professor-plan-benchmark-architecture-v3-independent-reaudit-gpt56sol-v1.json",
    architectureV4IndependentReaudit: "phase6a1-professor-plan-benchmark-architecture-v4-independent-reaudit-gpt56sol-v1.json",
    syntheticArchitecturePivotLineage: "phase6a1-professor-plan-synthetic-architecture-pivot-lineage-v2.json",
    architectureAmendmentBundleV5: "archv5.zip",
    architectureAmendmentBundleV5BytePin: "phase6a1-professor-plan-audit-bundle-archv5-byte-pin.json",
  },
  prospectiveProfessorPopulation: "NOT_AUTHORIZED_YET",
  productionClosureImplementation: "NOT_AUTHORIZED",
  instruction: "REPORT AND WAIT",
});

writeJson("phase6a1-professor-plan-post-gold-development-track-v13-architecture.json", {
  version: "phase6a1-professor-plan-post-gold-development-track-v13-architecture",
  updatedAt: SEALED_AT,
  supersedes: "phase6a1-professor-plan-post-gold-development-track-v12-architecture",
  decision: "ARCHITECTURE_AMENDMENT_V5_SEALED_WAIT",
  normativeArtifacts: {
    pipelineFreezeSpecV5: "phase6a1-professor-plan-prospective-pipeline-freeze-spec-v5.json",
    selectionPolicyV3: "phase6a1-professor-plan-prospective-commander-selection-policy-v3.json",
    exposedIdentitiesManifestV2: "phase6a1-exposed-benchmark-identities-manifest-v2.json",
    disagreementProtocolV3: "phase6a1-professor-plan-authority-adjudication-disagreement-protocol-v3.json",
    authorityAdjudicationRubricV3: "phase6a1-professor-plan-authority-adjudication-rubric-v3.json",
    evaluationAScoringRubricV2: "phase6a1-professor-plan-evaluation-a-scoring-rubric-v2.json",
    serializationPilotSpecV4: "phase6a1-professor-plan-serialization-pilot-spec-v4.json",
    eligibilityContractPinV1: "phase6a1-professor-plan-benchmark-commander-eligibility-contract-pin-v1.json",
    rosterCommitmentSpecV1: "phase6a1-professor-plan-prospective-commander-roster-commitment-v1-spec.json",
    architectureSealedManifestV5: "phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v5.json",
  },
  instruction: "REPORT AND WAIT",
});

const pins: Record<string, { artifact: string; sha256: string }> = {
  pipelineFreezeSpecV5: {
    artifact: "phase6a1-professor-plan-prospective-pipeline-freeze-spec-v5.json",
    sha256: sha("phase6a1-professor-plan-prospective-pipeline-freeze-spec-v5.json"),
  },
  selectionPolicyV3Immutable: {
    artifact: "phase6a1-professor-plan-prospective-commander-selection-policy-v3.json",
    sha256: IMMUTABLE.selectionPolicyV3,
  },
  exposedIdentitiesManifestV2: {
    artifact: "phase6a1-exposed-benchmark-identities-manifest-v2.json",
    sha256: sha("phase6a1-exposed-benchmark-identities-manifest-v2.json"),
  },
  spentRosterV2IdentitiesV1: {
    artifact: "phase6a1-professor-plan-prospective-commander-roster-v2-spent-identities-v1.json",
    sha256: sha("phase6a1-professor-plan-prospective-commander-roster-v2-spent-identities-v1.json"),
  },
  rosterV2SpentSidecar: {
    artifact: "phase6a1-professor-plan-prospective-commander-roster-v2-spent-sidecar.json",
    sha256: sha("phase6a1-professor-plan-prospective-commander-roster-v2-spent-sidecar.json"),
  },
  eligibilityContractPinV1: {
    artifact: "phase6a1-professor-plan-benchmark-commander-eligibility-contract-pin-v1.json",
    sha256: sha("phase6a1-professor-plan-benchmark-commander-eligibility-contract-pin-v1.json"),
  },
  rosterCommitmentSpecV1: {
    artifact: "phase6a1-professor-plan-prospective-commander-roster-commitment-v1-spec.json",
    sha256: sha("phase6a1-professor-plan-prospective-commander-roster-commitment-v1-spec.json"),
  },
  disagreementProtocolV3: {
    artifact: "phase6a1-professor-plan-authority-adjudication-disagreement-protocol-v3.json",
    sha256: sha("phase6a1-professor-plan-authority-adjudication-disagreement-protocol-v3.json"),
  },
  authorityAdjudicationRubricV3: {
    artifact: "phase6a1-professor-plan-authority-adjudication-rubric-v3.json",
    sha256: sha("phase6a1-professor-plan-authority-adjudication-rubric-v3.json"),
  },
  evaluationAScoringRubricV2: {
    artifact: "phase6a1-professor-plan-evaluation-a-scoring-rubric-v2.json",
    sha256: sha("phase6a1-professor-plan-evaluation-a-scoring-rubric-v2.json"),
  },
  serializationPilotSpecV4: {
    artifact: "phase6a1-professor-plan-serialization-pilot-spec-v4.json",
    sha256: sha("phase6a1-professor-plan-serialization-pilot-spec-v4.json"),
  },
  capturedV2Spec: {
    artifact: "phase6a1-professor-plan-professor-stack-freeze-captured-v2-spec-v1.json",
    sha256: sha("phase6a1-professor-plan-professor-stack-freeze-captured-v2-spec-v1.json"),
  },
  operationalReadinessSealedV2Spec: {
    artifact: "phase6a1-professor-plan-operational-readiness-sealed-v2-spec-v1.json",
    sha256: sha("phase6a1-professor-plan-operational-readiness-sealed-v2-spec-v1.json"),
  },
  syntheticPivotLineageV2: {
    artifact: "phase6a1-professor-plan-synthetic-architecture-pivot-lineage-v2.json",
    sha256: sha("phase6a1-professor-plan-synthetic-architecture-pivot-lineage-v2.json"),
  },
  benchmarkDispositionV13: {
    artifact: "phase6a1-professor-plan-v2-benchmark-disposition-v13-architecture.json",
    sha256: sha("phase6a1-professor-plan-v2-benchmark-disposition-v13-architecture.json"),
  },
  developmentTrackV13: {
    artifact: "phase6a1-professor-plan-post-gold-development-track-v13-architecture.json",
    sha256: sha("phase6a1-professor-plan-post-gold-development-track-v13-architecture.json"),
  },
  architectureReauditV3: {
    artifact: requiredAudits[0],
    sha256: sha(requiredAudits[0]),
  },
  architectureReauditV4: {
    artifact: requiredAudits[1],
    sha256: sha(requiredAudits[1]),
  },
  implementationVisibilityAmendmentV2: {
    artifact: "phase6a1-professor-plan-implementation-visibility-amendment-v2.json",
    sha256: sha("phase6a1-professor-plan-implementation-visibility-amendment-v2.json"),
  },
  harmonyBridgeSufficiencyV1: {
    artifact: "phase6a1-professor-plan-functional-role-closure-harmony-bridge-sufficiency-v1.json",
    sha256: sha("phase6a1-professor-plan-functional-role-closure-harmony-bridge-sufficiency-v1.json"),
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
  spentPrivateRosterV2FileBytes: {
    artifact: `benchmark-authority/.../private/${SPENT_PRIVATE_ROSTER_V2}`,
    sha256: spentPrivateRosterV2ByteSha256,
  },
};

writeJson("phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v5.json", {
  version: "phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v5",
  sealedAt: SEALED_AT,
  supersedes: "phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v4.json",
  decision: "ARCHITECTURE_AMENDMENT_V5_SEALED_WAIT",
  byteReproducibleSealScript: "web/scripts/run-phase6a1-seal-benchmark-architecture-v5.ts",
  archv5BundleBytePinArtifact: "phase6a1-professor-plan-audit-bundle-archv5-byte-pin.json",
  immutablePendingArtifacts: {
    professorStackFreezeManifestV1: IMMUTABLE.professorStackFreezeManifestV1,
    professorStackFreezeCapturedV1: IMMUTABLE.professorStackFreezeCapturedV1,
    operationalReadinessSealV1: IMMUTABLE.operationalReadinessSealV1,
    selectionPolicyV3: IMMUTABLE.selectionPolicyV3,
  },
  pins,
  instruction:
    "REPORT AND WAIT — prove ACL, run spent serialization/Harmony pilot, capture stack v2, seal operational-readiness-v2, then generate secret roster v3 into roster-commitment-v1 successor.",
});

console.log(
  JSON.stringify(
    {
      manifestSha256: sha("phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v5.json"),
      spentPrivateRosterV2ByteSha256,
      pins,
    },
    null,
    2,
  ),
);
