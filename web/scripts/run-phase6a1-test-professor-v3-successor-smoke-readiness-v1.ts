#!/usr/bin/env npx tsx
/** Professor v3 successor smoke readiness audit — strict schema + RAG env + ledger, no OpenAI. */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { appendRetrievalEvent, initRunLedgerFromContext } from "../src/lib/deck-synthesis/professor-v3-run-ledger-v1";
import { buildEvidenceResolverContextV3, resolveEvidenceRefExistenceV3 } from "../src/lib/deck-synthesis/professor-planning-evidence-resolver-v3";
import { buildProfessorPlanningContextV3 } from "./lib/phase6a1-professor-plan-context-builder-v3";
import { normalizeProfessorPlanningResponseV3 } from "./lib/phase6a1-professor-plan-normalizer-v3";
import {
  assertProfessorV3ApiRequestBodyUsesAuditedStrictSchemaV2,
  buildProfessorV3ApiRequestBody,
} from "./lib/phase6a1-professor-v3-model-caller-v3";
import { loadProfessorModelPinV2 } from "./lib/phase6a1-professor-plan-model-pin-v2";
import {
  buildProfessorV3ContractRoundtripContextV1,
  buildProfessorV3ContractRoundtripRawPlanV1,
  PROFESSOR_V3_CONTRACT_NEGATIVE_FIXTURES_V1,
} from "./lib/phase6a1-professor-v3-contract-roundtrip-fixture-v1";
import {
  auditProfessorV3StructuredOutputSchemaStrictCompatibilityV2,
  buildProfessorV3NormalizationRepairPromptV2,
  PROFESSOR_V3_MODEL_RESPONSE_JSON_SCHEMA_V2,
  validateProfessorV3ModelResponseEnvelopeV2,
  validateProfessorV3PlanOutputSchemaV2,
} from "./lib/phase6a1-professor-v3-plan-output-schema-v2";
import { buildProfessorV3PromptPayload } from "./lib/phase6a1-professor-v3-prompt-payload-v1";
import {
  assertProfessorV3SuccessorSmokeExecutionPreflightV5,
  verifyProfessorV3SmokeExecutionAuthorizationV5,
} from "./lib/phase6a1-professor-v3-smoke-material-pins-v4";
import { verifyProfessorV3SuccessorRagPreflightV1 } from "./lib/phase6a1-professor-v3-successor-rag-preflight-v1";
import { loadProjectEnvLocal } from "./lib/script-env";
import { getPilotMechanismCatalogEntry } from "./lib/phase6a1-spent-pilot-truth-loader-v1";
import { MILESTONES, sha256File } from "./lib/phase6a1-pinned-implementation-container-v1";

const OUT_PATH = resolve(MILESTONES, "phase6a1-professor-v3-successor-smoke-readiness-audit-v1.json");

type Check = { id: string; description: string; pass: boolean; detail?: string };

function record(checks: Check[], id: string, description: string, pass: boolean, detail?: string) {
  checks.push({ id, description, pass, detail });
}

