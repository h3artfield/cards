#!/usr/bin/env npx tsx
/** Seal benchmark architecture package v8 — repairs archv7 audit blocks. Never mutates v3-pinned bytes. */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../..");
const OUT = resolve(REPO, "web/data/milestones/deck-synthesis");
const SEALED_AT = "2026-08-15T01:00:00.000Z";

const IMMUTABLE = {
  professorStackFreezeManifestV1: "47fb3cf2e1a6d34a7d22e124457db50055fb6194a3fed7cfdaae7871d8297664",
  professorStackFreezeCapturedV1: "be7a8f2c07c47962656215dd93208277d3fdf222b4a1fe627478ce0ab7c44d75",
  operationalReadinessSealV1: "488c4c6d7aa27c87acb667949017b834b829f1b0c2f40442bff6306377fc34f3",
  selectionPolicyV3: "c741bb5374feb58fc9a37a93b0e423c7330b757c347e2df9bfaf9ffc3eb13b73",
  sealedManifestV7: "911c6e1006e946d6280f9143a06a88624c88bb3c48b78b50d58834aeb010e2d7",
  fullCatalogDataStateCommitmentV1: "542713fbe39017af136ff82a0bd282d3135930bf01ace4b0b8092f1e60673591",
  deckResolutionDataStatePinV1: "3b12c29a6d3ce1e039c192c897f575a0eecba77cf4274c56ff95bdff83eadc82",
  freshnessOverrideV1: "3fea7f0fe4644c94894c656d41d966e5e77beb546783f0e197563a2189a2f397",
  exposedIdentitiesManifestV2: "899cf2e09dbb60e0b57bf98b00fc6c6f5eaca765cbab26b308d9e7f05b5100ef",
  disagreementProtocolV4: "6c1ab7ef29d3824bc70aac71a5b2d6d8fdb964e14687de0ffebfbe261dc683c9",
  evaluationAScoringRubricV3: "da9e164e544dbbbac986e720260c74bc06d84ecec37a4637b1a3723dd0051eae",
  authorityAdjudicationRubricV4: "8bc3e79457ff061f1c92417cdb0711e9281c5424ffb239d228af7f1962bda382",
  authorityGoldClearancePolicyV1: "480bfaeb8272349b6c47d90087ce479be60d74e927e4979455efc8771923e9b5",
  rosterCommitmentWaitSpecV2: "1af72de475f54af09841684565b953a1391284d593724752201585e164f17d0d",
  rosterGeneratorV3Source: "991270999ca72aebcdbb97d8c8af1f5e1e7ad07e80819618798792d4f907ef72",
  catalogVerifierScript: "f3f18a5f2aefaa3db26d354848ce9f02ff7990843dd169f61d702c3c12528653",
  frozenAmendmentV8Archive: "9297688b07b85095672fedfb91f63669d71fc5e5d66ba319c10a654b0169cba1",
};

const REQUIRED_STACK_PINS = {
  repository: ["commitSha256", "branchOrTag", "dirtyWorktreeStatus"],
  professor: ["modelId", "modelConfigSha256", "promptOrAgentVersion", "agentSourceSha256"],
  validator: ["validatorVersion", "validatorSourceSha256"],
  retrieval: ["retrievalServiceVersion", "rankingConfigSha256", "corpusVersion", "embeddingModelVersion"],
  rules: ["rulesSourceVersion", "rulesSnapshotSha256"],
  tools: ["enabledToolsList", "toolPermissionsPolicySha256"],
  dependencies: ["lockfileSha256", "runtimeEnvironmentDigest"],
  closureInput: ["runtimeSchemaSidecarSha256", "serializerVersion", "publishContractSha256"],
  catalogDataState: [
    "fullCatalogDataStateCommitmentByteSha256",
    "deckResolutionDataStatePinByteSha256",
    "deckResolutionTransitiveSourceManifestByteSha256",
    "catalogDataStateVerificationByteSha256",
  ],
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
  ["phase6a1-professor-plan-prospective-commander-selection-policy-v3.json", IMMUTABLE.selectionPolicyV3],
  ["phase6a1-professor-plan-full-catalog-data-state-commitment-v1.json", IMMUTABLE.fullCatalogDataStateCommitmentV1],
  ["phase6a1-professor-plan-deck-resolution-data-state-pin-v1.json", IMMUTABLE.deckResolutionDataStatePinV1],
  ["phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v7.json", IMMUTABLE.sealedManifestV7],
]) {
  assertImmutable(file, expected);
}

