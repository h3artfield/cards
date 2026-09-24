#!/usr/bin/env npx tsx
/** Report Professor v3 spent-failure repair bundle v1. */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { MILESTONES, sha256File } from "./lib/phase6a1-pinned-implementation-container-v1";

const AUDIT_PATH = resolve(MILESTONES, "phase6a1-professor-v3-spent-failure-repair-audit-v1.json");
const RAG_DIAG_PATH = resolve(MILESTONES, "phase6a1-professor-v3-muldrotha-rag-diagnostic-v1.json");
const OUT_PATH = resolve(MILESTONES, "phase6a1-professor-v3-spent-failure-repair-report-v1.json");

function readJson(path: string) {
  if (!existsSync(path)) throw new Error(`Missing artifact: ${path}`);
  return JSON.parse(readFileSync(path, "utf8"));
}

function main() {
  const audit = readJson(AUDIT_PATH);
  const rag = existsSync(RAG_DIAG_PATH) ? readJson(RAG_DIAG_PATH) : null;
  const report = {
    version: "phase6a1-professor-v3-spent-failure-repair-report-v1",
    generatedAt: new Date().toISOString(),
    decision: "PROFESSOR_V3_SMOKE_V1_SPENT_FAIL_CONTRACT_SCHEMA_AND_RAG_ENVIRONMENT_REPAIR_REQUIRED_NO_MODEL",
    instruction: "REPORT AND WAIT — contract schema + structured output + zero-hit retrieval + RAG diagnostic submitted. Next authorization: one successor Muldrotha Professor v3 smoke only.",
    spentSmokePreserved: true,
    openAiCalls: 0,
    audit: {
      artifact: "phase6a1-professor-v3-spent-failure-repair-audit-v1.json",
      sha256: sha256File(AUDIT_PATH),
      passed: audit.passed,
      totalChecks: audit.totalChecks,
      failed: audit.failed,
    },
    ragDiagnostic: rag
      ? {
          artifact: "phase6a1-professor-v3-muldrotha-rag-diagnostic-v1.json",
          sha256: sha256File(RAG_DIAG_PATH),
          diagnosis: rag.diagnosis,
          withoutEnvHits: rag.withoutProjectEnvLocal?.totalHits ?? 0,
          withEnvHits: rag.withProjectEnvLocal?.totalHits ?? 0,
          successorSmokeAuthorizationReady: rag.successorSmokeAuthorizationReady,
        }
      : null,
    repairsDelivered: {
      P0: "Shared machine-readable Professor v3 plan output schema drives prompt, structured output, normalizer alignment",
      P1: "Model caller uses Responses API json_schema strict structured output",
      P2: "Dependency enums and full EvidenceRef union explicit in schema and prompt",
      P3: "Deterministic four-lens contract round-trip audit with negative schema fixtures",
      P4: "Same-environment Muldrotha RAG diagnostic script",
      P5: "Zero-hit initial retrieval attempts preserved in run ledger events",
    },
    nextAuthorizedStep: "One successor Muldrotha Professor v3 smoke run only after independent contract + RAG environment pass",
  };
  writeFileSync(OUT_PATH, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ artifact: OUT_PATH, sha256: sha256File(OUT_PATH), auditPassed: audit.passed, auditTotal: audit.totalChecks }, null, 2));
}

main();
