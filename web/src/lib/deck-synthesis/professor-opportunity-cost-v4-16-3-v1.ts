/**
 * Professor v4.16.3 — opportunity cost as replacement delta, not low absolute score.
 */
import type { CommanderBracket } from "@/lib/bracket-policy/commander-bracket-snapshot-v1";
import type { CouncilCardV46 } from "./professor-council-assembly-v4-6-v1";
import type { DeckCharterV45 } from "./professor-council-state-v4-5-v1";

export const PROFESSOR_OPPORTUNITY_COST_V4_16_3_V1_VERSION = "professor-opportunity-cost-v4-16-3-v1";

export type AssignedRoleV4163 =
  | "PREMIUM_ACCELERATION"
  | "INTERACTION"
  | "ENGINE"
  | "WIN_COMPONENT"
  | "ACCESS_ROUTE"
  | "PROTECTION"
  | "CARD_VELOCITY"
  | "GENERIC_SYNERGY";

export type OpportunityCostSlotV4163 = {
  currentCard: string;
  currentAssignedRoles: AssignedRoleV4163[];
  currentContribution: number;
  bestKnownReplacement: string | null;
  replacementContribution: number;
  netStrategicDelta: number;
  bracketDelta: number;
  charterDelta: number;
  recommendation: "KEEP" | "REPLACE" | "PRESERVE_UNLESS_SUPERSEDED";
  reason: string;
  preserveUnlessSuperseded: boolean;
};

export type OpportunityCostReportV4163 = {
  version: typeof PROFESSOR_OPPORTUNITY_COST_V4_16_3_V1_VERSION;
  bottomSlots: OpportunityCostSlotV4163[];
  b4PowerUtilizationGap: boolean;
  summary: string;
};

const PREMIUM_ACCEL_RE =
  /sol ring|mana crypt|dockside|chrome mox|mox diamond|jeweled lotus|lotus petal|grim monolith|mana vault|ancient tomb/i;
const PREMIUM_INTERACTION_RE =
  /force of will|deadly rollick|fierce guardianship|deflecting swat|swords to plowshares|path to exile|cyclonic rift|counterspell|swan song|nature's claim|generous gift|beast within|terminat|all is dust/i;
const DRAFT_RE =
  /doorman|heal|sunbeam spellbomb|disposal mummy|spider-ham|thopter assembly|airdrop aeronauts|summit apes|zendikar farguide|gingerbrute|vault guardsman/i;

const ROLE_CEILING: Record<AssignedRoleV4163, number> = {
  PREMIUM_ACCELERATION: 95,
  INTERACTION: 92,
  ENGINE: 88,
  WIN_COMPONENT: 90,
  ACCESS_ROUTE: 90,
  PROTECTION: 85,
  CARD_VELOCITY: 82,
  GENERIC_SYNERGY: 70,
};

const ROLE_BENCHMARKS: Partial<Record<AssignedRoleV4163, string[]>> = {
  PREMIUM_ACCELERATION: ["Sol Ring", "Mana Crypt", "Chrome Mox", "Mox Diamond", "Mana Vault"],
  INTERACTION: ["Swords to Plowshares", "Path to Exile", "Counterspell", "Cyclonic Rift", "All Is Dust"],
  ACCESS_ROUTE: ["Inventors' Fair", "Urza's Saga", "Mystic Forge", "Kuldotha Forgemaster", "Fabricate"],
  WIN_COMPONENT: ["Walking Ballista", "Steel Overseer", "Hangarback Walker", "Arcbound Ravager"],
};

function assignRoles(card: CouncilCardV46): AssignedRoleV4163[] {
  const roles: AssignedRoleV4163[] = [];
  if (PREMIUM_ACCEL_RE.test(card.name) || (card.roles.includes("ramp") && PREMIUM_ACCEL_RE.test(card.name))) {
    roles.push("PREMIUM_ACCELERATION");
  }
  if (PREMIUM_INTERACTION_RE.test(card.name) || card.roles.includes("interaction")) {
    roles.push("INTERACTION");
  }
  if (/inventors' fair|urza's saga|mystic forge|kuldotha forgemaster|fabricate|tribute mage|tutor/i.test(card.name)) {
    roles.push("ACCESS_ROUTE");
  }
  if (card.roles.includes("finisher")) roles.push("WIN_COMPONENT");
  if (card.roles.includes("protection")) roles.push("PROTECTION");
  if (card.roles.includes("card-advantage")) roles.push("CARD_VELOCITY");
  if (card.roles.some((r) => /engine|ramp|token-generation/.test(r))) roles.push("ENGINE");
  if (roles.length === 0) roles.push("GENERIC_SYNERGY");
  return roles;
}

