#!/usr/bin/env npx tsx
/** Seal benchmark architecture package v7 — repairs archv6 audit blocks. Never mutates v3-pinned bytes. */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../..");
const OUT = resolve(REPO, "web/data/milestones/deck-synthesis");
const SEALED_AT = "2026-08-15T00:30:00.000Z";

const IMMUTABLE = {
  professorStackFreezeManifestV1: "47fb3cf2e1a6d34a7d22e124457db50055fb6194a3fed7cfdaae7871d8297664",
  professorStackFreezeCapturedV1: "be7a8f2c07c47962656215dd93208277d3fdf222b4a1fe627478ce0ab7c44d75",
  operationalReadinessSealV1: "488c4c6d7aa27c87acb667949017b834b829f1b0c2f40442bff6306377fc34f3",
  selectionPolicyV1: "28df0ec79a7c006ea40faad3599c1fba3194d72279c61ef76b30b954d8922398",
  selectionPolicyV2: "4a5a64af8c57cd7b2810319b8ee11ac4d714ee752a1307361241fe0d53a51fb3",
  selectionPolicyV3: "c741bb5374feb58fc9a37a93b0e423c7330b757c347e2df9bfaf9ffc3eb13b73",
  sealedManifestV6: "7bee773cd15c8d33831e1c9fdef282da2733f780b8259b6d21970e0c0fb082ac",
  exposedIdentitiesManifestV2: "899cf2e09dbb60e0b57bf98b00fc6c6f5eaca765cbab26b308d9e7f05b5100ef",
  freshnessOverrideV1: "3fea7f0fe4644c94894c656d41d966e5e77beb546783f0e197563a2189a2f397",
  eligibilityContractPinV1: "f95c754d2b8b308c1abb0f9fecd1241716182eca9de3554f77b1fdac544870fb",
  disagreementProtocolV4: "6c1ab7ef29d3824bc70aac71a5b2d6d8fdb964e14687de0ffebfbe261dc683c9",
  evaluationAScoringRubricV3: "da9e164e544dbbbac986e720260c74bc06d84ecec37a4637b1a3723dd0051eae",
  authorityAdjudicationRubricV4: "8bc3e79457ff061f1c92417cdb0711e9281c5424ffb239d228af7f1962bda382",
  rosterGeneratorV3Source: "991270999ca72aebcdbb97d8c8af1f5e1e7ad07e80819618798792d4f907ef72",
  firestoreCatalogManifestV2: "5077b8bfd947380b5f735e3f594b5073fa405d2a2d21aeb4849ae3d42e1a0b23",
  paperEligibilityIdentitiesV1: "ed3d4084ca5dbae7b936a9ab4e1c29e621bb6cda3a20974c64bd21132ab07c0a",
  deckResolutionSupplementV1: "1fb6ae92c9cf79e771d2595c6d0bdb34d83ed1382db87840d8404d2c1de47890",
  catalogVersion: "scryfall-oracle_cards:2026-08-05T21:03:08.408+00:00",
  fullOracleCardCount: 38542,
  fullCatalogPopulationHash: "986c26116efaea45a20bb0cffe388fc20340db47839300ce69127942681dcbc5",
  fullCatalogCardStructurePopulationHash: "e895859cc97510840751c17a4d8dccca985568cbbe59c4fe447d3d06f51b155d",
};

