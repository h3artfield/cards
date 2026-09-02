/**
 * Professor v4.16.2 — quality-aware bracket readiness (counts are evidence, not conclusions).
 */
import type { BracketPowerUtilizationV4161 } from "./professor-bracket-power-utilization-v4-16-1-v1";
import type { B4WinReadinessV4161 } from "./professor-b4-win-readiness-v4-16-1-v1";
import type { DeckCharterV45 } from "./professor-council-state-v4-5-v1";
import type { CouncilCardV46 } from "./professor-council-assembly-v4-6-v1";
import type { AccessArchitectureV4163 } from "./professor-access-architecture-v4-16-3-v1";
import type { DeckSlotBudgetV4163 } from "./professor-deck-slot-budget-v4-16-3-v1";
import type { PreFinalQualityCriticReportV4162 } from "./professor-pre-final-quality-critic-v4-16-2-v1";

export const PROFESSOR_BRACKET_READINESS_QUALITY_V4_16_2_V1_VERSION =
  "professor-bracket-readiness-quality-v4-16-2-v1";

export type BracketReadinessQualityDimensionV4162 =
  | "accessQuality"
  | "accelerationQuality"
  | "interactionQuality"
  | "protectionQuality"
  | "engineQuality"
  | "cardQuality"
  | "winArchitectureQuality"
  | "manaQuality"
  | "deadCardRate"
  | "charterCoherence";

export type BracketReadinessQualityV4162 = {
  version: typeof PROFESSOR_BRACKET_READINESS_QUALITY_V4_16_2_V1_VERSION;
  dimensions: Array<{ dimension: BracketReadinessQualityDimensionV4162; pass: boolean; detail: string }>;
  failingDimensions: BracketReadinessQualityDimensionV4162[];
  qualityReady: boolean;
  summary: string;
};

const DRAFT_RE =
  /doorman|heal|sunbeam spellbomb|disposal mummy|spider-ham|akki rockspeaker|dakmor lancer|whispering shade|vanilla|draft-level/i;

export function assessBracketReadinessQualityV4162(args: {
  selectedCards: CouncilCardV46[];
  charter: DeckCharterV45 | null;
  utilization: BracketPowerUtilizationV4161 | null;
  winReadiness: B4WinReadinessV4161 | null;
  preFinalCritic?: PreFinalQualityCriticReportV4162 | null;
  accessArchitecture?: AccessArchitectureV4163 | null;
  slotBudget?: DeckSlotBudgetV4163 | null;
}): BracketReadinessQualityV4162 {
  const nonlands = args.selectedCards.filter((c) => c.category !== "land");
  const draftCards = nonlands.filter((c) => DRAFT_RE.test(c.name));
  const interactionBelow = args.utilization?.belowTargetDimensions.includes("interactionQuality") ?? false;
  const gcBelow = args.utilization?.belowTargetDimensions.includes("relevantGameChangerUtilization") ?? false;
  const winConcrete = args.winReadiness?.concreteLineReady ?? args.winReadiness?.ready ?? false;
  const charterCoherent = !(args.preFinalCritic?.disconnectedPackages ?? false);

  const dims: BracketReadinessQualityV4162["dimensions"] = [
    {
      dimension: "accessQuality",
      pass:
        !(args.utilization?.belowTargetDimensions.includes("access") ?? false) &&
        !(args.accessArchitecture?.criticalAccessFailure ?? false),
      detail: args.accessArchitecture?.summary ?? args.utilization?.entries.find((e) => e.dimension === "access")?.detail ?? "access",
    },
    {
      dimension: "accelerationQuality",
      pass: !(args.utilization?.belowTargetDimensions.includes("acceleration") ?? false),
      detail: args.utilization?.entries.find((e) => e.dimension === "acceleration")?.detail ?? "acceleration",
    },
    {
      dimension: "interactionQuality",
      pass: !interactionBelow,
      detail: args.utilization?.entries.find((e) => e.dimension === "interactionQuality")?.detail ?? "interaction",
    },
    {
      dimension: "protectionQuality",
      pass: !(args.utilization?.belowTargetDimensions.includes("protection") ?? false),
      detail: "protection coverage vs quality",
    },
    {
      dimension: "engineQuality",
      pass: !(args.utilization?.belowTargetDimensions.includes("engineQuality") ?? false),
      detail: args.utilization?.entries.find((e) => e.dimension === "engineQuality")?.detail ?? "engine",
    },
    {
      dimension: "cardQuality",
      pass: draftCards.length <= 1,
      detail: `suspect low-quality slots: ${draftCards.length}`,
    },
    {
      dimension: "winArchitectureQuality",
      pass: winConcrete,
      detail: args.winReadiness?.summary ?? "win architecture",
    },
    {
      dimension: "manaQuality",
      pass:
        !(args.utilization?.belowTargetDimensions.includes("manaQuality") ?? false) &&
        !(args.slotBudget?.landOversubscribed ?? false),
      detail: args.slotBudget?.summary ?? "mana base quality",
    },
    {
      dimension: "deadCardRate",
      pass: draftCards.length <= 2,
      detail: `dead/suspect rate: ${draftCards.length}/${nonlands.length}`,
    },
    {
      dimension: "charterCoherence",
      pass: charterCoherent,
      detail: args.preFinalCritic?.summary ?? "charter alignment",
    },
  ];

  const failingDimensions = dims.filter((d) => !d.pass).map((d) => d.dimension);
  const qualityReady = failingDimensions.length === 0 && !gcBelow;

  return {
    version: PROFESSOR_BRACKET_READINESS_QUALITY_V4_16_2_V1_VERSION,
    dimensions: dims,
    failingDimensions,
    qualityReady,
    summary: qualityReady
      ? "Quality dimensions pass for bracket target"
      : `Quality gaps: ${failingDimensions.join(", ")}${gcBelow ? ", gameChangerUtilization" : ""}`,
  };
}