async function main() {
  const checks: Check[] = [];
  const ctx = buildProfessorV3ContractRoundtripContextV1();
  const rawPlan = buildProfessorV3ContractRoundtripRawPlanV1();
  const payload = buildProfessorV3PromptPayload(ctx);

  record(
    checks,
    "prompt-payload-binds-output-schema-v2",
    "Prompt payload exposes strict envelope schema version v2",
    payload.outputSchemaVersion === "phase6a1-professor-v3-plan-output-schema-v2",
  );
  record(
    checks,
    "prompt-payload-includes-envelope",
    "Prompt payload includes responseKind envelope contract",
    payload.modelVisibleText.includes('"responseKind"') && payload.modelVisibleText.includes("TOOL_REQUESTS"),
  );

  const schemaAudit = auditProfessorV3StructuredOutputSchemaStrictCompatibilityV2(PROFESSOR_V3_MODEL_RESPONSE_JSON_SCHEMA_V2);
  record(
    checks,
    "strict-schema-audit-root-object",
    "Model response schema passes recursive strict Structured Outputs audit",
    schemaAudit.pass,
    schemaAudit.issues.map((i) => `${i.path}: ${i.message}`).join("; ") || undefined,
  );
  record(checks, "strict-schema-no-root-oneof", "Model response schema has no root oneOf", !("oneOf" in PROFESSOR_V3_MODEL_RESPONSE_JSON_SCHEMA_V2));

  const envelopeTool = validateProfessorV3ModelResponseEnvelopeV2({
    responseKind: "TOOL_REQUESTS",
    toolRequests: [{ tool: "searchMtgKnowledge", query: "muldrotha", mode: "COMMANDER_PRIMER", limit: 4 }],
    strategyHypotheses: [],
  });
  record(checks, "envelope-tool-requests-valid", "responseKind=TOOL_REQUESTS envelope validates", envelopeTool.pass);

  const envelopePlan = validateProfessorV3ModelResponseEnvelopeV2({
    responseKind: "PLAN",
    toolRequests: [],
    strategyHypotheses: rawPlan.strategyHypotheses,
  });
  record(checks, "envelope-plan-valid", "responseKind=PLAN envelope validates with four-lens plan", envelopePlan.pass);

  const schema = validateProfessorV3PlanOutputSchemaV2(rawPlan);
  record(checks, "roundtrip-schema-pass", "Representative four-lens plan passes schema validation v2", schema.pass);

  const normalization = normalizeProfessorPlanningResponseV3({ parsedModelResponse: rawPlan, ctx });
  record(checks, "roundtrip-normalizer-pass", "Representative four-lens plan passes normalizer", normalization.status === "SUCCESS");

  if (normalization.status === "SUCCESS") {
    const resolverCtx = buildEvidenceResolverContextV3(ctx);
    let resolverPass = true;
    for (const hyp of normalization.normalized) {
      const refBlobs = [
        ...hyp.evidenceRefs,
        ...hyp.strategicAssertions.flatMap((a) => a.evidenceRefs),
        ...hyp.causalEdges.flatMap((e) => e.evidenceRefs),
        ...hyp.packages.flatMap((p) => p.evidenceRefs),
        ...hyp.relationships.flatMap((r) => r.evidenceRefs),
      ];
      for (const ref of refBlobs) {
        if (resolveEvidenceRefExistenceV3({ ctx: resolverCtx, ref }).length > 0) resolverPass = false;
      }
    }
    record(checks, "roundtrip-reference-integrity-pass", "Representative plan evidence refs resolve", resolverPass);
  } else {
    record(checks, "roundtrip-reference-integrity-pass", "Representative plan passes reference integrity", false, "skipped");
  }

  const negString = validateProfessorV3PlanOutputSchemaV2(PROFESSOR_V3_CONTRACT_NEGATIVE_FIXTURES_V1.stringEvidenceRef);
  record(checks, "schema-rejects-string-evidence-ref", "String evidenceRef rejected", !negString.pass);

  const negAlias = validateProfessorV3PlanOutputSchemaV2(PROFESSOR_V3_CONTRACT_NEGATIVE_FIXTURES_V1.aliasEvidenceRef);
  record(checks, "schema-rejects-alias-evidence-ref", "{evidenceId,evidenceType} rejected", !negAlias.pass);

  const repairPrompt = buildProfessorV3NormalizationRepairPromptV2({
    issues: [{ path: "strategyHypotheses[0].evidenceRefs[0]", message: "evidenceRef must be object with kind" }],
  });
  record(checks, "repair-prompt-includes-schema-fragment", "Repair prompt includes schema fragment", repairPrompt.includes("EvidenceRef union"));

  const modelPin = loadProfessorModelPinV2();
  const requestBodyJson = buildProfessorV3ApiRequestBody(modelPin, "system", "user");
  const requestBody = JSON.parse(requestBodyJson);
  record(
    checks,
    "model-caller-uses-json-schema-strict",
    "Model caller uses Responses API json_schema strict",
    requestBody.text?.format?.type === "json_schema" && requestBody.text?.format?.strict === true,
  );

  let apiBodyAuditPass = false;
  try {
    assertProfessorV3ApiRequestBodyUsesAuditedStrictSchemaV2(requestBodyJson);
    apiBodyAuditPass = true;
  } catch (err) {
    record(checks, "api-request-body-uses-audited-schema", "API request body schema passes strict audit", false, String(err));
  }
  if (apiBodyAuditPass) {
    record(checks, "api-request-body-uses-audited-schema", "API request body schema passes strict audit", true);
  }

  const entry = getPilotMechanismCatalogEntry("multi-muldrotha");
  if (!entry) throw new Error("Missing Muldrotha entry");

  const twoSearchCtx = await buildProfessorPlanningContextV3({
    entry,
    oppCase: null,
    options: {
      includeMechanicalAffordances: true,
      searchMtgKnowledgeImpl: async (input) => ({
        mode: input.mode,
        consumer: input.consumer,
        query: input.query,
        enabled: true,
        hits:
          input.mode === "COMMANDER_PRIMER"
            ? [{ chunkId: "rag-a", corpus: "commander_primer", authorityTier: "curated", citationLabel: "a", retrievalMethod: "lexical_exact", score: 1, provenanceTier: "CURATED_KNOWLEDGE", retrievalText: "a" }]
            : [{ chunkId: "rag-b", corpus: "commander_primer", authorityTier: "curated", citationLabel: "b", retrievalMethod: "lexical_exact", score: 1, provenanceTier: "CURATED_KNOWLEDGE", retrievalText: "b" }],
        corpora: ["commander_primer"],
        aliasMatches: 0,
        lexicalMatches: 1,
        vectorMatches: 0,
      }),
    },
  });
  const twoSearchLedger = initRunLedgerFromContext({ ...twoSearchCtx, caseId: "two-search-fixture" });
  const eventIdsUnique = twoSearchLedger.retrievalEvents.every((event) => {
    const uniq = new Set(event.returnedEvidenceIds);
    return uniq.size === event.returnedEvidenceIds.length;
  });
  const resultCountsMatch = twoSearchLedger.retrievalEvents.every(
    (event) => event.resultCount === event.returnedEvidenceIds.length,
  );
  record(
    checks,
    "retrieval-one-event-per-attempt",
    "Two initial searches produce exactly two retrieval events without supplement duplicates",
    twoSearchLedger.retrievalEvents.length === 2,
    `events=${twoSearchLedger.retrievalEvents.length}`,
  );
  record(checks, "retrieval-returned-evidence-ids-unique", "Every returnedEvidenceIds array is unique internally", eventIdsUnique);
  record(checks, "retrieval-result-count-matches", "resultCount matches returnedEvidenceIds length", resultCountsMatch);

  const callerIds = ["existing-id"];
  const before = [...callerIds];
  appendRetrievalEvent({
    runLedger: { version: "professor-v3-run-ledger-v1", caseId: "mut-test", evidenceObjects: [], retrievalEvents: [] },
    hits: [
      {
        chunkId: "existing-id",
        corpus: "commander_primer",
        authorityTier: "curated",
        citationLabel: "dup",
        retrievalMethod: "lexical_exact",
        score: 1,
        provenanceTier: "CURATED_KNOWLEDGE",
        retrievalText: "dup",
      },
      {
        chunkId: "new-id",
        corpus: "commander_primer",
        authorityTier: "curated",
        citationLabel: "new",
        retrievalMethod: "lexical_exact",
        score: 1,
        provenanceTier: "CURATED_KNOWLEDGE",
        retrievalText: "new",
      },
    ],
    tool: "searchMtgKnowledge",
    query: "q",
    returnedEvidenceIds: callerIds,
  });
  record(
    checks,
    "retrieval-does-not-mutate-caller-ids",
    "appendRetrievalEvent does not mutate caller-supplied returnedEvidenceIds array",
    callerIds.length === before.length && before[0] === "existing-id",
    `callerIds=${JSON.stringify(callerIds)} before=${JSON.stringify(before)}`,
  );

  loadProjectEnvLocal();
  const liveCtx = await buildProfessorPlanningContextV3({ entry, oppCase: null, options: { includeMechanicalAffordances: true } });
  const ragPreflight = verifyProfessorV3SuccessorRagPreflightV1({ ...liveCtx, caseId: "rag-preflight-fixture" });
  record(
    checks,
    "successor-rag-preflight-with-project-env",
    "Project env yields MTG_RAG_ENABLED=true and initial RAG evidence >= 1",
    ragPreflight.pass,
    ragPreflight.issues.join("; ") || `hits=${ragPreflight.initialRagEvidenceCount}`,
  );

  const auth = verifyProfessorV3SmokeExecutionAuthorizationV5();
  record(
    checks,
    "successor-authorization-root-matches-sealed-artifacts",
    "External authorization v5 matches sealed identity/pins/runner/manifest",
    auth.ok,
    auth.ok ? undefined : Object.entries(auth.details ?? {}).map(([k, v]) => `${k}=${v}`).join("; "),
  );

  let preflightPass = false;
  try {
    assertProfessorV3SuccessorSmokeExecutionPreflightV5();
    preflightPass = true;
  } catch (err) {
    record(checks, "successor-execution-preflight-pass", "Successor execution preflight (auth + identity + pins) passes", false, String(err));
  }
  if (preflightPass) record(checks, "successor-execution-preflight-pass", "Successor execution preflight (auth + identity + pins) passes", true);

  const tmp = mkdtempSync(join(tmpdir(), "professor-v3-successor-readiness-"));
  mkdirSync(tmp, { recursive: true });
  try {
    writeFileSync(join(tmp, "request.json"), requestBodyJson);
    record(checks, "structured-output-request-serializable", "Audited structured output request body serializes", sha256File(join(tmp, "request.json")).length === 64);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }

  const audit = {
    version: "phase6a1-professor-v3-successor-smoke-readiness-audit-v1",
    generatedAt: new Date().toISOString(),
    decision:
      "PROFESSOR_V3_SPENT_FAILURE_REPAIR_V1_BLOCK_STRUCTURED_OUTPUT_SCHEMA_API_INCOMPATIBLE_AND_SUCCESSOR_EXECUTION_DELTA_REQUIRED",
    totalChecks: checks.length,
    passed: checks.filter((c) => c.pass).length,
    failed: checks.filter((c) => !c.pass).length,
    checks,
  };
  writeFileSync(OUT_PATH, JSON.stringify(audit, null, 2));
  console.log(JSON.stringify({ artifact: OUT_PATH, sha256: sha256File(OUT_PATH), passed: audit.passed, total: audit.totalChecks }, null, 2));
  if (audit.failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