function roleContribution(card: CouncilCardV46, role: AssignedRoleV4163, charter: DeckCharterV45 | null): number {
  let score = ROLE_CEILING[role] * 0.55;
  if (role === "PREMIUM_ACCELERATION" && PREMIUM_ACCEL_RE.test(card.name)) score = ROLE_CEILING[role] - 5;
  if (role === "INTERACTION" && PREMIUM_INTERACTION_RE.test(card.name)) score = ROLE_CEILING[role] - 8;
  if (role === "ACCESS_ROUTE" && /inventors' fair|urza's saga|mystic forge|kuldotha forgemaster/i.test(card.name)) {
    score = ROLE_CEILING[role] - 3;
  }
  if (role === "GENERIC_SYNERGY") {
    score = 45;
    if (DRAFT_RE.test(card.name)) score = 15;
    const blob = `${charter?.primaryStrategy ?? ""} ${charter?.secondaryStrategy ?? ""}`.toLowerCase();
    if (blob.includes("counter") && /counter|\+1\/\+1|proliferat/i.test(card.name)) score += 15;
    if (card.manaValue && card.manaValue >= 6) score -= 10;
  }
  if (role === "WIN_COMPONENT" && /ballista|overseer|ravager|hangarback/i.test(card.name)) score = ROLE_CEILING[role] - 6;
  return Math.max(0, Math.min(100, score));
}

function bestReplacementForRole(role: AssignedRoleV4163): { name: string; contribution: number } | null {
  const bench = ROLE_BENCHMARKS[role];
  if (!bench?.length) return null;
  return { name: bench[0]!, contribution: ROLE_CEILING[role] - 2 };
}

export function rankOpportunityCostCandidatesV4163(args: {
  selectedCards: CouncilCardV46[];
  charter: DeckCharterV45 | null;
  requestedBracket: CommanderBracket;
}): OpportunityCostReportV4163 {
  if (args.requestedBracket < 4) {
    return {
      version: PROFESSOR_OPPORTUNITY_COST_V4_16_3_V1_VERSION,
      bottomSlots: [],
      b4PowerUtilizationGap: false,
      summary: "Opportunity-cost scan N/A below B4",
    };
  }

  const nonlands = args.selectedCards.filter((c) => c.category !== "land");
  const ranked: OpportunityCostSlotV4163[] = nonlands.map((card) => {
    const assigned = assignRoles(card);
    const primaryRole = assigned[0] ?? "GENERIC_SYNERGY";
    const currentContribution = Math.max(...assigned.map((r) => roleContribution(card, r, args.charter)));
    const replacement = bestReplacementForRole(primaryRole);
    const replacementContribution = replacement?.contribution ?? currentContribution;
    const netStrategicDelta = replacementContribution - currentContribution;
    const preserveUnlessSuperseded =
      (primaryRole === "PREMIUM_ACCELERATION" && PREMIUM_ACCEL_RE.test(card.name)) ||
      (primaryRole === "ACCESS_ROUTE" && /inventors' fair|urza's saga|mystic forge|kuldotha forgemaster/i.test(card.name)) ||
      (primaryRole === "INTERACTION" && PREMIUM_INTERACTION_RE.test(card.name));

    let recommendation: OpportunityCostSlotV4163["recommendation"] = "KEEP";
    if (preserveUnlessSuperseded) recommendation = "PRESERVE_UNLESS_SUPERSEDED";
    else if (netStrategicDelta >= 18) recommendation = "REPLACE";

    const reason =
      preserveUnlessSuperseded
        ? `Near-ceiling ${primaryRole.replace(/_/g, " ").toLowerCase()} — not an opportunity-cost cut`
        : netStrategicDelta >= 18
          ? `B4-selected: materially stronger ${primaryRole.replace(/_/g, " ").toLowerCase()} exists (${replacement?.name ?? "known upgrade"})`
          : DRAFT_RE.test(card.name)
            ? "Low charter fit / draft-tier slot in B4 build"
            : "Role contribution acceptable for assigned need";

    return {
      currentCard: card.name,
      currentAssignedRoles: assigned,
      currentContribution,
      bestKnownReplacement: replacement?.name ?? null,
      replacementContribution,
      netStrategicDelta,
      bracketDelta: netStrategicDelta >= 18 ? 1 : 0,
      charterDelta: DRAFT_RE.test(card.name) ? -20 : 0,
      recommendation,
      reason,
      preserveUnlessSuperseded,
    };
  });

  const replaceCandidates = ranked
    .filter((s) => s.recommendation === "REPLACE" && !s.preserveUnlessSuperseded)
    .sort((a, b) => b.netStrategicDelta - a.netStrategicDelta);
  const bottomSlots = replaceCandidates.slice(0, 5);
  const b4PowerUtilizationGap = bottomSlots.length >= 2;

  return {
    version: PROFESSOR_OPPORTUNITY_COST_V4_16_3_V1_VERSION,
    bottomSlots,
    b4PowerUtilizationGap,
    summary: b4PowerUtilizationGap
      ? `B4_POWER_UTILIZATION_GAP — ${bottomSlots.map((s) => s.currentCard).join(", ")}`
      : "No material replacement-delta gaps at current scan",
  };
}