for (const audit of [
  "phase6a1-professor-plan-benchmark-architecture-v6-independent-reaudit-gpt56sol-v1.json",
  "phase6a1-professor-plan-benchmark-architecture-v7-independent-reaudit-gpt56sol-v1.json",
]) {
  if (!existsSync(resolve(OUT, audit))) {
    throw new Error(`Missing required audit artifact in milestones: ${audit}`);
  }
}

writeJson("phase6a1-professor-plan-deck-resolution-transitive-source-manifest-v1.json", {
  version: "phase6a1-professor-plan-deck-resolution-transitive-source-manifest-v1",
  authorizedAt: SEALED_AT,
  extendsDeckResolutionDataStatePin: "phase6a1-professor-plan-deck-resolution-data-state-pin-v1.json",
  purpose:
    "Material transitive runtime source closure for deck-resolution, eligibility, name resolution, and paper/legalities.",
  sourcePins: {
    loadDeckResolutionCatalog: {
      path: "web/scripts/lib/load-deck-resolution-catalog.ts",
      sha256: "9e30c4c2108c3a175e835fef3074a82147b47eb53925b420fb59274d6c6debce",
    },
    deckResolutionSupplementType: {
      path: "web/scripts/lib/deck-resolution-supplement-v1.ts",
      sha256: "336c889c1c85fb67f92b69b94afb4835c8745e2e1e933ea28c6c3d286adaadcf",
    },
    loadGoldenCatalogIndex: {
      path: "web/scripts/lib/load-golden-catalog-index.ts",
      sha256: "aaff4526fa3bad0b17fa7ef91b3293ef0c2c7a29f276b56af8d659a93ec29010",
    },
    benchmarkCommanderEligibilityV1: {
      path: "web/src/lib/deck-synthesis/benchmark-commander-eligibility-v1.ts",
      sha256: "1281074656bd7005be282263744dc8bb7500482d10a08fbfce15c1e399e20c17",
    },
    benchmarkCommanderResolverV1: {
      path: "web/src/lib/deck-synthesis/benchmark-commander-resolver-v1.ts",
      sha256: "43a963204e3796a5a156595e47ffa4d9e3f513f4412f9bfe7301c89ffd6387b2",
    },
    deriveCommanderClassification: {
      path: "web/src/lib/deck-builder/commander-classification.ts",
      sha256: "351d300f095e5a682a9f9b805c594d80c3a6c4a7427057581c57d25d33d706c2",
    },
    normalizeOracleName: {
      path: "web/src/lib/deck-builder/golden-catalog/normalize-name.ts",
      sha256: "990a9e68e2a51826ed430f0203f8080e7bf95fa9049936875d63e92d5bd50c10",
    },
    parseTypeLine: {
      path: "web/src/lib/deck-builder/golden-catalog/parse-type-line.ts",
      sha256: "165baf43fa281baf89c7a4fd38f7a921e84423ff108b09241f5fc744b0f8fd33",
    },
    resolveCatalogCardByName: {
      path: "web/src/lib/commander-strategy/resolve-catalog-card-by-name.ts",
      sha256: "0d1f7e2e3dee02200ee8e7db38c3f9820c4e9aa8e32e473c68638b23d7374e81",
    },
    scriptsCatalogResolver: {
      path: "web/scripts/lib/catalog-resolver.ts",
      sha256: "70878bec265a8eaaf8aa7e91d84e2163168051b486c59a4c4c867cffbdca4905",
    },
    deckBuilderCatalogResolver: {
      path: "web/src/lib/deck-builder/catalog-resolver.ts",
      sha256: "c8fac8e2c53a54dc8b6a7bdfd41ced9f4e66ad8dd453f09cd4f6dd8652f41ff0",
    },
    catalogCoverageAdjudicationConfig: {
      path: "web/src/lib/catalog-coverage/adjudication-config.ts",
      sha256: "db14b99096be9ca963250b4500df61aca82dce496362a55702cbffe4d6c8bb5a",
    },
  },
  operationalReadinessBinding:
    "Operational readiness v2 MUST prove all material runtime files above match the captured clean repository commitSha256 or these explicit source SHA pins.",
});

