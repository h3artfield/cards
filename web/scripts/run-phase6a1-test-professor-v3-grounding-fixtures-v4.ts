#!/usr/bin/env npx tsx
/** Professor v3 fixture audit v4 — v1–v4 grounding + prompt snapshot + ledger provenance + orchestration skeleton. */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildValidatorContextV3FromPlanning,
  resetValidatorIssueCounterV3,
  validateStrategyHypothesisV3,
} from "../src/lib/deck-synthesis/strategy-package-validator-v3";
import { auditProfessorPlanningContextPreflightV3 } from "./lib/phase6a1-professor-plan-context-preflight-v3";
import { normalizeProfessorPlanningResponseV3 } from "./lib/phase6a1-professor-plan-normalizer-v3";
import { runProfessorPlanCaseV3Orchestration } from "./lib/phase6a1-professor-plan-agent-v3";
import { buildProfessorV3PromptPayload } from "./lib/phase6a1-professor-v3-prompt-payload-v1";
import { MILESTONES, sha256File } from "./lib/phase6a1-pinned-implementation-container-v1";
import {
  buildFixtureValidatorContext,
  buildMuldrothaProfessorContextV3ZeroAffordances,
  MULDROTHA_CAST_FACT,
  MULDROTHA_LAND_FACT,
  MULDROTHA_ORACLE_ID,
  PROFESSOR_V3_GROUNDING_FIXTURES,
  type ProfessorV3FixtureCase,
} from "./lib/phase6a1-professor-v3-grounding-fixtures-v1";
import { PROFESSOR_V3_ADVERSARIAL_FIXTURES } from "./lib/phase6a1-professor-v3-grounding-fixtures-v2";
import {
  PROFESSOR_V3_NORMALIZATION_FIXTURES,
  PROFESSOR_V3_TYPED_ADVERSARIAL_FIXTURES,
} from "./lib/phase6a1-professor-v3-grounding-fixtures-v3";
import {
  PROFESSOR_V3_LEDGER_PROVENANCE_FIXTURES,
  PROFESSOR_V3_SEMANTIC_COVERAGE_FIXTURES,
  PROFESSOR_V3_V4_ADVERSARIAL_FIXTURES,
} from "./lib/phase6a1-professor-v3-grounding-fixtures-v4";

const OUT_PATH = resolve(MILESTONES, "phase6a1-professor-v3-grounding-fixtures-audit-v4.json");
const SNAPSHOT_PATH = resolve(MILESTONES, "phase6a1-professor-v3-prompt-payload-snapshot-muldrotha-v1.json");