const DECK_RESOLUTION_SOURCE_PINS = {
  loadDeckResolutionCatalog: {
    path: "web/scripts/lib/load-deck-resolution-catalog.ts",
    sha256: "9e30c4c2108c3a175e835fef3074a82147b47eb53925b420fb59274d6c6debce",
  },
  deckResolutionSupplementType: {
    path: "web/scripts/lib/deck-resolution-supplement-v1.ts",
    sha256: "336c889c1c85fb67f92b69b94afb4835c8745e2e1e933ea28c6c3d286adaadcf",
  },
  benchmarkCommanderResolverV1: {
    path: "web/src/lib/deck-synthesis/benchmark-commander-resolver-v1.ts",
    sha256: "43a963204e3796a5a156595e47ffa4d9e3f513f4412f9bfe7301c89ffd6387b2",
  },
  deriveCommanderClassification: {
    path: "web/src/lib/deck-builder/commander-classification.ts",
    sha256: "351d300f095e5a682a9f9b805c594d80c3a6c4a7427057581c57d25d33d706c2",
  },
  benchmarkCommanderEligibilityV1: {
    path: "web/src/lib/deck-synthesis/benchmark-commander-eligibility-v1.ts",
    sha256: "1281074656bd7005be282263744dc8bb7500482d10a08fbfce15c1e399e20c17",
  },
  loadGoldenCatalogIndex: {
    path: "web/scripts/lib/load-golden-catalog-index.ts",
    sha256: "aaff4526fa3bad0b17fa7ef91b3293ef0c2c7a29f276b56af8d659a93ec29010",
  },
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
  ["phase6a1-professor-plan-professor-stack-freeze-manifest-v1.json", IMMUTABLE.professorStackFreezeManifestV1],
  ["phase6a1-professor-plan-professor-stack-freeze-captured-v1.json", IMMUTABLE.professorStackFreezeCapturedV1],
  ["phase6a1-professor-plan-operational-readiness-seal-v1.json", IMMUTABLE.operationalReadinessSealV1],
  ["phase6a1-professor-plan-prospective-commander-selection-policy-v3.json", IMMUTABLE.selectionPolicyV3],
  ["phase6a1-exposed-benchmark-identities-manifest-v2.json", IMMUTABLE.exposedIdentitiesManifestV2],
  ["phase6a1-professor-plan-selection-policy-v3-freshness-manifest-v2-override-v1.json", IMMUTABLE.freshnessOverrideV1],
  ["phase6a1-professor-plan-authority-adjudication-disagreement-protocol-v4.json", IMMUTABLE.disagreementProtocolV4],
  ["phase6a1-professor-plan-evaluation-a-scoring-rubric-v3.json", IMMUTABLE.evaluationAScoringRubricV3],
  ["phase6a1-professor-plan-authority-adjudication-rubric-v4.json", IMMUTABLE.authorityAdjudicationRubricV4],
  ["phase6a1-professor-plan-benchmark-commander-eligibility-contract-pin-v1.json", IMMUTABLE.eligibilityContractPinV1],
  ["phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v6.json", IMMUTABLE.sealedManifestV6],
]) {
  assertImmutable(file, expected);
}

for (const audit of [
  "phase6a1-professor-plan-benchmark-architecture-v5-independent-reaudit-gpt56sol-v1.json",
  "phase6a1-professor-plan-benchmark-architecture-v6-independent-reaudit-gpt56sol-v1.json",
]) {
  if (!existsSync(resolve(OUT, audit))) {
    throw new Error(`Missing required audit artifact in milestones: ${audit}`);
  }
}

writeJson("phase6a1-professor-plan-full-catalog-data-state-commitment-v1.json", {
  version: "phase6a1-professor-plan-full-catalog-data-state-commitment-v1",
  authorizedAt: SEALED_AT,
  supersedesIncompletePin: "phase6a1-professor-plan-golden-catalog-state-pin-spec-v1.json",
  purpose:
    "Deterministic full golden-catalog data state used for roster eligibility, canonical Oracle facts, and prospective Professor inputs.",
  catalogImportRunId: "catalog-shadow-parse-rc8-v2",
  catalogVersion: IMMUTABLE.catalogVersion,
  fullOracleCardCount: IMMUTABLE.fullOracleCardCount,
  fullCatalogPopulationHash: IMMUTABLE.fullCatalogPopulationHash,
  fullCatalogCardStructurePopulationHash: IMMUTABLE.fullCatalogCardStructurePopulationHash,
  firestoreCatalogManifestArtifact: "web/data/milestones/catalog-shadow/catalog-shadow-parse-rc8-firestore-v2-manifest.json",
  firestoreCatalogManifestByteSha256: IMMUTABLE.firestoreCatalogManifestV2,
  paperEligibilityIdentitiesArtifact: "web/data/milestones/catalog-shadow/catalog-paper-eligibility-identities-v1.jsonl",
  paperEligibilityIdentitiesByteSha256: IMMUTABLE.paperEligibilityIdentitiesV1,
  deckResolutionSupplementArtifact: "web/data/milestones/catalog-shadow/catalog-deck-resolution-supplement-v1.json",
  deckResolutionSupplementByteSha256: IMMUTABLE.deckResolutionSupplementV1,
  supplementaryAuditSliceOnly: {
    artifact: "phase6a1-benchmark-canonical-catalog-slice-v2.json",
    note: "66-record DEV36+HOLDOUT v8 audit slice only; NOT the full candidate universe and NOT sufficient alone.",
  },
  verificationRequirements: [
    "Uniform catalogVersion across all loaded Oracle records",
    "rawCatalogIdentitiesLoaded equals fullOracleCardCount",
    "paperPopulationHash and resolution supplement version match pinned artifacts",
    "Pilot commanders Korvold and Prosper MUST resolve against this full state, not the 66-record slice alone",
  ],
  instruction:
    "Pilot PASS, captured-v2, and operational-readiness-v2 MUST pin this commitment byte SHA exactly.",
});

