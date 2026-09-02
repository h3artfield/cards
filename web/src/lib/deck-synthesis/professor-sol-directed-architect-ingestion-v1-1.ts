/**
 * Lossless Architect plan ingestion — preserve raw Sol response + derive retrieval contract.
 */
import type {
  ArchitectRawPlanV11,
  IngestedArchitectPlanV11,
  RetrievalContractRequirementV11,
  RetrievalContractV11,
} from "./professor-sol-directed-types-v1-1";
import { PROFESSOR_SOL_DIRECTED_TYPES_V1_1_VERSION } from "./professor-sol-directed-types-v1-1";

export const PROFESSOR_SOL_DIRECTED_ARCHITECT_INGESTION_V1_1_VERSION =
  "professor-sol-directed-architect-ingestion-v1-1";

export const CHATTERFANG_ARCHITECT_FIXTURE_V11_REL =
  "data/milestones/deck-synthesis/sol-directed-chatterfang-v1/call-1-architect-response.json";

const EXPECTED_REQUIREMENT_IDS_V11 = [
  "ramp_and_fixing",
  "repeatable_token_engines",
  "burst_token_production",
  "sacrifice_outlets",
  "token_and_death_payoffs",
  "card_advantage_and_selection",
  "interaction",
  "protection",
  "recursion",
  "combat_finishers",
] as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

