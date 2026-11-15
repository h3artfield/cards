#!/usr/bin/env npx tsx
/** Deterministic Professor v3 grounding fixture tests v2 — regression + adversarial, no OpenAI. */
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
  type ProfessorV3FixtureCase,
} from "./lib/phase6a1-professor-v3-grounding-fixtures-v1";
import { PROFESSOR_V3_ADVERSARIAL_FIXTURES } from "./lib/phase6a1-professor-v3-grounding-fixtures-v2";

const OUT_PATH = resolve(MILESTONES, "phase6a1-professor-v3-grounding-fixtures-audit-v2.json");

function runFixture(fixture: ProfessorV3FixtureCase, defaultCtx: ReturnType<typeof buildMuldrothaProfessorContextV3ZeroAffordances>) {
  if (fixture.expectOutcome === "PREFLIGHT_SATISFIABLE_ONLY") {
    const ctx = fixture.buildContext?.() ?? defaultCtx;
    const preflight = auditProfessorPlanningContextPreflightV3(ctx);
    const pass = preflight.pass === (fixture.expectPreflightPass ?? true);
    return {
      id: fixture.id,
      description: fixture.description,
      pass,
      expectOutcome: fixture.expectOutcome,
      actualOutcome: preflight.pass ? "PREFLIGHT_SATISFIABLE" : preflight.classification,
      issues: preflight.pass ? [] : preflight.issues.map((i) => `${i.code}: ${i.message}`),
    };
  }

  let ctx = fixture.buildContext?.() ?? buildFixtureValidatorContext({ ctx: defaultCtx });
  if (fixture.id === "fixture-07-rag-contradicts-oracle") {
    ctx = buildFixtureValidatorContext({
      ctx: defaultCtx,
      extraRagIds: ["rag-muldrotha-primer-001"],
      extraRagTexts: ["Muldrotha decks play two lands per turn from the graveyard for extra ramp."],
    });
  }
  if (fixture.id === "fixture-05-affordance-only-grounding") {
    ctx = buildFixtureValidatorContext({
      ctx: defaultCtx,
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
}

function main() {
  const muldrothaCtx = buildMuldrothaProfessorContextV3ZeroAffordances();
  const allFixtures = [...PROFESSOR_V3_GROUNDING_FIXTURES, ...PROFESSOR_V3_ADVERSARIAL_FIXTURES];
  const results = allFixtures.map((fixture) => runFixture(fixture, muldrothaCtx));

  const report = {
    version: "phase6a1-professor-v3-grounding-fixtures-audit-v2",
    generatedAt: new Date().toISOString(),
    decision: "PROFESSOR_V3_ARCHITECTURE_CORE_PASS_MODEL_EXECUTION_BLOCK_V1_GROUNDING_CONTRACT_INCOMPLETE",
    repairDecision: "PROFESSOR_V3_GROUNDING_CONTRACT_REPAIR_V2",
    pass: results.every((r) => r.pass),
    summary: {
      fixtures: results.length,
      passing: results.filter((r) => r.pass).length,
      regressionFixtures: PROFESSOR_V3_GROUNDING_FIXTURES.length,
      adversarialFixtures: PROFESSOR_V3_ADVERSARIAL_FIXTURES.length,
    },
    results,
  };

  writeFileSync(OUT_PATH, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ artifact: OUT_PATH, sha256: sha256File(OUT_PATH), pass: report.pass, summary: report.summary }, null, 2));
  if (!report.pass) process.exit(1);
}

main();
