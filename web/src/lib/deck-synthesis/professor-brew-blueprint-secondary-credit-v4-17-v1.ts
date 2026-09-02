/**
 * Professor v4.17 Slice 5.1 — verified cross-package secondary requirement credit.
 */
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import type { BrewBlueprintV417, BrewRequirementV417, PackageContributionV417 } from "./professor-brew-blueprint-v4-17-v1";
import { compileRequirementSemanticQueryV417 } from "./professor-requirement-semantic-query-v4-17-v1";
import {
  evaluateCandidateAgainstRequirementV417,
  type RequirementCandidateEvaluationV417,
  type RequirementCandidateInputV417,
} from "./professor-requirement-candidate-v4-17-v1";
import { packageContributingCardIds } from "./professor-brew-blueprint-package-density-v4-17-v1";

export const PROFESSOR_BREW_BLUEPRINT_SECONDARY_CREDIT_V4_17_V1_VERSION = "professor-brew-blueprint-secondary-credit-v4-17-v1";

/** Cap transitive generic package propagation during deterministic assembly. */
export const MAX_DETERMINISTIC_PACKAGE_MEMBERSHIPS_V417 = 4;

export type VerifiedSecondaryCreditV417 = {
  requirementId: string;
  packageIds: string[];
  evaluation: RequirementCandidateEvaluationV417;
};

export function allowsSecondaryFunctionalSatisfactionV417(
  primaryRequirement: BrewRequirementV417,
  secondaryRequirement: BrewRequirementV417,
): boolean {
  if (secondaryRequirement.family === "PACKAGE_DENSITY") return false;
  if (secondaryRequirement.requirementId.startsWith("pkg-density-")) return false;

  const isPackageFunctionStub =
    secondaryRequirement.packageIds.length === 1 &&
    secondaryRequirement.requirementId.startsWith(`${secondaryRequirement.packageIds[0]}-`);

  if (isPackageFunctionStub) {
    return primaryRequirement.packageIds.some((pid) => secondaryRequirement.packageIds.includes(pid));
  }

  return true;
}

export function discoverVerifiedSecondaryRequirementsV417(args: {
  blueprint: BrewBlueprintV417;
  primaryRequirementId: string;
  candidate: RequirementCandidateInputV417;
  commanderColorIdentity: string[];
  catalog: DeckResolutionCatalog;
}): VerifiedSecondaryCreditV417[] {
  const results: VerifiedSecondaryCreditV417[] = [];
  for (const req of args.blueprint.openRequirements) {
    if (req.requirementId === args.primaryRequirementId) continue;
    if (req.status !== "OPEN" && req.status !== "PARTIAL") continue;
    const compiled = compileRequirementSemanticQueryV417(req);
    const evaluation = evaluateCandidateAgainstRequirementV417({
      requirement: req,
      compiledQuery: compiled,
      candidate: args.candidate,
      commanderColorIdentity: args.commanderColorIdentity,
      catalog: args.catalog,
    });
    if (!evaluation.requirementEligible) continue;
    results.push({
      requirementId: req.requirementId,
      packageIds: req.packageIds,
      evaluation,
    });
  }
  return results;
}

export function buildPackageContributionsV417(args: {
  blueprint: BrewBlueprintV417;
  primaryRequirementId: string;
  primaryRequirement: BrewRequirementV417;
  evaluation: RequirementCandidateEvaluationV417;
  verifiedSecondaries: VerifiedSecondaryCreditV417[];
  candidateOracleId: string;
}): PackageContributionV417[] {
  const byPackage = new Map<string, PackageContributionV417>();

  function addContribution(packageId: string, requirementId: string, evaluation: RequirementCandidateEvaluationV417) {
    const existingContributors = packageContributingCardIds(args.blueprint, packageId);
    const countsTowardPhysicalDensity = !existingContributors.includes(args.candidateOracleId);
    const current = byPackage.get(packageId);
    if (current) {
      if (!current.requirementIds.includes(requirementId)) current.requirementIds.push(requirementId);
      for (const fn of evaluation.satisfiedFunctions) {
        if (!current.contributedFunctions.includes(fn)) current.contributedFunctions.push(fn);
      }
      current.semanticEvidence = [...new Set([...current.semanticEvidence, ...evaluation.semanticEvidence])];
      current.contributionStrength = Math.max(current.contributionStrength, evaluation.finalRequirementScore);
      return;
    }
    byPackage.set(packageId, {
      packageId,
      requirementIds: [requirementId],
      contributedFunctions: [...evaluation.satisfiedFunctions],
      semanticEvidence: [...evaluation.semanticEvidence],
      contributionStrength: evaluation.finalRequirementScore,
      countsTowardPhysicalDensity,
    });
  }

  for (const packageId of args.primaryRequirement.packageIds) {
    addContribution(packageId, args.primaryRequirementId, args.evaluation);
  }

  for (const secondary of args.verifiedSecondaries) {
    const sharesPrimaryPackage = secondary.packageIds.some((pid) => args.primaryRequirement.packageIds.includes(pid));
    if (!sharesPrimaryPackage) continue;
    for (const packageId of secondary.packageIds) {
      if (!args.primaryRequirement.packageIds.includes(packageId)) continue;
      addContribution(packageId, secondary.requirementId, secondary.evaluation);
    }
  }

  const primaryPackages = new Set(args.primaryRequirement.packageIds);
  return [...byPackage.values()]
    .sort(
      (a, b) =>
        Number(primaryPackages.has(b.packageId)) - Number(primaryPackages.has(a.packageId)) ||
        b.contributionStrength - a.contributionStrength ||
        a.packageId.localeCompare(b.packageId),
    )
    .slice(0, MAX_DETERMINISTIC_PACKAGE_MEMBERSHIPS_V417);
}
