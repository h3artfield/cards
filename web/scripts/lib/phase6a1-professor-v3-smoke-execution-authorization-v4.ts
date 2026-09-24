/**
 * Independently reviewed execution authorization root for Professor v3 Muldrotha smoke.
 * Immutable operator/reviewer anchor — not updated by local seal scripts.
 */
export const PROFESSOR_V3_SMOKE_EXECUTION_AUTHORIZATION_V4_VERSION =
  "phase6a1-professor-v3-smoke-execution-authorization-v4";

export const PROFESSOR_V3_INDEPENDENTLY_REVIEWED_EXECUTION_AUTHORIZATION_V4 = {
  version: PROFESSOR_V3_SMOKE_EXECUTION_AUTHORIZATION_V4_VERSION,
  decision: "PROFESSOR_V3_ARCHITECTURE_FROZEN_SMOKE_READINESS_BLOCK_V4_INITIAL_RAG_AND_FAILURE_SEAL_CLOSURE_REQUIRED",
  stackIdentity: "professor-v3-muldrotha-smoke-execution-tree-v3",
  executionIdentityArtifactRelativePath: "web/data/milestones/deck-synthesis/phase6a1-professor-v3-smoke-execution-identity-v3.json",
  executionIdentityArtifactSha256: "f96c2223db29e8f49b66e052127f0c6b424192b3c3e2633a57fcecd0133c16e3",
  executeRunnerRelativePath: "web/scripts/run-phase6a1-execute-smoke-professor-v3-muldrotha-v1.ts",
  executeRunnerSha256: "0cc8424ea620a8c30a433998e79e4e747461f688dfe1c47b1fa8c30f5aa37cc8",
  executionPinsArtifactRelativePath: "web/data/milestones/deck-synthesis/phase6a1-professor-v3-smoke-execution-pins-v3.json",
  executionPinsArtifactSha256: "23eedf0ded218654eda535540f60e2c1f4de3a69289ce59335703cf73ddaecf7",
  dependencyManifestSha256: "f6f89f60b22f6401663fa5b4ad3d570812bbf796d7f90555ea31e1b7aa02731a",
} as const;

export type ProfessorV3IndependentlyReviewedExecutionAuthorizationV4 =
  typeof PROFESSOR_V3_INDEPENDENTLY_REVIEWED_EXECUTION_AUTHORIZATION_V4;
