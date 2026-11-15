#!/usr/bin/env npx tsx
/** P3 — deterministic normalizer satisfiability audit for five spent pilot cases (no OpenAI). */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { MILESTONES, sha256File } from "./lib/phase6a1-pinned-implementation-container-v1";
import { normalizeProfessorPlanningResponse } from "./lib/phase6a1-professor-plan-normalizer-v2";
import { PILOT_COMMANDER_SLOTS } from "./lib/phase6a1-serialization-pilot-v8-config-v1";
import {
  buildMinimalSyntheticProfessorHypothesis,
  buildSpentPilotAuditPlanningContext,
} from "./lib/phase6a1-spent-pilot-audit-context-v1";

const OUT_PATH = resolve(MILESTONES, "phase6a1-spent-pilot-normalizer-satisfiability-audit-v2.json");

function main() {
  const caseAudits = PILOT_COMMANDER_SLOTS.map((slot) => {
    const ctx = buildSpentPilotAuditPlanningContext(slot.mechanismTruthCaseId);
    if (!ctx || ctx.semanticOpportunities.length === 0) {
      return {
        pilotCaseId: slot.pilotCaseId,
        commander: slot.commander,
        mechanismTruthCaseId: slot.mechanismTruthCaseId,
        pass: false,
        issues: ["Missing audit context or empty opportunity universe"],
        chosenFactId: null,
        chosenOpportunityId: null,
        normalizationStatus: "CONTEXT_MISSING",
      };
    }

    const firstOpp = ctx.semanticOpportunities[0]!;
    const factId = (firstOpp.sourceMechanismFactIds ?? firstOpp.sourceFactIds ?? [])[0];
    if (!factId) {
      return {
        pilotCaseId: slot.pilotCaseId,
        commander: slot.commander,
        mechanismTruthCaseId: slot.mechanismTruthCaseId,
        pass: false,
        issues: ["First opportunity missing sourceMechanismFactId"],
        chosenFactId: null,
        chosenOpportunityId: firstOpp.opportunityId,
        normalizationStatus: "MISSING_SOURCE_FACT",
      };
    }

    const parsed = buildMinimalSyntheticProfessorHypothesis({
      caseId: ctx.caseId,
      factId,
      opportunityId: firstOpp.opportunityId,
    });
    const raw = JSON.stringify(parsed);
    const result = normalizeProfessorPlanningResponse({
      rawModelResponse: raw,
      parsedModelResponse: parsed,
      ctx,
    });

    return {
      pilotCaseId: slot.pilotCaseId,
      commander: slot.commander,
      mechanismTruthCaseId: slot.mechanismTruthCaseId,
      pass: result.status === "SUCCESS",
      issues: result.issues.map((i) => `${i.path}: ${i.message}`),
      chosenFactId: factId,
      chosenOpportunityId: firstOpp.opportunityId,
      normalizationStatus: result.status,
    };
  });

  const report = {
    version: "phase6a1-spent-pilot-normalizer-satisfiability-audit-v2",
    generatedAt: new Date().toISOString(),
    decision: "ROOT-CAUSE_REPAIR_SEMANTIC_OPPORTUNITY_COVERAGE",
    note: "Strategy-quality probe only — proves frozen input contract is not impossible for Professor normalizer v2.",
    pass: caseAudits.every((c) => c.pass),
    summary: {
      cases: caseAudits.length,
      passingCases: caseAudits.filter((c) => c.pass).length,
    },
    caseAudits,
  };

  writeFileSync(OUT_PATH, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ artifact: OUT_PATH, sha256: sha256File(OUT_PATH), pass: report.pass, summary: report.summary }, null, 2));
  if (!report.pass) process.exit(1);
}

main();
