/**
 * Unique semantic Layer-2 gold actions — region membership is many-to-many metadata.
 * One physical semantic action must not inflate Stage-C denominator via overlapping regions.
 */
import { createHash } from "node:crypto";
import type { MachineGroundedBenchmarkTarget, TextSpan } from "./benchmark-identity";

export type RegionLinkedLayer2Record = {
  caseId: string;
  oracleId: string;
  cardName?: string;
  regionIndex: number;
  regionKey: string;
  fullRegionSpan: TextSpan;
  actionType: string;
  evidenceContains: string;
  optionalEffect?: boolean;
  choiceGroupId?: string;
  choiceAlternativeIndex?: number;
  semanticOwner?: string;
  abilityType?: string;
  costRegionText?: string;
};

export type SemanticGoldAction = {
  actionId: string;
  oracleId: string;
  caseId: string;
  cardName?: string;
  actionType: string;
  evidenceContains: string;
  evidenceSpan?: TextSpan;
  optionalEffect?: boolean;
  choiceGroupId?: string;
  choiceAlternativeIndex?: number;
  semanticOwner: string;
  abilityType: string;
  costRegionText?: string;
  benchmarkRegionIds: string[];
  rawRegionLinkedRecords: RegionLinkedLayer2Record[];
};

function normalizeEvidence(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Identity key for deduplication — same action reachable through multiple benchmark regions. */
export function semanticActionIdentityKey(input: {
  oracleId: string;
  actionType: string;
  evidenceContains: string;
  costRegionText?: string;
  abilityType?: string;
  choiceGroupId?: string;
  choiceAlternativeIndex?: number;
}): string {
  const payload = [
    input.oracleId,
    input.actionType,
    normalizeEvidence(input.evidenceContains),
    normalizeEvidence(input.costRegionText ?? ""),
    input.abilityType ?? "",
    input.choiceGroupId ?? "",
    input.choiceAlternativeIndex ?? "",
  ].join("|");
  return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

export function collectRegionLinkedLayer2Records(
  cases: Array<{
    id: string;
    oracleId: string;
    cardName?: string;
    benchmarkTargets: MachineGroundedBenchmarkTarget[];
  }>,
): RegionLinkedLayer2Record[] {
  const records: RegionLinkedLayer2Record[] = [];
  for (const c of cases) {
    c.benchmarkTargets.forEach((target, regionIndex) => {
      if (target.expectedContext !== "genuine_granted") return;
      const adj = target.semanticAdjudication;
      if (!adj?.layer2Gold?.length) return;
      for (const l2 of adj.layer2Gold) {
        records.push({
          caseId: c.id,
          oracleId: c.oracleId,
          cardName: c.cardName,
          regionIndex,
          regionKey: `${c.id}:region${regionIndex}`,
          fullRegionSpan: target.fullRegionSpan!,
          actionType: l2.actionType,
          evidenceContains: l2.evidenceContains,
          optionalEffect: l2.optionalEffect,
          choiceGroupId: l2.choiceGroupId,
          choiceAlternativeIndex: l2.choiceAlternativeIndex,
          semanticOwner: adj.semanticOwner,
          abilityType: adj.layer1Structure.abilityType,
          costRegionText: adj.layer1Structure.costRegion?.text,
        });
      }
    });
  }
  return records;
}

export function dedupeSemanticGoldActions(records: RegionLinkedLayer2Record[]): {
  rawRegionLinkedRecords: RegionLinkedLayer2Record[];
  uniqueSemanticActions: SemanticGoldAction[];
  duplicateMembershipsCollapsed: Array<{
    actionId: string;
    collapsedRegionKeys: string[];
    reason: string;
  }>;
} {
  const byId = new Map<string, SemanticGoldAction>();

  for (const rec of records) {
    const actionId = semanticActionIdentityKey({
      oracleId: rec.oracleId,
      actionType: rec.actionType,
      evidenceContains: rec.evidenceContains,
      costRegionText: rec.costRegionText,
      abilityType: rec.abilityType,
      choiceGroupId: rec.choiceGroupId,
      choiceAlternativeIndex: rec.choiceAlternativeIndex,
    });
    const existing = byId.get(actionId);
    if (existing) {
      if (!existing.benchmarkRegionIds.includes(rec.regionKey)) {
        existing.benchmarkRegionIds.push(rec.regionKey);
      }
      existing.rawRegionLinkedRecords.push(rec);
      continue;
    }
    byId.set(actionId, {
      actionId,
      oracleId: rec.oracleId,
      caseId: rec.caseId,
      cardName: rec.cardName,
      actionType: rec.actionType,
      evidenceContains: rec.evidenceContains,
      optionalEffect: rec.optionalEffect,
      choiceGroupId: rec.choiceGroupId,
      choiceAlternativeIndex: rec.choiceAlternativeIndex,
      semanticOwner: rec.semanticOwner ?? "granted_object",
      abilityType: rec.abilityType ?? "unknown",
      costRegionText: rec.costRegionText,
      benchmarkRegionIds: [rec.regionKey],
      rawRegionLinkedRecords: [rec],
    });
  }

  const uniqueSemanticActions = [...byId.values()];
  const duplicateMembershipsCollapsed = uniqueSemanticActions
    .filter((a) => a.benchmarkRegionIds.length > 1)
    .map((a) => ({
      actionId: a.actionId,
      collapsedRegionKeys: a.benchmarkRegionIds,
      reason: "same_oracleId_actionType_evidence_cost_ability",
    }));

  return {
    rawRegionLinkedRecords: records,
    uniqueSemanticActions,
    duplicateMembershipsCollapsed,
  };
}
