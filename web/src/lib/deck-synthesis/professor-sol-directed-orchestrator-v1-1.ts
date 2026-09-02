/**
 * PROFESSOR_SOL_DIRECTED_DECK_CONSTRUCTION_V1_1 orchestrator.
 */
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import type { CommanderBlueprintV417 } from "./professor-brew-blueprint-v4-17-v1";
import { runSolDirectedArchitectV1 } from "./professor-sol-directed-architect-v1";
import { ingestArchitectResponseV11 } from "./professor-sol-directed-architect-ingestion-v1-1";
import { runSolDirectedRetrievalV11 } from "./professor-sol-directed-retrieval-v1-1";
import { evaluateConstructorSupplyGateV11 } from "./professor-sol-directed-supply-gate-v1-1";
import {
  acceptanceTestConstructorInputV11,
  buildConstructorInputBundleV11,
} from "./professor-sol-directed-constructor-input-v1-1";
import {
  isConstructorOutputCatastrophicallyIncompleteV11,
  runSolDirectedConstructorV11,
} from "./professor-sol-directed-constructor-v1-1";
import { validateSolDirectedDeckV11 } from "./professor-sol-directed-validator-v1-1";
import {
  runSolDirectedHeadProfessorV1,
  runSolDirectedRepairV1,
} from "./professor-sol-directed-adjudicator-v1";
import type { SolDirectedExperimentReportV11 } from "./professor-sol-directed-types-v1-1";
import { PROFESSOR_SOL_DIRECTED_TYPES_V1_1_VERSION } from "./professor-sol-directed-types-v1-1";
import type { SolDirectedModelCallRecordV1 } from "./professor-sol-directed-types-v1";

export const PROFESSOR_SOL_DIRECTED_ORCHESTRATOR_V1_1_VERSION = "professor-sol-directed-orchestrator-v1-1";

const MAX_MODEL_CALLS = 3;
const DECISION =
  "PROFESSOR_SOL_DIRECTED_DECK_CONSTRUCTION_V1_1_PLAN_PRESERVATION_RETRIEVAL_SUFFICIENCY_AND_SECOND_PROSPECTIVE_CHATTERFANG_V1_AUTHORIZED";

export function solDirectedLiveEnabledV11(): boolean {
  return process.env.PROFESSOR_SOL_DIRECTED_LIVE === "1" && Boolean(process.env.OPENAI_API_KEY?.trim());
}

function baseReport(args: {
  caseId: string;
  commander: CommanderBlueprintV417;
  bracket: number;
  playstyle: string;
  p0TruthPass: boolean;
}): SolDirectedExperimentReportV11 {
  return {
    version: PROFESSOR_SOL_DIRECTED_TYPES_V1_1_VERSION,
    decision: DECISION,
    caseId: args.caseId,
    commander: args.commander.name,
    bracket: args.bracket,
    playstyle: args.playstyle,
    p0TruthPass: args.p0TruthPass,
    modelCallBudget: { max: MAX_MODEL_CALLS, used: 0 },
    architectRawPlan: null,
    retrievalContract: null,
    retrieval: null,
    exactResolutionHits: [],
    supplyGate: null,
    constructorInputAcceptance: null,
    constructorPromptBytes: null,
    constructedDeck: null,
    validation: null,
    repair: null,
    headProfessor: null,
    modelCalls: [],
    architectFixtureUsed: false,
    failure: null,
    summary: "",
  };
}

export type CheapAcceptanceResultV11 = {
  pass: boolean;
  ingestionFailures: string[];
  constructorInputAcceptance: ReturnType<typeof acceptanceTestConstructorInputV11>;
  supplyGate: ReturnType<typeof evaluateConstructorSupplyGateV11>;
  bundle: ReturnType<typeof buildConstructorInputBundleV11>;
  ingested: ReturnType<typeof ingestArchitectResponseV11>;
  retrieval: ReturnType<typeof runSolDirectedRetrievalV11>;
};

