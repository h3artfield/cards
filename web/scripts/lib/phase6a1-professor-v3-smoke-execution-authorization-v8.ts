/**
 * Independently reviewed execution authorization v8 — explicit modelExecutionAuthorized + case binding.
 */
export const PROFESSOR_V3_SMOKE_EXECUTION_AUTHORIZATION_V8_VERSION =
  "phase6a1-professor-v3-smoke-execution-authorization-v8";

export type ProfessorV3IndependentlyReviewedExecutionAuthorizationV8 = {
  version: typeof PROFESSOR_V3_SMOKE_EXECUTION_AUTHORIZATION_V8_VERSION;
  decision: string;
  modelExecutionAuthorized: boolean;
  /** Explicit OpenAI Responses API call budget when modelExecutionAuthorized=true. Never infer from maxValidationRepairRounds. */
  maxModelApiCalls?: number;
  prospectiveCaseId: string;
  mechanismTruthCaseId: string;
  stackIdentity: string;
  executionIdentityArtifactRelativePath: string;
  executionIdentityArtifactSha256: string;
  executeRunnerRelativePath: string;
  executeRunnerSha256: string;
  executionPinsArtifactRelativePath: string;
  executionPinsArtifactSha256: string;
  dependencyManifestSha256: string;
};

export const PROFESSOR_V3_BINDING_REPAIR_DECISION_V1 =
  "PROFESSOR_V3_SUCCESSOR_PROSPECTIVE_EXECUTION_AUTHORIZATION_BINDING_REPAIR_V1_AUTHORIZED_NO_MODEL";

export const PROFESSOR_V3_INDEPENDENTLY_REVIEWED_EXECUTION_AUTHORIZATION_V8 = {
  version: PROFESSOR_V3_SMOKE_EXECUTION_AUTHORIZATION_V8_VERSION,
  decision: PROFESSOR_V3_BINDING_REPAIR_DECISION_V1,
  modelExecutionAuthorized: false,
  prospectiveCaseId: "professor-v3-smoke-korvold-prospective-v1",
  mechanismTruthCaseId: "multi-korvold",
  stackIdentity: "professor-v3-korvold-smoke-execution-tree-v1-prospective",
  executionIdentityArtifactRelativePath:
    "web/data/milestones/deck-synthesis/phase6a1-professor-v3-smoke-execution-identity-v7-korvold-prospective-v1.json",
  executionIdentityArtifactSha256: "c6a00cf8f1d8e16124f7192b88969a66330987f40babb0041ce6e8088187a5fc",
  executeRunnerRelativePath: "web/scripts/run-phase6a1-execute-smoke-professor-v3-korvold-prospective-v1.ts",
  executeRunnerSha256: "88ef99af8be04e5dce4dc1983c895282d24cdc02b373d0d3b6b2f76f3dc419bb",
  executionPinsArtifactRelativePath:
    "web/data/milestones/deck-synthesis/phase6a1-professor-v3-smoke-execution-pins-v7-korvold-prospective-v1.json",
  executionPinsArtifactSha256: "350f26489626a48fb9c88d87f3826426464226786fb83455fb6ebaa4b56958ee",
  dependencyManifestSha256: "801449587dc3a9c0950991d44a784ba4124c24bc690ff9e321282d14afc06d56",
} as const satisfies ProfessorV3IndependentlyReviewedExecutionAuthorizationV8;

/** Test-only fixture for gate preflight-eligible boundary checks — not a live smoke authorization. */
export const PROFESSOR_V3_PROSPECTIVE_SMOKE_EXECUTION_AUTHORIZATION_FIXTURE_V1 = {
  version: PROFESSOR_V3_SMOKE_EXECUTION_AUTHORIZATION_V8_VERSION,
  decision: "PROFESSOR_V3_KORVOLD_PROSPECTIVE_SMOKE_V1_AUTHORIZED_WITH_EXTERNAL_ANCHORS_FIXTURE",
  modelExecutionAuthorized: true,
  maxModelApiCalls: 1,
  prospectiveCaseId: "professor-v3-smoke-korvold-prospective-v1",
  mechanismTruthCaseId: "multi-korvold",
  stackIdentity: "professor-v3-korvold-smoke-execution-tree-v1-prospective",
  executionIdentityArtifactRelativePath:
    "web/data/milestones/deck-synthesis/phase6a1-professor-v3-smoke-execution-identity-v7-korvold-prospective-v1.json",
  executionIdentityArtifactSha256: "0000000000000000000000000000000000000000000000000000000000000000",
  executeRunnerRelativePath: "web/scripts/run-phase6a1-execute-smoke-professor-v3-korvold-prospective-v1.ts",
  executeRunnerSha256: "0000000000000000000000000000000000000000000000000000000000000000",
  executionPinsArtifactRelativePath:
    "web/data/milestones/deck-synthesis/phase6a1-professor-v3-smoke-execution-pins-v7-korvold-prospective-v1.json",
  executionPinsArtifactSha256: "0000000000000000000000000000000000000000000000000000000000000000",
  dependencyManifestSha256: "0000000000000000000000000000000000000000000000000000000000000000",
} as const satisfies ProfessorV3IndependentlyReviewedExecutionAuthorizationV8;

/** Legacy v7 Muldrotha anchor adapted for semantic gate regression only. */
export const PROFESSOR_V3_LEGACY_MULDROTHA_SUCCESSOR_V7_AUTHORIZATION_ADAPTED_V1: ProfessorV3IndependentlyReviewedExecutionAuthorizationV8 =
  {
    version: PROFESSOR_V3_SMOKE_EXECUTION_AUTHORIZATION_V8_VERSION,
    decision: "PROFESSOR_V3_INCOMPLETE_RESPONSE_AND_OUTPUT_BUDGET_REPAIR_V1_AUTHORIZED_NO_MODEL",
    modelExecutionAuthorized: false,
    prospectiveCaseId: "professor-v3-smoke-muldrotha-successor-v3",
    mechanismTruthCaseId: "multi-muldrotha",
    stackIdentity: "professor-v3-muldrotha-smoke-execution-tree-v6-successor-v3",
    executionIdentityArtifactRelativePath:
      "web/data/milestones/deck-synthesis/phase6a1-professor-v3-smoke-execution-identity-v6-successor-v3.json",
    executionIdentityArtifactSha256: "196e5fb4c8bd5bba495c55482ec8e34a56c5e5aa5c93f7ec0545d064df3542f3",
    executeRunnerRelativePath: "web/scripts/run-phase6a1-execute-smoke-professor-v3-muldrotha-successor-v3.ts",
    executeRunnerSha256: "10b27559d9fd2448fe4e0e68f95f251b587e3cebde63660f50db470a09293869",
    executionPinsArtifactRelativePath:
      "web/data/milestones/deck-synthesis/phase6a1-professor-v3-smoke-execution-pins-v6-successor-v3.json",
    executionPinsArtifactSha256: "91cd4930ad21bd1cae27bb62627eee6bea7f18efc682e7b84314ec08da1a8be2",
    dependencyManifestSha256: "ab3908bca8c239a4f2f3741d9c1da6fc43a33a1da97e671bada6bc6e8e005035",
  };
