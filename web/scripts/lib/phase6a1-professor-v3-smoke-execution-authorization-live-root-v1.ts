/**
 * External live authorization root — excluded from dependency closure.
 * Runner imports this module only; swap exported values after independent smoke authorization.
 */
import type { ProfessorV3IndependentlyReviewedExecutionAuthorizationV8 } from "./phase6a1-professor-v3-smoke-execution-authorization-v8";
import { PROFESSOR_V3_INDEPENDENTLY_REVIEWED_EXECUTION_AUTHORIZATION_V8 } from "./phase6a1-professor-v3-smoke-execution-authorization-v8";

export const PROFESSOR_V3_SMOKE_EXECUTION_AUTHORIZATION_LIVE_ROOT_V1_VERSION =
  "phase6a1-professor-v3-smoke-execution-authorization-live-root-v1";

/** Fail-closed live root — Chatterfang prospective v1 is SPENT; modelExecutionAuthorized=false. */
export const PROFESSOR_V3_LIVE_EXECUTION_AUTHORIZATION: ProfessorV3IndependentlyReviewedExecutionAuthorizationV8 =
  PROFESSOR_V3_INDEPENDENTLY_REVIEWED_EXECUTION_AUTHORIZATION_V8;
