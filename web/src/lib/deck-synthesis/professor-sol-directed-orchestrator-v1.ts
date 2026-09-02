/**
 * PROFESSOR_SOL_DIRECTED_DECK_CONSTRUCTION_V1 orchestrator.
 */
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import type { CommanderBlueprintV417 } from "./professor-brew-blueprint-v4-17-v1";
import { runSolDirectedArchitectV1 } from "./professor-sol-directed-architect-v1";
import { runSolDirectedConstructorV1 } from "./professor-sol-directed-constructor-v1";
import {
  retrieveAllSolCandidatePoolsV1,
  retrieveLandCandidatePoolV1,
} from "./professor-sol-directed-retrieval-v1";
import { validateSolDirectedDeckV1 } from "./professor-sol-directed-validator-v1";
import {
  runSolDirectedHeadProfessorV1,
  runSolDirectedRepairV1,
} from "./professor-sol-directed-adjudicator-v1";
import type { SolDirectedExperimentReportV1 } from "./professor-sol-directed-types-v1";
import { PROFESSOR_SOL_DIRECTED_TYPES_V1_VERSION } from "./professor-sol-directed-types-v1";

export const PROFESSOR_SOL_DIRECTED_ORCHESTRATOR_V1_VERSION = "professor-sol-directed-orchestrator-v1";

const MAX_MODEL_CALLS = 3;

export function solDirectedLiveEnabledV1(): boolean {
  return process.env.PROFESSOR_SOL_DIRECTED_LIVE === "1" && Boolean(process.env.OPENAI_API_KEY?.trim());
}

export async function runSolDirectedDeckConstructionV1(args: {
  caseId: string;
  commander: CommanderBlueprintV417;
  bracket: number;
  playstyle: string;
  catalog: DeckResolutionCatalog;
  p0TruthPass: boolean;
  allowLiveSol?: boolean;
}): Promise<SolDirectedExperimentReportV1> {
  const modelCalls: SolDirectedExperimentReportV1["modelCalls"] = [];
  const allowLive = args.allowLiveSol ?? solDirectedLiveEnabledV1();

  if (!args.p0TruthPass) {
    return {
      version: PROFESSOR_SOL_DIRECTED_TYPES_V1_VERSION,
      decision: "PROFESSOR_SOL_DIRECTED_DECK_CONSTRUCTION_V1_AUTHORIZED",
      caseId: args.caseId,
      commander: args.commander.name,
      bracket: args.bracket,
      playstyle: args.playstyle,
      p0TruthPass: false,
      modelCallBudget: { max: MAX_MODEL_CALLS, used: 0 },
      plan: null,
      candidatePools: [],
      constructedDeck: null,
      validation: null,
      repair: null,
      headProfessor: null,
      modelCalls,
      failure: "P0_TRUTH_REGRESSIONS_NOT_PASSING",
      summary: "Blocked — P0 deterministic truth regressions must pass before OpenAI calls.",
    };
  }

  if (!allowLive) {
    return {
      version: PROFESSOR_SOL_DIRECTED_TYPES_V1_VERSION,
      decision: "PROFESSOR_SOL_DIRECTED_DECK_CONSTRUCTION_V1_AUTHORIZED",
      caseId: args.caseId,
      commander: args.commander.name,
      bracket: args.bracket,
      playstyle: args.playstyle,
      p0TruthPass: true,
      modelCallBudget: { max: MAX_MODEL_CALLS, used: 0 },
      plan: null,
      candidatePools: [],
      constructedDeck: null,
      validation: null,
      repair: null,
      headProfessor: null,
      modelCalls,
      failure: "LIVE_SOL_NOT_ENABLED",
      summary: "P0 passed. Set PROFESSOR_SOL_DIRECTED_LIVE=1 and OPENAI_API_KEY to run architect/constructor/adjudicator.",
    };
  }

  const architect = await runSolDirectedArchitectV1({
    commander: args.commander,
    bracket: args.bracket,
    playstyle: args.playstyle,
  });
  modelCalls.push(architect.record);

  const { pools, uniqueCandidateCount } = retrieveAllSolCandidatePoolsV1({
    catalog: args.catalog,
    commander: args.commander,
    plan: architect.plan,
    poolSize: 25,
  });

  const landTarget = architect.plan.desiredLandRange?.preferred ?? (args.bracket >= 4 ? 35 : 34);
  const landPool = retrieveLandCandidatePoolV1({
    catalog: args.catalog,
    commander: args.commander,
    landTarget,
  });

  const constructor = await runSolDirectedConstructorV1({
    commander: args.commander,
    plan: architect.plan,
    candidatePools: pools,
    landCandidates: landPool.map((l) => ({
      name: l.name,
      oracleId: l.oracleId,
      typeLine: l.truth.typeLine,
      oracleText: l.truth.oracleText,
    })),
    bracket: args.bracket,
  });
  modelCalls.push(constructor.record);

  let deck = constructor.deck;
  let validation = validateSolDirectedDeckV1({ deck, catalog: args.catalog, bracket: args.bracket });

  let repair: SolDirectedExperimentReportV1["repair"] = null;
  let headProfessor: SolDirectedExperimentReportV1["headProfessor"] = null;

  if (modelCalls.length < MAX_MODEL_CALLS) {
    if (validation.pass) {
      const review = await runSolDirectedHeadProfessorV1({
        deck,
        plan: architect.plan,
        validation,
        bracket: args.bracket,
      });
      modelCalls.push(review.record);
      headProfessor = review.verdict;
    } else {
      const nearbyCandidates = pools.flatMap((p) => p.candidates.map((c) => c.name));
      const repairRun = await runSolDirectedRepairV1({
        deck,
        plan: architect.plan,
        validation,
        nearbyCandidates,
      });
      modelCalls.push(repairRun.record);
      repair = { actions: repairRun.actions, validationAfter: null };
    }
  }

  const used = modelCalls.length;
  const summary = validation.pass
    ? headProfessor
      ? `Legal 99 — Head Professor verdict: ${headProfessor.verdict}. ${uniqueCandidateCount} unique candidates retrieved.`
      : `Legal 99 constructed — ${uniqueCandidateCount} unique candidates retrieved.`
    : `Construction incomplete — ${validation.violations.length} validation violations after ${used} model calls.`;

  return {
    version: PROFESSOR_SOL_DIRECTED_TYPES_V1_VERSION,
    decision: "PROFESSOR_SOL_DIRECTED_DECK_CONSTRUCTION_V1_AUTHORIZED",
    caseId: args.caseId,
    commander: args.commander.name,
    bracket: args.bracket,
    playstyle: args.playstyle,
    p0TruthPass: true,
    modelCallBudget: { max: MAX_MODEL_CALLS, used },
    plan: architect.plan,
    candidatePools: pools,
    constructedDeck: deck,
    validation,
    repair,
    headProfessor,
    modelCalls,
    failure: validation.pass ? null : "VALIDATION_FAILED",
    summary,
  };
}
