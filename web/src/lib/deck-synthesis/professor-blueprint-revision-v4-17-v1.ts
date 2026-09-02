/**
 * Professor v4.17 — blueprint revision with authoritative requirement rematerialization.
 */
import type { BrewBlueprintV417, BlueprintRevisionV417 } from "./professor-brew-blueprint-v4-17-v1";
import type { SolBlueprintProposalV417 } from "./professor-sol-blueprint-proposal-v4-17-v1";
import type { BlueprintResearchFindingV417 } from "./professor-blueprint-research-v4-17-v1";
import { materializeRequirementsFromBlueprintV417 } from "./professor-requirement-materializer-v4-17-v1";
import {
  assessBlueprintSlotFeasibilityV417,
  auditBlueprintConsistencyV417,
} from "./professor-blueprint-feasibility-v4-17-v1";
import { buildBlueprintFromSolProposalV417 } from "./professor-sol-blueprint-live-v4-17-v1";

export const PROFESSOR_BLUEPRINT_REVISION_V4_17_V1_VERSION = "professor-blueprint-revision-v4-17-v1";

export function currentBlueprintRevisionId(blueprint: BrewBlueprintV417): number {
  return blueprint.revisionHistory.length
    ? Math.max(...blueprint.revisionHistory.map((r) => r.revision))
    : 0;
}

export function assertRequirementRevisionProvenanceV417(blueprint: BrewBlueprintV417): void {
  const rev = currentBlueprintRevisionId(blueprint);
  for (const req of blueprint.openRequirements) {
    if (req.blueprintRevisionId !== rev) {
      throw new Error(`STALE_REQUIREMENT:${req.requirementId}:${req.blueprintRevisionId}!=${rev}`);
    }
  }
}

export function applyBlueprintRevisionV417(args: {
  blueprint: BrewBlueprintV417;
  proposal: SolBlueprintProposalV417;
  findings: BlueprintResearchFindingV417[];
  summary: string;
}): BrewBlueprintV417 {
  const nextRevision = currentBlueprintRevisionId(args.blueprint) + 1;
  let revisedProposal = { ...args.proposal, packages: [...args.proposal.packages] };

  for (const finding of args.findings) {
    if (finding.verdict === "REJECT" && finding.targetType === "PACKAGE") {
      revisedProposal.packages = revisedProposal.packages.map((p) =>
        p.packageId === finding.targetId
          ? {
              ...p,
              minimumPhysicalContribution: Math.min(p.minimumPhysicalContribution ?? p.minimumPhysicalSlots, 8),
              minimumPhysicalSlots: Math.min(p.minimumPhysicalSlots, 8),
              status: "REVISE" as const,
            }
          : p,
      );
    }
    if (finding.rulesContradiction && finding.targetType === "REQUIREMENT") {
      revisedProposal = revisedProposal;
    }
  }

  const rebuilt = buildBlueprintFromSolProposalV417({
    commander: args.blueprint.commander,
    userIntent: args.blueprint.userIntent,
    proposal: revisedProposal,
  });

  const openRequirements = materializeRequirementsFromBlueprintV417({
    proposal: revisedProposal,
    commanderColorIdentity: args.blueprint.commander.colorIdentity,
    requestedBracket: args.blueprint.userIntent.bracket,
    selectedCards: args.blueprint.selectedCards,
  }).map((r) => ({ ...r, blueprintRevisionId: nextRevision }));

  const revision: BlueprintRevisionV417 = {
    revision: nextRevision,
    summary: args.summary,
    changedRequirementIds: openRequirements.map((r) => r.requirementId),
    changedPackageIds: revisedProposal.packages.map((p) => p.packageId),
  };

  const next: BrewBlueprintV417 = {
    ...rebuilt,
    selectedCards: args.blueprint.selectedCards,
    openRequirements,
    revisionHistory: [...args.blueprint.revisionHistory, revision],
  };
  next.physicalSlotBudget = {
    ...next.physicalSlotBudget,
    selectedNonlands: args.blueprint.selectedCards.length,
    remainingNonlandSlots: Math.max(0, next.physicalSlotBudget.expectedNonlands - args.blueprint.selectedCards.length),
  };
  next.slotFeasibility = assessBlueprintSlotFeasibilityV417(next);
  next.consistencyAudit = auditBlueprintConsistencyV417({ blueprint: next, proposal: revisedProposal });
  assertRequirementRevisionProvenanceV417(next);
  return next;
}
