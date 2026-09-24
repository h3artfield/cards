/**
 * Candidate execution authorization v11 — explicit maxModelApiCalls on authorized smokes.
 */
import type { ProfessorV3IndependentlyReviewedExecutionAuthorizationV8 } from "./phase6a1-professor-v3-smoke-execution-authorization-v8";

export const PROFESSOR_V3_SMOKE_EXECUTION_AUTHORIZATION_V11_VERSION =
  "phase6a1-professor-v3-smoke-execution-authorization-v11";

export const PROFESSOR_V3_POST_YURIKO_GROUNDING_CONTRACT_REPAIR_DECISION_V1 =
  "PROFESSOR_V3_POST_YURIKO_GROUNDING_CONTRACT_AND_TERMINAL_SEAL_REPAIR_V1_AUTHORIZED_NO_MODEL";

export type ProfessorV3CandidateExecutionAuthorizationV11 = ProfessorV3IndependentlyReviewedExecutionAuthorizationV8 & {
  version: typeof PROFESSOR_V3_SMOKE_EXECUTION_AUTHORIZATION_V11_VERSION;
  maxModelApiCalls: number;
};

/** Reference authorization shape for future prospective smokes — not live until independently approved. */
export const PROFESSOR_V3_PROSPECTIVE_SMOKE_EXECUTION_AUTHORIZATION_TEMPLATE_V11 = {
  version: PROFESSOR_V3_SMOKE_EXECUTION_AUTHORIZATION_V11_VERSION,
  decision: "PROFESSOR_V3_PROSPECTIVE_SMOKE_TEMPLATE_V11_NOT_AUTHORIZED",
  modelExecutionAuthorized: false,
  maxModelApiCalls: 1,
  prospectiveCaseId: "professor-v3-smoke-template-v1",
  mechanismTruthCaseId: "multi-template",
  stackIdentity: "professor-v3-template-smoke-execution-tree-v1-prospective",
  executionIdentityArtifactRelativePath:
    "web/data/milestones/deck-synthesis/phase6a1-professor-v3-smoke-execution-identity-template-v1.json",
  executionIdentityArtifactSha256: "0000000000000000000000000000000000000000000000000000000000000000",
  executeRunnerRelativePath: "web/scripts/run-phase6a1-execute-smoke-professor-v3-template-v1.ts",
  executeRunnerSha256: "0000000000000000000000000000000000000000000000000000000000000000",
  executionPinsArtifactRelativePath:
    "web/data/milestones/deck-synthesis/phase6a1-professor-v3-smoke-execution-pins-template-v1.json",
  executionPinsArtifactSha256: "0000000000000000000000000000000000000000000000000000000000000000",
  dependencyManifestSha256: "0000000000000000000000000000000000000000000000000000000000000000",
} as const satisfies ProfessorV3CandidateExecutionAuthorizationV11;
