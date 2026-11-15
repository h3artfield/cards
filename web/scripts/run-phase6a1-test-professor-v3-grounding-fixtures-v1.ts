#!/usr/bin/env npx tsx
/** Deterministic Professor v3 grounding fixture tests — no OpenAI. */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildValidatorContextV3FromPlanning,
  resetValidatorIssueCounterV3,
  validateStrategyHypothesisV3,
} from "../src/lib/deck-synthesis/strategy-package-validator-v3";
import { auditProfessorPlanningContextPreflightV3 } from "./lib/phase6a1-professor-plan-context-preflight-v3";
import { MILESTONES, sha256File } from "./lib/phase6a1-pinned-implementation-container-v1";
import {
  buildFixtureValidatorContext,
  buildMuldrothaProfessorContextV3ZeroAffordances,
  PROFESSOR_V3_GROUNDING_FIXTURES,
} from "./lib/phase6a1-professor-v3-grounding-fixtures-v1";

const OUT_PATH = resolve(MILESTONES, "phase6a1-professor-v3-grounding-fixtures-audit-v1.json");

function main() {
  const muldrothaCtx = buildMuldrothaProfessorContextV3ZeroAffordances();
  const results = PROFESSOR_V3_GROUNDING_FIXTURES.map((fixture) => {
    if (fixture.expectOutcome === "PREFLIGHT_SATISFIABLE_ONLY") {
      const ctx = fixture.buildContext?.() ?? muldrothaCtx;
      const preflight = auditProfessorPlanningContextPreflightV3(ctx);
      const pass = preflight.pass === (fixture.expectPreflightPass ?? true);
      return {
        id: fixture.id,
        description: fixture.description,
        pass,
        expectOutcome: fixture.expectOutcome,
        actualOutcome: preflight.pass ? "PREFLIGHT_SATISFIABLE" : preflight.classification,
        issues: preflight.pass ? [] : preflight.issues,
      };
    }

    let ctx = buildFixtureValidatorContext({ ctx: muldrothaCtx });
    if (fixture.id === "fixture-07-rag-contradicts-oracle") {
      ctx = buildFixtureValidatorContext({ ctx: muldrothaCtx, extraRagIds: ["rag-muldrotha-primer-001"] });
    }
    if (fixture.id === "fixture-05-affordance-only-grounding") {
      ctx = buildFixtureValidatorContext({
        ctx: muldrothaCtx,
        extraAffordanceIds: ["muldrotha-graveyard-land-play--graveyard-land-zone-enablement"],
      });
    }

    resetValidatorIssueCounterV3();
    const validatorCtx = buildValidatorContextV3FromPlanning(ctx);
    const result = validateStrategyHypothesisV3(validatorCtx, fixture.hypothesis);
    const pass = result.outcome === fixture.expectOutcome;
    return {
      id: fixture.id,
      description: fixture.description,
      pass,
      expectOutcome: fixture.expectOutcome,
      actualOutcome: result.outcome,
      issues: result.issues.map((i) => `${i.code}: ${i.message}`),
    };
  });

  const report = {
    version: "phase6a1-professor-v3-grounding-fixtures-audit-v1",
    generatedAt: new Date().toISOString(),
    decision: "PROFESSOR_V3_ARCHITECTURE_PIVOT",
    pass: results.every((r) => r.pass),
    summary: {
      fixtures: results.length,
      passing: results.filter((r) => r.pass).length,
    },
    results,
  };

  writeFileSync(OUT_PATH, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ artifact: OUT_PATH, sha256: sha256File(OUT_PATH), pass: report.pass, summary: report.summary }, null, 2));
  if (!report.pass) process.exit(1);
}

main();
