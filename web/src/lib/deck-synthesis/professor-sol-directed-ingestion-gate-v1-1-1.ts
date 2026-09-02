/**
 * Commander-generic lossless Architect ingestion gate (v1.1.1 GUI path).
 */
import { ingestArchitectResponseWithRepairsV11 } from "./professor-sol-directed-architect-ingestion-v1-1";
import type { IngestedArchitectPlanV11 } from "./professor-sol-directed-types-v1-1";

export const PROFESSOR_SOL_DIRECTED_INGESTION_GATE_V1_1_1_VERSION =
  "professor-sol-directed-ingestion-gate-v1-1-1";

export type ArchitectIngestionGateResultV111 = {
  pass: boolean;
  failures: string[];
  ingested: IngestedArchitectPlanV11;
  repairs: string[];
};

export function evaluateArchitectIngestionGateV111(raw: unknown): ArchitectIngestionGateResultV111 {
  const { repairs, ...ingested } = ingestArchitectResponseWithRepairsV11(raw);
  const { retrievalContract, architectRawPlan } = ingested;
  const failures: string[] = [];

  if (!retrievalContract.strategicThesis.trim()) failures.push("strategicThesis empty");
  if (retrievalContract.earlyGamePlan.length === 0) failures.push("earlyGamePlan empty");
  if (retrievalContract.midGamePlan.length === 0) failures.push("midGamePlan empty");
  if (retrievalContract.lateGamePlan.length === 0) failures.push("lateGamePlan empty");
  if (retrievalContract.winLines.length === 0) failures.push("winLines empty");

  const requirementIds = retrievalContract.cardRequirements.map((r) => r.requirementId);
  if (requirementIds.length < 4) {
    failures.push(`expected at least 4 card requirements, got ${requirementIds.length}`);
  }
  if (requirementIds.some((id) => !id.trim() || /^req-\d+$/.test(id))) {
    failures.push("stub or blank requirement IDs detected");
  }
  if (new Set(requirementIds).size !== requirementIds.length) {
    failures.push("duplicate requirement IDs");
  }

  const nonlandSum = retrievalContract.cardRequirements.reduce((s, r) => s + r.requestedCount, 0);
  const nonlandSlots = retrievalContract.nonlandSlotsRequired;
  const landSlots = retrievalContract.landSlotsRequired;

  if (nonlandSlots < 54 || nonlandSlots > 69) {
    failures.push(`nonland slots ${nonlandSlots} outside plausible 54–69 range`);
  }
  if (landSlots < 30 || landSlots > 45) {
    failures.push(`land slots ${landSlots} outside plausible 30–45 range`);
  }
  if (nonlandSlots + landSlots !== 99) {
    failures.push(`nonland (${nonlandSlots}) + land (${landSlots}) != 99`);
  }
  if (nonlandSum !== nonlandSlots) {
    failures.push(`card requirement sum ${nonlandSum} != constructionBudget.nonlandSlots ${nonlandSlots}`);
  }

  if (!architectRawPlan || typeof architectRawPlan !== "object") {
    failures.push("architectRawPlan lost");
  }

  return {
    pass: failures.length === 0,
    failures,
    ingested,
    repairs,
  };
}