writeJson("phase6a1-professor-plan-catalog-data-state-verification-spec-v1.json", {
  version: "phase6a1-professor-plan-catalog-data-state-verification-spec-v1",
  authorizedAt: SEALED_AT,
  status: "NOT_YET_CREATED",
  completedArtifactTarget: "phase6a1-professor-plan-catalog-data-state-verification-v1.json",
  verifierScript: "web/scripts/run-phase6a1-verify-pinned-catalog-data-state-v1.ts",
  verifierScriptByteSha256: IMMUTABLE.catalogVerifierScript,
  prerequisiteCommitment: "phase6a1-professor-plan-full-catalog-data-state-commitment-v1.json",
  failClosedRequirements: [
    "exactly 38542 Oracle identities loaded at runtime",
    "exact Oracle-ID set and count",
    "uniform catalogVersion on every loaded record",
    "runtime oracle-text root hash recorded",
    "exact paper eligibility ledger byte SHA/content",
    "exact deck-resolution supplement byte SHA/version",
    "all five fixed pilot commanders resolve and pass benchmark eligibility on verified state",
    "loadDeckResolutionCatalog failClosed; missing paper/supplement is hard failure",
  ],
  requiredInPilotPass: true,
  requiredInCapturedV2: true,
  instruction:
    "Run verifier immediately before pilot PASS issuance. Pilot PASS and captured-v2 MUST pin catalog-data-state-verification-v1 byte SHA.",
});

writeJson("phase6a1-professor-plan-serialization-pilot-harmony-evidence-v2.json", {
  version: "phase6a1-professor-plan-serialization-pilot-harmony-evidence-v2",
  authorizedAt: SEALED_AT,
  supersedes: "phase6a1-professor-plan-serialization-pilot-harmony-evidence-v1.json",
  purpose:
    "Predeclare byte-exact spent Harmony evidence from the canonical frozen final Amendment-v8 archive.",
  frozenAmendmentV8Archive: {
    artifact: "v8v8.zip",
    byteSha256: IMMUTABLE.frozenAmendmentV8Archive,
    note: "Inner case byte SHAs are from this frozen archive, not mutable workspace copies.",
  },
  usesFrozenSpentOutputsOnly: true,
  noPostHocCaseSelection: true,
  harmonySufficientSpentOutput: {
    label: "HARMONY_SUFFICIENT",
    innerPath: "cases/hybrid-kinnan.json",
    innerByteSha256: "8c3b1fceda465101735da3c0cd99020b7c4717de229580dd058a81c99dd3ac23",
    commander: "Kinnan, Bonder Prodigy",
    sourcePool: "amendment-v8-professor-population",
    explicitBridgeEdgeCount: 5,
    expectedBridgeRuleOutcome:
      "At least two distinct qualifying cross-engine bridge edges per harmony-bridge-sufficiency-v1 including distinct engine domains",
    independentVerificationRequired:
      "Independent reviewer must confirm >=2 qualifying bridge edges with distinct engine domains on the frozen inner bytes",
  },
  harmonyInsufficientSpentOutput: {
    label: "HARMONY_INSUFFICIENT",
    innerPath: "cases/yuriko-ninja.json",
    innerByteSha256: "dd4a998346f830755c951d46bf2824f1114aa1cc329dc27d1f4ede5d4d94673f",
    commander: "Yuriko, the Tiger's Shadow",
    sourcePool: "amendment-v8-professor-population",
    harmonyDetermination: "HARMONY_UNDERDETERMINED",
    expectedBridgeRuleOutcome: "Fewer than two distinct qualifying bridge edges",
  },
  supersededIncorrectPins: {
    singleTokensKrenkoWorkspaceSha256: "36d3f588eb94713a0078bfb9d5cf3e1d60e4b54c8acae3347f048f5ae214f337",
    frozenArchiveInnerSha256: "2acbc9a7a760cc9f85ce77895d42e94ef5eb87d0098ac523ad1933c745bdf885",
    reason: "Workspace bytes differ from frozen archive; Krenko also has only 1 explicit BRIDGE edge under new rule",
  },
  validationMethod:
    "Apply harmony-bridge-sufficiency-v1 to the frozen inner bytes through validator_v2 + serializer path; independent reviewer attests both outcomes.",
});

