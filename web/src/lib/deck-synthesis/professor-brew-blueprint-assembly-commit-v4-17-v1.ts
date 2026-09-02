/**
 * Professor v4.17 Slice 5.1/5.3 — single assembly iteration commit helpers.
 */
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import type { BrewBlueprintV417 } from "./professor-brew-blueprint-v4-17-v1";
import { recomputeBlueprintValidationV417 } from "./professor-brew-blueprint-v4-17-v1";
import { applyRequirementSelectionV417 } from "./professor-brew-blueprint-mutation-v4-17-v1";
import {
  isPackageDensityRequirement,
  retrieveCandidatesForPackageDensityV417,
  type PackageDensityCandidateV417,
} from "./professor-brew-blueprint-package-density-v4-17-v1";
import {
  computeFunctionalDensityStatesV417,
  isFunctionalDensityRequirement,
  retrieveCandidatesForFunctionalDensityV417,
  type FunctionalDensityCandidateV417,
} from "./professor-brew-blueprint-functional-density-v4-17-v1";
import { rankCandidatesForAssemblyV417, type RankedAssemblyCandidateV417 } from "./professor-blueprint-candidate-ranking-v4-17-v1";
import { retrieveCandidatesForRequirementV417 } from "./professor-requirement-retrieval-v4-17-v1";
import {
  mapTailExhaustionToFailureV417,
  type AssemblyFailureStateV417,
  type BlueprintNextRequirementV417,
} from "./professor-blueprint-assembly-types-v4-17-v1";
import { refreshWinArchitectureV417 } from "./professor-brew-blueprint-win-progress-v4-17-v1";
import {
  passesUsefulDeltaGateV417,
  simulateRequirementSelectionV417,
} from "./professor-brew-blueprint-selection-sim-v4-17-v1";
import { combinedGoldenOracleText } from "../../../scripts/lib/load-golden-catalog-index";
import {
  createAdaptiveRetrievalBuildContextV417,
  diagnoseTailObjectiveExhaustionV417,
  evaluateRetrievedCandidateFunnelV417,
  type AdaptiveRetrievalBuildContextV417,
  type TailObjectiveExhaustionV417,
} from "./professor-requirement-adaptive-retrieval-v4-17-v1";

export type AssemblyCommitResultV417 =
  | {
      committed: true;
      blueprint: BrewBlueprintV417;
      candidate: RankedAssemblyCandidateV417 | PackageDensityCandidateV417 | FunctionalDensityCandidateV417;
      rankedCount: number;
      simulation: ReturnType<typeof simulateRequirementSelectionV417>;
    }
  | {
      committed: false;
      failure: AssemblyFailureStateV417;
      tailExhaustion: TailObjectiveExhaustionV417 | null;
    };

function oracleMetaFromCatalog(catalog: DeckResolutionCatalog, oracleId: string) {
  const card = catalog.byOracleId.get(oracleId);
  if (!card) return null;
  return { oracleText: combinedGoldenOracleText(card), typeLine: card.typeLine ?? "", card };
}

function recordTailFailure(args: {
  buildContext: AdaptiveRetrievalBuildContextV417;
  tailExhaustion: TailObjectiveExhaustionV417 | null;
}): AssemblyCommitResultV417 {
  if (args.tailExhaustion) {
    args.buildContext.lastTailExhaustion = args.tailExhaustion;
    args.buildContext.tailExhaustions.push(args.tailExhaustion);
  }
  return {
    committed: false,
    failure: mapTailExhaustionToFailureV417(args.tailExhaustion),
    tailExhaustion: args.tailExhaustion,
  };
}

