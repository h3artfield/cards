/**
 * Candidate execution authorization — Chatterfang prospective smoke; not live in runner.
 */
import type { ProfessorV3CandidateExecutionAuthorizationV11 } from "./phase6a1-professor-v3-smoke-execution-authorization-v11";

export const PROFESSOR_V3_SMOKE_EXECUTION_AUTHORIZATION_CHATTERFANG_V1_VERSION =
  "phase6a1-professor-v3-smoke-execution-authorization-chatterfang-v1";

export const PROFESSOR_V3_CHATTERFANG_PROSPECTIVE_SMOKE_DECISION_V1 =
  "PROFESSOR_V3_CHATTERFANG_PROSPECTIVE_SMOKE_V1_AUTHORIZED_WITH_EXTERNAL_ANCHORS";

export const PROFESSOR_V3_CHATTERFANG_EXECUTABLE_STACK_FINALIZATION_DECISION_V1 =
  "PROFESSOR_V3_CHATTERFANG_EXECUTABLE_STACK_FINALIZATION_V1_AUTHORIZED_NO_MODEL";

export const PROFESSOR_V3_CHATTERFANG_PROSPECTIVE_STACK_RESEAL_DECISION_V1 =
  "PROFESSOR_V3_CHATTERFANG_PROSPECTIVE_STACK_RESEAL_V1_AUTHORIZED_NO_MODEL";

export const PROFESSOR_V3_CHATTERFANG_TRANSITIVE_RUNTIME_CLOSURE_REPAIR_DECISION_V1 =
  "PROFESSOR_V3_CHATTERFANG_TRANSITIVE_RUNTIME_CLOSURE_REPAIR_V1_AUTHORIZED_NO_MODEL";

export const PROFESSOR_V3_CHATTERFANG_RUNTIME_MATERIAL_INPUT_BINDING_REPAIR_DECISION_V1 =
  "PROFESSOR_V3_CHATTERFANG_RUNTIME_MATERIAL_INPUT_BINDING_REPAIR_V1_AUTHORIZED_NO_MODEL";

/** Candidate smoke authorization — sealed after executable stack identity/pins; not wired as live runner auth. */
export const PROFESSOR_V3_CHATTERFANG_PROSPECTIVE_SMOKE_CANDIDATE_EXECUTION_AUTHORIZATION_V1 = {
  version: "phase6a1-professor-v3-smoke-execution-authorization-v11",
  decision: PROFESSOR_V3_CHATTERFANG_PROSPECTIVE_SMOKE_DECISION_V1,
  modelExecutionAuthorized: true,
  maxModelApiCalls: 4,
  prospectiveCaseId: "professor-v3-smoke-chatterfang-prospective-v1",
  mechanismTruthCaseId: "multi-chatterfang",
  stackIdentity: "professor-v3-chatterfang-smoke-execution-tree-v1-prospective",
  executionIdentityArtifactRelativePath:
    "web/data/milestones/deck-synthesis/phase6a1-professor-v3-smoke-execution-identity-v11-chatterfang-executable-v1.json",
  executionIdentityArtifactSha256: "8d45604c147aaf6a18f589470b8eb9042b09bde407e4b9698ec8bb6c65d3cdfd",
  executeRunnerRelativePath: "web/scripts/run-phase6a1-execute-smoke-professor-v3-chatterfang-prospective-v1.ts",
  executeRunnerSha256: "a801a16a76db0acdce0a052ba689429a128d057087eecf4e6e69b49a8f3c3abe",
  executionPinsArtifactRelativePath:
    "web/data/milestones/deck-synthesis/phase6a1-professor-v3-smoke-execution-pins-v11-chatterfang-executable-v1.json",
  executionPinsArtifactSha256: "5636a28c206b2a91e1e7e0be3d575a4e8c214d34706d663e451725e4b1e94297",
  dependencyManifestSha256: "fe31733871a3015e6ec3454c82de5c603953d98f7201d230e2d5d645484bfc0d",
} as const satisfies ProfessorV3CandidateExecutionAuthorizationV11;

export const PROFESSOR_V3_CHATTERFANG_PROSPECTIVE_SMOKE_BINDING_V1 = {
  caseId: "professor-v3-smoke-chatterfang-prospective-v1",
  mechanismTruthCaseId: "multi-chatterfang",
  stackIdentity: "professor-v3-chatterfang-smoke-execution-tree-v1-prospective",
} as const;

export function buildProfessorV3ChatterfangProspectiveRunnerBindingV1(args: {
  decision: string;
}): import("./phase6a1-professor-v3-smoke-execution-authorization-binding-v1").ProfessorV3SmokeRunnerCaseBindingV1 {
  return {
    decision: args.decision,
    caseId: PROFESSOR_V3_CHATTERFANG_PROSPECTIVE_SMOKE_BINDING_V1.caseId,
    mechanismTruthCaseId: PROFESSOR_V3_CHATTERFANG_PROSPECTIVE_SMOKE_BINDING_V1.mechanismTruthCaseId,
    stackIdentity: PROFESSOR_V3_CHATTERFANG_PROSPECTIVE_SMOKE_BINDING_V1.stackIdentity,
  };
}