function stringListFromBullets(value: unknown): string[] {
  if (Array.isArray(value)) return asStringArray(value);
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

function parseCardRequirements(raw: unknown): RetrievalContractRequirementV11[] {
  if (!Array.isArray(raw)) return [];
  const results: RetrievalContractRequirementV11[] = [];
  for (const item of raw) {
    const row = asRecord(item);
    if (!row) continue;
    const requirementId = String(row.id ?? row.requirementId ?? "").trim();
    if (!requirementId) continue;
    results.push({
      requirementId,
      requestedCount: Number(row.count ?? row.requestedCount ?? row.minimumCount ?? 0),
      primaryRole: String(row.primaryRole ?? row.label ?? requirementId),
      naturalLanguageRequirements: stringListFromBullets(row.requirements ?? row.description),
      preferredExamples: asStringArray(row.preferredExamples),
    });
  }
  return results;
}

function parseConstructionBudget(raw: unknown): {
  nonlandSlotsRequired: number;
  landSlotsRequired: number;
  tutorPolicy: Record<string, unknown> | null;
  manaValueTargets: Record<string, unknown> | null;
} {
  const budget = asRecord(raw);
  if (!budget) {
    return { nonlandSlotsRequired: 0, landSlotsRequired: 0, tutorPolicy: null, manaValueTargets: null };
  }
  return {
    nonlandSlotsRequired: Number(budget.nonlandSlots ?? budget.nonlandSlotsRequired ?? 0),
    landSlotsRequired: Number(budget.landSlots ?? budget.landSlotsRequired ?? 0),
    tutorPolicy: asRecord(budget.tutorPolicy),
    manaValueTargets: asRecord(budget.manaValueTargets),
  };
}

function parseLandPlan(raw: unknown): Record<string, unknown> {
  const plan = asRecord(raw);
  if (!plan) return {};
  return { ...plan };
}

function parseGuardrails(raw: unknown): Record<string, unknown> {
  const guardrails = asRecord(raw);
  if (!guardrails) return {};
  return { ...guardrails };
}

function scaleIntegerCounts(counts: number[], target: number): number[] {
  const sum = counts.reduce((a, b) => a + b, 0);
  if (sum === target) return [...counts];
  if (sum <= 0 || target <= 0) return [...counts];

  const scaled = counts.map((c) => (c / sum) * target);
  const floored = scaled.map(Math.floor);
  let remainder = target - floored.reduce((a, b) => a + b, 0);
  const order = scaled
    .map((s, i) => ({ i, frac: s - floored[i] }))
    .sort((a, b) => b.frac - a.frac);
  const result = [...floored];
  for (let k = 0; k < remainder; k++) {
    result[order[k % order.length].i]++;
  }
  return result;
}

/** Normalize constructionBudget + cardRequirement counts so nonlands + lands === 99. */
export function repairArchitectSlotCountsV11(raw: unknown): {
  plan: ArchitectRawPlanV11;
  repairs: string[];
} {
  const repairs: string[] = [];
  const plan: ArchitectRawPlanV11 =
    raw != null && typeof raw === "object" ? structuredClone(raw as ArchitectRawPlanV11) : {};

  const budgetRecord = asRecord(plan.constructionBudget) ?? {};
  const landPlanRecord = parseLandPlan(plan.landPlan);

  let landSlots = Number(
    budgetRecord.landSlots ??
      budgetRecord.landSlotsRequired ??
      landPlanRecord.target ??
      landPlanRecord.minimum ??
      36,
  );
  if (!Number.isFinite(landSlots) || landSlots < 30 || landSlots > 45) {
    const previous = landSlots;
    landSlots = 36;
    repairs.push(`land slots normalized ${previous} → ${landSlots}`);
  }

  const nonlandTarget = 99 - landSlots;
  const budgetNonland = Number(budgetRecord.nonlandSlots ?? budgetRecord.nonlandSlotsRequired ?? 0);
  const budgetLand = Number(budgetRecord.landSlots ?? budgetRecord.landSlotsRequired ?? 0);
  if (budgetNonland + budgetLand !== 99) {
    repairs.push(`constructionBudget ${budgetNonland}+${budgetLand} → ${nonlandTarget}+${landSlots}`);
  }

  plan.constructionBudget = {
    ...budgetRecord,
    nonlandSlots: nonlandTarget,
    landSlots,
  };

  if (!plan.landPlan || typeof plan.landPlan !== "object") {
    plan.landPlan = { target: landSlots, minimum: landSlots, maximum: landSlots };
    repairs.push(`landPlan.target set to ${landSlots}`);
  } else {
    const landPlan = plan.landPlan as Record<string, unknown>;
    if (Number(landPlan.target ?? 0) !== landSlots) {
      landPlan.target = landSlots;
      if (landPlan.minimum == null) landPlan.minimum = landSlots;
      if (landPlan.maximum == null) landPlan.maximum = landSlots;
      repairs.push(`landPlan.target set to ${landSlots}`);
    }
  }

  if (!Array.isArray(plan.cardRequirements) || plan.cardRequirements.length === 0) {
    return { plan, repairs };
  }

  const counts = plan.cardRequirements.map((item) => {
    const row = asRecord(item);
    return Number(row?.count ?? row?.requestedCount ?? row?.minimumCount ?? 0);
  });
  const requirementSum = counts.reduce((a, b) => a + b, 0);

  if (requirementSum === nonlandTarget) {
    return { plan, repairs };
  }

  if (requirementSum > 0) {
    const scaled = scaleIntegerCounts(counts, nonlandTarget);
    for (let i = 0; i < plan.cardRequirements.length; i++) {
      const row = plan.cardRequirements[i] as Record<string, unknown>;
      if (Number(row.count ?? row.requestedCount ?? 0) !== scaled[i]) {
        row.count = scaled[i];
      }
    }
    repairs.push(`card requirement counts ${requirementSum} → ${nonlandTarget}`);
    return { plan, repairs };
  }

  const perReq = Math.floor(nonlandTarget / plan.cardRequirements.length);
  let extra = nonlandTarget - perReq * plan.cardRequirements.length;
  for (const item of plan.cardRequirements) {
    const row = item as Record<string, unknown>;
    row.count = perReq + (extra > 0 ? 1 : 0);
    if (extra > 0) extra--;
  }
  repairs.push(`distributed ${nonlandTarget} nonland slots across ${plan.cardRequirements.length} requirements`);
  return { plan, repairs };
}

export function ingestArchitectResponseV11(raw: unknown): IngestedArchitectPlanV11 {
  const architectRawPlan: ArchitectRawPlanV11 =
    raw != null && typeof raw === "object" ? structuredClone(raw as ArchitectRawPlanV11) : {};

  const gamePlan = asRecord(architectRawPlan.gamePlan);
  const budget = parseConstructionBudget(architectRawPlan.constructionBudget);
  const landPlanRaw = architectRawPlan.landPlan;
  const landPlanRecord = parseLandPlan(landPlanRaw);
  const landTarget = Number(
    landPlanRecord.target ?? landPlanRecord.minimum ?? landPlanRecord.maximum ?? budget.landSlotsRequired ?? 0,
  );

  const cardRequirements = parseCardRequirements(architectRawPlan.cardRequirements);
  const requirementNonlandSum = cardRequirements.reduce((sum, r) => sum + r.requestedCount, 0);

  const retrievalContract: RetrievalContractV11 = {
    version: PROFESSOR_SOL_DIRECTED_TYPES_V1_1_VERSION,
    strategicThesis: String(architectRawPlan.strategicThesis ?? architectRawPlan.deckThesis ?? ""),
    earlyGamePlan: stringListFromBullets(gamePlan?.earlyGame ?? architectRawPlan.earlyGamePlan),
    midGamePlan: stringListFromBullets(gamePlan?.midGame ?? architectRawPlan.midgamePlan),
    lateGamePlan: stringListFromBullets(gamePlan?.lateGame ?? architectRawPlan.closingPlan),
    winLines: Array.isArray(architectRawPlan.winLines) ? [...architectRawPlan.winLines] : [],
    failureRecoveryPlan: stringListFromBullets(
      architectRawPlan.failureRecoveryPlan ?? architectRawPlan.recoveryPlan,
    ).join("\n")
      ? stringListFromBullets(architectRawPlan.failureRecoveryPlan ?? architectRawPlan.recoveryPlan)
      : [],
    nonlandSlotsRequired: budget.nonlandSlotsRequired || requirementNonlandSum,
    landSlotsRequired: budget.landSlotsRequired || landTarget,
    cardRequirements,
    landPlan: landPlanRecord,
    comboAndPowerGuardrails: parseGuardrails(architectRawPlan.comboAndPowerGuardrails),
    retrievalRules: asStringArray(architectRawPlan.retrievalRules),
    tutorPolicy: budget.tutorPolicy,
    manaValueTargets: budget.manaValueTargets,
    preservedTopLevelFields: Object.keys(architectRawPlan),
  };

  return { architectRawPlan, retrievalContract };
}

export function ingestArchitectResponseWithRepairsV11(raw: unknown): IngestedArchitectPlanV11 & {
  repairs: string[];
} {
  const { plan, repairs } = repairArchitectSlotCountsV11(raw);
  const ingested = ingestArchitectResponseV11(plan);
  return { ...ingested, repairs };
}

export type ArchitectIngestionRegressionV11 = {
  pass: boolean;
  failures: string[];
  requirementIds: string[];
  nonlandSum: number;
  landTarget: number;
};

export function regressionArchitectIngestionV11(raw: unknown): ArchitectIngestionRegressionV11 {
  const { architectRawPlan, retrievalContract } = ingestArchitectResponseV11(raw);
  const failures: string[] = [];

  if (!retrievalContract.strategicThesis.trim()) failures.push("strategicThesis empty");
  if (retrievalContract.earlyGamePlan.length === 0) failures.push("earlyGamePlan empty");
  if (retrievalContract.midGamePlan.length === 0) failures.push("midGamePlan empty");
  if (retrievalContract.lateGamePlan.length === 0) failures.push("lateGamePlan empty");
  if (retrievalContract.winLines.length === 0) failures.push("winLines empty");

  const requirementIds = retrievalContract.cardRequirements.map((r) => r.requirementId);
  if (requirementIds.length !== 10) failures.push(`expected 10 requirements, got ${requirementIds.length}`);
  for (const expected of EXPECTED_REQUIREMENT_IDS_V11) {
    if (!requirementIds.includes(expected)) failures.push(`missing requirement ${expected}`);
  }
  if (requirementIds.some((id) => /^req-\d+$/.test(id))) {
    failures.push("stub requirement IDs detected (req-N)");
  }

  const nonlandSum = retrievalContract.cardRequirements.reduce((s, r) => s + r.requestedCount, 0);
  if (nonlandSum !== 63) failures.push(`nonland sum ${nonlandSum} != 63`);
  if (retrievalContract.nonlandSlotsRequired !== 63) {
    failures.push(`constructionBudget.nonlandSlots ${retrievalContract.nonlandSlotsRequired} != 63`);
  }
  if (retrievalContract.landSlotsRequired !== 36) {
    failures.push(`landSlots ${retrievalContract.landSlotsRequired} != 36`);
  }

  const guardrails = retrievalContract.comboAndPowerGuardrails;
  const prohibited = Array.isArray(guardrails.prohibitedCards) ? guardrails.prohibitedCards : [];
  if (prohibited.length === 0) failures.push("guardrails.prohibitedCards empty");

  const landPlan = retrievalContract.landPlan;
  if (Number(landPlan.target ?? landPlan.minimum) !== 36) failures.push("landPlan target != 36");

  if (!architectRawPlan.strategicThesis) failures.push("architectRawPlan.strategicThesis lost");
  if (!Array.isArray(architectRawPlan.cardRequirements)) failures.push("architectRawPlan.cardRequirements lost");
  if (!architectRawPlan.landPlan) failures.push("architectRawPlan.landPlan lost");
  if (!architectRawPlan.comboAndPowerGuardrails) failures.push("architectRawPlan.comboAndPowerGuardrails lost");

  return {
    pass: failures.length === 0,
    failures,
    requirementIds,
    nonlandSum,
    landTarget: retrievalContract.landSlotsRequired,
  };
}

export { EXPECTED_REQUIREMENT_IDS_V11 };
