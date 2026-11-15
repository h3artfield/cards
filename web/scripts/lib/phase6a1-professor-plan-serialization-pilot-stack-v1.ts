/**
 * Compute singleFinalStackIdentity and stack pins for serialization pilot v8.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { PROFESSOR_PLANNING_CONTRACTS_V2_VERSION } from "../../src/lib/deck-synthesis/professor-planning-contracts-v2";
import { STRATEGY_PACKAGE_VALIDATOR_V2_VERSION } from "../../src/lib/deck-synthesis/strategy-package-validator-v2";
import { FROZEN_SEMANTIC_OPPORTUNITY_MODEL_V322_SHA256 } from "./phase6a1-frozen-semantic-opportunity-v322-loader-v1";
import { PROFESSOR_PLAN_AGENT_V2_VERSION } from "./phase6a1-professor-plan-agent-v2";
import { PROFESSOR_PLAN_CONTEXT_BUILDER_V2_VERSION } from "./phase6a1-professor-plan-context-builder-v2";
import { PROFESSOR_PLAN_NORMALIZER_V2_VERSION } from "./phase6a1-professor-plan-normalizer-v2";
import { PROFESSOR_PLAN_PROMPT_V2_VERSION } from "./phase6a1-professor-plan-prompt-v2";
import { loadProfessorModelPinV2 } from "./phase6a1-professor-plan-model-pin-v2";
import { THREE_LENS_PORTFOLIO_SELECTOR_V5_VERSION } from "./phase6a1-three-lens-portfolio-selector-v5";
import { PACKAGE_SYNERGY_GRAPH_V8_VERSION } from "./phase6a1-package-synergy-graph-v8";
import { assertMtgRagRetrievalSemanticFreezeV1 } from "./phase6a1-mtg-rag-retrieval-semantic-freeze-v1";
import { PROFESSOR_PLAN_SERIALIZER_V1_VERSION } from "./phase6a1-professor-plan-serializer-v1";
import { PROFESSOR_PLAN_SERIALIZATION_LOSSLESSNESS_V1_VERSION } from "./phase6a1-professor-plan-serialization-losslessness-v1";
import { PROFESSOR_PLAN_SERIALIZATION_HARMONY_V1_VERSION } from "./phase6a1-professor-plan-serialization-harmony-v1";
import { PROFESSOR_PLAN_SERIALIZATION_SEMANTIC_PROJECTION_V1_VERSION } from "./phase6a1-professor-plan-serialization-semantic-projection-v1";
import { SERIALIZATION_PILOT_ARTIFACT_ROUTING_V1_VERSION } from "./phase6a1-serialization-pilot-artifact-routing-v1";
import { PROFESSOR_PLAN_RUNTIME_INPUT_V8_SCHEMA_VALIDATOR_V1_VERSION } from "./phase6a1-professor-plan-runtime-input-v8-schema-validator-v1";
import {
  SPENT_PILOT_TRUTH_LOADER_V1_VERSION,
  getSpentPilotMechanismTruthSupplementSha256,
  getSpentPilotOpportunitySupplementSha256,
  getSpentPilotOpportunitySupplementV2Sha256,
} from "./phase6a1-spent-pilot-truth-loader-v1";
import { FROZEN_TRUTH_SHA256 } from "./phase6a1-independent-truth-loader-v1";
import {
  CATALOG_VERIFIER_PATH,
  MECHANISM_TRUTH_SUPPLEMENT_ARTIFACT,
  OPPORTUNITY_SUPPLEMENT_ARTIFACT,
  OPPORTUNITY_SUPPLEMENT_V2_ARTIFACT,
  PILOT_SPEC_PATH,
} from "./phase6a1-serialization-pilot-v8-config-v1";
import { CONTAINER_IMAGE_DIGEST, REPO, sha256File } from "./phase6a1-pinned-implementation-container-v1";
import { RUNTIME_SCHEMA_V8 } from "./phase6a1-semantic-fixture-builder-v8";
import { SEMANTIC_OPPORTUNITY_FACT_FAMILY_RULES_V1_VERSION } from "./phase6a1-semantic-opportunity-fact-family-rules-v1";
import { PROFESSOR_PLAN_CONTEXT_PREFLIGHT_V1_VERSION } from "./phase6a1-professor-plan-context-preflight-v1";
import { SEMANTIC_OPPORTUNITY_FIDELITY_AUDIT_V1_VERSION } from "./phase6a1-semantic-opportunity-fidelity-audit-v1";

export const PROFESSOR_PLAN_SERIALIZATION_PILOT_STACK_V1_VERSION =
  "phase6a1-professor-plan-serialization-pilot-stack-v1";

const RUNTIME_SCHEMA_SIDEcar = resolve(
  REPO,
  "web/data/milestones/deck-synthesis/phase6a1-semantic-closure-runtime-input-schema-v8.json",
);
const COMMITMENT_V2 = resolve(
  REPO,
  "web/data/milestones/deck-synthesis/phase6a1-professor-plan-full-catalog-data-state-commitment-v2.json",
);
const DECK_RES_PIN_V2 = resolve(
  REPO,
  "web/data/milestones/deck-synthesis/phase6a1-professor-plan-deck-resolution-data-state-pin-v2.json",
);
const DECK_RES_MANIFEST = resolve(
  REPO,
  "web/data/milestones/deck-synthesis/phase6a1-professor-plan-deck-resolution-transitive-source-manifest-v2.json",
);
const LOCKFILE = resolve(REPO, "web/package-lock.json");

export type RepositoryIdentityPin = {
  commitSha256: string;
  branchOrTag: string;
  dirtyWorktreeStatus: string;
};

export type ImplementationExecutionTreePin = {
  manifestSha256: string;
  fileCount: number;
  archiveByteSha256: string;
  overlayFileCount: number;
};

function git(args: string[]): string {
  const result = spawnSync("git", args, { cwd: REPO, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed`);
  return (result.stdout ?? "").trim();
}

function sha256Text(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export function resolveRepositoryIdentityPin(): RepositoryIdentityPin {
  const pinned = process.env.PHASE6A1_PINNED_REPOSITORY_IDENTITY?.trim();
  if (pinned) return JSON.parse(pinned) as RepositoryIdentityPin;
  if (process.env.PHASE6A1_IMPLEMENTATION_CONTAINER === "1") {
    throw new Error("FAIL_CLOSED: PHASE6A1_PINNED_REPOSITORY_IDENTITY required inside implementation container");
  }
  const dirty = git(["status", "--porcelain"]);
  return {
    commitSha256: git(["rev-parse", "HEAD"]),
    branchOrTag: git(["rev-parse", "--abbrev-ref", "HEAD"]),
    dirtyWorktreeStatus: dirty.length === 0 ? "clean" : "dirty",
  };
}

export function resolveImplementationExecutionTreePin(
  override?: ImplementationExecutionTreePin,
): ImplementationExecutionTreePin {
  if (override) return override;
  const pinned = process.env.PHASE6A1_IMPLEMENTATION_EXECUTION_TREE_MANIFEST?.trim();
  if (pinned) return JSON.parse(pinned) as ImplementationExecutionTreePin;
  if (process.env.PHASE6A1_IMPLEMENTATION_CONTAINER === "1") {
    throw new Error("FAIL_CLOSED: PHASE6A1_IMPLEMENTATION_EXECUTION_TREE_MANIFEST required inside implementation container");
  }
  return {
    manifestSha256: "HOST_PREFLIGHT_EXECUTION_TREE_NOT_BOUND",
    fileCount: 0,
    archiveByteSha256: "HOST_PREFLIGHT_EXECUTION_TREE_NOT_BOUND",
    overlayFileCount: 0,
  };
}

export type PilotStackIdentityInputs = {
  repository: RepositoryIdentityPin;
  implementationExecutionTree: ImplementationExecutionTreePin;
  professor: {
    modelId: string;
    modelConfigSha256: string;
    promptOrAgentVersion: string;
    agentSourceSha256: string;
    contextBuilderSourceSha256: string;
    normalizerSourceSha256: string;
    threeLensSelectorSourceSha256: string;
    synergyGraphSourceSha256: string;
  };
  validator: { validatorVersion: string; validatorSourceSha256: string };
  retrieval: {
    retrievalServiceVersion: string;
    rankingConfigSha256: string;
    corpusVersion: string;
    embeddingModelVersion: string;
  };
  rules: { rulesSourceVersion: string; rulesSnapshotSha256: string };
  tools: { enabledToolsList: string[]; toolPermissionsPolicySha256: string };
  dependencies: { lockfileSha256: string; runtimeEnvironmentDigest: string };
  closureInput: {
    runtimeSchemaSidecarSha256: string;
    serializerVersion: string;
    publishContractSha256: string;
  };
  catalogDataState: {
    fullCatalogDataStateCommitmentByteSha256: string;
    deckResolutionDataStatePinByteSha256: string;
    deckResolutionTransitiveSourceManifestByteSha256: string;
    catalogDataStateVerificationByteSha256: string;
  };
  spentPilotSupplements: {
    mechanismTruthSupplementByteSha256: string;
    opportunitySupplementByteSha256: string;
    opportunitySupplementV2ByteSha256: string;
  };
  semanticOpportunityRepair: {
    factFamilyRulesVersion: string;
  factFamilyRulesSourceSha256: string;
  contextPreflightVersion: string;
  contextPreflightSourceSha256: string;
  fidelityAuditVersion: string;
  fidelityAuditSourceSha256: string;
  opportunityCoverageAuditV2Artifact: string;
    opportunityCoverageAuditV2ByteSha256: string;
    normalizerSatisfiabilityAuditV2Artifact: string;
    normalizerSatisfiabilityAuditV2ByteSha256: string;
    contextPreflightAuditV1Artifact: string;
    contextPreflightAuditV1ByteSha256: string;
  };
  pilotInfrastructure: {
    pilotRunnerSha256: string;
    pilotRunnerContainerWrapperSha256: string;
    pinnedContainerHelperSha256: string;
    configSourceSha256: string;
    serializerSourceSha256: string;
    losslessnessSourceSha256: string;
    semanticProjectionSourceSha256: string;
    runtimeInputV8SchemaValidatorSourceSha256: string;
    artifactRoutingSourceSha256: string;
    harmonySourceSha256: string;
    stackIdentitySourceSha256: string;
    spentPilotTruthLoaderSha256: string;
    spentPilotAdjudicationSourceSha256: string;
    pilotSpecSha256: string;
  };
};

export function buildPilotStackIdentityInputs(args: {
  pilotRunnerPath: string;
  pilotRunnerContainerWrapperPath: string;
  pinnedContainerHelperPath: string;
  configPath: string;
  serializerPath: string;
  losslessnessPath: string;
  semanticProjectionPath: string;
  runtimeInputV8SchemaValidatorPath: string;
  artifactRoutingPath: string;
  harmonyPath: string;
  stackIdentityPath: string;
  spentPilotTruthLoaderPath: string;
  spentPilotAdjudicationPath: string;
  implementationExecutionTree?: ImplementationExecutionTreePin;
}): PilotStackIdentityInputs {
  const ragFreeze = assertMtgRagRetrievalSemanticFreezeV1();
  const modelPin = loadProfessorModelPinV2();
  const commitmentSha = sha256File(COMMITMENT_V2);
  const opportunityCoverageAuditPath = resolve(
    REPO,
    "web/data/milestones/deck-synthesis/phase6a1-spent-pilot-opportunity-coverage-audit-v2.json",
  );
  const normalizerSatisfiabilityAuditPath = resolve(
    REPO,
    "web/data/milestones/deck-synthesis/phase6a1-spent-pilot-normalizer-satisfiability-audit-v2.json",
  );
  const contextPreflightAuditPath = resolve(
    REPO,
    "web/data/milestones/deck-synthesis/phase6a1-professor-plan-context-preflight-audit-v1.json",
  );

  return {
    repository: resolveRepositoryIdentityPin(),
    implementationExecutionTree: resolveImplementationExecutionTreePin(args.implementationExecutionTree),
    professor: {
      modelId: modelPin.modelIdentifier,
      modelConfigSha256: modelPin.sha256,
      promptOrAgentVersion: PROFESSOR_PLAN_PROMPT_V2_VERSION,
      agentSourceSha256: sha256File(resolve(REPO, "web/scripts/lib/phase6a1-professor-plan-agent-v2.ts")),
      contextBuilderSourceSha256: sha256File(resolve(REPO, "web/scripts/lib/phase6a1-professor-plan-context-builder-v2.ts")),
      normalizerSourceSha256: sha256File(resolve(REPO, "web/scripts/lib/phase6a1-professor-plan-normalizer-v2.ts")),
      threeLensSelectorSourceSha256: sha256File(resolve(REPO, "web/scripts/lib/phase6a1-three-lens-portfolio-selector-v5.ts")),
      synergyGraphSourceSha256: sha256File(resolve(REPO, "web/scripts/lib/phase6a1-package-synergy-graph-v8.ts")),
    },
    validator: {
      validatorVersion: STRATEGY_PACKAGE_VALIDATOR_V2_VERSION,
      validatorSourceSha256: sha256File(resolve(REPO, "web/src/lib/deck-synthesis/strategy-package-validator-v2.ts")),
    },
    retrieval: {
      retrievalServiceVersion: ragFreeze.serviceVersion,
      rankingConfigSha256: sha256File(resolve(REPO, "web/src/lib/mtg-rag/retrieval-ranking.ts")),
      corpusVersion: ragFreeze.version,
      embeddingModelVersion: ragFreeze.rankingVersion,
    },
    rules: {
      rulesSourceVersion: "phase6a1-semantic-evidence-v3",
      rulesSnapshotSha256: sha256File(resolve(REPO, "web/scripts/lib/phase6a1-semantic-evidence-v3.ts")),
    },
    tools: {
      enabledToolsList: [
        "searchMtgKnowledge",
        "inspectCommanderFacts",
        "inspectSemanticOpportunities",
        "getCard",
        "explainCardSemantics",
      ],
      toolPermissionsPolicySha256: sha256File(resolve(REPO, "web/scripts/lib/phase6a1-professor-plan-prompt-v2.ts")),
    },
    dependencies: {
      lockfileSha256: sha256File(LOCKFILE),
      runtimeEnvironmentDigest: CONTAINER_IMAGE_DIGEST,
    },
    closureInput: {
      runtimeSchemaSidecarSha256: sha256File(RUNTIME_SCHEMA_SIDEcar),
      serializerVersion: PROFESSOR_PLAN_SERIALIZER_V1_VERSION,
      publishContractSha256: sha256Text(
        [PROFESSOR_PLANNING_CONTRACTS_V2_VERSION, RUNTIME_SCHEMA_V8, PROFESSOR_PLAN_SERIALIZER_V1_VERSION].join("|"),
      ),
    },
    catalogDataState: {
      fullCatalogDataStateCommitmentByteSha256: commitmentSha,
      deckResolutionDataStatePinByteSha256: sha256File(DECK_RES_PIN_V2),
      deckResolutionTransitiveSourceManifestByteSha256: sha256File(DECK_RES_MANIFEST),
      catalogDataStateVerificationByteSha256: existsSync(CATALOG_VERIFIER_PATH)
        ? sha256File(CATALOG_VERIFIER_PATH)
        : "PENDING_INDEPENDENT_VERIFIER_PASS",
    },
    spentPilotSupplements: {
      mechanismTruthSupplementByteSha256: getSpentPilotMechanismTruthSupplementSha256(),
      opportunitySupplementByteSha256: getSpentPilotOpportunitySupplementSha256(),
      opportunitySupplementV2ByteSha256: getSpentPilotOpportunitySupplementV2Sha256(),
    },
    semanticOpportunityRepair: {
      factFamilyRulesVersion: SEMANTIC_OPPORTUNITY_FACT_FAMILY_RULES_V1_VERSION,
      factFamilyRulesSourceSha256: sha256File(
        resolve(REPO, "web/scripts/lib/phase6a1-semantic-opportunity-fact-family-rules-v1.ts"),
      ),
      contextPreflightVersion: PROFESSOR_PLAN_CONTEXT_PREFLIGHT_V1_VERSION,
      contextPreflightSourceSha256: sha256File(
        resolve(REPO, "web/scripts/lib/phase6a1-professor-plan-context-preflight-v1.ts"),
      ),
      fidelityAuditVersion: SEMANTIC_OPPORTUNITY_FIDELITY_AUDIT_V1_VERSION,
      fidelityAuditSourceSha256: sha256File(
        resolve(REPO, "web/scripts/lib/phase6a1-semantic-opportunity-fidelity-audit-v1.ts"),
      ),
      opportunityCoverageAuditV2Artifact: "phase6a1-spent-pilot-opportunity-coverage-audit-v2.json",
      opportunityCoverageAuditV2ByteSha256: existsSync(opportunityCoverageAuditPath)
        ? sha256File(opportunityCoverageAuditPath)
        : "PENDING_OPPORTUNITY_COVERAGE_AUDIT_V2",
      normalizerSatisfiabilityAuditV2Artifact: "phase6a1-spent-pilot-normalizer-satisfiability-audit-v2.json",
      normalizerSatisfiabilityAuditV2ByteSha256: existsSync(normalizerSatisfiabilityAuditPath)
        ? sha256File(normalizerSatisfiabilityAuditPath)
        : "PENDING_NORMALIZER_SATISFIABILITY_AUDIT_V2",
      contextPreflightAuditV1Artifact: "phase6a1-professor-plan-context-preflight-audit-v1.json",
      contextPreflightAuditV1ByteSha256: existsSync(contextPreflightAuditPath)
        ? sha256File(contextPreflightAuditPath)
        : "PENDING_CONTEXT_PREFLIGHT_AUDIT_V1",
    },
    pilotInfrastructure: {
      pilotRunnerSha256: sha256File(args.pilotRunnerPath),
      pilotRunnerContainerWrapperSha256: sha256File(args.pilotRunnerContainerWrapperPath),
      pinnedContainerHelperSha256: sha256File(args.pinnedContainerHelperPath),
      configSourceSha256: sha256File(args.configPath),
      serializerSourceSha256: sha256File(args.serializerPath),
      losslessnessSourceSha256: sha256File(args.losslessnessPath),
      semanticProjectionSourceSha256: sha256File(args.semanticProjectionPath),
      runtimeInputV8SchemaValidatorSourceSha256: sha256File(args.runtimeInputV8SchemaValidatorPath),
      artifactRoutingSourceSha256: sha256File(args.artifactRoutingPath),
      harmonySourceSha256: sha256File(args.harmonyPath),
      stackIdentitySourceSha256: sha256File(args.stackIdentityPath),
      spentPilotTruthLoaderSha256: sha256File(args.spentPilotTruthLoaderPath),
      spentPilotAdjudicationSourceSha256: sha256File(args.spentPilotAdjudicationPath),
      pilotSpecSha256: sha256File(PILOT_SPEC_PATH),
    },
  };
}

export function computeSingleFinalStackIdentity(inputs: PilotStackIdentityInputs): string {
  return sha256Text(JSON.stringify(inputs));
}

export function assertCatalogVerifierPassPresent(): { sha256: string } {
  if (!existsSync(CATALOG_VERIFIER_PATH)) {
    throw new Error(
      "FAIL_CLOSED: catalog verifier v2 artifact missing — independent verifier PASS required before pilot execution",
    );
  }
  const raw = readFileSync(CATALOG_VERIFIER_PATH, "utf8");
  const parsed = JSON.parse(raw) as { pass?: boolean };
  if (!parsed.pass) {
    throw new Error("FAIL_CLOSED: catalog verifier v2 artifact is not PASS");
  }
  return { sha256: sha256Text(raw) };
}

export const FROZEN_TRUTH_PINS = FROZEN_TRUTH_SHA256;
export const FROZEN_OPPORTUNITY_PIN = FROZEN_SEMANTIC_OPPORTUNITY_MODEL_V322_SHA256;
export const SPENT_PILOT_TRUTH_LOADER_VERSION = SPENT_PILOT_TRUTH_LOADER_V1_VERSION;
export const PROFESSOR_COMPONENT_VERSIONS = {
  agent: PROFESSOR_PLAN_AGENT_V2_VERSION,
  contextBuilder: PROFESSOR_PLAN_CONTEXT_BUILDER_V2_VERSION,
  normalizer: PROFESSOR_PLAN_NORMALIZER_V2_VERSION,
  threeLensSelector: THREE_LENS_PORTFOLIO_SELECTOR_V5_VERSION,
  synergyGraph: PACKAGE_SYNERGY_GRAPH_V8_VERSION,
  serializer: PROFESSOR_PLAN_SERIALIZER_V1_VERSION,
  losslessness: PROFESSOR_PLAN_SERIALIZATION_LOSSLESSNESS_V1_VERSION,
  semanticProjection: PROFESSOR_PLAN_SERIALIZATION_SEMANTIC_PROJECTION_V1_VERSION,
  runtimeInputV8SchemaValidator: PROFESSOR_PLAN_RUNTIME_INPUT_V8_SCHEMA_VALIDATOR_V1_VERSION,
  artifactRouting: SERIALIZATION_PILOT_ARTIFACT_ROUTING_V1_VERSION,
  harmony: PROFESSOR_PLAN_SERIALIZATION_HARMONY_V1_VERSION,
  mechanismTruthSupplementArtifact: MECHANISM_TRUTH_SUPPLEMENT_ARTIFACT,
  opportunitySupplementArtifact: OPPORTUNITY_SUPPLEMENT_ARTIFACT,
  opportunitySupplementV2Artifact: OPPORTUNITY_SUPPLEMENT_V2_ARTIFACT,
};
