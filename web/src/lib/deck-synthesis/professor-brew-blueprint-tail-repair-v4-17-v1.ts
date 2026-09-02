/**
 * Professor v4.17 Slice 5.4 — bounded 1-for-1 tail repair after full corpus exhaustion.
 */
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import { combinedGoldenOracleText } from "../../../scripts/lib/load-golden-catalog-index";
import type { BrewBlueprintV417, BrewRequirementV417 } from "./professor-brew-blueprint-v4-17-v1";
import { applyRequirementSelectionV417 } from "./professor-brew-blueprint-mutation-v4-17-v1";
import {
  mandatoryStructureSatisfiedV417,
  mandatoryFunctionalDensityMinimumsSatisfiedV417,
  retrieveCandidatesForFunctionalDensityV417,
  isFunctionalDensityRequirement,
} from "./professor-brew-blueprint-functional-density-v4-17-v1";
import { mandatoryPackageFloorsSatisfiedV417 } from "./professor-brew-blueprint-package-density-v4-17-v1";
import {
  passesUsefulDeltaGateV417,
  simulateRequirementSelectionV417,
} from "./professor-brew-blueprint-selection-sim-v4-17-v1";
import { rankCandidatesForAssemblyV417 } from "./professor-blueprint-candidate-ranking-v4-17-v1";
import { retrieveCandidatesForRequirementV417 } from "./professor-requirement-retrieval-v4-17-v1";
import type { AdaptiveRetrievalBuildContextV417 } from "./professor-requirement-adaptive-retrieval-v4-17-v1";
import type { BlueprintNextRequirementV417 } from "./professor-blueprint-assembly-types-v4-17-v1";
import { computeMarginalBlueprintUtilityV417 } from "./professor-brew-blueprint-functional-density-v4-17-v1";

export const PROFESSOR_BREW_BLUEPRINT_TAIL_REPAIR_V4_17_V1_VERSION =
  "professor-brew-blueprint-tail-repair-v4-17-v1";

export type TailRepairAttemptV417 = {
  removedOracleId: string;
  removedName: string;
  addedOracleId: string;
  addedName: string;
  requirementId: string;
  accepted: boolean;
  rejectionReason?: string;
  utilityDelta: number;
};

export type TailRepairResultV417 = {
  version: typeof PROFESSOR_BREW_BLUEPRINT_TAIL_REPAIR_V4_17_V1_VERSION;
  attempted: boolean;
  executed: boolean;
  attempts: TailRepairAttemptV417[];
  blueprint: BrewBlueprintV417;
  summary: string;
};

function tailRepairWeaknessScore(blueprint: BrewBlueprintV417, oracleId: string): number {
  const card = blueprint.selectedCards.find((c) => c.oracleId === oracleId);
  if (!card) return 999;
  let score = 0;
  if ((card.satisfiedFunctions?.length ?? 0) <= 1) score += 8;
  if ((card.packageContributions?.length ?? 0) === 0) score += 6;
  if ((card.functionalDensityContributions?.length ?? 0) === 0) score += 5;
  if (card.primaryFunction === "FLEX") score += 10;
  if ((card.bracketContribution?.length ?? 0) === 0) score += 4;
  if ((card.secondaryRequirementIds?.length ?? 0) === 0) score += 3;
  return score;
}

function preservesMandatoryMinima(before: BrewBlueprintV417, after: BrewBlueprintV417): boolean {
  return (
    mandatoryFunctionalDensityMinimumsSatisfiedV417(after) &&
    mandatoryPackageFloorsSatisfiedV417(after) &&
    after.openRequirements.filter(
      (r) =>
        !r.requirementId.startsWith("flex-") &&
        !isFunctionalDensityRequirement(r) &&
        (r.status === "OPEN" || r.status === "PARTIAL"),
    ).length <=
      before.openRequirements.filter(
        (r) =>
          !r.requirementId.startsWith("flex-") &&
          !isFunctionalDensityRequirement(r) &&
          (r.status === "OPEN" || r.status === "PARTIAL"),
      ).length
  );
}

function retrieveBestCandidate(args: {
  blueprint: BrewBlueprintV417;
  candidateReq: BlueprintNextRequirementV417;
  catalog: DeckResolutionCatalog;
  excludeOracleIds: Set<string>;
  buildContext: AdaptiveRetrievalBuildContextV417;
}) {
  const req = args.candidateReq.requirement;
  if (isFunctionalDensityRequirement(req)) {
    return retrieveCandidatesForFunctionalDensityV417({
      catalog: args.catalog,
      blueprint: args.blueprint,
      requirement: req,
      commanderColorIdentity: args.blueprint.commander.colorIdentity,
      excludeOracleIds: args.excludeOracleIds,
      maxScan: 12000,
      maxEvaluate: 300,
      buildContext: args.buildContext,
      requireFullCorpus: true,
    })[0];
  }
  const retrieval = retrieveCandidatesForRequirementV417({
    catalog: args.catalog,
    requirement: req,
    commanderColorIdentity: args.blueprint.commander.colorIdentity,
    excludeOracleIds: args.excludeOracleIds,
    maxScan: 12000,
    maxEvaluate: 300,
    buildContext: args.buildContext,
  });
  const ranked = rankCandidatesForAssemblyV417({
    blueprint: args.blueprint,
    evaluations: retrieval.topCandidates,
    candidateOracleTextById: new Map(
      retrieval.topCandidates.map((c) => {
        const card = args.catalog.byOracleId.get(c.oracleId);
        return [
          c.oracleId,
          { oracleText: card ? combinedGoldenOracleText(card) : "", typeLine: card?.typeLine ?? "" },
        ] as const;
      }),
    ),
    catalog: args.catalog,
    commanderColorIdentity: args.blueprint.commander.colorIdentity,
    excludeOracleIds: args.excludeOracleIds,
  });
  return ranked[0];
}

