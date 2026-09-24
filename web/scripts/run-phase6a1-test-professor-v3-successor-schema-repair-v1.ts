#!/usr/bin/env npx tsx
/** Professor v3 successor API schema type-annotation repair audit — no OpenAI. */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildEvidenceResolverContextV3, resolveEvidenceRefExistenceV3 } from "../src/lib/deck-synthesis/professor-planning-evidence-resolver-v3";
import { initRunLedgerFromContext } from "../src/lib/deck-synthesis/professor-v3-run-ledger-v1";
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
} from "./lib/phase6a1-professor-v3-contract-roundtrip-fixture-v1";
import {
  auditProfessorV3StructuredOutputSchemaStrictCompatibilityV2,
  countConstOnlyPropertySchemas,
  PROFESSOR_V3_MODEL_RESPONSE_JSON_SCHEMA_V2,
  validateProfessorV3ModelResponseEnvelopeV2,
} from "./lib/phase6a1-professor-v3-plan-output-schema-v2";
import {
  assertProfessorV3SuccessorSmokeExecutionPreflightV6,
  verifyProfessorV3SmokeExecutionAuthorizationV6,
} from "./lib/phase6a1-professor-v3-smoke-material-pins-v5";
import { verifyProfessorV3SuccessorRagPreflightV1 } from "./lib/phase6a1-professor-v3-successor-rag-preflight-v1";
import { loadProjectEnvLocal } from "./lib/script-env";
import { getPilotMechanismCatalogEntry } from "./lib/phase6a1-spent-pilot-truth-loader-v1";
import { MILESTONES, sha256File } from "./lib/phase6a1-pinned-implementation-container-v1";

const OUT_PATH = resolve(MILESTONES, "phase6a1-professor-v3-successor-schema-repair-audit-v1.json");
const SPENT_REQUEST_PATH = resolve(
  MILESTONES,
  "phase6a1-professor-v3-smoke-muldrotha-successor-model-attempts-v1/attempt-000-api-request-body.json",
);

type Check = { id: string; description: string; pass: boolean; detail?: string };

function record(checks: Check[], id: string, description: string, pass: boolean, detail?: string) {
  checks.push({ id, description, pass, detail });
}

