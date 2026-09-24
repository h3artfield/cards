/**
 * Independently reviewed execution authorization root for Professor v3 Muldrotha successor smoke v2.
 */
export const PROFESSOR_V3_SMOKE_EXECUTION_AUTHORIZATION_V6_VERSION =
  "phase6a1-professor-v3-smoke-execution-authorization-v6";

export const PROFESSOR_V3_INDEPENDENTLY_REVIEWED_EXECUTION_AUTHORIZATION_V6 = {
  version: PROFESSOR_V3_SMOKE_EXECUTION_AUTHORIZATION_V6_VERSION,
  decision: "PROFESSOR_V3_SUCCESSOR_SMOKE_V1_SPENT_FAIL_API_SCHEMA_TYPE_ANNOTATION_REPAIR_REQUIRED_NO_MODEL",
  stackIdentity: "professor-v3-muldrotha-smoke-execution-tree-v5-successor-v2",
  executionIdentityArtifactRelativePath:
    "web/data/milestones/deck-synthesis/phase6a1-professor-v3-smoke-execution-identity-v5-successor-v2.json",
  executionIdentityArtifactSha256: "94043d0d03ecff9de1debbd1ea0128571fe3a43e60cc00cd55f3bb49342e8113",
  executeRunnerRelativePath: "web/scripts/run-phase6a1-execute-smoke-professor-v3-muldrotha-successor-v2.ts",
  executeRunnerSha256: "10de8fee22a90281c7dc50f5731259ae81488651f47f3fb8b7dda285d5702929",
  executionPinsArtifactRelativePath:
    "web/data/milestones/deck-synthesis/phase6a1-professor-v3-smoke-execution-pins-v5-successor-v2.json",
  executionPinsArtifactSha256: "1fa8518bc6d1f82ec5c67153007fe180a60efa637c37bbb5f0a2cf8960a27d51",
  dependencyManifestSha256: "6888175f6bbeed43719d8a94f2f1a1ed6b5f7ebbef73a6a1f8ca12c302bbcc1a",
} as const;

export type ProfessorV3IndependentlyReviewedExecutionAuthorizationV6 =
  typeof PROFESSOR_V3_INDEPENDENTLY_REVIEWED_EXECUTION_AUTHORIZATION_V6;