writeJson("phase6a1-professor-plan-authority-gold-clearance-policy-v2.json", {
  version: "phase6a1-professor-plan-authority-gold-clearance-policy-v2",
  authorizedAt: SEALED_AT,
  supersedes: "phase6a1-professor-plan-authority-gold-clearance-policy-v1.json",
  extendsDisagreementProtocol: "phase6a1-professor-plan-authority-adjudication-disagreement-protocol-v4.json",
  unresolvedGoldAuthorization: "PERMANENTLY_BLOCKED_UNTIL_ALL_FIELDS_RESOLVED",
  preRegisteredTieBreakBeforeProspectivePack: "NONE",
  additionalEvidenceBeforeProspectiveAdjudication:
    "No open-ended additional evidence path. Any new clearance criterion requires a sealed successor protocol amendment before prospective pack adjudication begins.",
  instruction:
    "GOLD_AMBIGUITY_BLOCK remains in force for production closure authorization until every authority gold field is resolved under the sealed rubric.",
});

writeJson("phase6a1-professor-plan-authority-roster-generator-source-audit-spec-v2.json", {
  version: "phase6a1-professor-plan-authority-roster-generator-source-audit-spec-v2",
  authorizedAt: SEALED_AT,
  supersedes: "phase6a1-professor-plan-authority-roster-generator-source-audit-spec-v1.json",
  attestationArtifact: "phase6a1-professor-plan-authority-roster-generator-source-audit-attestation-v1.json",
  auditedGeneratorSourceByteSha256: IMMUTABLE.rosterGeneratorV3Source,
  requiredAttestationChecks: [
    "uses phase6a1-exposed-benchmark-identities-manifest-v2 fail-closed freshness including spent roster-v2 identities",
    "uses benchmark-commander-eligibility-v1.single_commander via pinned eligibility contract and verified catalog state",
    "enforces global uniqueness and selection-policy-v3 replacement rules",
    "samples/shuffles from the complete fresh single-commander-eligible universe only",
    "NO hidden commander/theme/archetype/complexity/name filters beyond public eligibility + freshness policy",
    "uses predeclared selection algorithm with cryptographically strong secret seed/randomness",
    "hashes actual private roster FILE bytes for public commitment",
    "does not log seed or commander names to implementation-visible output",
    "material deck-resolution transitive sources match captured clean repository commit or deck-resolution-transitive-source-manifest-v1 pins",
  ],
  requiredInOperationalReadinessV2: true,
});

