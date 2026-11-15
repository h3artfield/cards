/**
 * Independently reviewed execution authorization root for Professor v3 incomplete-response repair v1.
 * Placeholder SHA anchors are patched by seal script after material pins are computed.
 */
export const PROFESSOR_V3_SMOKE_EXECUTION_AUTHORIZATION_V7_VERSION =
  "phase6a1-professor-v3-smoke-execution-authorization-v7";

export const PROFESSOR_V3_INDEPENDENTLY_REVIEWED_EXECUTION_AUTHORIZATION_V7 = {
  version: PROFESSOR_V3_SMOKE_EXECUTION_AUTHORIZATION_V7_VERSION,
  decision: "PROFESSOR_V3_INCOMPLETE_RESPONSE_AND_OUTPUT_BUDGET_REPAIR_V1_AUTHORIZED_NO_MODEL",
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
} as const;

export type ProfessorV3IndependentlyReviewedExecutionAuthorizationV7 =
  typeof PROFESSOR_V3_INDEPENDENTLY_REVIEWED_EXECUTION_AUTHORIZATION_V7;
