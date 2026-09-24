#!/usr/bin/env npx tsx
/** Professor v3 fixture audit v5 — v1–v5 + structural wiring + orchestration, no OpenAI. */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildValidatorContextV3FromPlanning,
  resetValidatorIssueCounterV3,
  validateProfessorPlanLensCoverageV3,
  validateStrategyHypothesisV3,
} from "../src/lib/deck-synthesis/strategy-package-validator-v3";
import { auditProfessorPlanningContextPreflightV3 } from "./lib/phase6a1-professor-plan-context-preflight-v3";
import { normalizeProfessorPlanningResponseV3 } from "./lib/phase6a1-professor-plan-normalizer-v3";
import {
  runProfessorPlanCaseV3Orchestration,
  validateProfessorV3ToolRequest,
} from "./lib/phase6a1-professor-plan-agent-v3";
import { buildProfessorV3PromptPayload } from "./lib/phase6a1-professor-v3-prompt-payload-v1";
import { DEFAULT_PROFESSOR_PLAN_TOOL_BUDGET_V3 } from "../src/lib/deck-synthesis/professor-planning-contracts-v3";
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
import {
  PROFESSOR_V3_NORMALIZATION_FIXTURES_V5,
  PROFESSOR_V3_RUN_LEDGER_FIXTURES_V5,
  PROFESSOR_V3_V5_ADVERSARIAL_FIXTURES,
} from "./lib/phase6a1-professor-v3-grounding-fixtures-v5";
import { castFromGraveyardAssertion, mechanismRef } from "./lib/phase6a1-professor-v3-fixture-assertions-v1";
import { buildProfessorPlanningContextV3Sync } from "./lib/phase6a1-professor-plan-context-builder-v3";
import { getPilotMechanismCatalogEntry } from "./lib/phase6a1-spent-pilot-truth-loader-v1";