writeJson("phase6a1-professor-plan-serialization-pilot-spec-v7.json", {
  version: "phase6a1-professor-plan-serialization-pilot-spec-v7",
  authorizedAt: SEALED_AT,
  supersedes: "phase6a1-professor-plan-serialization-pilot-spec-v6.json",
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
    "run catalog-data-state verification and pin verification artifact",
    "real Professor production-equivalent run",
    "validator_v2",
    "deterministic serializer to runtime-input-v8",
    "Harmony validation on predeclared frozen spent outputs",
    "independent diff/review",
  ],
  extendsHarmonyEvidence: "phase6a1-professor-plan-serialization-pilot-harmony-evidence-v2.json",
  extendsCatalogVerificationSpec: "phase6a1-professor-plan-catalog-data-state-verification-spec-v1.json",
  requiredStackPinsSupersetOf: "phase6a1-professor-plan-professor-stack-freeze-manifest-v1.json",
  passArtifactMustPin: REQUIRED_STACK_PINS,
  singleStackPilotInvariant: {
    rule: "All five final passing serialization results and Harmony validation MUST be produced under one identical final stack.",
    stochasticRetryWithoutStackChange: "Allowed up to per-class retry limits.",
    anyRelevantChangeDuringPilot: [
      "Professor model/config/prompt",
      "validator",
      "retrieval/rules/tools",
      "dependencies/runtime",
      "serializer/publish contract",
      "catalog/deck-resolution data state",
    ],
    onAnyRelevantChange: "Invalidate all prior pilot case results; rerun complete 5-case pilot + Harmony under the new exact stack before PASS.",
  },
  pilotFinalityRule: {
    binding:
      "The final PASS artifact MUST pin the complete requiredStackPins superset, catalog verification artifact SHA, and one single final stack identity shared by all case results.",
    capturedV2MustMatchPassArtifactPinsExactly: true,
    anyRelevantStackOrCatalogChangeAfterPass: "INVALIDATES_PILOT_REQUIRES_RERUN",
  },
  nonVacuousPassRequirement: {
    allFiveFixedSlotsMustPass: true,
    eachSlotRequires: [
      "successful validator_v2 PASS on a produced plan",
      "completed lossless serialization of that validated plan to runtime-input-v8",
    ],
    retryExhaustionDisposition: "PILOT_BLOCK_FAIL",
    forbidden: "Treating UPSTREAM_PROFESSOR_FAILURE or VALIDATOR_FAILURE retry exhaustion as a passing perCommander result",
  },
  pilotFailureClasses: {
    UPSTREAM_PROFESSOR_FAILURE: "Real Professor run failed before a valid validated plan existed.",
    VALIDATOR_FAILURE: "validator_v2 rejected a produced plan for upstream validity reasons.",
    SERIALIZER_SCHEMA_FAILURE: "Serialized artifact failed runtime-input-v8 schema or structural integrity gates.",
    SERIALIZER_SEMANTIC_LOSS: "Serialization changed or lost required semantic fields.",
    HARMONY_RULE_FAILURE: "Predeclared Harmony frozen outputs failed bridge sufficiency rule checks.",
    STACK_PIN_MISMATCH: "Captured stack or catalog pins would not match PASS artifact requirements.",
    CATALOG_STATE_VERIFICATION_FAILURE: "Pinned catalog verifier failed closed against runtime loaded state.",
  },
  onFailByClass: {
    UPSTREAM_PROFESSOR_FAILURE: "Same-commander retry up to 2 additional attempts with NO stack change; exhaustion => PILOT BLOCK/FAIL.",
    VALIDATOR_FAILURE: "Same-commander retry up to 2 additional attempts with NO stack change after upstream repair; exhaustion => PILOT BLOCK/FAIL.",
    SERIALIZER_SCHEMA_FAILURE: "Repair serializer/schema; invalidate all prior results if stack changed; rerun all five + Harmony.",
    SERIALIZER_SEMANTIC_LOSS: "Repair serializer semantics; invalidate all prior results if stack changed; rerun all five + Harmony.",
    HARMONY_RULE_FAILURE: "Repair Harmony bridge handling; rerun Harmony validation on frozen evidence.",
    STACK_PIN_MISMATCH: "Repair stack/catalog pinning procedure; rerun full pilot.",
    CATALOG_STATE_VERIFICATION_FAILURE: "Repair runtime catalog loading to match commitment; rerun verification then full pilot.",
  },
  onFailDefault: "Fail closed: do not authorize stack capture, operational readiness, roster v3, or fresh holdout population.",
  passArtifact: {
    artifact: "phase6a1-professor-plan-serialization-pilot-pass-v1.json",
    requiredFields: [
      "pilotSpecVersion",
      "pilotSpecSha256",
      "singleFinalStackIdentity",
      "stackPins",
      "catalogDataStateVerificationByteSha256",
      "perCommanderResults",
      "harmonyEvidenceResults",
      "independentReviewerAttestation",
    ],
    macroPassRequires: "5/5 fixed slots with validator PASS + lossless serialization under the same singleFinalStackIdentity",
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
  prerequisite: "serialization-pilot-spec-v7 PASS artifact with single-stack non-vacuous success",
  mustMatchPilotPassArtifactStackPinsExactly: true,
  mustIncludeCatalogDataStateVerification: "phase6a1-professor-plan-catalog-data-state-verification-v1.json",
  instruction:
    "Write captured stack pins once to captured-v2.json immediately from the final passing pilot PASS artifact.",
});

