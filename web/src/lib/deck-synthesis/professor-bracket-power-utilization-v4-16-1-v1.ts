/**
 * Professor v4.16.1 — per-dimension bracket power utilization floors.
 */
import type { CommanderBracket } from "@/lib/bracket-policy/commander-bracket-snapshot-v1";
import type { BracketPowerPortfolioV416 } from "./professor-bracket-power-portfolio-v4-16-v1";
import type { CanonicalLegalityAssessmentV4161 } from "./professor-canonical-legality-v4-16-1-v1";
import type { CouncilCardV46 } from "./professor-council-assembly-v4-6-v1";
import type { DeckSnapshotV46 } from "./professor-council-assembly-v4-6-v1";

export const PROFESSOR_BRACKET_POWER_UTILIZATION_V4_16_1_V1_VERSION =
  "professor-bracket-power-utilization-v4-16-1-v1";

export type UtilizationDimensionV4161 =
  | "access"
  | "acceleration"
  | "interactionQuality"
  | "protection"
  | "cardVelocity"
  | "engineQuality"
  | "manaQuality"
  | "winArchitecture"
  | "relevantGameChangerUtilization"
  | "deadCardRate";

export type UtilizationLevelV4161 = "BELOW_TARGET" | "ON_TARGET" | "ABOVE_TARGET" | "NOT_RELEVANT";

export type BracketPowerUtilizationEntryV4161 = {
  dimension: UtilizationDimensionV4161;
  level: UtilizationLevelV4161;
  detail: string;
};

export type BracketPowerUtilizationV4161 = {
  version: typeof PROFESSOR_BRACKET_POWER_UTILIZATION_V4_16_1_V1_VERSION;
  requestedBracket: CommanderBracket;
  entries: BracketPowerUtilizationEntryV4161[];
  belowTargetDimensions: UtilizationDimensionV4161[];
  bracketReady: boolean;
  summary: string;
};

const DRAFT_LEVEL_RE =
  /akki rockspeaker|dakmor lancer|dirtwater wraith|goblin flotilla|keldon raider|lich's caress|whispering shade|zodiac goat|vanilla|draft-level/i;
const EFFICIENT_INTERACTION_RE =
  /terminate|lightning bolt|path to exile|swords to plowshares|counterspell|force of will|cyclonic rift|deadly rollick|toxic deluge|feed the swarm|chaos warp|beast within|generous gift|anguished unmaking|abrupt decay|dismember|fatal push|terminate|terminate|terminate/i;
const EXPENSIVE_INTERACTION_RE = /lich's caress|launch party|five-mana|costs?\s+[5-9]|costs?\s+\{5/i;

function countRole(selected: CouncilCardV46[], role: string): number {
  return selected.filter((c) => c.roles.includes(role)).length;
}

