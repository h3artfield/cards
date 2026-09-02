/**
 * Professor v4.17 Slice 5 — isolated full deck assembly from blueprint.
 */
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import type { BrewBlueprintV417 } from "./professor-brew-blueprint-v4-17-v1";
import { recomputeBlueprintValidationV417, roundTripBlueprintV417 } from "./professor-brew-blueprint-v4-17-v1";
import { chooseNextRequirementsV417, physicalSlotPressureCheckpointV417 } from "./professor-blueprint-next-requirement-v4-17-v1";
import { materializeFlexRequirementsV417, mandatoryStructureSatisfiedV417 } from "./professor-brew-blueprint-flex-v4-17-v1";
import {
  refreshWinArchitectureV417,
  winArchitectureVerifiedV417,
} from "./professor-brew-blueprint-win-progress-v4-17-v1";
import { COMMANDER_DECK_LIBRARY_SIZE_V47 } from "./professor-deck-completion-v4-7-v1";
import { appendManaBaseForBlueprintV417, isLegal99V417, libraryCountV417 } from "./professor-brew-blueprint-mana-v4-17-v1";
import {
  computeNonlandManaFrontierV417,
  evaluateDynamicNonlandClosureV417,
  shouldContinueNonlandAssemblyV417,
  syncPhysicalSlotBudgetToFrontierV417,
  type NonlandManaFrontierV417,
} from "./professor-brew-blueprint-mana-frontier-v4-17-v1";
import { buildAccessPortfolioStateV417, type AccessPortfolioStateV417 } from "./professor-brew-blueprint-access-v4-17-v1";
import { attemptTailRepairV417, type TailRepairResultV417 } from "./professor-brew-blueprint-tail-repair-v4-17-v1";
import {
  freezePreCriticDeckV417,
  runBlueprintCriticV417,
  runDeterministicAuditsV417,
  type BlueprintDeterministicAuditV417,
  type CriticFindingV417,
} from "./professor-brew-blueprint-audit-v4-17-v1";
import {
  applyVagueWinDecompositionV417,
  decomposeVagueWinHypothesisV417,
  vagueWinBlocksAssemblyV417,
} from "./professor-brew-blueprint-vague-win-v4-17-v1";
import {
  materializePackageDensityRequirementsV417,
  openPackageDensityCountV417,
  computePackageDensityStatesV417,
  mandatoryPackageFloorsSatisfiedV417,
} from "./professor-brew-blueprint-package-density-v4-17-v1";
import {
  computeFunctionalDensityStatesV417,
  diagnoseFlexEntryV417,
  isNonlandFunctionalBudget,
  mandatoryFunctionalDensityMinimumsSatisfiedV417,
  materializeFunctionalDensityRequirementsV417,
  openFunctionalDensityCountV417,
  preferredCoverageRemainingV417,
} from "./professor-brew-blueprint-functional-density-v4-17-v1";
import { attemptAssemblyCommitV417 } from "./professor-brew-blueprint-assembly-commit-v4-17-v1";
import {
  createAdaptiveRetrievalBuildContextV417,
  type TailObjectiveExhaustionV417,
} from "./professor-requirement-adaptive-retrieval-v4-17-v1";
import {
  PROFESSOR_BLUEPRINT_ASSEMBLY_TYPES_V4_17_V1_VERSION,
  snapshotBlueprintCoverageV417,
  type AssemblyCheckpointV417,
  type AssemblyFailureStateV417,
  type BlueprintSelectionDecisionV417,
  type ConvergenceTelemetryV417,
  type ConstructionRescueClassificationV417,
  type PreCriticDeckV417,
} from "./professor-blueprint-assembly-types-v4-17-v1";

export const PROFESSOR_BREW_BLUEPRINT_ASSEMBLY_V4_17_V1_VERSION = "professor-brew-blueprint-assembly-v4-17-v1";

const CHECKPOINT_COUNTS = [0, 16, 32, 48, 58, 64] as const;

