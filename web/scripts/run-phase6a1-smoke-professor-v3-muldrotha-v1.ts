#!/usr/bin/env npx tsx
/** Prepared one-case Muldrotha Professor v3 smoke runner — DO NOT EXECUTE without authorization. */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildProfessorPlanningContextV3Sync } from "./lib/phase6a1-professor-plan-context-builder-v3";
import { getPilotMechanismCatalogEntry } from "./lib/phase6a1-spent-pilot-truth-loader-v1";
import { runProfessorPlanCaseV3Orchestration, PROFESSOR_V3_MODEL_AUTHORIZATION } from "./lib/phase6a1-professor-plan-agent-v3";
import { MILESTONES, sha256File } from "./lib/phase6a1-pinned-implementation-container-v1";

const OUT_PATH = resolve(MILESTONES, "phase6a1-professor-v3-smoke-muldrotha-prepared-v1.json");

async function main() {
  const entry = getPilotMechanismCatalogEntry("multi-muldrotha");
  if (!entry) throw new Error("Missing Muldrotha mechanism truth");
  const ctx = buildProfessorPlanningContextV3Sync({ entry, oppCase: null, options: { includeMechanicalAffordances: true } });
  ctx.caseId = "professor-v3-smoke-muldrotha-prepared";

  const preflightOnly = await runProfessorPlanCaseV3Orchestration({ ctx, modelAuthorization: PROFESSOR_V3_MODEL_AUTHORIZATION });
  const artifact = {
    version: "phase6a1-professor-v3-smoke-muldrotha-prepared-v1",
    generatedAt: new Date().toISOString(),
    decision: "PREPARED_NOT_EXECUTED",
    executionAuthorizationRequired: true,
    caseId: ctx.caseId,
    preflightStatus: preflightOnly.caseStatus,
    modelAuthorization: PROFESSOR_V3_MODEL_AUTHORIZATION,
    note: "Smoke runner prepared. Execute only after independent v5 review authorization for one real Muldrotha Professor v3 smoke run.",
    nextCommandWhenAuthorized:
      "Set modelAuthorization=AUTHORIZED and provide modelCaller in runProfessorPlanCaseV3Orchestration — still requires explicit human authorization gate.",
  };

  writeFileSync(OUT_PATH, JSON.stringify(artifact, null, 2));
  console.log(JSON.stringify({ artifact: OUT_PATH, sha256: sha256File(OUT_PATH), prepared: true, executed: false }, null, 2));
}

main();
