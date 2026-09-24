#!/usr/bin/env npx tsx
/** Professor v3 spent-failure repair audit — contract schema + RAG environment, no OpenAI. */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { buildEvidenceResolverContextV3, resolveEvidenceRefExistenceV3 } from "../src/lib/deck-synthesis/professor-planning-evidence-resolver-v3";
import { initRunLedgerFromContext } from "../src/lib/deck-synthesis/professor-v3-run-ledger-v1";
import { buildProfessorPlanningContextV3 } from "./lib/phase6a1-professor-plan-context-builder-v3";
import { normalizeProfessorPlanningResponseV3 } from "./lib/phase6a1-professor-plan-normalizer-v3";
import { buildProfessorV3ApiRequestBody } from "./lib/phase6a1-professor-v3-model-caller-v3";
import { loadProfessorModelPinV2 } from "./lib/phase6a1-professor-plan-model-pin-v2";
import {
  buildProfessorV3ContractRoundtripContextV1,
  buildProfessorV3ContractRoundtripRawPlanV1,
  PROFESSOR_V3_CONTRACT_NEGATIVE_FIXTURES_V1,
} from "./lib/phase6a1-professor-v3-contract-roundtrip-fixture-v1";
import {
  buildProfessorV3NormalizationRepairPromptV1,
  validateProfessorV3PlanOutputSchemaV1,
} from "./lib/phase6a1-professor-v3-plan-output-schema-v1";
import { buildProfessorV3PromptPayload } from "./lib/phase6a1-professor-v3-prompt-payload-v1";
import { getPilotMechanismCatalogEntry } from "./lib/phase6a1-spent-pilot-truth-loader-v1";
import { MILESTONES, sha256File } from "./lib/phase6a1-pinned-implementation-container-v1";