writeJson("phase6a1-professor-plan-operational-readiness-sealed-v2-spec-v1.json", {
  version: "phase6a1-professor-plan-operational-readiness-sealed-v2-spec-v1",
  authorizedAt: SEALED_AT,
  status: "NOT_YET_CREATED",
  purpose: "Immutable operational readiness seal created only after pilot PASS, stack capture v2, and ACL proof.",
  preserveForever: ["phase6a1-professor-plan-operational-readiness-seal-v1.json"],
  completedArtifactTarget: "phase6a1-professor-plan-operational-readiness-sealed-v2.json",
  prerequisite:
    "serialization-pilot-spec-v7 PASS artifact and professor-stack-freeze-captured-v2.json matching pilot stack pins exactly",
  pinsOnCompletion: [
    "professor-stack-freeze-captured-v2.json byte SHA",
    "serialization-pilot-pass-v1.json byte SHA",
    "serialization-pilot-spec-v7.json byte SHA",
    "catalog-data-state-verification-v1.json byte SHA",
    "access boundary operational evidence",
    "singleFinalStackIdentity matching pilot PASS artifact exactly",
    "stackPins matching pilot PASS artifact exactly",
    "fullCatalogDataStateCommitment-v1 byte SHA",
    "deckResolutionDataStatePin-v1 byte SHA",
    "deckResolutionTransitiveSourceManifest-v1 byte SHA",
    "benchmark-commander-eligibility-contract-pin-v1.json byte SHA",
    "authority roster generator source byte SHA",
    "authority-roster-generator-source-audit-attestation-v1.json byte SHA",
    "reviewedGeneratorSourceByteSha256 in attestation",
    "capturedRepositoryCommitSha256 matching transitive source closure",
    "authority-adjudication-rubric-v4.json byte SHA",
    "exposed-benchmark-identities-manifest-v2.json byte SHA",
    "selection-policy-v3-freshness-manifest-v2-override-v1.json byte SHA",
  ],
});

const NORMATIVE_SEQUENCE = [
  "Seal protocol repair package v8",
  "Establish and prove separate authority access",
  "Run catalog-data-state verification; pin verification artifact",
  "Run serialization pilot under spec v7 with single-stack non-vacuous 5/5 success",
  "Write professor-stack-freeze-captured-v2.json matching final PASS artifact exactly",
  "Write operational-readiness-sealed-v2.json",
  "Generate roster v3; publish roster-commitment-v1",
  "ROSTER_COMMITMENT_SEALED_WAIT with strengthened generator source audit",
  "REPORT AND WAIT until roster audit clears",
  "Authority privately generates 24 real Professor cases",
  "validator_v2 + serialization + authority adjudication + seal hidden pack",
  "Independent benchmark integrity confirmation",
  "ONLY THEN authorize production closure implementation against DEV",
  "Implement closure against DEV; freeze closure code",
  "Evaluation runner loads hidden prospective inputs; run; commit outputs; open gold; score",
];

writeJson("phase6a1-professor-plan-prospective-pipeline-freeze-spec-v8.json", {
  version: "phase6a1-professor-plan-prospective-pipeline-freeze-spec-v8",
  authorizedAt: SEALED_AT,
  supersedes: "phase6a1-professor-plan-prospective-pipeline-freeze-spec-v7.json",
  extendsSerializationPilotSpec: "phase6a1-professor-plan-serialization-pilot-spec-v7.json",
  extendsHarmonyPilotEvidence: "phase6a1-professor-plan-serialization-pilot-harmony-evidence-v2.json",
  extendsCatalogVerificationSpec: "phase6a1-professor-plan-catalog-data-state-verification-spec-v1.json",
  extendsDeckResolutionTransitiveSourceManifest: "phase6a1-professor-plan-deck-resolution-transitive-source-manifest-v1.json",
  extendsAuthorityRosterGeneratorSourceAuditSpec: "phase6a1-professor-plan-authority-roster-generator-source-audit-spec-v2.json",
  extendsAuthorityGoldClearancePolicy: "phase6a1-professor-plan-authority-gold-clearance-policy-v2.json",
  extendsRosterCommitmentSealedWaitSpec: "phase6a1-professor-plan-roster-commitment-sealed-wait-spec-v2.json",
  immutablePendingArtifacts: {
    professorStackFreezeManifestV1: IMMUTABLE.professorStackFreezeManifestV1,
    professorStackFreezeCapturedV1: IMMUTABLE.professorStackFreezeCapturedV1,
    operationalReadinessSealV1: IMMUTABLE.operationalReadinessSealV1,
    selectionPolicyV3: IMMUTABLE.selectionPolicyV3,
    fullCatalogDataStateCommitmentV1: IMMUTABLE.fullCatalogDataStateCommitmentV1,
  },
  normativeSequence: NORMATIVE_SEQUENCE,
  productionClosureImplementation: "NOT_AUTHORIZED",
  status: "SPECIFICATION_SEALED_AWAITING_PROTOCOL_V8_REAUDIT_THEN_ACL_AND_PILOT",
});

