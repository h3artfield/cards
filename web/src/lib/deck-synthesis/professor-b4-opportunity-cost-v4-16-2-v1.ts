/**
 * Professor v4.16.2 — B4 opportunity-cost pressure (bottom-five scan).
 */
import type { CommanderBracket } from "@/lib/bracket-policy/commander-bracket-snapshot-v1";
import type { DeckCharterV45 } from "./professor-council-state-v4-5-v1";
import type { CouncilCardV46 } from "./professor-council-assembly-v4-6-v1";

export const PROFESSOR_B4_OPPORTUNITY_COST_V4_16_2_V1_VERSION = "professor-b4-opportunity-cost-v4-16-2-v1";

export type B4OpportunityCostSlotV4162 = {
  name: string;
  score: number;
  reason: string;
};

export type B4OpportunityCostReportV4162 = {
  version: typeof PROFESSOR_B4_OPPORTUNITY_COST_V4_16_2_V1_VERSION;
  bottomSlots: B4OpportunityCostSlotV4162[];
  b4PowerUtilizationGap: boolean;
  summary: string;
};

const LOW_QUALITY_RE =
  /doorman|heal|sunbeam spellbomb|disposal mummy|spider-ham|vault guardsman|gingerbrute|thopter assembly|airdrop aeronauts|summit apes|zendikar farguide|misfortune's gain|optimistic scavenger|foe-liage|tanglewalker/i;

const PREMIUM_ALTERNATIVES = [
  "Grand Abolisher",
  "Teferi's Protection",
  "Smothering Tithe",
  "Esper Sentinel",
  "Aura Shards",
  "Heroic Intervention",
  "Tyvar Kell",
  "Kami of Whispered Hopes",
];

function charterKeywordScore(name: string, charter: DeckCharterV45 | null): number {
  if (!charter) return 0;
  const blob = `${charter.primaryStrategy} ${charter.secondaryStrategy}`.toLowerCase();
  let score = 0;
  if (blob.includes("legendary") && /legendary/i.test(name)) score += 3;
  if (blob.includes("cost") && /cost|reduce|discount/i.test(name)) score += 2;
  return score;
}

export function rankB4OpportunityCostCandidatesV4162(args: {
  selectedCards: CouncilCardV46[];
  charter: DeckCharterV45 | null;
  requestedBracket: CommanderBracket;
}): B4OpportunityCostReportV4162 {
  if (args.requestedBracket < 4) {
    return {
      version: PROFESSOR_B4_OPPORTUNITY_COST_V4_16_2_V1_VERSION,
      bottomSlots: [],
      b4PowerUtilizationGap: false,
      summary: "Opportunity-cost scan N/A below B4",
    };
  }

  const nonlands = args.selectedCards.filter((c) => c.category !== "land");
  const ranked: B4OpportunityCostSlotV4162[] = nonlands.map((c) => {
    let score = 50;
    if (LOW_QUALITY_RE.test(c.name)) score -= 35;
    if (c.roles.length <= 1) score -= 10;
    if (c.roles.includes("finisher") && LOW_QUALITY_RE.test(c.name)) score -= 15;
    score += charterKeywordScore(c.name, args.charter);
    const reason =
      score <= 20
        ? "Low charter fit / draft-tier slot in B4 build"
        : score <= 35
          ? "Weak role compression for requested bracket"
          : "Acceptable but upgradeable";
    return { name: c.name, score, reason };
  });

  ranked.sort((a, b) => a.score - b.score);
  const bottomSlots = ranked.slice(0, 5);
  const b4PowerUtilizationGap = bottomSlots.some((s) => s.score <= 25);

  return {
    version: PROFESSOR_B4_OPPORTUNITY_COST_V4_16_2_V1_VERSION,
    bottomSlots,
    b4PowerUtilizationGap,
    summary: b4PowerUtilizationGap
      ? `B4_POWER_UTILIZATION_GAP — bottom slots include ${bottomSlots
          .filter((s) => s.score <= 25)
          .map((s) => s.name)
          .join(", ")}; alternatives exist (${PREMIUM_ALTERNATIVES.slice(0, 3).join(", ")})`
      : "No obvious bottom-five gap at current scan",
  };
}

export function knownBetterReplacementExistsV4162(slotName: string): boolean {
  return LOW_QUALITY_RE.test(slotName);
}
