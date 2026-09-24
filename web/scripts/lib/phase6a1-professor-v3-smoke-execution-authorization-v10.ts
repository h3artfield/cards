/**
 * Candidate execution authorization v10 — Yuriko prospective smoke; not live in runner.
 */
import type { ProfessorV3IndependentlyReviewedExecutionAuthorizationV8 } from "./phase6a1-professor-v3-smoke-execution-authorization-v8";

export const PROFESSOR_V3_SMOKE_EXECUTION_AUTHORIZATION_V10_VERSION =
  "phase6a1-professor-v3-smoke-execution-authorization-v10";

export const PROFESSOR_V3_YURIKO_PROSPECTIVE_SMOKE_DECISION_V1 =
  "PROFESSOR_V3_YURIKO_PROSPECTIVE_SMOKE_V1_AUTHORIZED_WITH_EXTERNAL_ANCHORS";

export const PROFESSOR_V3_YURIKO_PROSPECTIVE_STACK_RESEAL_DECISION_V1 =
  "PROFESSOR_V3_YURIKO_PROSPECTIVE_STACK_RESEAL_V1_AUTHORIZED_NO_MODEL";

export type ProfessorV3CandidateExecutionAuthorizationV10 = ProfessorV3IndependentlyReviewedExecutionAuthorizationV8 & {
  version: typeof PROFESSOR_V3_SMOKE_EXECUTION_AUTHORIZATION_V10_VERSION;
};

/** Candidate smoke authorization — sealed after executable stack identity/pins; not wired as live runner auth. */
export const PROFESSOR_V3_YURIKO_PROSPECTIVE_SMOKE_CANDIDATE_EXECUTION_AUTHORIZATION_V10 = {
  version: PROFESSOR_V3_SMOKE_EXECUTION_AUTHORIZATION_V10_VERSION,
  decision: PROFESSOR_V3_YURIKO_PROSPECTIVE_SMOKE_DECISION_V1,
  modelExecutionAuthorized: true,
  prospectiveCaseId: "professor-v3-smoke-yuriko-prospective-v1",
  mechanismTruthCaseId: "multi-yuriko",
  stackIdentity: "professor-v3-yuriko-smoke-execution-tree-v1-prospective",
  executionIdentityArtifactRelativePath:
    "web/data/milestones/deck-synthesis/phase6a1-professor-v3-smoke-execution-identity-v9-yuriko-executable-v1.json",
  executionIdentityArtifactSha256: "93cb41fa19f0487e325dbd806261f1371c3b950749a5556bfde37cecb11cf087",
  executeRunnerRelativePath: "web/scripts/run-phase6a1-execute-smoke-professor-v3-yuriko-prospective-v1.ts",
  executeRunnerSha256: "104b63e860f685999732b741bb860922a616960bfdd0ed736776f34f7b7a0a64",
  executionPinsArtifactRelativePath:
    "web/data/milestones/deck-synthesis/phase6a1-professor-v3-smoke-execution-pins-v9-yuriko-executable-v1.json",
  executionPinsArtifactSha256: "7f6b6d42f65bef26655e97040b75ffe6563aa232eda7e8c4b9b030f387ec9914",
  dependencyManifestSha256: "fe56c9a2a3905bb203218ee665957c52e791d382ebd0bcaad24bd18ebb179ee5",
} as const satisfies ProfessorV3CandidateExecutionAuthorizationV10;
