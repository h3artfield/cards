/**
 * Professor v4.17 — blueprint mutation: select card, role compression, satisfaction ledger.
 */
import type {
  BlueprintSelectedCardV417,
  BrewBlueprintV417,
  BrewRequirementV417,
  RequirementFunctionV417,
} from "./professor-brew-blueprint-v4-17-v1";
import {
  assertBlueprintInvariantsV417,
  recomputeBlueprintValidationV417,
  recomputePhysicalSlotBudgetV417,
} from "./professor-brew-blueprint-v4-17-v1";
import { refreshPackageStatusesV417, refreshFunctionalBudgetCoverageV417 } from "./professor-brew-blueprint-package-v4-17-v1";
import {
  detectVerifiedFunctionsForCard,
  type RequirementCandidateEvaluationV417,
} from "./professor-requirement-candidate-v4-17-v1";
import { shrinkRequirementsAfterRoleCompressionV417 } from "./professor-requirement-materializer-v4-17-v1";
import {
  assessBlueprintSlotFeasibilityV417,
  auditBlueprintConsistencyV417,
} from "./professor-blueprint-feasibility-v4-17-v1";
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import {
  buildPackageContributionsV417,
  discoverVerifiedSecondaryRequirementsV417,
  allowsSecondaryFunctionalSatisfactionV417,
} from "./professor-brew-blueprint-secondary-credit-v4-17-v1";
import { rejectCanonicalLandAsNonlandSelectionV1 } from "./professor-canonical-deck-partition-v1";
import { refreshBlueprintPackageDensityV417, materializePackageDensityRequirementsV417 } from "./professor-brew-blueprint-package-density-v4-17-v1";
import {
  buildFunctionalDensityContributionsV417,
  materializeFunctionalDensityRequirementsV417,
  refreshBlueprintFunctionalDensityV417,
} from "./professor-brew-blueprint-functional-density-v4-17-v1";

export const PROFESSOR_BREW_BLUEPRINT_MUTATION_V4_17_V1_VERSION = "professor-brew-blueprint-mutation-v4-17-v1";

function deriveRequirementStatus(requirement: BrewRequirementV417, opts?: { secondaryOnly?: boolean }): BrewRequirementV417["status"] {
  if (requirement.status === "SATISFIED" && !opts?.secondaryOnly) return "SATISFIED";
  if (requirement.status === "REVISE") return "REVISE";
  const selected = requirement.selectedCardIds.length;
  if (opts?.secondaryOnly) {
    if (selected >= requirement.physicalSlotsNeeded.preferred) return "PARTIAL";
    if (selected >= requirement.physicalSlotsNeeded.min) return "PARTIAL";
    return requirement.status === "SATISFIED" ? "SATISFIED" : "OPEN";
  }
  if (selected >= requirement.physicalSlotsNeeded.preferred) return "SATISFIED";
  if (selected >= requirement.physicalSlotsNeeded.min) return "PARTIAL";
  return "OPEN";
}

function assignRoleCompression(args: {
  primaryFn: RequirementFunctionV417;
  verified: RequirementFunctionV417[];
}): {
  primaryFunction: RequirementFunctionV417;
  secondaryFunctions: RequirementFunctionV417[];
  tertiaryFunctions: RequirementFunctionV417[];
  satisfiedFunctions: RequirementFunctionV417[];
} {
  const rest = args.verified.filter((f) => f !== args.primaryFn);
  return {
    primaryFunction: args.primaryFn,
    secondaryFunctions: rest.slice(0, 1),
    tertiaryFunctions: rest.slice(1, 2),
    satisfiedFunctions: args.verified,
  };
}

