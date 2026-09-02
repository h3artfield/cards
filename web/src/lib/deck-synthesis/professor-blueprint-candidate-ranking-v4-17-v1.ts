/**
 * Professor v4.17 Slice 5 — requirement-relative ranking with deck-level tie-breaking.
 */
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import type { BrewBlueprintV417 } from "./professor-brew-blueprint-v4-17-v1";
import type { RequirementCandidateEvaluationV417, RequirementCandidateInputV417 } from "./professor-requirement-candidate-v4-17-v1";
import { detectVerifiedFunctionsForCard } from "./professor-requirement-candidate-v4-17-v1";
import { discoverVerifiedSecondaryRequirementsV417, allowsSecondaryFunctionalSatisfactionV417 } from "./professor-brew-blueprint-secondary-credit-v4-17-v1";
import { isPackageDensityRequirement } from "./professor-brew-blueprint-package-density-v4-17-v1";

export const PROFESSOR_BLUEPRINT_CANDIDATE_RANKING_V4_17_V1_VERSION = "professor-blueprint-candidate-ranking-v4-17-v1";

export type RankedAssemblyCandidateV417 = RequirementCandidateEvaluationV417 & {
  requirementFit: number;
  packageContribution: number;
  coverageDeltaPerPhysicalSlot: number;
  deckLevelScore: number;
  secondaryRequirementIds: string[];
  verifiedSecondaryCount: number;
};

function packageContributionScore(blueprint: BrewBlueprintV417, evaluation: RequirementCandidateEvaluationV417): number {
  const openCore = blueprint.packages.filter((p) => p.core && p.status !== "SATISFIED").map((p) => p.packageId);
  if (openCore.length === 0) return 40;
  const req = blueprint.openRequirements.find((r) => r.requirementId === evaluation.requirementId);
  if (!req) return 40;
  const overlap = req.packageIds.filter((pid) => openCore.includes(pid)).length;
  return overlap > 0 ? 70 + overlap * 10 : 45;
}

export function rankCandidatesForAssemblyV417(args: {
  blueprint: BrewBlueprintV417;
  evaluations: RequirementCandidateEvaluationV417[];
  candidateOracleTextById: Map<string, { oracleText: string; typeLine: string }>;
  candidateInputsById?: Map<string, RequirementCandidateInputV417>;
  catalog?: DeckResolutionCatalog | null;
  commanderColorIdentity?: string[];
  excludeOracleIds?: Set<string>;
  minQualityScore?: number;
}): RankedAssemblyCandidateV417[] {
  const exclude = args.excludeOracleIds ?? new Set(args.blueprint.selectedCards.map((c) => c.oracleId));
  const minQuality = args.minQualityScore ?? 35;
  const catalog = args.catalog ?? null;
  const commanderColorIdentity = args.commanderColorIdentity ?? args.blueprint.commander.colorIdentity;

  return args.evaluations
    .filter((e) => e.requirementEligible && !exclude.has(e.oracleId))
    .map((evaluation) => {
      const meta = args.candidateOracleTextById.get(evaluation.oracleId);
      const verified =
        meta != null
          ? detectVerifiedFunctionsForCard({
              oracleId: evaluation.oracleId,
              oracleText: meta.oracleText,
              typeLine: meta.typeLine,
            })
          : evaluation.satisfiedFunctions;

      const candidateInput: RequirementCandidateInputV417 = args.candidateInputsById?.get(evaluation.oracleId) ?? {
        oracleId: evaluation.oracleId,
        name: evaluation.cardName,
        oracleText: meta?.oracleText,
        typeLine: meta?.typeLine,
      };

      const verifiedSecondariesAll =
        catalog != null
          ? discoverVerifiedSecondaryRequirementsV417({
              blueprint: args.blueprint,
              primaryRequirementId: evaluation.requirementId,
              candidate: candidateInput,
              commanderColorIdentity,
              catalog,
            })
          : [];
      const primaryReq = args.blueprint.openRequirements.find((r) => r.requirementId === evaluation.requirementId);
      const verifiedSecondaries = verifiedSecondariesAll.filter((secondary) => {
        if (!primaryReq) return false;
        const secondaryReq = args.blueprint.openRequirements.find((r) => r.requirementId === secondary.requirementId);
        return secondaryReq ? allowsSecondaryFunctionalSatisfactionV417(primaryReq, secondaryReq) : false;
      });

      const secondaryRequirementIds = verifiedSecondaries.map((s) => s.requirementId);
      const uniquePackages = new Set(verifiedSecondaries.flatMap((s) => s.packageIds)).size;
      const coverageDeltaPerPhysicalSlot = 1 + Math.min(verifiedSecondaries.length, 3) * 0.25 + uniquePackages * 0.15;
      const requirementFit = evaluation.missionFit;
      const packageContribution = packageContributionScore(args.blueprint, evaluation);
      const densityBonus = isPackageDensityRequirement(
        args.blueprint.openRequirements.find((r) => r.requirementId === evaluation.requirementId) ?? {
          requirementId: evaluation.requirementId,
          family: "FLEX",
        } as never,
      )
        ? 15
        : 0;

      const deckLevelScore = Math.round(
        requirementFit * 0.35 +
          evaluation.bracketQuality * 0.18 +
          packageContribution * 0.14 +
          evaluation.roleCompression * 0.12 +
          evaluation.commanderSynergy * 0.08 +
          evaluation.independentValue * 0.06 +
          coverageDeltaPerPhysicalSlot * 8 +
          densityBonus,
      );
      return {
        ...evaluation,
        requirementFit,
        packageContribution,
        coverageDeltaPerPhysicalSlot,
        deckLevelScore,
        secondaryRequirementIds,
        verifiedSecondaryCount: verifiedSecondaries.length,
        finalRequirementScore: evaluation.finalRequirementScore,
      };
    })
    .filter((e) => e.finalRequirementScore >= minQuality)
    .sort(
      (a, b) =>
        b.finalRequirementScore - a.finalRequirementScore ||
        b.deckLevelScore - a.deckLevelScore ||
        b.coverageDeltaPerPhysicalSlot - a.coverageDeltaPerPhysicalSlot ||
        b.bracketQuality - a.bracketQuality ||
        a.oracleId.localeCompare(b.oracleId) ||
        a.cardName.localeCompare(b.cardName),
    );
}

/** Stable ordering independent of source corpus iteration position. */
export function compareRankedCandidatesDeterministicV417(
  a: Pick<RankedAssemblyCandidateV417, "finalRequirementScore" | "deckLevelScore" | "coverageDeltaPerPhysicalSlot" | "bracketQuality" | "oracleId" | "cardName">,
  b: Pick<RankedAssemblyCandidateV417, "finalRequirementScore" | "deckLevelScore" | "coverageDeltaPerPhysicalSlot" | "bracketQuality" | "oracleId" | "cardName">,
): number {
  return (
    b.finalRequirementScore - a.finalRequirementScore ||
    b.deckLevelScore - a.deckLevelScore ||
    b.coverageDeltaPerPhysicalSlot - a.coverageDeltaPerPhysicalSlot ||
    b.bracketQuality - a.bracketQuality ||
    a.oracleId.localeCompare(b.oracleId) ||
    a.cardName.localeCompare(b.cardName)
  );
}
