/**
 * Independently reviewed execution authorization root for Professor v3 Muldrotha successor smoke.
 * Immutable operator/reviewer anchor — updated only by independent review, not local seal scripts.
 */
export const PROFESSOR_V3_SMOKE_EXECUTION_AUTHORIZATION_V5_VERSION =
  "phase6a1-professor-v3-smoke-execution-authorization-v5";

export const PROFESSOR_V3_INDEPENDENTLY_REVIEWED_EXECUTION_AUTHORIZATION_V5 = {
  version: PROFESSOR_V3_SMOKE_EXECUTION_AUTHORIZATION_V5_VERSION,
  decision:
    "PROFESSOR_V3_SPENT_FAILURE_REPAIR_V1_BLOCK_STRUCTURED_OUTPUT_SCHEMA_API_INCOMPATIBLE_AND_SUCCESSOR_EXECUTION_DELTA_REQUIRED",
  stackIdentity: "professor-v3-muldrotha-smoke-execution-tree-v4-successor",
  executionIdentityArtifactRelativePath:
    "web/data/milestones/deck-synthesis/phase6a1-professor-v3-smoke-execution-identity-v4-successor.json",
  executionIdentityArtifactSha256: "471cd38a59919d7d5395ed1a236f2912f64dab96e6e00f22cc25fd27de3935ff",
  executeRunnerRelativePath: "web/scripts/run-phase6a1-execute-smoke-professor-v3-muldrotha-successor-v1.ts",
  executeRunnerSha256: "b9ca231cc8d828099d210d88fc17fc4dbf04c631cbab511c389996c1d2d36d67",
  executionPinsArtifactRelativePath:
    "web/data/milestones/deck-synthesis/phase6a1-professor-v3-smoke-execution-pins-v4-successor.json",
  executionPinsArtifactSha256: "1746f94efb3dd963b655dd75b049f247b366e0dfdad68762a4fed9e622df9695",
  dependencyManifestSha256: "3f0faf3e342413a1dd9572e3a70206d29bf0bac153245b439f44a6310b694ed7",
} as const;

export type ProfessorV3IndependentlyReviewedExecutionAuthorizationV5 =
  typeof PROFESSOR_V3_INDEPENDENTLY_REVIEWED_EXECUTION_AUTHORIZATION_V5;
