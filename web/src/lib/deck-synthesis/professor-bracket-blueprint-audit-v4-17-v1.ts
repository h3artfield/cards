/**
 * Professor v4.17 — bracket architecture audit (before card filling).
 */
import type { BrewBlueprintV417 } from "./professor-brew-blueprint-v4-17-v1";
import type { SolBlueprintProposalV417 } from "./professor-sol-blueprint-proposal-v4-17-v1";

export const PROFESSOR_BRACKET_BLUEPRINT_AUDIT_V4_17_V1_VERSION = "professor-bracket-blueprint-audit-v4-17-v1";

export type BracketBlueprintAuditV417 = {
  requestedBracket: number;
  bracketMismatch: boolean;
  hasAccelerationPlan: boolean;
  hasInteractionPlan: boolean;
  hasAccessPlan: boolean;
  hasProtectionPlan: boolean;
  hasRecoveryPlan: boolean;
  hasWinArchitecture: boolean;
  issues: string[];
};

export function assessBracketBlueprintArchitectureV417(
  blueprint: BrewBlueprintV417,
  proposal: SolBlueprintProposalV417,
): BracketBlueprintAuditV417 {
  const requested = blueprint.userIntent.bracket;
  const issues: string[] = [];
  const text = [
    proposal.bracketConstructionGuidance.join(" "),
    proposal.bracketContract.accelerationExpectation,
    proposal.bracketContract.interactionExpectation,
    proposal.primaryStrategy,
    proposal.commanderExploit,
  ]
    .join(" ")
    .toLowerCase();

  const hasAccelerationPlan =
    blueprint.openRequirements.some((r) => r.family === "ACCELERATION") ||
    /ramp|accelerat|mana/.test(text);
  const hasInteractionPlan =
    blueprint.openRequirements.some((r) => r.family === "INTERACTION") ||
    /interaction|removal|counter|answer/.test(text);
  const hasAccessPlan = proposal.accessNeeds.length > 0 || blueprint.openRequirements.some((r) => r.family === "ACCESS");
  const hasProtectionPlan =
    proposal.protectionNeeds.length > 0 || blueprint.openRequirements.some((r) => r.family === "PROTECTION");
  const hasRecoveryPlan = /recover|recur|recursion|graveyard/.test(text);
  const hasWinArchitecture = proposal.winArchitecture.length > 0;

  if (requested >= 4) {
    if (!hasInteractionPlan) issues.push("B4_MISSING_INTERACTION_ARCHITECTURE");
    if (!hasAccelerationPlan) issues.push("B4_MISSING_ACCELERATION_ARCHITECTURE");
    if (/casual|slow|battlecruiser|low power|friendly/.test(text) && !/efficient|premium|compact/.test(text)) {
      issues.push("BLUEPRINT_BRACKET_MISMATCH");
    }
  }

  const bracketMismatch = issues.includes("BLUEPRINT_BRACKET_MISMATCH") ||
    (requested >= 4 && (!hasInteractionPlan || !hasWinArchitecture));

  return {
    requestedBracket: requested,
    bracketMismatch,
    hasAccelerationPlan,
    hasInteractionPlan,
    hasAccessPlan,
    hasProtectionPlan,
    hasRecoveryPlan,
    hasWinArchitecture,
    issues,
  };
}
