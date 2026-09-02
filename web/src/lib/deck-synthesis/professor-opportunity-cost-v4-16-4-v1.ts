/**
 * Professor v4.16.4 — legal opportunity cost with role-preservation delta.
 */
import type { CommanderBracket } from "@/lib/bracket-policy/commander-bracket-snapshot-v1";
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import type { CouncilCardV46 } from "./professor-council-assembly-v4-6-v1";
import type { DeckCharterV45 } from "./professor-council-state-v4-5-v1";
import {
  cardLegalInCommanderColorIdentity,
  cardTruthAllowsIntelligenceParticipation,
  resolveCanonicalCardTruthV4164,
} from "./professor-canonical-card-truth-v4-16-4-v1";
import {
  type AssignedRoleV4163,
  type OpportunityCostReportV4163,
  type OpportunityCostSlotV4163,
  rankOpportunityCostCandidatesV4163,
} from "./professor-opportunity-cost-v4-16-3-v1";

export const PROFESSOR_OPPORTUNITY_COST_V4_16_4_V1_VERSION = "professor-opportunity-cost-v4-16-4-v1";

export type OpportunityCostSlotV4164 = OpportunityCostSlotV4163 & {
  currentRoles: AssignedRoleV4163[];
  replacementRoles: AssignedRoleV4163[];
  rolesPreserved: AssignedRoleV4163[];
  rolesImproved: AssignedRoleV4163[];
  rolesLost: AssignedRoleV4163[];
  uniqueEngineValueLost: number;
  packageContributionLost: number;
  commanderContributionLost: number;
  netDeckDelta: number;
  replacementLegal: boolean;
  replacementRejectedReason?: string;
};

export type OpportunityCostReportV4164 = {
  version: typeof PROFESSOR_OPPORTUNITY_COST_V4_16_4_V1_VERSION;
  bottomSlots: OpportunityCostSlotV4164[];
  b4PowerUtilizationGap: boolean;
  summary: string;
  illegalReplacementsRejected: number;
};

const ROLE_BENCHMARKS: Partial<Record<AssignedRoleV4163, string[]>> = {
  PREMIUM_ACCELERATION: ["Sol Ring", "Mana Crypt", "Chrome Mox", "Mox Diamond", "Mana Vault"],
  INTERACTION: ["Counterspell", "Cyclonic Rift", "All Is Dust", "Force of Negation", "Mana Drain"],
  ACCESS_ROUTE: ["Inventors' Fair", "Urza's Saga", "Mystic Forge", "Kuldotha Forgemaster", "Fabricate"],
  WIN_COMPONENT: ["Walking Ballista", "Steel Overseer", "Hangarback Walker", "Arcbound Ravager"],
  CARD_VELOCITY: ["Rhystic Study", "Mystic Remora", "Esper Sentinel", "Consecrated Sphinx"],
  ENGINE: ["Thopter Assembly", "Saheeli, Sublime Artificer", "Urza, Lord High Artificer"],
};

function assignReplacementRoles(name: string): AssignedRoleV4163[] {
  const lower = name.toLowerCase();
  const roles: AssignedRoleV4163[] = [];
  if (/sol ring|mana crypt|chrome mox|mox diamond|mana vault|jeweled lotus/.test(lower)) {
    roles.push("PREMIUM_ACCELERATION");
  }
  if (/counterspell|cyclonic rift|force of|swan song|delay|flusterstorm|mana drain/.test(lower)) {
    roles.push("INTERACTION");
  }
  if (/inventors' fair|urza's saga|mystic forge|fabricate|tutor/.test(lower)) roles.push("ACCESS_ROUTE");
  if (/ballista|overseer|ravager|hangarback/.test(lower)) roles.push("WIN_COMPONENT");
  if (/rhystic|remora|study|sphinx|brainstorm|ponder/.test(lower)) roles.push("CARD_VELOCITY");
  if (/assembly|engine|forge|ballista|thopter/.test(lower)) roles.push("ENGINE");
  if (roles.length === 0) roles.push("GENERIC_SYNERGY");
  return roles;
}

function roleContribution(role: AssignedRoleV4163): number {
  const ceilings: Record<AssignedRoleV4163, number> = {
    PREMIUM_ACCELERATION: 95,
    INTERACTION: 92,
    ENGINE: 88,
    WIN_COMPONENT: 90,
    ACCESS_ROUTE: 90,
    PROTECTION: 85,
    CARD_VELOCITY: 82,
    GENERIC_SYNERGY: 70,
  };
  return ceilings[role] - 2;
}

function bestLegalReplacementForRole(args: {
  role: AssignedRoleV4163;
  commanderColorIdentity: string[];
  catalog: DeckResolutionCatalog | null;
  selectedNames: Set<string>;
}): { name: string; contribution: number; roles: AssignedRoleV4163[] } | null {
  const bench = ROLE_BENCHMARKS[args.role] ?? [];
  for (const name of bench) {
    if (args.selectedNames.has(name.toLowerCase())) continue;
    const truth = resolveCanonicalCardTruthV4164({ name, catalog: args.catalog });
    if (!cardTruthAllowsIntelligenceParticipation(truth)) continue;
    if (!cardLegalInCommanderColorIdentity({ card: truth, commanderColorIdentity: args.commanderColorIdentity })) {
      continue;
    }
    const roles = assignReplacementRoles(name);
    return { name, contribution: roleContribution(args.role), roles };
  }
  return null;
}