export function evaluateBracketPowerUtilizationV4161(args: {
  requestedBracket: CommanderBracket;
  portfolio: BracketPowerPortfolioV416 | null;
  snapshot: DeckSnapshotV46 | null;
  selectedCards: CouncilCardV46[];
  legality: CanonicalLegalityAssessmentV4161 | null;
}): BracketPowerUtilizationV4161 {
  if (args.legality && !args.legality.effectiveBracketEvaluable) {
    return {
      version: PROFESSOR_BRACKET_POWER_UTILIZATION_V4_16_1_V1_VERSION,
      requestedBracket: args.requestedBracket,
      entries: [],
      belowTargetDimensions: [],
      bracketReady: false,
      summary: "NOT_EVALUATED — deck is not legal for bracket assessment",
    };
  }

  const nonlands = args.selectedCards.filter((c) => c.category !== "land");
  const deadCards = nonlands.filter((c) => DRAFT_LEVEL_RE.test(c.name)).length;
  const interactionTagged = countRole(nonlands, "interaction");
  const efficientInteraction = nonlands.filter((c) => EFFICIENT_INTERACTION_RE.test(c.name)).length;
  const expensiveInteraction = nonlands.filter((c) => EXPENSIVE_INTERACTION_RE.test(c.name)).length;
  const protection = countRole(nonlands, "protection");
  const ramp = countRole(nonlands, "ramp");
  const cardAdv = args.snapshot?.cardAdvantageCoverage ?? countRole(nonlands, "card-advantage");

  const entries: BracketPowerUtilizationEntryV4161[] = [];

  const push = (dimension: UtilizationDimensionV4161, level: UtilizationLevelV4161, detail: string) => {
    entries.push({ dimension, level, detail });
  };

  const accessEntry = args.portfolio?.entries.find((e) => e.dimension === "ACCESS");
  push(
    "access",
    accessEntry?.status === "CRITICAL_DEFICIT" || accessEntry?.status === "DEFICIT"
      ? "BELOW_TARGET"
      : "ON_TARGET",
    accessEntry?.detail ?? "Access lever",
  );

  const accelEntry = args.portfolio?.entries.find((e) => e.dimension === "ACCELERATION");
  push(
    "acceleration",
    accelEntry?.status === "CRITICAL_DEFICIT" || accelEntry?.status === "DEFICIT"
      ? "BELOW_TARGET"
      : ramp >= 6
        ? "ON_TARGET"
        : "BELOW_TARGET",
    accelEntry?.detail ?? `Ramp pieces: ${ramp}`,
  );

  push(
    "interactionQuality",
    efficientInteraction >= Math.max(2, interactionTagged - expensiveInteraction)
      ? "ON_TARGET"
      : interactionTagged >= 4 && efficientInteraction < 2
        ? "BELOW_TARGET"
        : interactionTagged >= 2
          ? "ON_TARGET"
          : "BELOW_TARGET",
    `Efficient interaction: ${efficientInteraction}, expensive: ${expensiveInteraction}, tagged: ${interactionTagged}`,
  );

  const protEntry = args.portfolio?.entries.find((e) => e.dimension === "PROTECTION");
  push(
    "protection",
    protection >= 3 ? "ON_TARGET" : protection >= 1 ? "BELOW_TARGET" : "BELOW_TARGET",
    protEntry?.detail ?? `Protection pieces: ${protection}`,
  );

  push(
    "cardVelocity",
    cardAdv >= 4 ? "ON_TARGET" : cardAdv >= 2 ? "BELOW_TARGET" : "BELOW_TARGET",
    `Card advantage coverage: ${cardAdv}`,
  );

  push(
    "engineQuality",
    deadCards >= 4 ? "BELOW_TARGET" : deadCards >= 2 ? "BELOW_TARGET" : "ON_TARGET",
    `Low-impact / draft-level cards: ${deadCards}`,
  );

  push(
    "manaQuality",
    args.snapshot && args.snapshot.landCount >= 33 ? "ON_TARGET" : "BELOW_TARGET",
    `Lands: ${args.snapshot?.landCount ?? "?"}`,
  );

  const winEntry = args.portfolio?.entries.find((e) => e.dimension === "WIN_COMPACTNESS");
  push(
    "winArchitecture",
    winEntry?.status === "CRITICAL_DEFICIT" || winEntry?.status === "DEFICIT"
      ? "BELOW_TARGET"
      : "ON_TARGET",
    winEntry?.detail ?? "Win compactness",
  );

  const gcEntry = args.portfolio?.entries.find((e) => e.dimension === "GAME_CHANGERS");
  push(
    "relevantGameChangerUtilization",
    args.requestedBracket >= 4
      ? gcEntry?.status === "CRITICAL_DEFICIT" || gcEntry?.status === "DEFICIT"
        ? "BELOW_TARGET"
        : "ON_TARGET"
      : "NOT_RELEVANT",
    gcEntry?.detail ?? "Game changer utilization vs contract",
  );

  push(
    "deadCardRate",
    deadCards >= 3 ? "BELOW_TARGET" : deadCards >= 1 ? "BELOW_TARGET" : "ON_TARGET",
    `${deadCards} suspected dead slots`,
  );

  const belowTargetDimensions = entries
    .filter((e) => e.level === "BELOW_TARGET")
    .map((e) => e.dimension);

  const bracketReady =
    belowTargetDimensions.length === 0 &&
    !(args.portfolio?.criticalDeficits.length ?? 0) &&
    !(args.portfolio?.highDeficits.length && args.portfolio.highDeficits.length >= 3);

  return {
    version: PROFESSOR_BRACKET_POWER_UTILIZATION_V4_16_1_V1_VERSION,
    requestedBracket: args.requestedBracket,
    entries,
    belowTargetDimensions,
    bracketReady,
    summary: bracketReady
      ? "Bracket utilization floors met"
      : `Below target: ${belowTargetDimensions.slice(0, 4).join(", ")}`,
  };
}
