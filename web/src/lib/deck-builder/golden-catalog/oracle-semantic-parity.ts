/**
 * Semantic ↔ legacy parity audit during migration.
 */
import type { OracleActionV1 } from "./oracle-action-parser-v1";
import { projectLegacyFromSemanticParse } from "./oracle-legacy-projection";
import type { OracleSemanticParse } from "./oracle-semantic-parse-schema";

export type ParityDifferenceKind =
  | "semantic_only"
  | "legacy_only"
  | "argument_difference"
  | "provenance_difference"
  | "review_status_difference";

export interface ParityRecord {
  kind: ParityDifferenceKind;
  actionId?: string;
  actionType?: string;
  legacyEvidence?: string;
  semanticEvidence?: string;
  details?: string;
}

function legacyKey(a: Pick<OracleActionV1, "actionType" | "evidenceStart" | "evidenceEnd" | "faceId">): string {
  return `${a.faceId}:${a.actionType}:${a.evidenceStart}:${a.evidenceEnd}`;
}

function projectedKey(a: ReturnType<typeof projectLegacyFromSemanticParse>[0]): string {
  return `${a.faceId}:${a.actionType}:${a.evidenceStart}:${a.evidenceEnd}`;
}

function spansEqual(a: { evidenceStart: number; evidenceEnd: number }, b: { evidenceStart: number; evidenceEnd: number }) {
  return a.evidenceStart === b.evidenceStart && a.evidenceEnd === b.evidenceEnd;
}

/** Compare accepted legacy Layer-2 actions against semantic projection. */
export function auditSemanticLegacyParity(input: {
  parse: OracleSemanticParse;
  legacyActions: OracleActionV1[];
}): { records: ParityRecord[]; counts: Record<ParityDifferenceKind, number> } {
  const records: ParityRecord[] = [];
  const counts: Record<ParityDifferenceKind, number> = {
    semantic_only: 0,
    legacy_only: 0,
    argument_difference: 0,
    provenance_difference: 0,
    review_status_difference: 0,
  };

  const acceptedLegacy = input.legacyActions.filter((a) => a.reviewStatus === "accepted");
  const acceptedSemanticIds = new Set(
    input.parse.actions.filter((a) => a.reviewStatus === "accepted").map((a) => a.actionId),
  );
  const projected = projectLegacyFromSemanticParse(input.parse).filter((p) =>
    acceptedSemanticIds.has(p.actionId),
  );

  const legacyByKey = new Map(acceptedLegacy.map((a) => [legacyKey(a), a]));
  const projectedByKey = new Map(projected.map((a) => [projectedKey(a), a]));

  for (const [key, sem] of projectedByKey) {
    const leg = legacyByKey.get(key);
    if (!leg) {
      records.push({
        kind: "semantic_only",
        actionId: sem.actionId,
        actionType: sem.actionType,
        semanticEvidence: sem.evidenceText,
        details: "Accepted semantic projection has no matching accepted legacy action",
      });
      counts.semantic_only++;
      continue;
    }
    legacyByKey.delete(key);

    if (leg.reviewStatus !== sem.reviewStatus) {
      records.push({
        kind: "review_status_difference",
        actionId: sem.actionId,
        actionType: sem.actionType,
        details: `legacy=${leg.reviewStatus} semantic=${sem.reviewStatus}`,
      });
      counts.review_status_difference++;
    }

    if (
      leg.abilityIndex !== sem.abilityIndex ||
      leg.loyaltyCost !== sem.loyaltyCost ||
      leg.modalOptionId !== sem.modalOptionId ||
      leg.optionalEffect !== sem.optionalEffect
    ) {
      records.push({
        kind: "argument_difference",
        actionId: sem.actionId,
        actionType: sem.actionType,
        details: `abilityIndex ${leg.abilityIndex}→${sem.abilityIndex}, loyalty ${leg.loyaltyCost}→${sem.loyaltyCost}, modal ${leg.modalOptionId}→${sem.modalOptionId}, optional ${leg.optionalEffect}→${sem.optionalEffect}`,
      });
      counts.argument_difference++;
    }

    if (!spansEqual(leg, sem) || leg.evidenceText !== sem.evidenceText) {
      records.push({
        kind: "provenance_difference",
        actionId: sem.actionId,
        actionType: sem.actionType,
        legacyEvidence: leg.evidenceText,
        semanticEvidence: sem.evidenceText,
        details: `legacy span ${leg.evidenceStart}-${leg.evidenceEnd} vs semantic ${sem.evidenceStart}-${sem.evidenceEnd}`,
      });
      counts.provenance_difference++;
    }
  }

  for (const [, leg] of legacyByKey) {
    records.push({
      kind: "legacy_only",
      actionId: leg.actionId,
      actionType: leg.actionType,
      legacyEvidence: leg.evidenceText,
      details: "Accepted legacy action has no matching accepted semantic projection",
    });
    counts.legacy_only++;
  }

  return { records, counts };
}
