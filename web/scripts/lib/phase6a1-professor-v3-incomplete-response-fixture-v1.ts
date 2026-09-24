/**
 * Regression fixtures for Professor v3 incomplete-response boundary repair v1.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MILESTONES } from "./phase6a1-pinned-implementation-container-v1";
import { buildProfessorV3ContractRoundtripRawPlanV1 } from "./phase6a1-professor-v3-contract-roundtrip-fixture-v1";

export const PROFESSOR_V3_INCOMPLETE_RESPONSE_FIXTURE_V1_VERSION =
  "phase6a1-professor-v3-incomplete-response-fixture-v1";

export const SPENT_SUCCESSOR_V2_INCOMPLETE_RAW_RESPONSE_PATH = resolve(
  MILESTONES,
  "phase6a1-professor-v3-smoke-muldrotha-successor-model-attempts-v2/attempt-000-api-response-raw.json",
);

export function loadSpentSuccessorV2IncompleteRawResponseFixtureV1(): string {
  return readFileSync(SPENT_SUCCESSOR_V2_INCOMPLETE_RAW_RESPONSE_PATH, "utf8");
}

export function buildCompletedStructuredOutputResponsesApiFixtureV1(): string {
  const plan = buildProfessorV3ContractRoundtripRawPlanV1();
  const envelope = {
    responseKind: "PLAN",
    toolRequests: [],
    strategyHypotheses: plan.strategyHypotheses,
  };
  return JSON.stringify({
    id: "resp_fixture_completed_v1",
    object: "response",
    status: "completed",
    incomplete_details: null,
    max_output_tokens: 32000,
    usage: {
      input_tokens: 1000,
      output_tokens: 4000,
      output_tokens_details: { reasoning_tokens: 500 },
    },
    output: [
      {
        id: "msg_fixture_completed_v1",
        type: "message",
        status: "completed",
        content: [{ type: "output_text", text: JSON.stringify(envelope) }],
      },
    ],
  });
}

export function buildCompletedMalformedJsonResponsesApiFixtureV1(): string {
  return JSON.stringify({
    id: "resp_fixture_malformed_v1",
    object: "response",
    status: "completed",
    incomplete_details: null,
    max_output_tokens: 32000,
    usage: {
      input_tokens: 1000,
      output_tokens: 120,
      output_tokens_details: { reasoning_tokens: 20 },
    },
    output: [
      {
        id: "msg_fixture_malformed_v1",
        type: "message",
        status: "completed",
        content: [{ type: "output_text", text: '{"responseKind":"PLAN","toolRequests":[],"strategyHypotheses":[' }],
      },
    ],
  });
}