export function selectEligibleCardForRequirementV417(args: {
  blueprint: BrewBlueprintV417;
  requirementId: string;
  evaluation: RequirementCandidateEvaluationV417;
  candidateOracleText: string;
  candidateTypeLine: string;
  secondaryRequirementIds?: string[];
  verifiedSecondaries?: ReturnType<typeof discoverVerifiedSecondaryRequirementsV417>;
  packageIds?: string[];
  revisionSummary?: string;
  catalog?: DeckResolutionCatalog | null;
}): BrewBlueprintV417 {
  const { blueprint, requirementId, evaluation } = args;
  if (!evaluation.requirementEligible) {
    throw new Error(`INELIGIBLE_CANDIDATE:${evaluation.cardName}`);
  }
  if (blueprint.selectedCards.some((c) => c.oracleId === evaluation.oracleId)) {
    throw new Error(`DUPLICATE_SELECTION:${evaluation.oracleId}`);
  }
  const landGuard = rejectCanonicalLandAsNonlandSelectionV1({
    name: evaluation.cardName,
    oracleId: evaluation.oracleId,
    catalog: args.catalog ?? null,
  });
  if (!landGuard.allowed) {
    throw new Error(landGuard.reason ?? `CANONICAL_LAND_NOT_STRUCTURAL_NONLAND:${evaluation.cardName}`);
  }

  const requirement = blueprint.openRequirements.find((r) => r.requirementId === requirementId);
  if (!requirement) throw new Error(`UNKNOWN_REQUIREMENT:${requirementId}`);

  const verified = detectVerifiedFunctionsForCard({
    oracleId: evaluation.oracleId,
    oracleText: args.candidateOracleText,
    typeLine: args.candidateTypeLine,
  });
  const primaryFn = requirement.requiredFunctions[0] ?? requirement.family;
  const roles = assignRoleCompression({ primaryFn, verified: verified.length ? verified : evaluation.satisfiedFunctions });
  const verifiedSecondariesAll =
    args.verifiedSecondaries ??
    (args.catalog
      ? discoverVerifiedSecondaryRequirementsV417({
          blueprint,
          primaryRequirementId: requirementId,
          candidate: {
            oracleId: evaluation.oracleId,
            name: evaluation.cardName,
            oracleText: args.candidateOracleText,
            typeLine: args.candidateTypeLine,
          },
          commanderColorIdentity: blueprint.commander.colorIdentity,
          catalog: args.catalog,
        })
      : []);
  const verifiedSecondaries = verifiedSecondariesAll.filter((secondary) => {
    const secondaryReq = blueprint.openRequirements.find((r) => r.requirementId === secondary.requirementId);
    return secondaryReq ? allowsSecondaryFunctionalSatisfactionV417(requirement, secondaryReq) : false;
  });
  const secondaryIds = args.secondaryRequirementIds ?? verifiedSecondaries.map((s) => s.requirementId);
  const packageContributions = buildPackageContributionsV417({
    blueprint,
    primaryRequirementId: requirementId,
    primaryRequirement: requirement,
    evaluation,
    verifiedSecondaries,
    candidateOracleId: evaluation.oracleId,
  });
  const functionalDensityContributions = buildFunctionalDensityContributionsV417({
    blueprint,
    candidateOracleId: evaluation.oracleId,
    satisfiedFunctions: roles.satisfiedFunctions,
    semanticEvidence: evaluation.semanticEvidence,
    contributionStrength: evaluation.finalRequirementScore,
  });
  const packageIds = [...new Set([...(args.packageIds ?? requirement.packageIds), ...packageContributions.map((c) => c.packageId)])];

  const selectedCard: BlueprintSelectedCardV417 = {
    oracleId: evaluation.oracleId,
    name: evaluation.cardName,
    physicalSlotsConsumed: 1,
    primaryRequirementId: requirementId,
    secondaryRequirementIds: secondaryIds,
    ...roles,
    packageIds,
    packageContributions,
    functionalDensityContributions,
    semanticEvidence: evaluation.semanticEvidence,
    bracketContribution: [`B${requirement.bracketQualityContract.requestedBracket}_${requirement.family}`],
    canonicalVerified: true,
  };

  let updatedRequirements = blueprint.openRequirements.map((r) => {
    const isPrimary = r.requirementId === requirementId;
    const isSecondary = secondaryIds.includes(r.requirementId);
    if (!isPrimary && !isSecondary) return r;
    if (r.selectedCardIds.includes(evaluation.oracleId)) return r;
    const selectedCardIds = [...r.selectedCardIds, evaluation.oracleId];
    return {
      ...r,
      selectedCardIds,
      currentCoverage: selectedCardIds.length,
      status: deriveRequirementStatus({ ...r, selectedCardIds }, { secondaryOnly: isSecondary && !isPrimary }),
    };
  });

  updatedRequirements = shrinkRequirementsAfterRoleCompressionV417(updatedRequirements, [
    ...blueprint.selectedCards,
    selectedCard,
  ]);

  const nextRevision = blueprint.revisionHistory.length
    ? Math.max(...blueprint.revisionHistory.map((h) => h.revision)) + 1
    : 1;

  const draft: BrewBlueprintV417 = {
    ...blueprint,
    selectedCards: [...blueprint.selectedCards, selectedCard],
    openRequirements: updatedRequirements,
    revisionHistory: [
      ...blueprint.revisionHistory,
      {
        revision: nextRevision,
        summary: args.revisionSummary ?? `Selected ${evaluation.cardName} for ${requirementId}`,
        changedRequirementIds: [requirementId],
        changedPackageIds: args.packageIds ?? requirement.packageIds,
        selectedOracleId: evaluation.oracleId,
      },
    ],
  };

  draft.physicalSlotBudget = recomputePhysicalSlotBudgetV417(draft);
  draft.packages = refreshPackageStatusesV417(draft);
  draft.functionalBudgets = refreshFunctionalBudgetCoverageV417(draft);
  draft.slotFeasibility = assessBlueprintSlotFeasibilityV417(draft);
  draft.consistencyAudit = auditBlueprintConsistencyV417({ blueprint: draft });
  draft.validation = recomputeBlueprintValidationV417(draft);
  assertBlueprintInvariantsV417(draft);
  return materializeFunctionalDensityRequirementsV417(
    refreshBlueprintPackageDensityV417(materializePackageDensityRequirementsV417(refreshBlueprintFunctionalDensityV417(draft))),
  );
}

export function applyRequirementSelectionV417(args: {
  blueprint: BrewBlueprintV417;
  requirementId: string;
  topEvaluation: RequirementCandidateEvaluationV417;
  candidateOracleText: string;
  candidateTypeLine: string;
  secondaryRequirementIds?: string[];
  verifiedSecondaries?: ReturnType<typeof discoverVerifiedSecondaryRequirementsV417>;
  catalog?: DeckResolutionCatalog | null;
}): BrewBlueprintV417 {
  return selectEligibleCardForRequirementV417({
    blueprint: args.blueprint,
    requirementId: args.requirementId,
    evaluation: { ...args.topEvaluation, accepted: true },
    candidateOracleText: args.candidateOracleText,
    candidateTypeLine: args.candidateTypeLine,
    secondaryRequirementIds: args.secondaryRequirementIds,
    verifiedSecondaries: args.verifiedSecondaries,
    catalog: args.catalog,
  });
}