function runValidatorFixture(fixture: ProfessorV3FixtureCase, defaultCtx: ReturnType<typeof buildMuldrothaProfessorContextV3ZeroAffordances>) {
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
  if (
    fixture.id === "fixture-10-harmony-valid-bridge" ||
    fixture.id === "typed-08-harmony-validated-bridge" ||
    fixture.id === "v4-04-validated-harmony-same-state"
  ) {
    const ragId =
      fixture.id === "v4-04-validated-harmony-same-state" ? "rag-v4-harmony-mill" : fixture.id === "typed-08-harmony-validated-bridge" ? "rag-harmony-mill-v3" : "rag-harmony-mill";
    ctx = buildFixtureValidatorContext({
      ctx: defaultCtx,
      extraRagIds: [ragId],
      extraRagTexts: ["Self-mill Muldrotha decks stock the graveyard with permanents for recursion."],
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

async function main() {
  const muldrothaCtx = buildMuldrothaProfessorContextV3ZeroAffordances();
  const allValidatorFixtures = [
    ...PROFESSOR_V3_GROUNDING_FIXTURES,
    ...PROFESSOR_V3_ADVERSARIAL_FIXTURES,
    ...PROFESSOR_V3_TYPED_ADVERSARIAL_FIXTURES,
    ...PROFESSOR_V3_SEMANTIC_COVERAGE_FIXTURES,
    ...PROFESSOR_V3_V4_ADVERSARIAL_FIXTURES,
  ];

  const validatorResults = allValidatorFixtures.map((f) => runValidatorFixture(f, muldrothaCtx));
  const normalizationResults = PROFESSOR_V3_NORMALIZATION_FIXTURES.map((fixture) => {
    const ctx = buildFixtureValidatorContext({ ctx: muldrothaCtx });
    const result = normalizeProfessorPlanningResponseV3({ parsedModelResponse: fixture.parsedModelResponse, ctx });
    const pass = result.status === "NORMALIZATION_FAILURE";
    return {
      id: fixture.id,
      description: fixture.description,
      pass,
      expectOutcome: "NORMALIZATION_FAILURE",
      actualOutcome: result.status,
      issues: result.status === "NORMALIZATION_FAILURE" ? result.issues.map((i) => `${i.path}: ${i.message}`) : [],
    };
  });

  const ledgerResults = PROFESSOR_V3_LEDGER_PROVENANCE_FIXTURES.map((fixture) => {
    const result = fixture.run();
    return {
      id: fixture.id,
      description: fixture.description,
      pass: result.pass,
      expectOutcome: "LEDGER_PROVENANCE_PRESERVED",
      actualOutcome: result.pass ? "LEDGER_PROVENANCE_PRESERVED" : "LEDGER_PROVENANCE_LOST",
      issues: result.issues,
    };
  });

  const snapshotCtx = buildFixtureValidatorContext({
    ctx: muldrothaCtx,
    extraRagIds: ["rag-muldrotha-primer-snapshot"],
    extraRagTexts: ["Self-mill Muldrotha decks stock the graveyard with permanents for recursion."],
    extraRagProvenance: [{ tool: "searchMtgKnowledge", query: "Muldrotha sacrifice recursion graveyard stocking", retrievalMode: "COMMANDER_PRIMER" }],
  });
  const payload = buildProfessorV3PromptPayload(snapshotCtx);
  const snapshotPass =
    payload.modelVisibleText.includes(MULDROTHA_ORACLE_ID) &&
    payload.modelVisibleText.includes(MULDROTHA_LAND_FACT) &&
    payload.modelVisibleText.includes(MULDROTHA_CAST_FACT) &&
    payload.modelVisibleText.includes("Muldrotha sacrifice recursion graveyard stocking") &&
    payload.sections.some((s) => s.sectionId === "canonical-oracle") &&
    payload.sections.some((s) => s.sectionId === "commander-mechanism-facts");

  const orchestration = await runProfessorPlanCaseV3Orchestration({ ctx: muldrothaCtx });
  const orchestrationPass =
    orchestration.caseStatus === "MODEL_EXECUTION_NOT_AUTHORIZED" &&
    orchestration.promptPayload !== null &&
    orchestration.phasesExecuted.includes("PREFLIGHT") &&
    orchestration.phasesExecuted.includes("LEDGER") &&
    orchestration.phasesExecuted.includes("PAYLOAD") &&
    orchestration.phasesExecuted.includes("MODEL_REQUEST") &&
    orchestration.maxRepairRounds === 2;

  const auxiliaryResults = [
    {
      id: "prompt-payload-snapshot-muldrotha",
      description: "Muldrotha model-visible payload contains Oracle, mechanism facts, RAG, evidence IDs",
      pass: snapshotPass,
      expectOutcome: "PAYLOAD_COMPLETE",
      actualOutcome: snapshotPass ? "PAYLOAD_COMPLETE" : "PAYLOAD_INCOMPLETE",
      issues: snapshotPass ? [] : ["Missing required semantic sections or evidence in modelVisibleText"],
    },
    {
      id: "orchestration-skeleton-preflight",
      description: "Orchestration skeleton reaches payload with model blocked and repair rounds configured",
      pass: orchestrationPass,
      expectOutcome: "ORCHESTRATION_SKELETON_READY",
      actualOutcome: orchestrationPass ? "ORCHESTRATION_SKELETON_READY" : orchestration.caseStatus,
      issues: orchestrationPass ? [] : [`phases=${orchestration.phasesExecuted.join(",")}`],
    },
  ];

  const results = [...validatorResults, ...normalizationResults, ...ledgerResults, ...auxiliaryResults];
  const report = {
    version: "phase6a1-professor-v3-grounding-fixtures-audit-v4",
    generatedAt: new Date().toISOString(),
    decision: "PROFESSOR_V3_ARCHITECTURE_CORE_PASS_MODEL_EXECUTION_BLOCK_V3_PROMPT_AGENT_LEDGER_AND_STATE_ENTAILMENT_REQUIRED",
    pass: results.every((r) => r.pass),
    summary: {
      fixtures: results.length,
      passing: results.filter((r) => r.pass).length,
      regressionFixtures: PROFESSOR_V3_GROUNDING_FIXTURES.length,
      adversarialFixturesV2: PROFESSOR_V3_ADVERSARIAL_FIXTURES.length,
      typedAdversarialFixturesV3: PROFESSOR_V3_TYPED_ADVERSARIAL_FIXTURES.length,
      semanticCoverageFixturesV4: PROFESSOR_V3_SEMANTIC_COVERAGE_FIXTURES.length,
      adversarialFixturesV4: PROFESSOR_V3_V4_ADVERSARIAL_FIXTURES.length,
      ledgerProvenanceFixtures: PROFESSOR_V3_LEDGER_PROVENANCE_FIXTURES.length,
      normalizationFixtures: PROFESSOR_V3_NORMALIZATION_FIXTURES.length,
      auxiliaryChecks: auxiliaryResults.length,
    },
    snapshotArtifact: SNAPSHOT_PATH,
    results,
  };

  writeFileSync(OUT_PATH, JSON.stringify(report, null, 2));
  writeFileSync(SNAPSHOT_PATH, JSON.stringify({ ...payload, generatedAt: new Date().toISOString(), pass: snapshotPass }, null, 2));
  console.log(JSON.stringify({ artifact: OUT_PATH, sha256: sha256File(OUT_PATH), pass: report.pass, summary: report.summary }, null, 2));
  if (!report.pass) {
    console.log(JSON.stringify(results.filter((r) => !r.pass), null, 2));
    process.exit(1);
  }
}

main();