export type NonlandClosureV417 = {
  valid: boolean;
  reasons: string[];
  frontier?: NonlandManaFrontierV417;
};

export type Slice5AssemblyResultV417 = {
  version: typeof PROFESSOR_BREW_BLUEPRINT_ASSEMBLY_V4_17_V1_VERSION;
  success: boolean;
  failure: AssemblyFailureStateV417 | null;
  blueprint: BrewBlueprintV417;
  decisions: BlueprintSelectionDecisionV417[];
  checkpoints: AssemblyCheckpointV417[];
  preCriticDeck: PreCriticDeckV417 | null;
  audits: BlueprintDeterministicAuditV417 | null;
  criticFindings: CriticFindingV417[];
  vagueWinDecompositions: ReturnType<typeof decomposeVagueWinHypothesisV417>;
  nonlandClosure: NonlandClosureV417;
  manaFrontier: NonlandManaFrontierV417 | null;
  accessPortfolio: AccessPortfolioStateV417 | null;
  tailRepair: TailRepairResultV417 | null;
  constructionRescue: {
    swapsRecommended: number;
    swapsAccepted: number;
    swapsExecuted: number;
    percentNonlandsChanged: number;
    classification: ConstructionRescueClassificationV417;
  };
  summary: string;
  tailExhaustions: TailObjectiveExhaustionV417[];
  lastTailExhaustion: TailObjectiveExhaustionV417 | null;
};

export type AssembleDeckOptionsV417 = {
  catalog: DeckResolutionCatalog;
  maxIterations?: number;
  maxScan?: number;
  maxEvaluate?: number;
  minQualityScore?: number;
  skipMana?: boolean;
  skipAudits?: boolean;
  allowVagueWinDecomposition?: boolean;
};

export function evaluateNonlandClosureV417(
  blueprint: BrewBlueprintV417,
  catalog?: DeckResolutionCatalog | null,
): NonlandClosureV417 {
  const frontier = computeNonlandManaFrontierV417({ blueprint, catalog });
  blueprint = syncPhysicalSlotBudgetToFrontierV417(blueprint, frontier);
  const dynamic = evaluateDynamicNonlandClosureV417(blueprint, frontier);
  const reasons: string[] = [...dynamic.reasons];

  const openMandatory = blueprint.openRequirements.filter(
    (r) => (r.status === "OPEN" || r.status === "PARTIAL") && !r.requirementId.startsWith("flex-"),
  );
  if (openMandatory.length > 0) reasons.push(`MANDATORY_OPEN:${openMandatory.length}`);

  const coreUnsatisfied = blueprint.packages.filter((p) => p.core && p.status !== "SATISFIED");
  if (coreUnsatisfied.length > 0) reasons.push(`CORE_PACKAGES:${coreUnsatisfied.map((p) => p.packageId).join(",")}`);
  if (!mandatoryPackageFloorsSatisfiedV417(blueprint)) reasons.push("PACKAGE_FLOORS_OPEN");
  if (!mandatoryFunctionalDensityMinimumsSatisfiedV417(blueprint)) reasons.push("FUNCTIONAL_DENSITY_BELOW_MINIMUM");

  if (!blueprint.slotFeasibility.feasible) reasons.push("PHYSICAL_INFEASIBLE");
  if (!winArchitectureVerifiedV417(blueprint) && !blueprint.winArchitecture.some((w) => w.status === "PARTIAL")) {
    reasons.push("WIN_UNVERIFIED");
  }

  return { valid: reasons.length === 0, reasons, frontier };
}

