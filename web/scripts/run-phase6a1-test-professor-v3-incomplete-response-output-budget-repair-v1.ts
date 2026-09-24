#!/usr/bin/env npx tsx
/** Professor v3 incomplete-response + output-budget repair audit — no OpenAI. */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildCompletedMalformedJsonResponsesApiFixtureV1,
  buildCompletedStructuredOutputResponsesApiFixtureV1,
  loadSpentSuccessorV2IncompleteRawResponseFixtureV1,
  SPENT_SUCCESSOR_V2_INCOMPLETE_RAW_RESPONSE_PATH,
} from "./lib/phase6a1-professor-v3-incomplete-response-fixture-v1";
import {
  assertProfessorV3ApiRequestBodyUsesAuditedStrictSchemaV3,
  buildProfessorV3ApiRequestBodyV4,
} from "./lib/phase6a1-professor-v3-model-caller-v4";
import {
  PROFESSOR_V3_MODEL_INCOMPLETE_MAX_OUTPUT_TOKENS,
  PROFESSOR_V3_MODEL_RESPONSE_JSON_PARSE_FAILED,
  assertProfessorV3ResponsesApiCompletedBeforeParse,
  extractProfessorV3OutputTextFromResponsesApi,
  isProfessorV3ModelResponseBoundaryError,
  parseProfessorV3CompletedModelResponseOutput,
  parseProfessorV3ResponsesApiEnvelope,
  processProfessorV3ResponsesApiBoundary,
  getProfessorJsonParseInvocationCountForTests,
  resetProfessorJsonParseInvocationCountForTests,
} from "./lib/phase6a1-professor-v3-model-response-boundary-v1";
import { loadProfessorModelPinV2 } from "./lib/phase6a1-professor-plan-model-pin-v2";
import {
  auditProfessorV3StructuredOutputSchemaStrictCompatibilityV3,
  countBoundedArrayMaxItems,
  countConstOnlyPropertySchemas,
  formatProfessorV3BoundedOutputContractForPromptV3,
  PROFESSOR_V3_BOUNDED_OUTPUT_LIMITS_V3,
  PROFESSOR_V3_MODEL_RESPONSE_JSON_SCHEMA_V3,
  validateProfessorV3ModelResponseEnvelopeV3,
} from "./lib/phase6a1-professor-v3-plan-output-schema-v3";
import { buildProfessorV3ContractRoundtripRawPlanV1 } from "./lib/phase6a1-professor-v3-contract-roundtrip-fixture-v1";
import {
  assertProfessorV3SmokeFailureDecisionV7,
  enumerateProfessorV3PartialModelAttemptFilesV7,
  PROFESSOR_V3_STALE_SMOKE_DECISION_STRINGS_V7,
} from "./lib/phase6a1-professor-v3-smoke-failure-seal-v7";
import { computeProfessorV3SmokeAttemptAccountingV1 } from "./lib/phase6a1-professor-v3-smoke-attempt-accounting-v1";
import {
  assertProfessorV3SuccessorSmokeExecutionPreflightV7,
  verifyProfessorV3SmokeExecutionAuthorizationV7,
} from "./lib/phase6a1-professor-v3-smoke-material-pins-v6";
import { MILESTONES, sha256File } from "./lib/phase6a1-pinned-implementation-container-v1";

const OUT_PATH = resolve(MILESTONES, "phase6a1-professor-v3-incomplete-response-output-budget-repair-audit-v1.json");
const DECISION = "PROFESSOR_V3_INCOMPLETE_RESPONSE_AND_OUTPUT_BUDGET_REPAIR_V1_AUTHORIZED_NO_MODEL";

type Check = { id: string; description: string; pass: boolean; detail?: string };

function record(checks: Check[], id: string, description: string, pass: boolean, detail?: string) {
  checks.push({ id, description, pass, detail });
}