const OUT_PATH = resolve(MILESTONES, "phase6a1-professor-v3-spent-failure-repair-audit-v1.json");

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
    "prompt-payload-binds-output-schema",
    "Prompt payload exposes machine-readable output schema version",
    payload.outputSchemaVersion === "phase6a1-professor-v3-plan-output-schema-v1",
  );
  record(
    checks,
    "prompt-payload-includes-evidence-ref-objects",
    "Prompt payload forbids bare string evidenceRefs in output contract section",
    payload.modelVisibleText.includes('"kind": "MECHANISM_FACT"') &&
      payload.modelVisibleText.includes("never bare strings"),
  );

  const schema = validateProfessorV3PlanOutputSchemaV1(rawPlan);
  record(checks, "roundtrip-schema-pass", "Representative four-lens plan passes schema validation", schema.pass, schema.issues.map((i) => `${i.path}: ${i.message}`).join("; "));

  const normalization = normalizeProfessorPlanningResponseV3({ parsedModelResponse: rawPlan, ctx });
  record(
    checks,
    "roundtrip-normalizer-pass",
    "Representative four-lens plan passes normalizer",
    normalization.status === "SUCCESS",
    normalization.status === "NORMALIZATION_FAILURE" ? normalization.issues.map((i) => `${i.path}: ${i.message}`).join("; ") : undefined,
  );

  if (normalization.status === "SUCCESS") {
    const resolverCtx = buildEvidenceResolverContextV3(ctx);
    let resolverPass = true;
    const resolverFailures: string[] = [];
    for (const hyp of normalization.normalized) {
      const refBlobs = [
        ...hyp.evidenceRefs,
        ...hyp.strategicAssertions.flatMap((a) => a.evidenceRefs),
        ...hyp.causalEdges.flatMap((e) => e.evidenceRefs),
        ...hyp.packages.flatMap((p) => p.evidenceRefs),
        ...hyp.relationships.flatMap((r) => r.evidenceRefs),
      ];
      for (const ref of refBlobs) {
        const issues = resolveEvidenceRefExistenceV3({ ctx: resolverCtx, ref });
        if (issues.length > 0) {
          resolverPass = false;
          resolverFailures.push(`${hyp.hypothesisId}:${issues.map((i) => i.code).join(",")}`);
        }
      }
    }
    record(
      checks,
      "roundtrip-reference-integrity-pass",
      "Representative plan evidence refs resolve in reference-integrity resolver",
      resolverPass,
      resolverFailures.join("; ") || undefined,
    );
  } else {
    record(checks, "roundtrip-reference-integrity-pass", "Representative plan passes reference integrity", false, "skipped — normalizer failed");
  }

  const negString = validateProfessorV3PlanOutputSchemaV1(PROFESSOR_V3_CONTRACT_NEGATIVE_FIXTURES_V1.stringEvidenceRef);
  record(checks, "schema-rejects-string-evidence-ref", "String evidenceRef rejected by schema", !negString.pass);

  const negAlias = validateProfessorV3PlanOutputSchemaV1(PROFESSOR_V3_CONTRACT_NEGATIVE_FIXTURES_V1.aliasEvidenceRef);
  record(checks, "schema-rejects-alias-evidence-ref", "{evidenceId,evidenceType} rejected by schema", !negAlias.pass);

  const posKind = validateProfessorV3PlanOutputSchemaV1(PROFESSOR_V3_CONTRACT_NEGATIVE_FIXTURES_V1.validMechanismRef);
  record(checks, "schema-accepts-proper-mechanism-ref", "Proper {kind,factIds} accepted by schema", posKind.pass);

  const negBool = validateProfessorV3PlanOutputSchemaV1(PROFESSOR_V3_CONTRACT_NEGATIVE_FIXTURES_V1.booleanWorksWithoutCommander);
  record(checks, "schema-rejects-boolean-worksWithoutCommander", "worksWithoutCommander=false rejected by schema", !negBool.pass);

  const depPass = validateProfessorV3PlanOutputSchemaV1({
    strategyHypotheses: [
      {
        ...PROFESSOR_V3_CONTRACT_NEGATIVE_FIXTURES_V1.validMechanismRef.strategyHypotheses[0],
        packages: [
          {
            packageId: "dep-pkg",
            purpose: "dep",
            functionalRoles: ["ENGINE"],
            commanderDependency: "LOW",
            worksWithoutCommander: "HIGH",
            evidenceRefs: [{ kind: "MECHANISM_FACT", factIds: ["muldrotha-graveyard-permanent-cast"] }],
          },
        ],
      },
    ],
  });
  record(checks, "schema-accepts-dependency-enums", "worksWithoutCommander=HIGH|MEDIUM|LOW accepted by schema", depPass.pass);

  const repairPrompt = buildProfessorV3NormalizationRepairPromptV1({
    issues: [{ path: "strategyHypotheses[0].evidenceRefs[0]", message: "evidenceRef must be object with kind — bare string IDs are rejected" }],
  });
  record(
    checks,
    "repair-prompt-includes-schema-fragment",
    "Repair prompt includes exact expected schema fragment for failing path",
    repairPrompt.includes("Expected schema fragment") || repairPrompt.includes("EvidenceRef union"),
  );

  const modelPin = loadProfessorModelPinV2();
  const requestBody = JSON.parse(buildProfessorV3ApiRequestBody(modelPin, "system", "user"));
  record(
    checks,
    "model-caller-uses-json-schema",
    "Model caller uses Responses API json_schema structured output",
    requestBody.text?.format?.type === "json_schema" && requestBody.text?.format?.strict === true,
  );

  const entry = getPilotMechanismCatalogEntry("multi-muldrotha");
  if (!entry) throw new Error("Missing Muldrotha entry");
  const zeroHitCtx = await buildProfessorPlanningContextV3({
    entry,
    oppCase: null,
    options: {
      includeMechanicalAffordances: true,
      searchMtgKnowledgeImpl: async (input) => ({
        mode: input.mode,
        consumer: input.consumer,
        query: input.query,
        enabled: true,
        hits: [],
        corpora: ["commander_primer"],
        aliasMatches: 0,
        lexicalMatches: 0,
        vectorMatches: 0,
      }),
    },
  });
  const zeroLedger = initRunLedgerFromContext({ ...zeroHitCtx, caseId: "zero-hit-fixture" });
  record(
    checks,
    "zero-hit-retrieval-events-preserved",
    "Zero-hit initial retrieval attempts create run ledger events",
    zeroLedger.retrievalEvents.length >= 2 &&
      zeroLedger.retrievalEvents.every((e) => e.resultCount === 0 && (e.status === "EMPTY" || e.status === "DISABLED")),
    `events=${zeroLedger.retrievalEvents.length}; statuses=${zeroLedger.retrievalEvents.map((e) => e.status).join(",")}`,
  );

  const tmp = mkdtempSync(join(tmpdir(), "professor-v3-spent-failure-repair-"));
  mkdirSync(tmp, { recursive: true });
  try {
    writeFileSync(join(tmp, "request.json"), JSON.stringify(requestBody));
    record(checks, "structured-output-schema-serializable", "Structured output request body serializes", sha256File(join(tmp, "request.json")).length === 64);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }

  const audit = {
    version: "phase6a1-professor-v3-spent-failure-repair-audit-v1",
    generatedAt: new Date().toISOString(),
    decision: "PROFESSOR_V3_SMOKE_V1_SPENT_FAIL_CONTRACT_SCHEMA_AND_RAG_ENVIRONMENT_REPAIR_REQUIRED_NO_MODEL",
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