function buildConvergenceTelemetryV417(blueprint: BrewBlueprintV417): ConvergenceTelemetryV417 {
  const packageDensity = computePackageDensityStatesV417(blueprint);
  const functionalDensity = computeFunctionalDensityStatesV417(blueprint).filter(isNonlandFunctionalBudget);
  const mandatoryFunctionalOpen = blueprint.openRequirements.filter(
    (r) =>
      !r.requirementId.startsWith("flex-") &&
      r.family !== "PACKAGE_DENSITY" &&
      r.family !== "FUNCTIONAL_DENSITY" &&
      (r.status === "OPEN" || r.status === "PARTIAL"),
  ).length;
  const roleCompressionCredit = blueprint.selectedCards.filter((c) => (c.satisfiedFunctions?.length ?? 0) >= 2).length;
  return {
    physicalNonlands: blueprint.physicalSlotBudget.selectedNonlands,
    mandatoryFunctionalOpen,
    functionalDensityBelowMinimum: functionalDensity.filter((d) => d.status === "BELOW_MINIMUM").length,
    functionalDensityPreferredOpen: functionalDensity.filter((d) => d.remainingPreferredDeficit > 0).length,
    packageFloorsOpen: packageDensity.filter((d) => d.status === "BELOW_MINIMUM").length,
    flexObjectivesOpen: blueprint.openRequirements.filter((r) => r.requirementId.startsWith("flex-") && (r.status === "OPEN" || r.status === "PARTIAL")).length,
    packages: packageDensity.map((d) => ({
      packageId: d.packageId,
      current: d.currentPhysicalContribution,
      minimum: d.minimumPhysicalContribution,
      preferred: d.preferredPhysicalContribution,
      status: d.status,
    })),
    functionalDensities: functionalDensity.map((d) => ({
      budgetId: d.budgetId,
      category: d.category,
      current: d.currentDistinctContributors,
      minimum: d.minimum,
      preferred: d.preferred,
      status: d.status,
      contributingCardIds: d.contributingCardIds,
    })),
    roleCompressionCredit,
    flexEntry: blueprint.flexEntryTelemetry,
  };
}

function recordCheckpoint(blueprint: BrewBlueprintV417, checkpoints: AssemblyCheckpointV417[]): void {
  const count = blueprint.physicalSlotBudget.selectedNonlands;
  if (!CHECKPOINT_COUNTS.includes(count as (typeof CHECKPOINT_COUNTS)[number])) return;
  if (checkpoints.some((c) => c.nonlandCount === count)) return;
  checkpoints.push({
    nonlandCount: count,
    snapshot: snapshotBlueprintCoverageV417(blueprint),
    openRequirementCount: blueprint.validation.openRequirementCount,
    corePackagesSatisfied: blueprint.validation.corePackagesSatisfied,
    convergence: buildConvergenceTelemetryV417(blueprint),
  });
}