async function main() {
  const checks: Check[] = [];
  const ctx = buildProfessorV3ContractRoundtripContextV1();
  const rawPlan = buildProfessorV3ContractRoundtripRawPlanV1();

  const repairedAudit = auditProfessorV3StructuredOutputSchemaStrictCompatibilityV2(PROFESSOR_V3_MODEL_RESPONSE_JSON_SCHEMA_V2);
  record(
    checks,
    "repaired-schema-audit-pass",
    "Repaired schema passes strict audit with constOnlyPropertyCount=0",
    repairedAudit.pass && repairedAudit.constOnlyPropertyCount === 0,
    `constOnlyPropertyCount=${repairedAudit.constOnlyPropertyCount}; issues=${repairedAudit.issues.map((i) => i.path).join(",")}`,
  );

  if (existsSync(SPENT_REQUEST_PATH)) {
    const spentBody = JSON.parse(readFileSync(SPENT_REQUEST_PATH, "utf8")) as {
      text?: { format?: { schema?: Record<string, unknown> } };
    };
    const spentSchema = spentBody.text?.format?.schema;
    const spentConstCount = spentSchema ? countConstOnlyPropertySchemas(spentSchema) : -1;
    const spentAudit = spentSchema ? auditProfessorV3StructuredOutputSchemaStrictCompatibilityV2(spentSchema) : null;
    record(
      checks,
      "spent-request-const-only-count-36",
      "Spent successor v1 API request schema had constOnlyPropertyCount=36",
      spentConstCount === 36,
      `constOnlyPropertyCount=${spentConstCount}`,
    );
    record(
      checks,
      "spent-request-would-fail-new-audit",
      "Spent successor v1 API request schema fails strengthened audit",
      spentAudit ? !spentAudit.pass && spentAudit.constOnlyPropertyCount === 36 : false,
    );
  } else {
    record(checks, "spent-request-const-only-count-36", "Spent request artifact present for regression anchor", false, "missing spent request body");
  }

  const modelPin = loadProfessorModelPinV2();
  const requestBodyJson = buildProfessorV3ApiRequestBody(modelPin, "system", "user");
  let apiAuditPass = false;
  try {
    assertProfessorV3ApiRequestBodyUsesAuditedStrictSchemaV2(requestBodyJson);
    apiAuditPass = true;
  } catch (err) {
    record(checks, "api-request-body-audit-pass", "Exact buildProfessorV3ApiRequestBody schema passes strengthened audit", false, String(err));
  }
  if (apiAuditPass) record(checks, "api-request-body-audit-pass", "Exact buildProfessorV3ApiRequestBody schema passes strengthened audit", true);

  const envelopeTool = validateProfessorV3ModelResponseEnvelopeV2({
    responseKind: "TOOL_REQUESTS",
    toolRequests: [{ tool: "searchMtgKnowledge", query: "muldrotha", mode: "COMMANDER_PRIMER", limit: 4 }],
    strategyHypotheses: [],
  });
  record(checks, "envelope-tool-requests-valid", "responseKind=TOOL_REQUESTS with searchMtgKnowledge validates", envelopeTool.pass);

  const envelopePlan = validateProfessorV3ModelResponseEnvelopeV2({
    responseKind: "PLAN",
    toolRequests: [],
    strategyHypotheses: rawPlan.strategyHypotheses,
  });
  record(checks, "envelope-plan-all-evidence-ref-variants-valid", "responseKind=PLAN with all EvidenceRef variants validates", envelopePlan.pass);

  const normalization = normalizeProfessorPlanningResponseV3({ parsedModelResponse: rawPlan, ctx });
  record(checks, "plan-normalizer-pass", "Representative four-lens plan passes normalizer", normalization.status === "SUCCESS");

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
    record(checks, "plan-reference-integrity-pass", "Representative plan passes reference integrity", resolverPass);
  } else {
    record(checks, "plan-reference-integrity-pass", "Representative plan passes reference integrity", false, "skipped");
  }

  loadProjectEnvLocal();
  const entry = getPilotMechanismCatalogEntry("multi-muldrotha");
  if (!entry) throw new Error("Missing Muldrotha entry");
  const liveCtx = await buildProfessorPlanningContextV3({ entry, oppCase: null, options: { includeMechanicalAffordances: true } });
  const rag = verifyProfessorV3SuccessorRagPreflightV1({ ...liveCtx, caseId: "schema-repair-rag-preflight" });
  record(
    checks,
    "rag-preflight-retained",
    "Project env RAG preflight still passes with initialRagEvidence >= 1",
    rag.pass && rag.initialRagEvidenceCount >= 1 && rag.firebaseProjectId === "trading-card-buyback-dev",
    rag.issues.join("; ") || `hits=${rag.initialRagEvidenceCount}`,
  );

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
  const ledger = initRunLedgerFromContext({ ...twoSearchCtx, caseId: "ledger-fixture" });
  record(
    checks,
    "retrieval-event-accounting-retained",
    "Two initial searches still produce exactly two retrieval events",
    ledger.retrievalEvents.length === 2,
  );

  const auth = verifyProfessorV3SmokeExecutionAuthorizationV6();
  record(
    checks,
    "successor-v2-authorization-matches-sealed-artifacts",
    "Authorization v6 matches sealed successor v2 identity/pins/runner/manifest",
    auth.ok,
    auth.ok ? undefined : Object.entries(auth.details ?? {}).map(([k, v]) => `${k}=${v}`).join("; "),
  );

  let preflightPass = false;
  try {
    assertProfessorV3SuccessorSmokeExecutionPreflightV6();
    preflightPass = true;
  } catch (err) {
    record(checks, "successor-v2-execution-preflight-pass", "Successor v2 execution preflight passes", false, String(err));
  }
  if (preflightPass) record(checks, "successor-v2-execution-preflight-pass", "Successor v2 execution preflight passes", true);

  const audit = {
    version: "phase6a1-professor-v3-successor-schema-repair-audit-v1",
    generatedAt: new Date().toISOString(),
    decision: "PROFESSOR_V3_SUCCESSOR_SMOKE_V1_SPENT_FAIL_API_SCHEMA_TYPE_ANNOTATION_REPAIR_REQUIRED_NO_MODEL",
    spentSuccessorSmokePreserved: true,
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

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