export function attemptAssemblyCommitV417(args: {
  blueprint: BrewBlueprintV417;
  candidateReq: BlueprintNextRequirementV417;
  catalog: DeckResolutionCatalog;
  excludeOracleIds: Set<string>;
  maxScan?: number;
  maxEvaluate?: number;
  minQualityScore?: number;
  buildContext?: AdaptiveRetrievalBuildContextV417;
}): AssemblyCommitResultV417 {
  const req = args.candidateReq.requirement;
  const buildContext = args.buildContext ?? createAdaptiveRetrievalBuildContextV417();
  const minQuality = args.minQualityScore ?? 40;

  if (isFunctionalDensityRequirement(req)) {
    const densityState = computeFunctionalDensityStatesV417(args.blueprint).find((s) => s.budgetId === req.requirementId);
    const densityCandidates = retrieveCandidatesForFunctionalDensityV417({
      catalog: args.catalog,
      blueprint: args.blueprint,
      requirement: req,
      commanderColorIdentity: args.blueprint.commander.colorIdentity,
      excludeOracleIds: args.excludeOracleIds,
      maxScan: args.maxScan,
      maxEvaluate: args.maxEvaluate,
      buildContext,
    });
    if (densityCandidates.length === 0) {
      const trace = buildContext.lastSupplyTrace;
      const tailExhaustion = trace
        ? diagnoseTailObjectiveExhaustionV417({
            trace,
            requirement: req,
            densityState: densityState
              ? {
                  budgetId: densityState.budgetId,
                  category: densityState.category,
                  minimum: densityState.minimum,
                  remainingMinimumDeficit: densityState.remainingMinimumDeficit,
                }
              : undefined,
            minQualityScore: args.minQualityScore ?? 35,
          })
        : null;
      return recordTailFailure({ buildContext, tailExhaustion });
    }

    for (const candidate of densityCandidates) {
      if (candidate.finalRequirementScore < (args.minQualityScore ?? 35)) continue;
      const meta = oracleMetaFromCatalog(args.catalog, candidate.oracleId);
      if (!meta) continue;
      const rankedLike: RankedAssemblyCandidateV417 = {
        ...candidate,
        requirementFit: candidate.missionFit,
        packageContribution: 50,
        coverageDeltaPerPhysicalSlot: candidate.functionalCoverageDelta,
        deckLevelScore: candidate.densityScore,
        secondaryRequirementIds: [],
        verifiedSecondaryCount: 0,
      };
      const simulation = simulateRequirementSelectionV417({
        blueprint: args.blueprint,
        requirementId: req.requirementId,
        candidate: rankedLike,
        candidateOracleText: meta.oracleText,
        candidateTypeLine: meta.typeLine,
        functionalDensityDelta: candidate.functionalCoverageDelta,
        marginalUtility: candidate.marginalUtility,
        catalog: args.catalog,
      });
      if (!passesUsefulDeltaGateV417(simulation)) continue;
      const next = applyRequirementSelectionV417({
        blueprint: args.blueprint,
        requirementId: req.requirementId,
        topEvaluation: candidate,
        candidateOracleText: meta.oracleText,
        candidateTypeLine: meta.typeLine,
        catalog: args.catalog,
      });
      return {
        committed: true,
        blueprint: refreshWinArchitectureV417({ ...next, validation: recomputeBlueprintValidationV417(next) }),
        candidate,
        rankedCount: densityCandidates.length,
        simulation,
      };
    }
    const trace = buildContext.lastSupplyTrace;
    return recordTailFailure({
      buildContext,
      tailExhaustion: trace
        ? diagnoseTailObjectiveExhaustionV417({
            trace: evaluateRetrievedCandidateFunnelV417({
              trace,
              evaluations: densityCandidates,
              minQualityScore: args.minQualityScore ?? 35,
              utilityByOracleId: new Map(
                densityCandidates.map((c) => [c.oracleId, c.marginalUtility.total > 0 ? c.marginalUtility.total : 0]),
              ),
            }),
            requirement: req,
            densityState: densityState
              ? {
                  budgetId: densityState.budgetId,
                  category: densityState.category,
                  minimum: densityState.minimum,
                  remainingMinimumDeficit: densityState.remainingMinimumDeficit,
                }
              : undefined,
            minQualityScore: args.minQualityScore ?? 35,
          })
        : null,
    });
  }

  if (isPackageDensityRequirement(req)) {
    const densityCandidates = retrieveCandidatesForPackageDensityV417({
      catalog: args.catalog,
      blueprint: args.blueprint,
      requirement: req,
      commanderColorIdentity: args.blueprint.commander.colorIdentity,
      excludeOracleIds: args.excludeOracleIds,
      maxScan: args.maxScan,
      maxEvaluate: args.maxEvaluate,
      buildContext,
    });
    if (densityCandidates.length === 0) {
      const trace = buildContext.lastSupplyTrace;
      return recordTailFailure({
        buildContext,
        tailExhaustion: trace ? diagnoseTailObjectiveExhaustionV417({ trace, requirement: req, minQualityScore: args.minQualityScore ?? 35 }) : null,
      });
    }

    for (const candidate of densityCandidates) {
      if (candidate.finalRequirementScore < (args.minQualityScore ?? 35)) continue;
      const meta = oracleMetaFromCatalog(args.catalog, candidate.oracleId);
      if (!meta) continue;
      const rankedLike: RankedAssemblyCandidateV417 = {
        ...candidate,
        requirementFit: candidate.missionFit,
        packageContribution: 80,
        coverageDeltaPerPhysicalSlot: candidate.packageCoverageDelta,
        deckLevelScore: candidate.densityScore,
        secondaryRequirementIds: candidate.matchedRequirementIds.filter((id) => id !== req.requirementId),
        verifiedSecondaryCount: candidate.matchedRequirementIds.length,
      };
      const simulation = simulateRequirementSelectionV417({
        blueprint: args.blueprint,
        requirementId: req.requirementId,
        candidate: rankedLike,
        candidateOracleText: meta.oracleText,
        candidateTypeLine: meta.typeLine,
        packageDensityDelta: candidate.packageCoverageDelta,
        catalog: args.catalog,
      });
      if (!passesUsefulDeltaGateV417(simulation)) continue;
      const next = applyRequirementSelectionV417({
        blueprint: args.blueprint,
        requirementId: req.requirementId,
        topEvaluation: candidate,
        candidateOracleText: meta.oracleText,
        candidateTypeLine: meta.typeLine,
        secondaryRequirementIds: rankedLike.secondaryRequirementIds,
        catalog: args.catalog,
      });
      return {
        committed: true,
        blueprint: refreshWinArchitectureV417({ ...next, validation: recomputeBlueprintValidationV417(next) }),
        candidate,
        rankedCount: densityCandidates.length,
        simulation,
      };
    }
    return recordTailFailure({
      buildContext,
      tailExhaustion: buildContext.lastSupplyTrace
        ? diagnoseTailObjectiveExhaustionV417({
            trace: buildContext.lastSupplyTrace,
            requirement: req,
            minQualityScore: args.minQualityScore ?? 35,
          })
        : null,
    });
  }

  const retrieval = retrieveCandidatesForRequirementV417({
    catalog: args.catalog,
    requirement: req,
    commanderColorIdentity: args.blueprint.commander.colorIdentity,
    maxScan: args.maxScan ?? 12000,
    maxEvaluate: args.maxEvaluate ?? 400,
    excludeOracleIds: args.excludeOracleIds,
    researchSeeds: args.blueprint.strategy.researchSeeds,
    buildContext,
    minQualityScore: minQuality,
  });
  if (retrieval.eligibleCount === 0) {
    return recordTailFailure({ buildContext, tailExhaustion: retrieval.tailExhaustion });
  }

  const metaById = new Map<string, { oracleText: string; typeLine: string }>();
  const inputById = new Map<string, { oracleId: string; name: string; oracleText: string; typeLine: string }>();
  const freshEvaluations = retrieval.topCandidates.filter((e) => e.requirementEligible && !args.excludeOracleIds.has(e.oracleId));
  if (freshEvaluations.length === 0) {
    return recordTailFailure({
      buildContext,
      tailExhaustion:
        retrieval.tailExhaustion ??
        (buildContext.lastSupplyTrace
          ? diagnoseTailObjectiveExhaustionV417({
              trace: buildContext.lastSupplyTrace,
              requirement: req,
              minQualityScore: minQuality,
            })
          : null),
    });
  }

  for (const evalRow of freshEvaluations) {
    const meta = oracleMetaFromCatalog(args.catalog, evalRow.oracleId);
    if (!meta) continue;
    metaById.set(evalRow.oracleId, { oracleText: meta.oracleText, typeLine: meta.typeLine });
    inputById.set(evalRow.oracleId, {
      oracleId: evalRow.oracleId,
      name: evalRow.cardName,
      oracleText: meta.oracleText,
      typeLine: meta.typeLine,
    });
  }

  const ranked = rankCandidatesForAssemblyV417({
    blueprint: args.blueprint,
    evaluations: freshEvaluations,
    candidateOracleTextById: metaById,
    candidateInputsById: inputById,
    catalog: args.catalog,
    commanderColorIdentity: args.blueprint.commander.colorIdentity,
    excludeOracleIds: args.excludeOracleIds,
    minQualityScore: minQuality,
  });
  if (ranked.length === 0) {
    return recordTailFailure({
      buildContext,
      tailExhaustion:
        retrieval.tailExhaustion ??
        diagnoseTailObjectiveExhaustionV417({
          trace: retrieval.supplyTrace,
          requirement: req,
          minQualityScore: minQuality,
        }),
    });
  }

  for (const candidate of ranked) {
    const meta = metaById.get(candidate.oracleId);
    if (!meta) continue;
    const simulation = simulateRequirementSelectionV417({
      blueprint: args.blueprint,
      requirementId: req.requirementId,
      candidate,
      candidateOracleText: meta.oracleText,
      candidateTypeLine: meta.typeLine,
      catalog: args.catalog,
    });
    if (!passesUsefulDeltaGateV417(simulation)) continue;
    const next = applyRequirementSelectionV417({
      blueprint: args.blueprint,
      requirementId: req.requirementId,
      topEvaluation: candidate,
      candidateOracleText: meta.oracleText,
      candidateTypeLine: meta.typeLine,
      secondaryRequirementIds: candidate.secondaryRequirementIds,
      catalog: args.catalog,
    });
    return {
      committed: true,
      blueprint: refreshWinArchitectureV417({ ...next, validation: recomputeBlueprintValidationV417(next) }),
      candidate,
      rankedCount: ranked.length,
      simulation,
    };
  }

  const utilityTrace = evaluateRetrievedCandidateFunnelV417({
    trace: retrieval.supplyTrace,
    evaluations: freshEvaluations,
    minQualityScore: minQuality,
    utilityByOracleId: new Map(
      ranked.map((c) => {
        const sim = simulateRequirementSelectionV417({
          blueprint: args.blueprint,
          requirementId: req.requirementId,
          candidate: c,
          candidateOracleText: metaById.get(c.oracleId)?.oracleText ?? "",
          candidateTypeLine: metaById.get(c.oracleId)?.typeLine ?? "",
          catalog: args.catalog,
        });
        return [c.oracleId, sim.usefulBlueprintDelta];
      }),
    ),
  });

  return recordTailFailure({
    buildContext,
    tailExhaustion: diagnoseTailObjectiveExhaustionV417({
      trace: utilityTrace,
      requirement: req,
      minQualityScore: minQuality,
    }),
  });
}
