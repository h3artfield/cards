/**
 * Bracket Power Portfolio v4.16 — qualitative power budget tracking (not a point system).
 */
import type { CommanderBracket } from "@/lib/bracket-policy/commander-bracket-snapshot-v1";
import type { BracketConstructionContractV416, PowerLeverKindV416 } from "./professor-bracket-construction-contract-v4-16-v1";
import type { BracketPowerPlanV410 } from "./professor-bracket-power-plan-v4-10-v1";
import type { BracketGapAnalysisV410 } from "./professor-bracket-gap-analysis-v4-10-v1";
import type { CouncilCardV46 } from "./professor-council-assembly-v4-6-v1";
import type { B4WinReadinessV4161 } from "./professor-b4-win-readiness-v4-16-1-v1";
import type { AccessArchitectureV4163 } from "./professor-access-architecture-v4-16-3-v1";

export const PROFESSOR_BRACKET_POWER_PORTFOLIO_V4_16_V1_VERSION = "professor-bracket-power-portfolio-v4-16-v1";

export type PortfolioLevelV416 = "NONE" | "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH";

export type PortfolioStatusV416 = "OK" | "DEFICIT" | "CRITICAL_DEFICIT" | "OVERSHOOT";

export type BracketPowerPortfolioEntryV416 = {
  dimension: PowerLeverKindV416;
  target: PortfolioLevelV416;
  current: PortfolioLevelV416;
  status: PortfolioStatusV416;
  detail: string;
};

export type BracketPowerPortfolioV416 = {
  version: typeof PROFESSOR_BRACKET_POWER_PORTFOLIO_V4_16_V1_VERSION;
  requestedBracket: CommanderBracket;
  entries: BracketPowerPortfolioEntryV416[];
  criticalDeficits: PowerLeverKindV416[];
  highDeficits: PowerLeverKindV416[];
  overshoots: PowerLeverKindV416[];
  bracketPowerUtilization: "LOW" | "MEDIUM" | "HIGH";
  holdCourseForbidden: boolean;
  summary: string;
};

const TUTOR_RE =
  /tutor|diabolic|demonic|vampiric|imperial seal|gamble|worldly|enlightened|mystical|personal tutor|recruiter|survival of the fittest|finale of devastation|fabricate|merchant scroll|wishclaw|spellseeker|tribute mage|isochron scepter|grim tutor|diabolic intent|entomb|buried alive/i;
const FAST_MANA_RE =
  /sol ring|mana crypt|dockside|chrome mox|mox diamond|jeweled lotus|lotus petal|grim monolith|mana vault|ancient tomb|three visits|nature's lore|farseek/i;

function countMatches(selected: CouncilCardV46[], re: RegExp): number {
  return selected.filter((c) => re.test(c.name)).length;
}

function levelFromCount(count: number, highTarget: number, mediumTarget: number): PortfolioLevelV416 {
  if (count >= highTarget) return "VERY_HIGH";
  if (count >= mediumTarget) return "HIGH";
  if (count > 0) return "MEDIUM";
  return "NONE";
}

function targetLevelFor(bracket: CommanderBracket, lever: PowerLeverKindV416): PortfolioLevelV416 {
  if (bracket <= 2) {
    if (lever === "ACCESS" || lever === "GAME_CHANGERS") return "LOW";
    if (lever === "ACCELERATION") return "LOW";
    return "MEDIUM";
  }
  if (bracket === 3) {
    if (lever === "ACCESS") return "MEDIUM";
    if (lever === "ACCELERATION") return "MEDIUM";
    if (lever === "WIN_COMPACTNESS") return "MEDIUM";
    if (lever === "INTERACTION") return "HIGH";
    return "MEDIUM";
  }
  if (lever === "ACCESS") return "VERY_HIGH";
  if (lever === "ACCELERATION") return "HIGH";
  if (lever === "INTERACTION") return "HIGH";
  if (lever === "WIN_COMPACTNESS") return "HIGH";
  if (lever === "MANA_QUALITY") return "HIGH";
  if (lever === "GAME_CHANGERS") return "MEDIUM";
  return "HIGH";
}

function compareLevel(current: PortfolioLevelV416, target: PortfolioLevelV416): PortfolioStatusV416 {
  const order: PortfolioLevelV416[] = ["NONE", "LOW", "MEDIUM", "HIGH", "VERY_HIGH"];
  const ci = order.indexOf(current);
  const ti = order.indexOf(target);
  if (ci >= ti) return "OK";
  if (ti - ci >= 2 || (target === "VERY_HIGH" && current === "NONE")) return "CRITICAL_DEFICIT";
  return "DEFICIT";
}

function compareOvershoot(current: PortfolioLevelV416, target: PortfolioLevelV416): boolean {
  const order: PortfolioLevelV416[] = ["NONE", "LOW", "MEDIUM", "HIGH", "VERY_HIGH"];
  return order.indexOf(current) > order.indexOf(target) + 1;
}