writeJson("phase6a1-professor-plan-v2-benchmark-disposition-v16-architecture.json", {
  version: "phase6a1-professor-plan-v2-benchmark-disposition-v16-architecture",
  recordedAt: SEALED_AT,
  supersedes: "phase6a1-professor-plan-v2-benchmark-disposition-v15-architecture.json",
  architectureCore: "PASS_PRESERVE",
  auditReferences: {
    architectureV7IndependentReaudit: "phase6a1-professor-plan-benchmark-architecture-v7-independent-reaudit-gpt56sol-v1.json",
    architectureAmendmentBundleV8: "archv8.zip",
    architectureAmendmentBundleV8BytePin: "phase6a1-professor-plan-audit-bundle-archv8-byte-pin.json",
  },
  aclProofWork: "AUTHORIZED",
  serializationPilot: "NOT_AUTHORIZED_YET",
  instruction: "REPORT AND WAIT",
});

writeJson("phase6a1-professor-plan-post-gold-development-track-v16-architecture.json", {
  version: "phase6a1-professor-plan-post-gold-development-track-v16-architecture",
  updatedAt: SEALED_AT,
  supersedes: "phase6a1-professor-plan-post-gold-development-track-v15-architecture",
  decision: "ARCHITECTURE_AMENDMENT_V8_SEALED_WAIT",
  normativeArtifacts: {
    pipelineFreezeSpecV8: "phase6a1-professor-plan-prospective-pipeline-freeze-spec-v8.json",
    serializationPilotSpecV7: "phase6a1-professor-plan-serialization-pilot-spec-v7.json",
    serializationPilotHarmonyEvidenceV2: "phase6a1-professor-plan-serialization-pilot-harmony-evidence-v2.json",
    catalogDataStateVerificationSpecV1: "phase6a1-professor-plan-catalog-data-state-verification-spec-v1.json",
    deckResolutionTransitiveSourceManifestV1: "phase6a1-professor-plan-deck-resolution-transitive-source-manifest-v1.json",
    authorityRosterGeneratorSourceAuditSpecV2: "phase6a1-professor-plan-authority-roster-generator-source-audit-spec-v2.json",
    architectureSealedManifestV8: "phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v8.json",
  },
  instruction: "REPORT AND WAIT",
});