writeJson("phase6a1-professor-plan-deck-resolution-data-state-pin-v1.json", {
  version: "phase6a1-professor-plan-deck-resolution-data-state-pin-v1",
  authorizedAt: SEALED_AT,
  purpose:
    "Pin the exact DeckResolutionCatalog eligibility path used by benchmark-commander-eligibility-v1, including paper/legalities/name-resolution inputs.",
  extendsFullCatalogCommitment: "phase6a1-professor-plan-full-catalog-data-state-commitment-v1.json",
  sourcePins: DECK_RESOLUTION_SOURCE_PINS,
  dataInputPins: {
    paperEligibilityIdentitiesArtifact: "web/data/milestones/catalog-shadow/catalog-paper-eligibility-identities-v1.jsonl",
    paperEligibilityIdentitiesByteSha256: IMMUTABLE.paperEligibilityIdentitiesV1,
    deckResolutionSupplementArtifact: "web/data/milestones/catalog-shadow/catalog-deck-resolution-supplement-v1.json",
    deckResolutionSupplementByteSha256: IMMUTABLE.deckResolutionSupplementV1,
  },
  affects: [
    "paperEligible",
    "commanderFormatLegal",
    "canOccupyCommandZone",
    "name resolution",
    "noncompetitive reasons",
    "official alias resolution",
  ],
  instruction:
    "Authority roster generation and prospective Professor canonical facts MUST load DeckResolutionCatalog under these exact source and data pins.",
});

writeJson("phase6a1-professor-plan-serialization-pilot-harmony-evidence-v1.json", {
  version: "phase6a1-professor-plan-serialization-pilot-harmony-evidence-v1",
  authorizedAt: SEALED_AT,
  purpose:
    "Predeclare already-spent real Professor outputs used for Harmony bridge rule validation before any pilot run.",
  usesFrozenSpentOutputsOnly: true,
  noPostHocCaseSelection: true,
  ifFiveFreshSerializationRunsLackNaturalHarmonyCoverage:
    "Harmony validation still uses only these predeclared spent outputs; do not add or substitute cases afterward.",
  harmonySufficientSpentOutput: {
    label: "HARMONY_SUFFICIENT",
    artifact:
      "web/data/milestones/deck-synthesis/phase6a1-professor-plan-experiment-v3-amended-v8/cases/single-tokens-krenko.json",
    artifactByteSha256: "36d3f588eb94713a0078bfb9d5cf3e1d60e4b54c8acae3347f048f5ae214f337",
    commander: "Krenko, Mob Boss",
    sourcePool: "amendment-v8-professor-population",
    harmonyDetermination: "DIFFERENTIATED",
    expectedBridgeRuleOutcome: "At least two distinct qualifying cross-engine bridge edges per harmony-bridge-sufficiency-v1",
  },
  harmonyInsufficientSpentOutput: {
    label: "HARMONY_INSUFFICIENT",
    artifact:
      "web/data/milestones/deck-synthesis/phase6a1-professor-plan-experiment-v3-amended-v8/cases/yuriko-ninja.json",
    artifactByteSha256: "caf23aebe2bf2b614130158f3dd0705692de7f3c592479ddf102137274e599e9",
    commander: "Yuriko, the Tiger's Shadow",
    sourcePool: "amendment-v8-professor-population",
    harmonyDetermination: "HARMONY_UNDERDETERMINED",
    expectedBridgeRuleOutcome: "Fewer than two distinct qualifying cross-engine bridge edges; HARMONY_UNDERDETERMINED handling applies",
  },
  validationMethod:
    "Apply harmony-bridge-sufficiency-v1 to the frozen spent outputs through validator_v2 + serializer path; independent reviewer attests both outcomes.",
});

