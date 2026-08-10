/**
 * Structural activated-cost Layer-2 leakage — per-ability colon boundary, not card-global.
 */
import { segmentAbilities, segmentCardFaces } from "../../src/lib/deck-builder/golden-catalog/oracle-ability-segmentation";
import type { SemanticAction } from "../../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-schema";
import { classifyTextRoleAt } from "../../src/lib/deck-builder/golden-catalog/oracle-span-role-classifier";

const COST_PRIMITIVES = new Set(["sacrifice", "discard", "tap", "exile"]);

function isInCostRegion(paragraph: string, localStart: number): boolean {
  const searchFrom = Math.max(0, localStart - 80);
  const searchTo = Math.min(paragraph.length, localStart + 60);
  const window = paragraph.slice(searchFrom, searchTo);
  const colonInWindow = window.indexOf(":");
  if (colonInWindow < 0) return false;
  const absColon = searchFrom + colonInWindow;
  if (localStart >= absColon) return false;
  const costChunk = paragraph.slice(Math.max(0, absColon - 80), absColon);
  if (!/\{[^}]+\}|\{T\}/.test(costChunk)) return false;
  const between = paragraph.slice(localStart, absColon);
  if (/\.\s+[A-Z(]/.test(between)) return false;
  return true;
}

function abilityContainingPoint(
  oracleId: string,
  oracleText: string,
  point: number,
): { paragraphText: string; paragraphStart: number; abilityType: string } | undefined {
  for (const face of segmentCardFaces(oracleText)) {
    for (const ability of segmentAbilities(oracleId, face.faceId, face.text, face.start)) {
      if (point >= ability.paragraphStart && point < ability.paragraphEnd) {
        return {
          paragraphText: ability.paragraphText,
          paragraphStart: ability.paragraphStart,
          abilityType: ability.abilityType,
        };
      }
    }
  }
  return undefined;
}

/** True when a payment primitive is structurally in an activated/additional cost region. */
export function isActivatedCostLayer2Leakage(
  oracleId: string,
  oracleText: string,
  action: SemanticAction,
): boolean {
  if (action.reviewStatus !== "accepted") return false;
  if (!COST_PRIMITIVES.has(action.actionType)) return false;
  if (action.executionContext === "activated_cost") return false;

  const span = action.provenance.actionSpan;
  const host = abilityContainingPoint(oracleId, oracleText, span.cardStart + 1);
  if (!host) return false;

  const localStart = span.cardStart - host.paragraphStart;
  const localEnd = span.cardEnd - host.paragraphStart;
  const role = classifyTextRoleAt({
    paragraph: host.paragraphText,
    localStart,
    localEnd,
    abilityType: host.abilityType,
  });
  if (role === "cost") return true;

  return isInCostRegion(host.paragraphText, localStart);
}

export function countActivatedCostLayer2Leakage(
  oracleId: string,
  oracleText: string,
  actions: SemanticAction[],
): number {
  return actions.filter((a) => isActivatedCostLayer2Leakage(oracleId, oracleText, a)).length;
}