export function runCheapAcceptanceV11(args: {
  architectRaw: unknown;
  catalog: DeckResolutionCatalog;
  commander: CommanderBlueprintV417;
  bracket: number;
}): CheapAcceptanceResultV11 {
  const ingested = ingestArchitectResponseV11(args.architectRaw);
  const retrieval = runSolDirectedRetrievalV11({
    contract: ingested.retrievalContract,
    catalog: args.catalog,
    commander: args.commander,
  });
  const supplyGate = evaluateConstructorSupplyGateV11({
    contract: ingested.retrievalContract,
    retrieval,
  });
  const bundle = buildConstructorInputBundleV11({
    architectRawPlan: ingested.architectRawPlan,
    retrievalContract: ingested.retrievalContract,
    retrieval,
    commander: args.commander,
    bracket: args.bracket,
    supplyGate,
  });
  const constructorInputAcceptance = acceptanceTestConstructorInputV11({ bundle, retrieval });
  const ingestionRegression = ingested.retrievalContract.cardRequirements.length === 10;

  return {
    pass: ingestionRegression && constructorInputAcceptance.pass && supplyGate.pass,
    ingestionFailures: ingestionRegression ? [] : ["ingestion requirement count != 10"],
    constructorInputAcceptance,
    supplyGate,
    bundle,
    ingested,
    retrieval,
  };
}

