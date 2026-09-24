/**
 * Frozen spent Zada prospective attempt-000 TOOL_REQUESTS — real GPT-5.6 Sol output, never regenerate.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MILESTONES } from "./phase6a1-pinned-implementation-container-v1";

export const PROFESSOR_V3_ZADA_SPENT_TOOL_LOOP_FIXTURE_V1_VERSION =
  "phase6a1-professor-v3-zada-spent-tool-loop-fixture-v1";

export const PROFESSOR_V3_ZADA_SPENT_ATTEMPT_000_PARSED_RESPONSE_RELATIVE_PATH =
  "phase6a1-professor-v3-smoke-zada-prospective-model-attempts-v1/attempt-000-parsed-response.json";

export const PROFESSOR_V3_ZADA_SPENT_ATTEMPT_000_PARSED_RESPONSE_SHA256 =
  "1aab75346ebfc6497716ae1db3aa7b34df2b287a40172a5d8b6fee2e34193bf1";

export const PROFESSOR_V3_ZADA_SPENT_ATTEMPT_000_PARSED_RESPONSE_ABSOLUTE_PATH = join(
  MILESTONES,
  PROFESSOR_V3_ZADA_SPENT_ATTEMPT_000_PARSED_RESPONSE_RELATIVE_PATH,
);

export type ProfessorV3ZadaSpentAttempt000ParsedEnvelopeV1 = {
  parsed: {
    responseKind: "TOOL_REQUESTS";
    toolRequests: Array<{
      tool: "searchMtgKnowledge";
      query: string;
      mode: "COMMANDER_PRIMER" | "PACKAGE" | "RULES" | "CARD_ORACLE";
      limit?: number;
    }>;
    strategyHypotheses: unknown[];
  };
  toolRequests: Array<{
    tool: "searchMtgKnowledge";
    query: string;
    mode: "COMMANDER_PRIMER" | "PACKAGE" | "RULES" | "CARD_ORACLE";
    limit?: number;
  }>;
};

export function loadProfessorV3ZadaSpentAttempt000ParsedResponseV1(): ProfessorV3ZadaSpentAttempt000ParsedEnvelopeV1 {
  const exactBytes = readFileSync(PROFESSOR_V3_ZADA_SPENT_ATTEMPT_000_PARSED_RESPONSE_ABSOLUTE_PATH, "utf8");
  return JSON.parse(exactBytes) as ProfessorV3ZadaSpentAttempt000ParsedEnvelopeV1;
}