writeJson("phase6a1-professor-plan-authority-gold-clearance-policy-v1.json", {
  version: "phase6a1-professor-plan-authority-gold-clearance-policy-v1",
  authorizedAt: SEALED_AT,
  extendsDisagreementProtocol: "phase6a1-professor-plan-authority-adjudication-disagreement-protocol-v4.json",
  unresolvedGoldAuthorization: "PERMANENTLY_BLOCKED_UNTIL_ALL_FIELDS_RESOLVED",
  preRegisteredTieBreakBeforeProspectivePack: "NONE",
  instruction:
    "GOLD_AMBIGUITY_BLOCK remains in force for production closure authorization until every authority gold field is resolved. Informational scoring may continue.",
});

writeJson("phase6a1-professor-plan-roster-commitment-sealed-wait-spec-v2.json", {
  version: "phase6a1-professor-plan-roster-commitment-sealed-wait-spec-v2",
  authorizedAt: SEALED_AT,
  supersedes: "phase6a1-professor-plan-roster-commitment-sealed-wait-spec-v1.json",
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
    "all commanders pass canonical eligibility on pinned full catalog + deck-resolution state",
    "replacement and alternate accounting matches selection-policy-v3",
    "private roster file byte SHA matches public roster-commitment-v1",
    "generator source byte SHA matches eligibility-contract-pin and attestation-v1",
    "generator source audit attestation byte SHA matches operational-readiness requirement",
  ],
  onAuditPass: "Clear WAIT gate; may proceed to authority-private 24-case Professor population",
  onAuditFail: {
    forbidHandEditingFailedRoster: true,
    forbidSelectiveCommanderSwap: true,
    failedRosterDisposition: "PRESERVE_AND_MARK_SPENT",
    failedCommitmentDisposition: "PRESERVE_AND_MARK_SPENT",
    retryPolicy:
      "If generator or protocol repair is required, generate a NEW roster version under the fixed audited rule with fresh secret randomness and logged provenance. Never mutate identities in the failed private roster.",
  },
});