export function assembleDeckFromBlueprintV417(
  initialBlueprint: BrewBlueprintV417,
  options: AssembleDeckOptionsV417,
): Slice5AssemblyResultV417 {
  let blueprint = roundTripBlueprintV417(initialBlueprint);
  const decisions: BlueprintSelectionDecisionV417[] = [];
  const checkpoints: AssemblyCheckpointV417[] = [];
  const retrievalContext = createAdaptiveRetrievalBuildContextV417();
  const maxIterations = options.maxIterations ?? 96;
  const excludeOracleIds = new Set<string>();

  if (options.allowVagueWinDecomposition !== false) {
    const vague = vagueWinBlocksAssemblyV417(blueprint);
    if (vague.blocked && vague.failure === "CREATIVE_REVISION_REQUIRED") {
      return {
        version: PROFESSOR_BREW_BLUEPRINT_ASSEMBLY_V4_17_V1_VERSION,
        success: false,
        failure: "CREATIVE_REVISION_REQUIRED",
        blueprint,
        decisions,
        checkpoints,
        preCriticDeck: null,
        audits: null,
        criticFindings: [],
        vagueWinDecompositions: vague.decompositions,
        nonlandClosure: evaluateNonlandClosureV417(blueprint, options.catalog),
        manaFrontier: computeNonlandManaFrontierV417({ blueprint, catalog: options.catalog }),
        accessPortfolio: buildAccessPortfolioStateV417({ blueprint, catalog: options.catalog }),
        tailRepair: null,
        constructionRescue: {
          swapsRecommended: 0,
          swapsAccepted: 0,
          swapsExecuted: 0,
          percentNonlandsChanged: 0,
          classification: "CONSTRUCTION_DOMINANT",
        },
        summary: "Vague win hypothesis requires bounded creative revision before assembly",
        tailExhaustions: [],
        lastTailExhaustion: null,
      };
    }
    blueprint = applyVagueWinDecompositionV417(blueprint);
  }

  recordCheckpoint(blueprint, checkpoints);

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    const frontier = computeNonlandManaFrontierV417({ blueprint, catalog: options.catalog });
    blueprint = syncPhysicalSlotBudgetToFrontierV417(blueprint, frontier);
    if (!shouldContinueNonlandAssemblyV417(blueprint, frontier)) break;

    blueprint = materializeFunctionalDensityRequirementsV417(materializePackageDensityRequirementsV417(blueprint));

    const pressure = physicalSlotPressureCheckpointV417(blueprint);
    if (pressure.overconstrained) {
      return failResult(blueprint, decisions, checkpoints, "BLUEPRINT_OVERCONSTRAINED", options, retrievalContext);
    }

    let requirementQueue = chooseNextRequirementsV417(blueprint, 10);
    if (requirementQueue.length === 0 && mandatoryStructureSatisfiedV417(blueprint)) {
      blueprint = materializeFlexRequirementsV417(blueprint);
      requirementQueue = chooseNextRequirementsV417(blueprint, 10);
    }

    let committed = false;
    let lastFailure: AssemblyFailureStateV417 = "NO_ELIGIBLE_CANDIDATES";
    let retryQueue: ReturnType<typeof chooseNextRequirementsV417> = [];

    for (const candidateReq of requirementQueue) {
      const result = attemptAssemblyCommitV417({
        blueprint,
        candidateReq,
        catalog: options.catalog,
        excludeOracleIds,
        maxScan: options.maxScan,
        maxEvaluate: options.maxEvaluate,
        minQualityScore: options.minQualityScore,
        buildContext: retrievalContext,
      });
      if (!result.committed) {
        lastFailure = result.failure;
        continue;
      }

      blueprint = result.blueprint;
      excludeOracleIds.add(result.candidate.oracleId);
      decisions.push({
        version: PROFESSOR_BLUEPRINT_ASSEMBLY_TYPES_V4_17_V1_VERSION,
        iteration,
        requirementId: candidateReq.requirement.requirementId,
        beforeCoverage: result.simulation.beforeCoverage,
        candidatesConsidered: result.rankedCount,
        selectedOracleId: result.candidate.oracleId,
        selectedCardName: result.candidate.cardName,
        primaryRequirementDelta: result.simulation.primaryRequirementDelta,
        secondaryCoverageDeltas: result.simulation.secondaryCoverageDeltas,
        packageDeltas: result.simulation.packageDeltas,
        winArchitectureDelta: result.simulation.winArchitectureDelta,
        bracketDeltas: [`B${blueprint.userIntent.bracket}`],
        physicalSlotsBefore: result.simulation.beforeCoverage.selectedNonlands,
        physicalSlotsAfter: blueprint.physicalSlotBudget.selectedNonlands,
        coverageDeltaPerPhysicalSlot: result.simulation.coverageDeltaPerPhysicalSlot,
        usefulBlueprintDelta: result.simulation.usefulBlueprintDelta,
        rationale: `${candidateReq.rationale}; selected ${result.candidate.cardName}`,
      });
      recordCheckpoint(blueprint, checkpoints);
      committed = true;
      break;
    }

    if (!committed) {
      blueprint = materializeFunctionalDensityRequirementsV417(materializePackageDensityRequirementsV417(blueprint));
      blueprint = materializeFlexRequirementsV417(blueprint);
      retryQueue = chooseNextRequirementsV417(blueprint, 8);
      for (const candidateReq of retryQueue) {
        const result = attemptAssemblyCommitV417({
          blueprint,
          candidateReq,
          catalog: options.catalog,
          excludeOracleIds,
          maxScan: options.maxScan,
          maxEvaluate: options.maxEvaluate,
          minQualityScore: Math.max(25, (options.minQualityScore ?? 40) - 8),
          buildContext: retrievalContext,
        });
        if (!result.committed) {
          lastFailure = result.failure;
          continue;
        }
        blueprint = result.blueprint;
        excludeOracleIds.add(result.candidate.oracleId);
        decisions.push({
          version: PROFESSOR_BLUEPRINT_ASSEMBLY_TYPES_V4_17_V1_VERSION,
          iteration,
          requirementId: candidateReq.requirement.requirementId,
          beforeCoverage: result.simulation.beforeCoverage,
          candidatesConsidered: result.rankedCount,
          selectedOracleId: result.candidate.oracleId,
          selectedCardName: result.candidate.cardName,
          primaryRequirementDelta: result.simulation.primaryRequirementDelta,
          secondaryCoverageDeltas: result.simulation.secondaryCoverageDeltas,
          packageDeltas: result.simulation.packageDeltas,
          winArchitectureDelta: result.simulation.winArchitectureDelta,
          bracketDeltas: [`B${blueprint.userIntent.bracket}`],
          physicalSlotsBefore: result.simulation.beforeCoverage.selectedNonlands,
          physicalSlotsAfter: blueprint.physicalSlotBudget.selectedNonlands,
          coverageDeltaPerPhysicalSlot: result.simulation.coverageDeltaPerPhysicalSlot,
          usefulBlueprintDelta: result.simulation.usefulBlueprintDelta,
          rationale: `escalation; ${candidateReq.rationale}; selected ${result.candidate.cardName}`,
        });
        recordCheckpoint(blueprint, checkpoints);
        committed = true;
        break;
      }
    }

    if (!committed) {
      const flexEntry = diagnoseFlexEntryV417(blueprint);
      if (flexEntry.underconstrained && blueprint.openRequirements.some((r) => r.requirementId.startsWith("flex-"))) {
        const convergence = buildConvergenceTelemetryV417(blueprint);
        return {
          ...failResult(blueprint, decisions, checkpoints, "BLUEPRINT_CLOSURE_UNDERCONSTRAINED", options, retrievalContext),
          summary: `Assembly failed: BLUEPRINT_CLOSURE_UNDERCONSTRAINED at ${blueprint.physicalSlotBudget.selectedNonlands} nonlands — functionalDensityBelowMin=${convergence.functionalDensityBelowMinimum} preferredOpen=${convergence.functionalDensityPreferredOpen} flexOpen=${convergence.flexObjectivesOpen}`,
        };
      }

      const unresolvedReq = requirementQueue[0]?.requirement ?? retryQueue[0]?.requirement;
      let tailRepair: TailRepairResultV417 | null = null;
      const activeCandidateReq = requirementQueue[0] ?? retryQueue[0];
      if (unresolvedReq && activeCandidateReq && retrievalContext.lastTailExhaustion?.supplyTrace?.searchSpaceExhausted) {
        tailRepair = attemptTailRepairV417({
          blueprint,
          catalog: options.catalog,
          unresolvedRequirement: unresolvedReq,
          candidateReq: activeCandidateReq,
          buildContext: retrievalContext,
        });
        if (tailRepair.executed) {
          blueprint = tailRepair.blueprint;
          recordCheckpoint(blueprint, checkpoints);
          continue;
        }
      }

      const frontierNow = computeNonlandManaFrontierV417({ blueprint, catalog: options.catalog });
      if (
        frontierNow.recommendation === "ADD_LAND" &&
        frontierNow.mandatoryStructureSatisfied &&
        mandatoryStructureSatisfiedV417(blueprint)
      ) {
        break;
      }

      const accessPortfolio = buildAccessPortfolioStateV417({ blueprint, catalog: options.catalog });
      let terminalFailure = lastFailure;
      if (accessPortfolio.status === "BELOW_MINIMUM" && unresolvedReq?.requirementId.includes("tutorsandaccess")) {
        terminalFailure = retrievalContext.lastTailExhaustion?.densityChallenge
          ? "BLUEPRINT_DENSITY_CHALLENGE"
          : "ACCESS_PORTFOLIO_UNSATISFIED";
      } else if (frontierNow.recommendation === "ADD_LAND" && frontierNow.nextNonlandMarginalUtility <= 0) {
        terminalFailure = "NO_POSITIVE_NONLAND_UTILITY";
      } else if (tailRepair?.attempted && !tailRepair.executed) {
        terminalFailure = "TAIL_REPAIR_EXHAUSTED";
      } else if (tailRepair?.attempted) {
        terminalFailure = "TAIL_REPAIR_AVAILABLE";
      }

      const convergence = buildConvergenceTelemetryV417(blueprint);
      const tailSummary = retrievalContext.lastTailExhaustion
        ? ` terminal=${retrievalContext.lastTailExhaustion.terminalReason} semantic=${retrievalContext.lastTailExhaustion.semanticEligible} quality=${retrievalContext.lastTailExhaustion.qualityPassed} utility=${retrievalContext.lastTailExhaustion.positiveUtility}`
        : "";
      return {
        ...failResult(blueprint, decisions, checkpoints, terminalFailure, options, retrievalContext, {
          manaFrontier: frontierNow,
          accessPortfolio,
          tailRepair,
        }),
        summary: `Assembly failed: ${terminalFailure} after ${decisions.length} selections — functionalOpen=${convergence.mandatoryFunctionalOpen} functionalDensityBelowMin=${convergence.functionalDensityBelowMinimum} packageFloorsOpen=${convergence.packageFloorsOpen} flexOpen=${convergence.flexObjectivesOpen} fdOpen=${openFunctionalDensityCountV417(blueprint)} densityOpen=${openPackageDensityCountV417(blueprint)} accessTools=${accessPortfolio.distinctAccessTools}/${accessPortfolio.minimumToolTarget ?? "?"}${tailSummary}`,
      };
    }
  }

  const frontierFinal = computeNonlandManaFrontierV417({ blueprint, catalog: options.catalog });
  blueprint = syncPhysicalSlotBudgetToFrontierV417(blueprint, frontierFinal);
  const nonlandClosure = evaluateNonlandClosureV417(blueprint, options.catalog);
  if (!nonlandClosure.valid && frontierFinal.recommendation !== "ADD_LAND") {
    return failResult(blueprint, decisions, checkpoints, "PHYSICAL_BUDGET_EXHAUSTED", options, retrievalContext, {
      manaFrontier: frontierFinal,
      accessPortfolio: buildAccessPortfolioStateV417({ blueprint, catalog: options.catalog }),
      tailRepair: null,
    });
  }

  if (!options.skipMana && (nonlandClosure.valid || frontierFinal.recommendation === "ADD_LAND")) {
    const dynamicLandTarget =
      frontierFinal.recommendation === "ADD_LAND"
        ? COMMANDER_DECK_LIBRARY_SIZE_V47 - blueprint.selectedCards.length
        : frontierFinal.candidateLandRange.preferred;
    blueprint = appendManaBaseForBlueprintV417({
      blueprint,
      catalog: options.catalog,
      landTargetOverride: dynamicLandTarget,
    });
    blueprint = refreshWinArchitectureV417(blueprint);
  }

  const accessPortfolioFinal = buildAccessPortfolioStateV417({ blueprint, catalog: options.catalog });
  const preCriticDeck = freezePreCriticDeckV417(blueprint);
  const audits = options.skipAudits ? null : runDeterministicAuditsV417(blueprint);
  const criticFindings = audits ? runBlueprintCriticV417(blueprint, audits) : [];

  const structureComplete = mandatoryStructureSatisfiedV417(blueprint);
  const frontierClosureValid =
    frontierFinal.recommendation === "ADD_LAND"
      ? structureComplete && preferredCoverageRemainingV417(blueprint) === 0 && openFunctionalDensityCountV417(blueprint) === 0
      : nonlandClosure.valid;
  const success = isLegal99V417(blueprint) && structureComplete && frontierClosureValid;

  return {
    version: PROFESSOR_BREW_BLUEPRINT_ASSEMBLY_V4_17_V1_VERSION,
    success,
    failure: success ? null : isLegal99V417(blueprint) ? "NO_POSITIVE_NONLAND_UTILITY" : "MANA_FRONTIER_REACHED",
    blueprint,
    decisions,
    checkpoints,
    preCriticDeck: success ? preCriticDeck : decisions.length ? preCriticDeck : null,
    audits,
    criticFindings,
    vagueWinDecompositions: decomposeVagueWinHypothesisV417(blueprint),
    nonlandClosure,
    manaFrontier: frontierFinal,
    accessPortfolio: accessPortfolioFinal,
    tailRepair: null,
    constructionRescue: {
      swapsRecommended: 0,
      swapsAccepted: 0,
      swapsExecuted: 0,
      percentNonlandsChanged: 0,
      classification: "CONSTRUCTION_DOMINANT",
    },
    summary: success
      ? `Assembled legal ${libraryCountV417(blueprint)}-card deck (${decisions.length} nonland picks, ${blueprint.manaPlan.selectedLands.length} lands)`
      : `Assembly incomplete — ${nonlandClosure.reasons.join("; ")}`,
    tailExhaustions: retrievalContext.tailExhaustions,
    lastTailExhaustion: retrievalContext.lastTailExhaustion,
  };
}