export function rankOpportunityCostCandidatesV4164(args: {
  selectedCards: CouncilCardV46[];
  charter: DeckCharterV45 | null;
  requestedBracket: CommanderBracket;
  commanderColorIdentity: string[];
  catalog?: DeckResolutionCatalog | null;
}): OpportunityCostReportV4164 {
  const base = rankOpportunityCostCandidatesV4163(args);
  if (args.requestedBracket < 4) {
    return {
      version: PROFESSOR_OPPORTUNITY_COST_V4_16_4_V1_VERSION,
      bottomSlots: [],
      b4PowerUtilizationGap: false,
      summary: base.summary,
      illegalReplacementsRejected: 0,
    };
  }

  const selectedNames = new Set(args.selectedCards.map((c) => c.name.toLowerCase()));
  let illegalReplacementsRejected = 0;
  const bottomSlots: OpportunityCostSlotV4164[] = base.bottomSlots.map((slot) => {
    const currentRoles = slot.currentAssignedRoles;
    const primaryRole = currentRoles[0] ?? "GENERIC_SYNERGY";
    const replacement = bestLegalReplacementForRole({
      role: primaryRole,
      commanderColorIdentity: args.commanderColorIdentity,
      catalog: args.catalog ?? null,
      selectedNames,
    });

    if (!replacement && slot.bestKnownReplacement) {
      illegalReplacementsRejected += 1;
      const rejectedTruth = resolveCanonicalCardTruthV4164({
        name: slot.bestKnownReplacement,
        catalog: args.catalog,
      });
      return {
        ...slot,
        currentRoles,
        replacementRoles: [],
        rolesPreserved: currentRoles,
        rolesImproved: [],
        rolesLost: [],
        uniqueEngineValueLost: 0,
        packageContributionLost: 0,
        commanderContributionLost: 0,
        netDeckDelta: 0,
        replacementLegal: false,
        replacementRejectedReason: !cardTruthAllowsIntelligenceParticipation(rejectedTruth)
          ? "CARD_TRUTH_UNRESOLVED"
          : "COLOR_IDENTITY_ILLEGAL",
        bestKnownReplacement: null,
        recommendation: "KEEP",
        reason: `Replacement ${slot.bestKnownReplacement} rejected before scoring — not legal in commander colors`,
      };
    }

    const replacementRoles = replacement?.roles ?? [];
    const rolesPreserved = currentRoles.filter((r) => replacementRoles.includes(r));
    const rolesImproved = replacementRoles.filter((r) => !currentRoles.includes(r));
    const rolesLost = currentRoles.filter((r) => !replacementRoles.includes(r));
    const uniqueEngineValueLost =
      rolesLost.includes("ENGINE") || rolesLost.includes("CARD_VELOCITY") ? 18 : 0;
    const packageContributionLost = rolesLost.length > 1 ? 12 : 0;
    const commanderContributionLost = 0;
    const grossDelta = (replacement?.contribution ?? slot.currentContribution) - slot.currentContribution;
    const netDeckDelta = grossDelta - uniqueEngineValueLost - packageContributionLost - commanderContributionLost;

    let recommendation = slot.recommendation;
    if (rolesLost.length > 0 && netDeckDelta < 18) recommendation = "KEEP";
    else if (netDeckDelta >= 18 && rolesLost.length === 0) recommendation = "REPLACE";
    else if (netDeckDelta >= 18 && rolesLost.length > 0) recommendation = "KEEP";

    return {
      ...slot,
      currentRoles,
      replacementRoles,
      rolesPreserved,
      rolesImproved,
      rolesLost,
      uniqueEngineValueLost,
      packageContributionLost,
      commanderContributionLost,
      netDeckDelta,
      replacementLegal: Boolean(replacement),
      bestKnownReplacement: replacement?.name ?? null,
      replacementContribution: replacement?.contribution ?? slot.replacementContribution,
      netStrategicDelta: netDeckDelta,
      recommendation,
      reason:
        rolesLost.length > 0
          ? `Role loss (${rolesLost.join(", ")}) offsets replacement delta — preserve dual-role slot`
          : slot.reason,
    };
  });

  const replaceCandidates = bottomSlots.filter((s) => s.recommendation === "REPLACE" && s.replacementLegal);
  return {
    version: PROFESSOR_OPPORTUNITY_COST_V4_16_4_V1_VERSION,
    bottomSlots: replaceCandidates.slice(0, 5),
    b4PowerUtilizationGap: replaceCandidates.length >= 2,
    summary:
      illegalReplacementsRejected > 0
        ? `Rejected ${illegalReplacementsRejected} illegal replacement(s) before scoring`
        : base.summary,
    illegalReplacementsRejected,
  };
}

export function adaptOpportunityCostV4164ToV4163(report: OpportunityCostReportV4164): OpportunityCostReportV4163 {
  return {
    version: "professor-opportunity-cost-v4-16-3-v1",
    bottomSlots: report.bottomSlots,
    b4PowerUtilizationGap: report.b4PowerUtilizationGap,
    summary: report.summary,
  };
}