export function evaluateBracketPowerPortfolioV416(args: {
  contract: BracketConstructionContractV416;
  powerPlan: BracketPowerPlanV410 | null;
  selectedCards: CouncilCardV46[];
  profiles: FunctionalCardProfileV47[];
  gap: BracketGapAnalysisV410 | null;
  gameChangerCount?: number;
  reservedLandSlots?: number;
  winReadiness?: B4WinReadinessV4161 | null;
  accessArchitecture?: AccessArchitectureV4163 | null;
}): BracketPowerPortfolioV416 {
  const bracket = args.contract.requestedBracket;
  const selected = args.selectedCards.filter((c) => c.category !== "land");
  const tutorCount = countMatches(selected, TUTOR_RE);
  const accessRouteCount = args.accessArchitecture?.routes.length ?? 0;
  const effectiveAccessCount = Math.max(tutorCount, accessRouteCount >= 2 ? 2 : accessRouteCount);
  const fastManaCount = countMatches(selected, FAST_MANA_RE);
  const profileByOracle = new Map(args.profiles.map((p) => [p.oracleId, p]));
  const rampCount = selected.filter((c) => {
    const prof = c.oracleId ? profileByOracle.get(c.oracleId) : null;
    return prof?.roles.includes("ramp") ?? c.roles.includes("ramp");
  }).length;
  const interactionCount = selected.filter((c) => {
    const prof = c.oracleId ? profileByOracle.get(c.oracleId) : null;
    return prof?.roles.includes("interaction") ?? c.roles.includes("interaction");
  }).length;
  const protectionCount = selected.filter((c) => {
    const prof = c.oracleId ? profileByOracle.get(c.oracleId) : null;
    return prof?.roles.includes("protection") ?? c.roles.includes("protection");
  }).length;
  const finisherCount = selected.filter((c) => {
    const prof = c.oracleId ? profileByOracle.get(c.oracleId) : null;
    return prof?.roles.includes("finisher") ?? c.roles.includes("finisher");
  }).length;
  const gcCount = args.gameChangerCount ?? 0;

  const dimensions: Array<{ dim: PowerLeverKindV416; current: PortfolioLevelV416; detail: string }> = [
    {
      dim: "ACCESS",
      current: levelFromCount(effectiveAccessCount, bracket >= 4 ? 4 : 2, bracket >= 4 ? 2 : 1),
      detail: `tutors/access pieces: ${tutorCount}, access routes: ${accessRouteCount}`,
    },
    {
      dim: "ACCELERATION",
      current: levelFromCount(rampCount + fastManaCount, bracket >= 4 ? 10 : 6, bracket >= 4 ? 6 : 3),
      detail: `ramp+fast mana: ${rampCount + fastManaCount}`,
    },
    {
      dim: "INTERACTION",
      current: levelFromCount(interactionCount, bracket >= 4 ? 8 : 5, 3),
      detail: `interaction: ${interactionCount}`,
    },
    {
      dim: "PROTECTION",
      current: levelFromCount(protectionCount, 4, 2),
      detail: `protection: ${protectionCount}`,
    },
    {
      dim: "WIN_COMPACTNESS",
      current:
        args.winReadiness?.concreteLineReady === false
          ? "NONE"
          : levelFromCount(finisherCount, bracket >= 4 ? 5 : 3, 2),
      detail: args.winReadiness?.concreteLineReady
        ? `verified win line (${finisherCount} finishers tagged)`
        : `finishers: ${finisherCount} — no verified win architecture`,
    },
    {
      dim: "GAME_CHANGERS",
      current: gcCount >= 3 ? "HIGH" : gcCount >= 1 ? "MEDIUM" : "NONE",
      detail: `Game Changers: ${gcCount}`,
    },
    {
      dim: "MANA_QUALITY",
      current: args.reservedLandSlots && args.reservedLandSlots >= 33 ? "HIGH" : "MEDIUM",
      detail: args.reservedLandSlots ? `reserved lands: ${args.reservedLandSlots}` : "mana plan pending",
    },
    {
      dim: "CONSISTENCY",
      current: levelFromCount(tutorCount + Math.floor(rampCount / 2), bracket >= 4 ? 6 : 3, 2),
      detail: "access + ramp redundancy",
    },
  ];

  const entries: BracketPowerPortfolioEntryV416[] = dimensions.map(({ dim, current, detail }) => {
    const target = targetLevelFor(bracket, dim);
    const status = compareLevel(current, target);
    return { dimension: dim, target, current, status, detail };
  });

  const criticalDeficits = entries.filter((e) => e.status === "CRITICAL_DEFICIT").map((e) => e.dimension);
  const highDeficits = entries.filter((e) => e.status === "DEFICIT").map((e) => e.dimension);
  const overshoots = entries.filter((e) => compareOvershoot(e.current, e.target)).map((e) => e.dimension);

  const gapForbidden = args.gap?.holdCourseForbidden ?? false;
  const holdCourseForbidden = criticalDeficits.length > 0 || gapForbidden;

  const okCount = entries.filter((e) => e.status === "OK").length;
  const utilizationScore = okCount / entries.length;
  const bracketPowerUtilization: BracketPowerPortfolioV416["bracketPowerUtilization"] =
    utilizationScore >= 0.75 ? "HIGH" : utilizationScore >= 0.5 ? "MEDIUM" : "LOW";

  const summary =
    criticalDeficits.length > 0
      ? `CRITICAL deficits: ${criticalDeficits.join(", ")} — HOLD_COURSE illegal`
      : highDeficits.length > 0
        ? `Deficits: ${highDeficits.join(", ")} — bracket power underutilized (${bracketPowerUtilization})`
        : `Bracket B${bracket} power portfolio on track (${bracketPowerUtilization} utilization)`;

  return {
    version: PROFESSOR_BRACKET_POWER_PORTFOLIO_V4_16_V1_VERSION,
    requestedBracket: bracket,
    entries,
    criticalDeficits,
    highDeficits,
    overshoots,
    bracketPowerUtilization,
    holdCourseForbidden,
    summary,
  };
}