function failResult(
  blueprint: BrewBlueprintV417,
  decisions: BlueprintSelectionDecisionV417[],
  checkpoints: AssemblyCheckpointV417[],
  failure: AssemblyFailureStateV417,
  options: AssembleDeckOptionsV417,
  retrievalContext?: ReturnType<typeof createAdaptiveRetrievalBuildContextV417>,
  extras?: {
    manaFrontier?: NonlandManaFrontierV417 | null;
    accessPortfolio?: AccessPortfolioStateV417 | null;
    tailRepair?: TailRepairResultV417 | null;
  },
): Slice5AssemblyResultV417 {
  const manaFrontier =
    extras?.manaFrontier ?? computeNonlandManaFrontierV417({ blueprint, catalog: options.catalog });
  const accessPortfolio =
    extras?.accessPortfolio ?? buildAccessPortfolioStateV417({ blueprint, catalog: options.catalog });
  return {
    version: PROFESSOR_BREW_BLUEPRINT_ASSEMBLY_V4_17_V1_VERSION,
    success: false,
    failure,
    blueprint,
    decisions,
    checkpoints,
    preCriticDeck: decisions.length ? freezePreCriticDeckV417(blueprint) : null,
    audits: options.skipAudits ? null : runDeterministicAuditsV417(blueprint),
    criticFindings: [],
    vagueWinDecompositions: decomposeVagueWinHypothesisV417(blueprint),
    nonlandClosure: evaluateNonlandClosureV417(blueprint, options.catalog),
    manaFrontier,
    accessPortfolio,
    tailRepair: extras?.tailRepair ?? null,
    constructionRescue: {
      swapsRecommended: extras?.tailRepair?.attempts.length ?? 0,
      swapsAccepted: extras?.tailRepair?.attempts.filter((a) => a.accepted).length ?? 0,
      swapsExecuted: extras?.tailRepair?.executed ? 1 : 0,
      percentNonlandsChanged: extras?.tailRepair?.executed ? Math.round(100 / Math.max(1, blueprint.selectedCards.length)) : 0,
      classification: extras?.tailRepair?.executed ? "MIXED" : "CONSTRUCTION_DOMINANT",
    },
    summary: `Assembly failed: ${failure} after ${decisions.length} selections`,
    tailExhaustions: retrievalContext?.tailExhaustions ?? [],
    lastTailExhaustion: retrievalContext?.lastTailExhaustion ?? null,
  };
}