function main() {
  const checks: Check[] = [];
  let jsonParseInvocations = 0;
  resetProfessorJsonParseInvocationCountForTests();

  const schemaAudit = auditProfessorV3StructuredOutputSchemaStrictCompatibilityV3(PROFESSOR_V3_MODEL_RESPONSE_JSON_SCHEMA_V3);
  record(
    checks,
    "bounded-schema-audit-pass",
    "Bounded v3 schema passes strict audit with constOnlyPropertyCount=0",
    schemaAudit.pass && schemaAudit.constOnlyPropertyCount === 0,
    `constOnlyPropertyCount=${schemaAudit.constOnlyPropertyCount}`,
  );
  record(
    checks,
    "bounded-schema-has-max-items",
    "Bounded v3 schema declares practical maxItems limits",
    countBoundedArrayMaxItems(PROFESSOR_V3_MODEL_RESPONSE_JSON_SCHEMA_V3) >= 10,
    `maxItemsNodes=${countBoundedArrayMaxItems(PROFESSOR_V3_MODEL_RESPONSE_JSON_SCHEMA_V3)}`,
  );
  record(
    checks,
    "bounded-prompt-guidance-present",
    "Bounded output contract prompt guidance is present",
    formatProfessorV3BoundedOutputContractForPromptV3().includes(String(PROFESSOR_V3_BOUNDED_OUTPUT_LIMITS_V3.strategyHypotheses)),
  );

  const modelPin = loadProfessorModelPinV2();
  const requestBodyJson = buildProfessorV3ApiRequestBodyV4(modelPin, "system", "user");
  let apiAuditPass = false;
  try {
    assertProfessorV3ApiRequestBodyUsesAuditedStrictSchemaV3(requestBodyJson);
    apiAuditPass = true;
  } catch (err) {
    record(checks, "api-request-body-audit-pass", "Exact buildProfessorV3ApiRequestBodyV4 schema passes audit", false, String(err));
  }
  if (apiAuditPass) record(checks, "api-request-body-audit-pass", "Exact buildProfessorV3ApiRequestBodyV4 schema passes audit", true);

  if (existsSync(SPENT_SUCCESSOR_V2_INCOMPLETE_RAW_RESPONSE_PATH)) {
    const spentRaw = loadSpentSuccessorV2IncompleteRawResponseFixtureV1();
    const envelope = parseProfessorV3ResponsesApiEnvelope(spentRaw);
    const extracted = extractProfessorV3OutputTextFromResponsesApi(envelope);
    record(
      checks,
      "spent-v2-fixture-incomplete-status",
      "Spent successor v2 raw response fixture is incomplete/max_output_tokens",
      envelope.status === "incomplete" &&
        envelope.incomplete_details?.reason === "max_output_tokens" &&
        envelope.usage?.output_tokens === envelope.max_output_tokens,
      `status=${envelope.status}; reason=${envelope.incomplete_details?.reason}; outputTokens=${envelope.usage?.output_tokens}`,
    );

    jsonParseInvocations = getProfessorJsonParseInvocationCountForTests();
    resetProfessorJsonParseInvocationCountForTests();
    let incompleteCode: string | null = null;
    try {
      processProfessorV3ResponsesApiBoundary({ apiResponseRaw: spentRaw });
    } catch (error) {
      if (isProfessorV3ModelResponseBoundaryError(error)) incompleteCode = error.code;
    }
    record(
      checks,
      "incomplete-fixture-structured-error",
      "Spent v2 incomplete fixture raises MODEL_INCOMPLETE_MAX_OUTPUT_TOKENS",
      incompleteCode === PROFESSOR_V3_MODEL_INCOMPLETE_MAX_OUTPUT_TOKENS,
      `code=${incompleteCode}`,
    );
    jsonParseInvocations = getProfessorJsonParseInvocationCountForTests();
    record(
      checks,
      "incomplete-fixture-no-professor-json-parse",
      "Professor JSON.parse is not invoked for incomplete fixture",
      jsonParseInvocations === 0,
      `jsonParseInvocations=${jsonParseInvocations}`,
    );
    record(
      checks,
      "incomplete-fixture-emitted-text-length",
      "Spent v2 incomplete fixture emitted text length matches sealed run (~33498 chars)",
      extracted.outputText.length > 33000 && extracted.outputText.length < 34000,
      `length=${extracted.outputText.length}`,
    );

    try {
      assertProfessorV3ResponsesApiCompletedBeforeParse({
        envelope,
        emittedTextLength: extracted.outputText.length,
        messageStatus: extracted.messageStatus,
      });
      record(checks, "incomplete-fixture-gate-throws", "Response-state gate throws for incomplete fixture", false);
    } catch (error) {
      record(
        checks,
        "incomplete-fixture-gate-throws",
        "Response-state gate throws for incomplete fixture",
        isProfessorV3ModelResponseBoundaryError(error) &&
          error.code === PROFESSOR_V3_MODEL_INCOMPLETE_MAX_OUTPUT_TOKENS,
      );
    }
  } else {
    record(checks, "spent-v2-fixture-present", "Spent successor v2 raw response fixture present", false);
  }

  const completedRaw = buildCompletedStructuredOutputResponsesApiFixtureV1();
  let completedPass = false;
  try {
    const completedResponse = processProfessorV3ResponsesApiBoundary({ apiResponseRaw: completedRaw });
    const envelopePlan = validateProfessorV3ModelResponseEnvelopeV3({
      responseKind: "PLAN",
      toolRequests: [],
      strategyHypotheses: (completedResponse.parsed as { strategyHypotheses: unknown }).strategyHypotheses,
    });
    completedPass = envelopePlan.pass;
  } catch (err) {
    record(checks, "completed-fixture-parses", "Completed structured output fixture parses successfully", false, String(err));
  }
  if (completedPass) record(checks, "completed-fixture-parses", "Completed structured output fixture parses successfully", true);

  const malformedRaw = buildCompletedMalformedJsonResponsesApiFixtureV1();
  let malformedCode: string | null = null;
  try {
    processProfessorV3ResponsesApiBoundary({ apiResponseRaw: malformedRaw });
  } catch (error) {
    if (isProfessorV3ModelResponseBoundaryError(error)) malformedCode = error.code;
  }
  record(
    checks,
    "malformed-completed-fixture-distinct-error",
    "Completed malformed JSON fixture raises MODEL_RESPONSE_JSON_PARSE_FAILED",
    malformedCode === PROFESSOR_V3_MODEL_RESPONSE_JSON_PARSE_FAILED,
    `code=${malformedCode}`,
  );

  const roundtripPlan = buildProfessorV3ContractRoundtripRawPlanV1();
  const roundtripEnvelope = validateProfessorV3ModelResponseEnvelopeV3({
    responseKind: "PLAN",
    toolRequests: [],
    strategyHypotheses: roundtripPlan.strategyHypotheses,
  });
  record(checks, "roundtrip-plan-validates-under-v3-envelope", "Representative four-lens plan validates under v3 envelope", roundtripEnvelope.pass);

  const spentAttemptsDir = resolve(
    MILESTONES,
    "phase6a1-professor-v3-smoke-muldrotha-successor-model-attempts-v2",
  );
  if (existsSync(spentAttemptsDir)) {
    const partialFiles = enumerateProfessorV3PartialModelAttemptFilesV7(spentAttemptsDir);
    const accounting = computeProfessorV3SmokeAttemptAccountingV1({ partialModelAttemptFiles: partialFiles });
    record(
      checks,
      "spent-v2-attempt-accounting-api-call-count",
      "Spent v2 partial artifacts represent exactly one model API call",
      accounting.modelApiCallCount === 1,
      `modelApiCallCount=${accounting.modelApiCallCount}`,
    );
    record(
      checks,
      "spent-v2-attempt-accounting-artifact-count",
      "Spent v2 partial artifacts count five files for attempt-000",
      accounting.modelAttemptArtifactCount === 5,
      `modelAttemptArtifactCount=${accounting.modelAttemptArtifactCount}`,
    );
    record(
      checks,
      "spent-v2-attempt-accounting-zero-repairs",
      "Spent v2 attempt accounting reports zero repair attempts",
      accounting.repairAttemptCount === 0,
    );
    record(
      checks,
      "spent-v2-attempt-accounting-zero-tool-calls",
      "Spent v2 attempt accounting reports zero Professor tool calls",
      accounting.professorToolCallCount === 0,
    );
  } else {
    record(checks, "spent-v2-attempt-artifacts-present", "Spent v2 model attempt directory present", false);
  }

  let staleDecisionRejected = false;
  try {
    assertProfessorV3SmokeFailureDecisionV7(PROFESSOR_V3_STALE_SMOKE_DECISION_STRINGS_V7[0]);
  } catch {
    staleDecisionRejected = true;
  }
  record(
    checks,
    "stale-v1-decision-rejected-by-seal-v7",
    "Failure seal v7 rejects stale v1 decision string",
    staleDecisionRejected,
  );
  let validDecisionAccepted = false;
  try {
    assertProfessorV3SmokeFailureDecisionV7(DECISION);
    validDecisionAccepted = true;
  } catch {
    validDecisionAccepted = false;
  }
  record(checks, "repair-decision-accepted-by-seal-v7", "Failure seal v7 accepts repair block decision", validDecisionAccepted);

  const auth = verifyProfessorV3SmokeExecutionAuthorizationV7();
  record(
    checks,
    "successor-v3-authorization-matches-sealed-artifacts",
    "Authorization v7 matches sealed successor v3 identity/pins/runner/manifest",
    auth.ok,
    auth.ok ? undefined : Object.entries(auth.details ?? {}).map(([k, v]) => `${k}=${v}`).join("; "),
  );

  let preflightPass = false;
  try {
    assertProfessorV3SuccessorSmokeExecutionPreflightV7();
    preflightPass = true;
  } catch (err) {
    record(checks, "successor-v3-execution-preflight-pass", "Successor v3 execution preflight passes", false, String(err));
  }
  if (preflightPass) record(checks, "successor-v3-execution-preflight-pass", "Successor v3 execution preflight passes", true);

  const spentRequestPath = resolve(
    MILESTONES,
    "phase6a1-professor-v3-smoke-muldrotha-successor-model-attempts-v2/attempt-000-api-request-body.json",
  );
  if (existsSync(spentRequestPath)) {
    const spentBody = JSON.parse(readFileSync(spentRequestPath, "utf8")) as {
      text?: { format?: { schema?: Record<string, unknown> } };
    };
    record(
      checks,
      "spent-v2-schema-const-count-zero-in-request",
      "Spent v2 request schema has zero const-only property schemas",
      countConstOnlyPropertySchemas(spentBody.text?.format?.schema ?? {}) === 0,
    );
  } else {
    record(checks, "spent-v2-schema-const-count-zero-in-request", "Spent v2 request body present", false);
  }

  const audit = {
    version: "phase6a1-professor-v3-incomplete-response-output-budget-repair-audit-v1",
    generatedAt: new Date().toISOString(),
    decision: DECISION,
    spentSuccessorSmokeV1Preserved: true,
    spentSuccessorSmokeV2Preserved: true,
    openAiCallsInThisBlock: 0,
    totalChecks: checks.length,
    passed: checks.filter((c) => c.pass).length,
    failed: checks.filter((c) => !c.pass).length,
    checks,
  };
  writeFileSync(OUT_PATH, JSON.stringify(audit, null, 2));
  console.log(JSON.stringify({ artifact: OUT_PATH, sha256: sha256File(OUT_PATH), passed: audit.passed, total: audit.totalChecks }, null, 2));
  if (audit.failed > 0) process.exit(1);
}

main();