const pins: Record<string, { artifact: string; sha256: string }> = {
  pipelineFreezeSpecV8: {
    artifact: "phase6a1-professor-plan-prospective-pipeline-freeze-spec-v8.json",
    sha256: sha("phase6a1-professor-plan-prospective-pipeline-freeze-spec-v8.json"),
  },
  serializationPilotSpecV7: {
    artifact: "phase6a1-professor-plan-serialization-pilot-spec-v7.json",
    sha256: sha("phase6a1-professor-plan-serialization-pilot-spec-v7.json"),
  },
  serializationPilotHarmonyEvidenceV2: {
    artifact: "phase6a1-professor-plan-serialization-pilot-harmony-evidence-v2.json",
    sha256: sha("phase6a1-professor-plan-serialization-pilot-harmony-evidence-v2.json"),
  },
  catalogDataStateVerificationSpecV1: {
    artifact: "phase6a1-professor-plan-catalog-data-state-verification-spec-v1.json",
    sha256: sha("phase6a1-professor-plan-catalog-data-state-verification-spec-v1.json"),
  },
  catalogVerifierScript: {
    artifact: "web/scripts/run-phase6a1-verify-pinned-catalog-data-state-v1.ts",
    sha256: IMMUTABLE.catalogVerifierScript,
  },
  deckResolutionTransitiveSourceManifestV1: {
    artifact: "phase6a1-professor-plan-deck-resolution-transitive-source-manifest-v1.json",
    sha256: sha("phase6a1-professor-plan-deck-resolution-transitive-source-manifest-v1.json"),
  },
  authorityRosterGeneratorSourceAuditSpecV2: {
    artifact: "phase6a1-professor-plan-authority-roster-generator-source-audit-spec-v2.json",
    sha256: sha("phase6a1-professor-plan-authority-roster-generator-source-audit-spec-v2.json"),
  },
  authorityGoldClearancePolicyV2: {
    artifact: "phase6a1-professor-plan-authority-gold-clearance-policy-v2.json",
    sha256: sha("phase6a1-professor-plan-authority-gold-clearance-policy-v2.json"),
  },
  fullCatalogDataStateCommitmentV1: {
    artifact: "phase6a1-professor-plan-full-catalog-data-state-commitment-v1.json",
    sha256: IMMUTABLE.fullCatalogDataStateCommitmentV1,
  },
  deckResolutionDataStatePinV1: {
    artifact: "phase6a1-professor-plan-deck-resolution-data-state-pin-v1.json",
    sha256: IMMUTABLE.deckResolutionDataStatePinV1,
  },
  selectionPolicyV3Immutable: {
    artifact: "phase6a1-professor-plan-prospective-commander-selection-policy-v3.json",
    sha256: IMMUTABLE.selectionPolicyV3,
  },
  frozenAmendmentV8Archive: {
    artifact: "v8v8.zip",
    sha256: IMMUTABLE.frozenAmendmentV8Archive,
  },
  capturedV2Spec: {
    artifact: "phase6a1-professor-plan-professor-stack-freeze-captured-v2-spec-v1.json",
    sha256: sha("phase6a1-professor-plan-professor-stack-freeze-captured-v2-spec-v1.json"),
  },
  operationalReadinessSealedV2Spec: {
    artifact: "phase6a1-professor-plan-operational-readiness-sealed-v2-spec-v1.json",
    sha256: sha("phase6a1-professor-plan-operational-readiness-sealed-v2-spec-v1.json"),
  },
  architectureReauditV7: {
    artifact: "phase6a1-professor-plan-benchmark-architecture-v7-independent-reaudit-gpt56sol-v1.json",
    sha256: sha("phase6a1-professor-plan-benchmark-architecture-v7-independent-reaudit-gpt56sol-v1.json"),
  },
  benchmarkDispositionV16: {
    artifact: "phase6a1-professor-plan-v2-benchmark-disposition-v16-architecture.json",
    sha256: sha("phase6a1-professor-plan-v2-benchmark-disposition-v16-architecture.json"),
  },
  developmentTrackV16: {
    artifact: "phase6a1-professor-plan-post-gold-development-track-v16-architecture.json",
    sha256: sha("phase6a1-professor-plan-post-gold-development-track-v16-architecture.json"),
  },
};

writeJson("phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v8.json", {
  version: "phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v8",
  sealedAt: SEALED_AT,
  supersedes: "phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v7.json",
  decision: "ARCHITECTURE_AMENDMENT_V8_SEALED_WAIT",
  byteReproducibleSealScript: "web/scripts/run-phase6a1-seal-benchmark-architecture-v8.ts",
  archv8BundleBytePinArtifact: "phase6a1-professor-plan-audit-bundle-archv8-byte-pin.json",
  preservedV7Repairs: {
    sealedManifestV7Sha256: IMMUTABLE.sealedManifestV7,
    note: "Preserves gold ambiguity fail-closed, freshness override, roster WAIT, full stack pin vocabulary, and roster failure immutability.",
  },
  pins,
  instruction:
    "REPORT AND WAIT — await protocol v8 reaudit, then ACL proof and non-vacuous single-stack spent pilot under spec v7 with runtime catalog verification.",
});

console.log(JSON.stringify({ manifestSha256: sha("phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v8.json"), pins }, null, 2));