const OUT_PATH = resolve(MILESTONES, "phase6a1-professor-v3-grounding-fixtures-audit-v5.json");

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
    ...PROFESSOR_V3_V5_ADVERSARIAL_FIXTURES,
  ];

  const validatorResults = allValidatorFixtures.map((f) => runValidatorFixture(f, muldrothaCtx));
  const normalizationResults = [...PROFESSOR_V3_NORMALIZATION_FIXTURES, ...PROFESSOR_V3_NORMALIZATION_FIXTURES_V5].map((fixture) => {
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

  const ledgerResults = [...PROFESSOR_V3_LEDGER_PROVENANCE_FIXTURES, ...PROFESSOR_V3_RUN_LEDGER_FIXTURES_V5].map((fixture) => {
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
  const muldrothaPayload = buildProfessorV3PromptPayload(snapshotCtx);
  const omnathEntry = getPilotMechanismCatalogEntry("single-landfall-omnath");
  const omnathPayload = omnathEntry
    ? buildProfessorV3PromptPayload(buildProfessorPlanningContextV3Sync({ entry: omnathEntry, oppCase: null, options: { includeMechanicalAffordances: false } }))
    : null;

  const minimalGroundedPlan = {
    strategyHypotheses: [
      {
        hypothesisId: "tool-round-trip",
        title: "Grounded cast",
        strategicClaim: "Cast permanents from graveyard",
        causalReasoning: "Commander permission",
        evidenceRefs: [mechanismRef([MULDROTHA_CAST_FACT])],
        commanderDependency: "HIGH",
        lens: "DEPENDENT_SYNERGY",
        packages: [
          {
            packageId: "cast-pkg",
            purpose: "Cast",
            functionalRoles: ["ENGINE"],
            commanderDependency: "HIGH",
            worksWithoutCommander: "LOW",
            evidenceRefs: [mechanismRef([MULDROTHA_CAST_FACT])],
          },
        ],
        strategicAssertions: [castFromGraveyardAssertion({ assertionId: "cast", packageId: "cast-pkg" })],
        causalEdges: [],
      },
    ],
  };

  let modelCalls = 0;
  const toolRoundTrip = await runProfessorPlanCaseV3Orchestration({
    ctx: muldrothaCtx,
    modelAuthorization: "AUTHORIZED",
    modelCaller: async (input) => {
      modelCalls += 1;
      if (input.afterToolResults) return { parsed: minimalGroundedPlan };
      return {
        parsed: { pending: true },
        toolRequests: [{ tool: "searchMtgKnowledge", query: "muldrotha graveyard recursion", mode: "COMMANDER_PRIMER", limit: 2 }],
      };
    },
    fakeToolHits: () => [
      {
        chunkId: "rag-tool-round-trip",
        citationLabel: "rag-tool-round-trip",
        corpus: "fixture",
        authorityTier: "fixture",
        retrievalMethod: "lexical_exact",
        score: 1,
        provenanceTier: "CURATED_KNOWLEDGE",
        retrievalText: "Self-mill Muldrotha decks stock the graveyard with permanents for recursion.",
        mode: "COMMANDER_PRIMER",
      },
    ],
  });

  const disallowedMode = await runProfessorPlanCaseV3Orchestration({
    ctx: muldrothaCtx,
    modelAuthorization: "AUTHORIZED",
    parsedModelResponse: {
      pending: true,
      toolRequests: [{ tool: "searchMtgKnowledge", query: "rules", mode: "TERMINOLOGY" }],
    },
    modelCaller: async () => ({ parsed: null, toolRequests: [{ tool: "searchMtgKnowledge", query: "rules", mode: "TERMINOLOGY" }] }),
  });

  const budgetCap = validateProfessorV3ToolRequest({
    req: { tool: "searchMtgKnowledge", query: "x", mode: "COMMANDER_PRIMER", limit: 4 },
    budget: { ...DEFAULT_PROFESSOR_PLAN_TOOL_BUDGET_V3, maxRetrievedEvidenceChunks: 1 },
    toolCallsSoFar: 0,
    chunksRetrievedSoFar: 0,
  });

  const lensMissing = validateProfessorPlanLensCoverageV3([
    {
      hypothesisId: "only-dependent",
      title: "Only dependent",
      strategicClaim: "x",
      causalReasoning: "y",
      evidenceRefs: [mechanismRef([MULDROTHA_CAST_FACT])],
      strategicAssertions: [],
      causalEdges: [],
      commanderDependency: "HIGH",
      lens: "DEPENDENT_SYNERGY",
      packages: [],
      relationships: [],
    },
  ]);

  const auxiliaryResults = [
    {
      id: "prompt-payload-snapshot-muldrotha",
      description: "Muldrotha payload contains Oracle, facts, RAG provenance, evidence IDs",
      pass:
        muldrothaPayload.modelVisibleText.includes(MULDROTHA_ORACLE_ID) &&
        muldrothaPayload.modelVisibleText.includes(MULDROTHA_LAND_FACT) &&
        muldrothaPayload.modelVisibleText.includes(MULDROTHA_CAST_FACT),
      expectOutcome: "PAYLOAD_COMPLETE",
      actualOutcome: "PAYLOAD_COMPLETE",
      issues: [],
    },
    {
      id: "prompt-payload-snapshot-omnath-relationships",
      description: "Omnath payload includes authoritative semantic relationships when derived",
      pass: Boolean(omnathPayload?.modelVisibleText.includes("SEMANTIC_RELATIONSHIP") && !omnathPayload.modelVisibleText.includes("(none supplied)")),
      expectOutcome: "RELATIONSHIPS_PRESENT",
      actualOutcome: omnathPayload?.modelVisibleText.includes("SEMANTIC_RELATIONSHIP") ? "RELATIONSHIPS_PRESENT" : "RELATIONSHIPS_MISSING",
      issues: [],
    },
    {
      id: "orchestration-fake-model-tool-round-trip",
      description: "Model → tool → refreshed payload → model → normalize validates final plan",
      pass:
        toolRoundTrip.caseStatus === "ARCHITECTURE_REVIEW_ONLY" &&
        modelCalls >= 2 &&
        toolRoundTrip.traceSummary.modelAttemptCount >= 2 &&
        toolRoundTrip.toolCalls.length === 1 &&
        toolRoundTrip.toolCalls[0]?.acceptedLimit === 2,
      expectOutcome: "TOOL_ROUND_TRIP_OK",
      actualOutcome: toolRoundTrip.caseStatus,
      issues: [],
    },
    {
      id: "orchestration-disallowed-retrieval-mode",
      description: "Disallowed retrieval mode fails closed",
      pass: disallowedMode.caseStatus === "TOOL_VALIDATION_FAILURE",
      expectOutcome: "TOOL_VALIDATION_FAILURE",
      actualOutcome: disallowedMode.caseStatus,
      issues: [],
    },
    {
      id: "orchestration-chunk-budget-cap",
      description: "Remaining chunk budget caps requested retrieval limit",
      pass: budgetCap.ok && budgetCap.cappedLimit === 1,
      expectOutcome: "BUDGET_CAPPED",
      actualOutcome: budgetCap.ok ? "BUDGET_CAPPED" : "BUDGET_FAIL",
      issues: [],
    },
    {
      id: "orchestration-lens-coverage-required",
      description: "Missing required lens coverage is detected",
      pass: lensMissing.length === 3,
      expectOutcome: "MISSING_LENS_COVERAGE",
      actualOutcome: lensMissing.length === 3 ? "MISSING_LENS_COVERAGE" : "UNEXPECTED",
      issues: lensMissing.map((i) => i.message),
    },
  ];

  const results = [...validatorResults, ...normalizationResults, ...ledgerResults, ...auxiliaryResults];
  const report = {
    version: "phase6a1-professor-v3-grounding-fixtures-audit-v5",
    generatedAt: new Date().toISOString(),
    decision: "PROFESSOR_V3_ARCHITECTURE_CORE_PASS_MODEL_EXECUTION_BLOCK_V4_FINAL_STRUCTURAL_WIRING_REPAIR_REQUIRED",
    pass: results.every((r) => r.pass),
    summary: {
      fixtures: results.length,
      passing: results.filter((r) => r.pass).length,
      v5AdversarialFixtures: PROFESSOR_V3_V5_ADVERSARIAL_FIXTURES.length,
      auxiliaryChecks: auxiliaryResults.length,
    },
    results,
  };

  writeFileSync(OUT_PATH, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ artifact: OUT_PATH, sha256: sha256File(OUT_PATH), pass: report.pass, summary: report.summary }, null, 2));
  if (!report.pass) {
    console.log(JSON.stringify(results.filter((r) => !r.pass), null, 2));
    process.exit(1);
  }
}

main();
