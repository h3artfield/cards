/**
 * Taxonomy v1.4 hand-zone primitive classification from Oracle evidence only.
 * parserConsulted = false — never use parser output.
 */
import type { ExpectedPrimitiveAction } from "../audit-oracle-action-eval-cases";
import type { PrimitiveActionType } from "../../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";

export const TAXONOMY_V14 = "three-layer-v1.4";

export type HandZonePrimitive = "draw" | "put_into_hand" | "return_to_hand";

/** Classify from Oracle evidence span — verb + destination, not destination alone. */
export function classifyHandZoneFromEvidence(evidence: string): HandZonePrimitive | null {
  const e = evidence.trim();
  if (/\breturn\b[^.]*\bto\b[^.]*(?:owner'?s )?hand\b/i.test(e)) return "return_to_hand";
  if (/\bput\b[^.]*\binto\b[^.]*(?:your |their |its owner'?s )?hand\b/i.test(e)) return "put_into_hand";
  if (/\breveal\b[^.]*\band put\b[^.]*\binto\b[^.]*hand\b/i.test(e)) return "put_into_hand";
  if (/\bdraw(?:s)?\b/i.test(e) && !/\bput\b[^.]*\binto\b/i.test(e)) return "draw";
  return null;
}

export interface V14MigrationRecord {
  caseId: string;
  oracleEvidence: string;
  oldPrimitive: string;
  newPrimitive: string;
  policyReason: string;
}

/** Migrate a single gold primitive to v1.4 hand-zone semantics where warranted. */
export function migratePrimitiveActionV14(
  caseId: string,
  action: ExpectedPrimitiveAction,
): { action: ExpectedPrimitiveAction; record?: V14MigrationRecord } {
  const classified = classifyHandZoneFromEvidence(action.evidenceContains);
  if (!classified) return { action };

  const reclassifyFrom: PrimitiveActionType[] = ["draw", "return_to_hand", "put_onto_battlefield"];
  if (action.actionType === classified) return { action };
  if (!reclassifyFrom.includes(action.actionType)) return { action };

  if (classified === "draw") return { action };

  return {
    action: { ...action, actionType: classified as ExpectedPrimitiveAction["actionType"] },
    record: {
      caseId,
      oracleEvidence: action.evidenceContains,
      oldPrimitive: action.actionType,
      newPrimitive: classified,
      policyReason: `Oracle '${classified === "put_into_hand" ? "put … into hand" : "return … to hand"}' wording — not ${action.actionType} under v1.4`,
    },
  };
}

/** Post-process derived catalog gold for v1.4 hand-zone primitives. */
export function applyV14HandZoneToDerived(
  caseId: string,
  primitives: ExpectedPrimitiveAction[],
): { primitives: ExpectedPrimitiveAction[]; records: V14MigrationRecord[] } {
  const records: V14MigrationRecord[] = [];
  const out: ExpectedPrimitiveAction[] = [];

  for (const p of primitives) {
    const { action, record } = migratePrimitiveActionV14(caseId, p);
    out.push(action);
    if (record) records.push(record);
  }

  // Add put_into_hand if oracle has put-into-hand not already covered
  return { primitives: dedupeByEvidence(out), records };
}

function dedupeByEvidence(primitives: ExpectedPrimitiveAction[]): ExpectedPrimitiveAction[] {
  const kept: ExpectedPrimitiveAction[] = [];
  for (const p of primitives) {
    const dupe = kept.some(
      (k) =>
        k.actionType === p.actionType &&
        k.evidenceContains.toLowerCase() === p.evidenceContains.toLowerCase(),
    );
    if (!dupe) kept.push(p);
  }
  return kept;
}