export function attemptTailRepairV417(args: {
  blueprint: BrewBlueprintV417;
  catalog: DeckResolutionCatalog;
  unresolvedRequirement: BrewRequirementV417;
  candidateReq: BlueprintNextRequirementV417;
  buildContext: AdaptiveRetrievalBuildContextV417;
}): TailRepairResultV417 {
  const attempts: TailRepairAttemptV417[] = [];
  const weakCards = [...args.blueprint.selectedCards]
    .map((c) => ({ oracleId: c.oracleId, name: c.name, weakness: tailRepairWeaknessScore(args.blueprint, c.oracleId) }))
    .sort((a, b) => b.weakness - a.weakness)
    .slice(0, 8);

  for (const weak of weakCards) {
    const without = {
      ...args.blueprint,
      selectedCards: args.blueprint.selectedCards.filter((c) => c.oracleId !== weak.oracleId),
    };
    const exclude = new Set(without.selectedCards.map((c) => c.oracleId));
    const candidate = retrieveBestCandidate({
      blueprint: without,
      candidateReq: args.candidateReq,
      catalog: args.catalog,
      excludeOracleIds: exclude,
      buildContext: args.buildContext,
    });
    if (!candidate) {
      attempts.push({
        removedOracleId: weak.oracleId,
        removedName: weak.name,
        addedOracleId: "",
        addedName: "",
        requirementId: args.unresolvedRequirement.requirementId,
        accepted: false,
        rejectionReason: "NO_REPLACEMENT_CANDIDATE",
        utilityDelta: 0,
      });
      continue;
    }

    const meta = args.catalog.byOracleId.get(candidate.oracleId);
    if (!meta) continue;
    const oracleText = combinedGoldenOracleText(meta);
    const typeLine = meta.typeLine ?? "";

    const simulation = simulateRequirementSelectionV417({
      blueprint: without,
      requirementId: args.unresolvedRequirement.requirementId,
      candidate: {
        ...candidate,
        requirementFit: candidate.finalRequirementScore,
        packageContribution: 50,
        coverageDeltaPerPhysicalSlot: 1,
        deckLevelScore: candidate.finalRequirementScore,
        secondaryRequirementIds: [],
        verifiedSecondaryCount: 0,
      },
      candidateOracleText: oracleText,
      candidateTypeLine: typeLine,
      catalog: args.catalog,
    });

    const marginalBefore = computeMarginalBlueprintUtilityV417({
      blueprint: args.blueprint,
      candidate: { ...candidate, requirementId: args.unresolvedRequirement.requirementId },
    });

    if (!passesUsefulDeltaGateV417(simulation)) {
      attempts.push({
        removedOracleId: weak.oracleId,
        removedName: weak.name,
        addedOracleId: candidate.oracleId,
        addedName: candidate.cardName,
        requirementId: args.unresolvedRequirement.requirementId,
        accepted: false,
        rejectionReason: "NO_USEFUL_DELTA",
        utilityDelta: simulation.usefulBlueprintDelta,
      });
      continue;
    }

    const next = applyRequirementSelectionV417({
      blueprint: without,
      requirementId: args.unresolvedRequirement.requirementId,
      topEvaluation: candidate,
      candidateOracleText: oracleText,
      candidateTypeLine: typeLine,
      catalog: args.catalog,
    });

    if (!preservesMandatoryMinima(args.blueprint, next)) {
      attempts.push({
        removedOracleId: weak.oracleId,
        removedName: weak.name,
        addedOracleId: candidate.oracleId,
        addedName: candidate.cardName,
        requirementId: args.unresolvedRequirement.requirementId,
        accepted: false,
        rejectionReason: "BREAKS_MANDATORY_MINIMUM",
        utilityDelta: simulation.usefulBlueprintDelta,
      });
      continue;
    }

    if (simulation.usefulBlueprintDelta <= 0 && !mandatoryStructureSatisfiedV417(args.blueprint)) {
      attempts.push({
        removedOracleId: weak.oracleId,
        removedName: weak.name,
        addedOracleId: candidate.oracleId,
        addedName: candidate.cardName,
        requirementId: args.unresolvedRequirement.requirementId,
        accepted: false,
        rejectionReason: "NO_BLUEPRINT_IMPROVEMENT",
        utilityDelta: simulation.usefulBlueprintDelta,
      });
      continue;
    }

    attempts.push({
      removedOracleId: weak.oracleId,
      removedName: weak.name,
      addedOracleId: candidate.oracleId,
      addedName: candidate.cardName,
      requirementId: args.unresolvedRequirement.requirementId,
      accepted: true,
      utilityDelta: simulation.usefulBlueprintDelta + marginalBefore.total,
    });

    return {
      version: PROFESSOR_BREW_BLUEPRINT_TAIL_REPAIR_V4_17_V1_VERSION,
      attempted: true,
      executed: true,
      attempts,
      blueprint: next,
      summary: `Tail repair: removed ${weak.name} → added ${candidate.cardName} for ${args.unresolvedRequirement.requirementId}`,
    };
  }

  return {
    version: PROFESSOR_BREW_BLUEPRINT_TAIL_REPAIR_V4_17_V1_VERSION,
    attempted: true,
    executed: false,
    attempts,
    blueprint: args.blueprint,
    summary: `Tail repair exhausted — ${attempts.length} bounded swap(s) rejected`,
  };
}
