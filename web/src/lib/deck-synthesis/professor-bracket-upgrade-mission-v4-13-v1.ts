/**
 * Bracket upgrade mission v4.13 — deficit portfolio + opportunity-cost deep refinement.
 */
import type { BracketUpgradeMissionV412, BracketMissionMetricSnapshotV412 } from "./professor-bracket-upgrade-mission-v4-12-v1";
import type { BracketDeficitPortfolioV413 } from "./professor-bracket-deficit-portfolio-v4-13-v1";
import type { OpportunityCostSlotV413 } from "./professor-opportunity-cost-slot-v4-13-v1";
import type { PackageDragV413 } from "./professor-bracket-deep-refinement-v4-13-v1";
import type { TutorAuditEntryV413 } from "./professor-tutor-audit-v4-13-v1";
import type { WinArchitectureV413 } from "./professor-win-architecture-v4-13-v1";
import type { RemainingBracketDeficitV413 } from "./professor-bracket-deficit-portfolio-v4-13-v1";

export const PROFESSOR_BRACKET_UPGRADE_MISSION_V4_13_V1_VERSION = "professor-bracket-upgrade-mission-v4-13-v1";

export const MAX_BRACKET_UPGRADE_ITERATIONS_V413 = 2;

export type BracketUpgradeMissionV413 = BracketUpgradeMissionV412 & {
  version: typeof PROFESSOR_BRACKET_UPGRADE_MISSION_V4_13_V1_VERSION;
  refinementMode?: "FILLER_DRAG" | "OPPORTUNITY_COST";
  deficitPortfolio?: BracketDeficitPortfolioV413;
  remainingBracketDeficits?: RemainingBracketDeficitV413[];
  opportunityCostSlots?: OpportunityCostSlotV413[];
  packageDrag?: PackageDragV413[];
  tutorAudits?: TutorAuditEntryV413[];
  winArchitecture?: WinArchitectureV413;
};

export function upgradeMissionToV413(base: BracketUpgradeMissionV412, extras: Partial<BracketUpgradeMissionV413>): BracketUpgradeMissionV413 {
  return {
    ...base,
    version: PROFESSOR_BRACKET_UPGRADE_MISSION_V4_13_V1_VERSION,
    ...extras,
  };
}

export { buildMetricSnapshotV412 as buildMetricSnapshotV413 } from "./professor-bracket-upgrade-mission-v4-12-v1";
export type { BracketMissionMetricSnapshotV412 as BracketMissionMetricSnapshotV413 } from "./professor-bracket-upgrade-mission-v4-12-v1";
