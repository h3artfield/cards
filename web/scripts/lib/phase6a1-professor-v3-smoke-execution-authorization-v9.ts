/**
 * Candidate execution authorization v9 — reserved for Korvold prospective smoke; not live in runner.
 */
import type { ProfessorV3IndependentlyReviewedExecutionAuthorizationV8 } from "./phase6a1-professor-v3-smoke-execution-authorization-v8";

export const PROFESSOR_V3_SMOKE_EXECUTION_AUTHORIZATION_V9_VERSION =
  "phase6a1-professor-v3-smoke-execution-authorization-v9";

export const PROFESSOR_V3_KORVOLD_PROSPECTIVE_SMOKE_DECISION_V1 =
  "PROFESSOR_V3_KORVOLD_PROSPECTIVE_SMOKE_V1_AUTHORIZED_WITH_EXTERNAL_ANCHORS";

export const PROFESSOR_V3_EXECUTABLE_STACK_SEALING_DECISION_V1 =
  "PROFESSOR_V3_KORVOLD_EXECUTABLE_STACK_SEALING_V1_AUTHORIZED_NO_MODEL";

export const PROFESSOR_V3_KORVOLD_FINAL_EXECUTION_HARDENING_DECISION_V1 =
  "PROFESSOR_V3_KORVOLD_FINAL_EXECUTION_HARDENING_AND_RESEAL_V1_AUTHORIZED_NO_MODEL";

export type ProfessorV3CandidateExecutionAuthorizationV9 = ProfessorV3IndependentlyReviewedExecutionAuthorizationV8 & {
  version: typeof PROFESSOR_V3_SMOKE_EXECUTION_AUTHORIZATION_V9_VERSION;
};

/** Candidate smoke authorization — sealed after executable stack identity/pins; not wired as live runner auth. */
export const PROFESSOR_V3_KORVOLD_PROSPECTIVE_SMOKE_CANDIDATE_EXECUTION_AUTHORIZATION_V9 = {
  version: PROFESSOR_V3_SMOKE_EXECUTION_AUTHORIZATION_V9_VERSION,
  decision: PROFESSOR_V3_KORVOLD_PROSPECTIVE_SMOKE_DECISION_V1,
  modelExecutionAuthorized: true,
  prospectiveCaseId: "professor-v3-smoke-korvold-prospective-v1",
  mechanismTruthCaseId: "multi-korvold",
  stackIdentity: "professor-v3-korvold-smoke-execution-tree-v1-prospective",
  executionIdentityArtifactRelativePath:
    "web/data/milestones/deck-synthesis/phase6a1-professor-v3-smoke-execution-identity-v8-korvold-executable-v1.json",
  executionIdentityArtifactSha256: "afd5ea96e4bd3781ee06cb651b223ceaf0a404686e5a11fd1e4049b28375c926",
  executeRunnerRelativePath: "web/scripts/run-phase6a1-execute-smoke-professor-v3-korvold-prospective-v1.ts",
  executeRunnerSha256: "6630d7be5700b84dd9c923fd9e025aee669703cdd03ccb3b0546dca819556c16",
  executionPinsArtifactRelativePath:
    "web/data/milestones/deck-synthesis/phase6a1-professor-v3-smoke-execution-pins-v8-korvold-executable-v1.json",
  executionPinsArtifactSha256: "2d565f472e9756be16e551a492e5825453bedcfd6c989041a47873050db4f733",
  dependencyManifestSha256: "76e98db93b9bb48fb34475022b6d85f75cfc656fc5678b49e514deb06028d592",
} as const satisfies ProfessorV3CandidateExecutionAuthorizationV9;
