/**
 * Candidate execution authorization — Zada prospective smoke; not live in runner.
 */
import type { ProfessorV3CandidateExecutionAuthorizationV11 } from "./phase6a1-professor-v3-smoke-execution-authorization-v11";

export const PROFESSOR_V3_SMOKE_EXECUTION_AUTHORIZATION_ZADA_V1_VERSION =
  "phase6a1-professor-v3-smoke-execution-authorization-zada-v1";

export const PROFESSOR_V3_ZADA_PROSPECTIVE_SMOKE_DECISION_V1 =
  "PROFESSOR_V3_ZADA_PROSPECTIVE_SMOKE_V1_AUTHORIZED_WITH_EXTERNAL_ANCHORS";

export const PROFESSOR_V3_ZADA_EXECUTABLE_STACK_FINALIZATION_DECISION_V1 =
  "PROFESSOR_V3_ZADA_EXECUTABLE_STACK_FINALIZATION_V1_AUTHORIZED_NO_MODEL";

export const PROFESSOR_V3_ZADA_PROSPECTIVE_STACK_RESEAL_DECISION_V1 =
  "PROFESSOR_V3_ZADA_PROSPECTIVE_STACK_RESEAL_V1_AUTHORIZED_NO_MODEL";

/** Candidate smoke authorization — sealed after executable stack identity/pins; not wired as live runner auth. */
export const PROFESSOR_V3_ZADA_PROSPECTIVE_SMOKE_CANDIDATE_EXECUTION_AUTHORIZATION_V1 = {
  version: "phase6a1-professor-v3-smoke-execution-authorization-v11",
  decision: PROFESSOR_V3_ZADA_PROSPECTIVE_SMOKE_DECISION_V1,
  modelExecutionAuthorized: true,
  maxModelApiCalls: 4,
  prospectiveCaseId: "professor-v3-smoke-zada-prospective-v1",
  mechanismTruthCaseId: "multi-zada",
  stackIdentity: "professor-v3-zada-smoke-execution-tree-v1-prospective",
  executionIdentityArtifactRelativePath:
    "web/data/milestones/deck-synthesis/phase6a1-professor-v3-smoke-execution-identity-v10-zada-executable-v1.json",
  executionIdentityArtifactSha256: "28d4bedeb3c4f16c8837c19bf732e34c7183a962de1fcef46dc9d31c9bf61f88",
  executeRunnerRelativePath: "web/scripts/run-phase6a1-execute-smoke-professor-v3-zada-prospective-v1.ts",
  executeRunnerSha256: "c4fe2ef01f8cef5a8e6a2cde923fb59d7cc43ec6d847a536df013715baa67cc4",
  executionPinsArtifactRelativePath:
    "web/data/milestones/deck-synthesis/phase6a1-professor-v3-smoke-execution-pins-v10-zada-executable-v1.json",
  executionPinsArtifactSha256: "835d2831411bf002250fb38c5db16c99d3960e1a6d682a13318c14ca092ad555",
  dependencyManifestSha256: "4f3cb13fefc60a4b777d753b70f0f2c9bcec07e408b9991049aabd65bd192f43",
} as const satisfies ProfessorV3CandidateExecutionAuthorizationV11;

export const PROFESSOR_V3_ZADA_PROSPECTIVE_SMOKE_BINDING_V1 = {
  caseId: "professor-v3-smoke-zada-prospective-v1",
  mechanismTruthCaseId: "multi-zada",
  stackIdentity: "professor-v3-zada-smoke-execution-tree-v1-prospective",
} as const;

export function buildProfessorV3ZadaProspectiveRunnerBindingV1(args: {
  decision: string;
}): import("./phase6a1-professor-v3-smoke-execution-authorization-binding-v1").ProfessorV3SmokeRunnerCaseBindingV1 {
  return {
    decision: args.decision,
    caseId: PROFESSOR_V3_ZADA_PROSPECTIVE_SMOKE_BINDING_V1.caseId,
    mechanismTruthCaseId: PROFESSOR_V3_ZADA_PROSPECTIVE_SMOKE_BINDING_V1.mechanismTruthCaseId,
    stackIdentity: PROFESSOR_V3_ZADA_PROSPECTIVE_SMOKE_BINDING_V1.stackIdentity,
  };
}