writeJson("phase6a1-professor-plan-serialization-pilot-spec-v6.json", {
  version: "phase6a1-professor-plan-serialization-pilot-spec-v6",
  authorizedAt: SEALED_AT,
  supersedes: "phase6a1-professor-plan-serialization-pilot-spec-v5.json",
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
    "Predeclared Harmony spent outputs in serialization-pilot-harmony-evidence-v1 satisfy positive and negative bridge rule checks",
  ],
  extendsHarmonyEvidence: "phase6a1-professor-plan-serialization-pilot-harmony-evidence-v1.json",
  requiredStackPinsSupersetOf: "phase6a1-professor-plan-professor-stack-freeze-manifest-v1.json",
  passArtifactMustPin: REQUIRED_STACK_PINS,
  pilotFinalityRule: {
    binding:
      "The final PASS artifact MUST pin the complete requiredStackPins superset plus full catalog/deck-resolution data-state commitments.",
    capturedV2MustMatchPassArtifactPinsExactly: true,
    anyRelevantStackOrCatalogChangeAfterPass: "INVALIDATES_PILOT_REQUIRES_RERUN",
    noPostPassChangesBeforeCapture:
      "Any change to Professor, validator, retrieval, rules, tools, dependencies, serializer, publish contract, or catalog/data state after PASS requires a new pilot run and new PASS artifact.",
  },
  pilotFailureClasses: {
    UPSTREAM_PROFESSOR_FAILURE: "Real Professor run failed before a valid validated plan existed.",
    VALIDATOR_FAILURE: "validator_v2 rejected a produced plan for upstream validity reasons.",
    SERIALIZER_SCHEMA_FAILURE: "Serialized artifact failed runtime-input-v8 schema or structural integrity gates.",
    SERIALIZER_SEMANTIC_LOSS: "Serialization changed or lost required semantic fields.",
    HARMONY_RULE_FAILURE: "Predeclared Harmony spent outputs failed bridge sufficiency rule checks.",
    STACK_PIN_MISMATCH: "Captured stack or catalog pins would not match PASS artifact requirements.",
  },
  onFailByClass: {
    UPSTREAM_PROFESSOR_FAILURE:
      "Same-commander retry up to 2 additional attempts per pilot case; NOT evidence of serializer defect.",
    VALIDATOR_FAILURE:
      "Same-commander retry up to 2 additional attempts per pilot case after upstream repair; NOT default serializer repair.",
    SERIALIZER_SCHEMA_FAILURE: "Repair serializer/schema; rerun affected pilot cases.",
    SERIALIZER_SEMANTIC_LOSS: "Repair serializer semantics; rerun affected pilot cases.",
    HARMONY_RULE_FAILURE: "Repair Harmony bridge handling or evidence interpretation; rerun Harmony validation.",
    STACK_PIN_MISMATCH: "Repair stack/catalog pinning procedure; rerun full pilot.",
  },
  onFailDefault: "Fail closed: do not authorize stack capture, operational readiness, roster v3, or fresh holdout population.",
  passArtifact: {
    artifact: "phase6a1-professor-plan-serialization-pilot-pass-v1.json",
    requiredFields: [
      "pilotSpecVersion",
      "pilotSpecSha256",
      "stackPins",
      "fullCatalogDataStateCommitmentByteSha256",
      "deckResolutionDataStatePinByteSha256",
      "perCommanderResults",
      "harmonyEvidenceResults",
      "independentReviewerAttestation",
    ],
    perCommanderPassRequires: [
      "validator_v2 PASS on produced plan OR documented UPSTREAM/VALIDATOR failure class with retry exhaustion",
      "runtime-input-v8 schema PASS when serialization attempted",
      "mustPreserve checks PASS when serialization attempted",
      "deterministic byte integrity PASS when serialization attempted",
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
  prerequisite: "serialization-pilot-spec-v6 PASS artifact with complete stack pin superset satisfied",
  mustMatchPilotPassArtifactStackPinsExactly: true,
  mustIncludeFullCatalogDataStateCommitment: "phase6a1-professor-plan-full-catalog-data-state-commitment-v1.json",
  mustIncludeDeckResolutionDataStatePin: "phase6a1-professor-plan-deck-resolution-data-state-pin-v1.json",
  instruction:
    "Write captured stack pins once to captured-v2.json immediately from the final passing pilot PASS artifact. Any relevant stack or catalog change after PASS invalidates the pilot.",
});

writeJson("phase6a1-professor-plan-operational-readiness-sealed-v2-spec-v1.json", {
  version: "phase6a1-professor-plan-operational-readiness-sealed-v2-spec-v1",
  authorizedAt: SEALED_AT,
  status: "NOT_YET_CREATED",
  purpose: "Immutable operational readiness seal created only after pilot PASS, stack capture v2, and ACL proof.",
  preserveForever: ["phase6a1-professor-plan-operational-readiness-seal-v1.json"],
  completedArtifactTarget: "phase6a1-professor-plan-operational-readiness-sealed-v2.json",
  prerequisite:
    "serialization-pilot-spec-v6 PASS artifact and professor-stack-freeze-captured-v2.json matching pilot stack pins exactly",
  pinsOnCompletion: [
    "professor-stack-freeze-captured-v2.json byte SHA",
    "serialization-pilot-pass-v1.json byte SHA",
    "serialization-pilot-spec-v6.json byte SHA",
    "access boundary operational evidence",
    "stackPins matching pilot PASS artifact exactly",
    "fullCatalogDataStateCommitment-v1 byte SHA",
    "deckResolutionDataStatePin-v1 byte SHA",
    "benchmark-commander-eligibility-contract-pin-v1.json byte SHA",
    "authority roster generator source byte SHA",
    "authority-roster-generator-source-audit-attestation-v1.json byte SHA",
    "reviewedGeneratorSourceByteSha256 in attestation",
    "authority-adjudication-rubric-v4.json byte SHA",
    "exposed-benchmark-identities-manifest-v2.json byte SHA",
    "selection-policy-v3-freshness-manifest-v2-override-v1.json byte SHA",
  ],
  instruction:
    "Operational readiness v2 MUST cryptographically bind the independent generator source audit attestation, not only the generator source SHA.",
});

const NORMATIVE_SEQUENCE = [
  "Seal protocol repair package v7",
  "Establish and prove separate authority access (implementation cannot read authority-private roster/seed/generator logs)",
  "Run serialization pilot on spent commanders under spec v6 with complete stack/catalog pins and predeclared Harmony evidence; fail closed on any mismatch",
  "Write professor-stack-freeze-captured-v2.json matching the final passing pilot PASS artifact stack pins exactly",
  "Write operational-readiness-sealed-v2.json including full catalog/deck-resolution pins, generator audit attestation SHA, and ACL evidence",
  "Generate fresh authority-private roster v3 with secret seed; publish byte SHA in roster-commitment-v1 successor (never mutate selection-policy-v3)",
  "ROSTER_COMMITMENT_SEALED_WAIT: authority-side independent audit of roster commitment, freshness manifest-v2, eligibility on pinned catalog state, uniqueness, generator source audit attestation",
  "REPORT AND WAIT until roster-commitment audit clears",
  "Authority privately generates 24 real Professor cases",
  "validator_v2 + serialization + authority adjudication + seal hidden pack",
  "Independent benchmark integrity confirmation",
  "ONLY THEN authorize production closure implementation against DEV",
  "Implement closure against DEV; freeze closure code",
  "Evaluation runner loads hidden prospective inputs; run; commit outputs; open gold; score",
];

writeJson("phase6a1-professor-plan-prospective-pipeline-freeze-spec-v7.json", {
  version: "phase6a1-professor-plan-prospective-pipeline-freeze-spec-v7",
  authorizedAt: SEALED_AT,
  supersedes: "phase6a1-professor-plan-prospective-pipeline-freeze-spec-v6.json",
  extendsSelectionPolicy: "phase6a1-professor-plan-prospective-commander-selection-policy-v3.json",
  selectionPolicyV3Preservation: "Never mutate selection-policy-v3 bytes; roster byte SHA publishes via roster-commitment-v1 successor only.",
  extendsFreshnessManifestOverride: "phase6a1-professor-plan-selection-policy-v3-freshness-manifest-v2-override-v1.json",
  extendsExposedIdentitiesManifest: "phase6a1-exposed-benchmark-identities-manifest-v2.json",
  extendsFullCatalogDataStateCommitment: "phase6a1-professor-plan-full-catalog-data-state-commitment-v1.json",
  extendsDeckResolutionDataStatePin: "phase6a1-professor-plan-deck-resolution-data-state-pin-v1.json",
  extendsHarmonyPilotEvidence: "phase6a1-professor-plan-serialization-pilot-harmony-evidence-v1.json",
  extendsAuthorityGoldClearancePolicy: "phase6a1-professor-plan-authority-gold-clearance-policy-v1.json",
  extendsRosterCommitmentCompletedSpec: "phase6a1-professor-plan-prospective-commander-roster-commitment-v1-spec.json",
  extendsRosterCommitmentSealedWaitSpec: "phase6a1-professor-plan-roster-commitment-sealed-wait-spec-v2.json",
  extendsEligibilityContractPin: "phase6a1-professor-plan-benchmark-commander-eligibility-contract-pin-v1.json",
  extendsAuthorityRosterGeneratorSourceAuditSpec: "phase6a1-professor-plan-authority-roster-generator-source-audit-spec-v1.json",
  extendsCapturedStackCompletedSpec: "phase6a1-professor-plan-professor-stack-freeze-captured-v2-spec-v1.json",
  extendsOperationalReadinessCompletedSpec: "phase6a1-professor-plan-operational-readiness-sealed-v2-spec-v1.json",
  extendsSerializationPilotSpec: "phase6a1-professor-plan-serialization-pilot-spec-v6.json",
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
  status: "SPECIFICATION_SEALED_AWAITING_PROTOCOL_V7_REAUDIT_THEN_ACL_AND_PILOT",
});

writeJson("phase6a1-professor-plan-v2-benchmark-disposition-v15-architecture.json", {
  version: "phase6a1-professor-plan-v2-benchmark-disposition-v15-architecture",
  recordedAt: SEALED_AT,
  supersedes: "phase6a1-professor-plan-v2-benchmark-disposition-v14-architecture.json",
  architectureCore: "PASS_PRESERVE",
  selectionPolicyV3: "SEALED_PRESERVE_BYTES_FOREVER",
  auditReferences: {
    architectureV6IndependentReaudit: "phase6a1-professor-plan-benchmark-architecture-v6-independent-reaudit-gpt56sol-v1.json",
    architectureAmendmentBundleV7: "archv7.zip",
    architectureAmendmentBundleV7BytePin: "phase6a1-professor-plan-audit-bundle-archv7-byte-pin.json",
  },
  aclProofWork: "AUTHORIZED",
  serializationPilot: "NOT_AUTHORIZED_YET",
  prospectiveRosterV3: "NOT_AUTHORIZED",
  prospectiveProfessorPopulation: "NOT_AUTHORIZED",
  productionClosureImplementation: "NOT_AUTHORIZED",
  instruction: "REPORT AND WAIT",
});

writeJson("phase6a1-professor-plan-post-gold-development-track-v15-architecture.json", {
  version: "phase6a1-professor-plan-post-gold-development-track-v15-architecture",
  updatedAt: SEALED_AT,
  supersedes: "phase6a1-professor-plan-post-gold-development-track-v14-architecture",
  decision: "ARCHITECTURE_AMENDMENT_V7_SEALED_WAIT",
  normativeArtifacts: {
    pipelineFreezeSpecV7: "phase6a1-professor-plan-prospective-pipeline-freeze-spec-v7.json",
    fullCatalogDataStateCommitmentV1: "phase6a1-professor-plan-full-catalog-data-state-commitment-v1.json",
    deckResolutionDataStatePinV1: "phase6a1-professor-plan-deck-resolution-data-state-pin-v1.json",
    serializationPilotSpecV6: "phase6a1-professor-plan-serialization-pilot-spec-v6.json",
    serializationPilotHarmonyEvidenceV1: "phase6a1-professor-plan-serialization-pilot-harmony-evidence-v1.json",
    rosterCommitmentSealedWaitSpecV2: "phase6a1-professor-plan-roster-commitment-sealed-wait-spec-v2.json",
    authorityGoldClearancePolicyV1: "phase6a1-professor-plan-authority-gold-clearance-policy-v1.json",
    architectureSealedManifestV7: "phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v7.json",
  },
  instruction: "REPORT AND WAIT",
});

const pins: Record<string, { artifact: string; sha256: string }> = {
  pipelineFreezeSpecV7: {
    artifact: "phase6a1-professor-plan-prospective-pipeline-freeze-spec-v7.json",
    sha256: sha("phase6a1-professor-plan-prospective-pipeline-freeze-spec-v7.json"),
  },
  selectionPolicyV3Immutable: {
    artifact: "phase6a1-professor-plan-prospective-commander-selection-policy-v3.json",
    sha256: IMMUTABLE.selectionPolicyV3,
  },
  freshnessManifestOverrideV1: {
    artifact: "phase6a1-professor-plan-selection-policy-v3-freshness-manifest-v2-override-v1.json",
    sha256: IMMUTABLE.freshnessOverrideV1,
  },
  fullCatalogDataStateCommitmentV1: {
    artifact: "phase6a1-professor-plan-full-catalog-data-state-commitment-v1.json",
    sha256: sha("phase6a1-professor-plan-full-catalog-data-state-commitment-v1.json"),
  },
  deckResolutionDataStatePinV1: {
    artifact: "phase6a1-professor-plan-deck-resolution-data-state-pin-v1.json",
    sha256: sha("phase6a1-professor-plan-deck-resolution-data-state-pin-v1.json"),
  },
  serializationPilotHarmonyEvidenceV1: {
    artifact: "phase6a1-professor-plan-serialization-pilot-harmony-evidence-v1.json",
    sha256: sha("phase6a1-professor-plan-serialization-pilot-harmony-evidence-v1.json"),
  },
  serializationPilotSpecV6: {
    artifact: "phase6a1-professor-plan-serialization-pilot-spec-v6.json",
    sha256: sha("phase6a1-professor-plan-serialization-pilot-spec-v6.json"),
  },
  rosterCommitmentSealedWaitSpecV2: {
    artifact: "phase6a1-professor-plan-roster-commitment-sealed-wait-spec-v2.json",
    sha256: sha("phase6a1-professor-plan-roster-commitment-sealed-wait-spec-v2.json"),
  },
  authorityGoldClearancePolicyV1: {
    artifact: "phase6a1-professor-plan-authority-gold-clearance-policy-v1.json",
    sha256: sha("phase6a1-professor-plan-authority-gold-clearance-policy-v1.json"),
  },
  disagreementProtocolV4: {
    artifact: "phase6a1-professor-plan-authority-adjudication-disagreement-protocol-v4.json",
    sha256: IMMUTABLE.disagreementProtocolV4,
  },
  evaluationAScoringRubricV3: {
    artifact: "phase6a1-professor-plan-evaluation-a-scoring-rubric-v3.json",
    sha256: IMMUTABLE.evaluationAScoringRubricV3,
  },
  authorityAdjudicationRubricV4: {
    artifact: "phase6a1-professor-plan-authority-adjudication-rubric-v4.json",
    sha256: IMMUTABLE.authorityAdjudicationRubricV4,
  },
  exposedIdentitiesManifestV2: {
    artifact: "phase6a1-exposed-benchmark-identities-manifest-v2.json",
    sha256: IMMUTABLE.exposedIdentitiesManifestV2,
  },
  eligibilityContractPinV1: {
    artifact: "phase6a1-professor-plan-benchmark-commander-eligibility-contract-pin-v1.json",
    sha256: IMMUTABLE.eligibilityContractPinV1,
  },
  capturedV2Spec: {
    artifact: "phase6a1-professor-plan-professor-stack-freeze-captured-v2-spec-v1.json",
    sha256: sha("phase6a1-professor-plan-professor-stack-freeze-captured-v2-spec-v1.json"),
  },
  operationalReadinessSealedV2Spec: {
    artifact: "phase6a1-professor-plan-operational-readiness-sealed-v2-spec-v1.json",
    sha256: sha("phase6a1-professor-plan-operational-readiness-sealed-v2-spec-v1.json"),
  },
  authorityRosterGeneratorSourceAuditSpecV1: {
    artifact: "phase6a1-professor-plan-authority-roster-generator-source-audit-spec-v1.json",
    sha256: sha("phase6a1-professor-plan-authority-roster-generator-source-audit-spec-v1.json"),
  },
  rosterCommitmentSpecV1: {
    artifact: "phase6a1-professor-plan-prospective-commander-roster-commitment-v1-spec.json",
    sha256: sha("phase6a1-professor-plan-prospective-commander-roster-commitment-v1-spec.json"),
  },
  benchmarkDispositionV15: {
    artifact: "phase6a1-professor-plan-v2-benchmark-disposition-v15-architecture.json",
    sha256: sha("phase6a1-professor-plan-v2-benchmark-disposition-v15-architecture.json"),
  },
  developmentTrackV15: {
    artifact: "phase6a1-professor-plan-post-gold-development-track-v15-architecture.json",
    sha256: sha("phase6a1-professor-plan-post-gold-development-track-v15-architecture.json"),
  },
  architectureReauditV6: {
    artifact: "phase6a1-professor-plan-benchmark-architecture-v6-independent-reaudit-gpt56sol-v1.json",
    sha256: sha("phase6a1-professor-plan-benchmark-architecture-v6-independent-reaudit-gpt56sol-v1.json"),
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

writeJson("phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v7.json", {
  version: "phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v7",
  sealedAt: SEALED_AT,
  supersedes: "phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v6.json",
  decision: "ARCHITECTURE_AMENDMENT_V7_SEALED_WAIT",
  byteReproducibleSealScript: "web/scripts/run-phase6a1-seal-benchmark-architecture-v7.ts",
  archv7BundleBytePinArtifact: "phase6a1-professor-plan-audit-bundle-archv7-byte-pin.json",
  immutablePendingArtifacts: {
    professorStackFreezeManifestV1: IMMUTABLE.professorStackFreezeManifestV1,
    professorStackFreezeCapturedV1: IMMUTABLE.professorStackFreezeCapturedV1,
    operationalReadinessSealV1: IMMUTABLE.operationalReadinessSealV1,
    selectionPolicyV3: IMMUTABLE.selectionPolicyV3,
  },
  preservedV6Repairs: {
    sealedManifestV6Sha256: IMMUTABLE.sealedManifestV6,
    note: "All successful v6 repairs preserved; v7 replaces incomplete catalog pin, completes stack freeze, predeclares Harmony evidence, classifies pilot failures, pins generator audit attestation, and tightens roster audit failure handling.",
  },
  pins,
  instruction:
    "REPORT AND WAIT — await protocol v7 reaudit, then ACL proof and spent serialization pilot under spec v6 with full stack/catalog binding.",
});

console.log(JSON.stringify({ manifestSha256: sha("phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v7.json"), pins }, null, 2));