export async function runSolDirectedDeckConstructionV11(args: {
  caseId: string;
  commander: CommanderBlueprintV417;
  bracket: number;
  playstyle: string;
  catalog: DeckResolutionCatalog;
  p0TruthPass: boolean;
  cheapAcceptance: CheapAcceptanceResultV11;
  allowLiveSol?: boolean;
  architectFixtureRaw?: unknown;
}): Promise<SolDirectedExperimentReportV11> {
  const modelCalls: SolDirectedModelCallRecordV1[] = [];
  const allowLive = args.allowLiveSol ?? solDirectedLiveEnabledV11();
  const report = baseReport(args);

  report.architectRawPlan = args.cheapAcceptance.ingested.architectRawPlan;
  report.retrievalContract = args.cheapAcceptance.ingested.retrievalContract;
  report.retrieval = args.cheapAcceptance.retrieval;
  report.exactResolutionHits = args.cheapAcceptance.retrieval.exactResolutionHits;
  report.supplyGate = args.cheapAcceptance.supplyGate;
  report.constructorInputAcceptance = args.cheapAcceptance.constructorInputAcceptance;
  report.constructorPromptBytes = Buffer.byteLength(args.cheapAcceptance.bundle.userPrompt, "utf8");

  if (!args.p0TruthPass) {
    report.failure = "P0_TRUTH_REGRESSIONS_NOT_PASSING";
    report.summary = "Blocked — P0 truth regressions must pass.";
    return report;
  }

  if (!args.cheapAcceptance.pass) {
    report.failure = "CHEAP_ACCEPTANCE_FAILED";
    report.summary = `Cheap acceptance failed — ${args.cheapAcceptance.constructorInputAcceptance.failures.join("; ")}`;
    return report;
  }

  if (!allowLive) {
    report.failure = "LIVE_SOL_NOT_ENABLED";
    report.summary = "Cheap acceptance passed. Set PROFESSOR_SOL_DIRECTED_LIVE=1 for live Calls 1–3.";
    return report;
  }

  if (!args.cheapAcceptance.supplyGate.pass) {
    report.failure = "CONSTRUCTOR_INPUT_INSUFFICIENT";
    report.summary = `Supply gate failed — ${args.cheapAcceptance.supplyGate.reasons.join("; ")}`;
    return report;
  }

  let architectRaw = args.architectFixtureRaw;
  if (process.env.PROFESSOR_SOL_DIRECTED_FRESH_ARCHITECT === "1" || !architectRaw) {
    const architect = await runSolDirectedArchitectV1({
      commander: args.commander,
      bracket: args.bracket,
      playstyle: args.playstyle,
    });
    modelCalls.push(architect.record);
    architectRaw = architect.record.rawResponse;
    report.architectFixtureUsed = false;
  } else {
    report.architectFixtureUsed = true;
  }

  const ingested = ingestArchitectResponseV11(architectRaw);
  report.architectRawPlan = ingested.architectRawPlan;
  report.retrievalContract = ingested.retrievalContract;

  const retrieval = runSolDirectedRetrievalV11({
    contract: ingested.retrievalContract,
    catalog: args.catalog,
    commander: args.commander,
  });
  report.retrieval = retrieval;
  report.exactResolutionHits = retrieval.exactResolutionHits;

  const supplyGate = evaluateConstructorSupplyGateV11({
    contract: ingested.retrievalContract,
    retrieval,
  });
  report.supplyGate = supplyGate;
  if (!supplyGate.pass) {
    report.modelCallBudget.used = modelCalls.length;
    report.modelCalls = modelCalls;
    report.failure = "CONSTRUCTOR_INPUT_INSUFFICIENT";
    report.summary = `Post-architect supply insufficient — ${supplyGate.reasons.join("; ")}`;
    return report;
  }

  const bundle = buildConstructorInputBundleV11({
    architectRawPlan: ingested.architectRawPlan,
    retrievalContract: ingested.retrievalContract,
    retrieval,
    commander: args.commander,
    bracket: args.bracket,
    supplyGate,
  });
  report.constructorPromptBytes = Buffer.byteLength(bundle.userPrompt, "utf8");

  const constructor = await runSolDirectedConstructorV11({
    bundle,
    commander: args.commander,
    catalog: args.catalog,
  });
  modelCalls.push(constructor.record);

  const incomplete = isConstructorOutputCatastrophicallyIncompleteV11({
    deck: constructor.deck,
    requiredNonlands: ingested.retrievalContract.nonlandSlotsRequired,
    requiredLands: ingested.retrievalContract.landSlotsRequired,
  });
  if (incomplete.incomplete) {
    report.modelCallBudget.used = modelCalls.length;
    report.modelCalls = modelCalls;
    report.constructedDeck = constructor.deck;
    report.failure = "UPSTREAM_SUPPLY_FAILURE";
    report.summary = `Constructor output catastrophically incomplete (${incomplete.reason}) — no Repair spent.`;
    return report;
  }

  const validation = validateSolDirectedDeckV11({
    deck: constructor.deck,
    catalog: args.catalog,
    contract: ingested.retrievalContract,
    prohibitedOracleIds: retrieval.prohibitedOracleIds,
  });
  report.constructedDeck = constructor.deck;
  report.validation = validation;

  if (modelCalls.length < MAX_MODEL_CALLS) {
    if (validation.pass) {
      const review = await runSolDirectedHeadProfessorV1({
        deck: constructor.deck as never,
        plan: { deckThesis: ingested.retrievalContract.strategicThesis } as never,
        validation,
        bracket: args.bracket,
      });
      modelCalls.push(review.record);
      report.headProfessor = review.verdict;
    } else if (validation.violations.length <= 6) {
      const nearby = retrieval.uniqueNonlandOracleIds
        .slice(0, 80)
        .map((id) => args.catalog.byOracleId.get(id)?.canonicalName ?? id);
      const repairRun = await runSolDirectedRepairV1({
        deck: constructor.deck as never,
        plan: { deckThesis: ingested.retrievalContract.strategicThesis } as never,
        validation,
        nearbyCandidates: nearby,
      });
      modelCalls.push(repairRun.record);
      report.repair = { actions: repairRun.actions, validationAfter: null };
    }
  }

  report.modelCalls = modelCalls;
  report.modelCallBudget.used = modelCalls.length;
  report.failure = validation.pass ? null : "VALIDATION_FAILED";
  report.summary = validation.pass
    ? report.headProfessor
      ? `Legal 99 — Head Professor: ${report.headProfessor.verdict}. Unique candidates: ${retrieval.uniqueNonlandCount}.`
      : `Legal 99 — ${retrieval.uniqueNonlandCount} unique candidates.`
    : `Validation failed (${validation.violations.length} violations) after ${modelCalls.length} calls.`;

  return report;
}
