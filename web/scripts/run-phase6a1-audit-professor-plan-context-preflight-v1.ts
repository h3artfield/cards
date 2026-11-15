#!/usr/bin/env npx tsx
/** P4 — deterministic Professor planning context preflight audit (no OpenAI). */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ProfessorPlanningContext } from "../src/lib/deck-synthesis/professor-planning-contracts-v2";
import { fileURLToPath } from "node:url";
import { MILESTONES, sha256File } from "./lib/phase6a1-pinned-implementation-container-v1";
import {
  auditProfessorPlanningContextPreflight,
  PROFESSOR_PLAN_CONTEXT_PREFLIGHT_V1_VERSION,
} from "./lib/phase6a1-professor-plan-context-preflight-v1";
import { PILOT_COMMANDER_SLOTS } from "./lib/phase6a1-serialization-pilot-v8-config-v1";
import { buildSpentPilotAuditPlanningContext } from "./lib/phase6a1-spent-pilot-audit-context-v1";

const HERE = resolve(fileURLToPath(import.meta.url), "..");
const OUT_PATH = resolve(MILESTONES, "phase6a1-professor-plan-context-preflight-audit-v1.json");
const PREFLIGHT_SOURCE = resolve(HERE, "lib/phase6a1-professor-plan-context-preflight-v1.ts");

function cloneContext(ctx: ProfessorPlanningContext): ProfessorPlanningContext {
  return JSON.parse(JSON.stringify(ctx)) as ProfessorPlanningContext;
}

function main() {
  const pilotContexts = PILOT_COMMANDER_SLOTS.map((slot) => {
    const ctx = buildSpentPilotAuditPlanningContext(slot.mechanismTruthCaseId);
    return {
      slot,
      ctx,
      preflight: ctx ? auditProfessorPlanningContextPreflight(ctx) : null,
    };
  });

  const negativeControls = [
    {
      label: "empty_semantic_opportunity_universe",
      build: () => {
        const base = buildSpentPilotAuditPlanningContext("multi-muldrotha");
        if (!base) throw new Error("Missing Muldrotha audit context");
        const ctx = cloneContext(base);
        ctx.semanticOpportunities = [];
        return ctx;
      },
      expectedClassification: "PROFESSOR_CONTEXT_UNSATISFIABLE" as const,
      expectedIssueCode: "EMPTY_SEMANTIC_OPPORTUNITY_UNIVERSE" as const,
    },
    {
      label: "empty_mechanism_fact_universe",
      build: () => {
        const base = buildSpentPilotAuditPlanningContext("multi-muldrotha");
        if (!base) throw new Error("Missing Muldrotha audit context");
        const ctx = cloneContext(base);
        ctx.commanderMechanismFacts = [];
        return ctx;
      },
      expectedClassification: "PROFESSOR_CONTEXT_UNSATISFIABLE" as const,
      expectedIssueCode: "EMPTY_MECHANISM_FACT_UNIVERSE" as const,
    },
  ].map((control) => {
    const ctx = control.build();
    const preflight = auditProfessorPlanningContextPreflight(ctx);
    return {
      label: control.label,
      pass:
        !preflight.pass &&
        preflight.classification === control.expectedClassification &&
        preflight.issues.some((i) => i.code === control.expectedIssueCode),
      classification: preflight.pass ? "UNEXPECTED_PASS" : preflight.classification,
      issues: preflight.issues,
    };
  });

  const report = {
    version: "phase6a1-professor-plan-context-preflight-audit-v1",
    generatedAt: new Date().toISOString(),
    decision: "ROOT-CAUSE_REPAIR_SEMANTIC_OPPORTUNITY_COVERAGE",
    preflightVersion: PROFESSOR_PLAN_CONTEXT_PREFLIGHT_V1_VERSION,
    preflightSourceSha256: sha256File(PREFLIGHT_SOURCE),
    pass:
      pilotContexts.every((row) => row.preflight?.pass === true) &&
      negativeControls.every((row) => row.pass),
    pilotCasePreflight: pilotContexts.map((row) => ({
      pilotCaseId: row.slot.pilotCaseId,
      commander: row.slot.commander,
      mechanismTruthCaseId: row.slot.mechanismTruthCaseId,
      pass: row.preflight?.pass === true,
      issues: row.preflight?.pass ? [] : row.preflight?.issues ?? ["Missing context"],
    })),
    negativeControls,
    finiteDomainChecks: [
      "commanderMechanismFacts non-empty for positive hypotheses",
      "semanticOpportunities non-empty for positive hypotheses",
      "commandZone.commanders non-empty",
      "caseId nonblank",
    ],
  };

  writeFileSync(OUT_PATH, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ artifact: OUT_PATH, sha256: sha256File(OUT_PATH), pass: report.pass }, null, 2));
  if (!report.pass) process.exit(1);
}

main();
