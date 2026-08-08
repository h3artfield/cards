/**
 * Generic caseScope scoring — only emissions inside declared scope are scored.
 */
import { segmentAbilities, segmentCardFaces } from "../../src/lib/deck-builder/golden-catalog/oracle-ability-segmentation";
import { findReminderSpans } from "../../src/lib/deck-builder/golden-catalog/oracle-span-role-classifier";
import type { CaseScopeType } from "./case-scope-v11";

export interface ScopedEvalCase {
  oracleText: string;
  caseScope?: CaseScopeType;
  targetFaceId?: string;
  targetAbilityId?: string;
  targetClauseId?: string;
  scopeEvidenceContains?: string;
  scopeSpanStart?: number;
  scopeSpanEnd?: number;
  cardFace?: string;
}

export interface ActionSpan {
  cardStart: number;
  cardEnd: number;
}

/** Resolve the in-scope character span for a benchmark case. */
export function resolveCaseScopeSpan(testCase: ScopedEvalCase): { start: number; end: number } | null {
  if (testCase.scopeSpanStart !== undefined && testCase.scopeSpanEnd !== undefined) {
    return { start: testCase.scopeSpanStart, end: testCase.scopeSpanEnd };
  }

  if (testCase.scopeEvidenceContains) {
    const idx = testCase.oracleText.indexOf(testCase.scopeEvidenceContains);
    if (idx >= 0) {
      return { start: idx, end: idx + testCase.scopeEvidenceContains.length };
    }
  }

  const scope = testCase.caseScope ?? "full_card";
  if (scope === "full_card") {
    return { start: 0, end: testCase.oracleText.length };
  }

  if (scope === "face" && testCase.targetFaceId) {
    const faces = segmentCardFaces(testCase.oracleText);
    const face = faces.find((f) => f.faceId === testCase.targetFaceId);
    if (face) return { start: face.start, end: face.start + face.text.length };
  }

  if (scope === "ability" && testCase.targetAbilityId) {
    const faces = segmentCardFaces(testCase.oracleText);
    for (const face of faces) {
      const abilities = segmentAbilities("scope", face.faceId, face.text, face.start);
      for (const ability of abilities) {
        const abilityId = `${face.faceId}:${ability.abilityIndex}`;
        if (abilityId === testCase.targetAbilityId || testCase.targetAbilityId.endsWith(`:${ability.abilityIndex}`)) {
          return { start: ability.paragraphStart, end: ability.paragraphEnd };
        }
      }
    }
  }

  if (scope === "clause") {
    for (const face of segmentCardFaces(testCase.oracleText)) {
      const abilities = segmentAbilities("scope", face.faceId, face.text, face.start);
      for (const ability of abilities) {
        for (const span of findReminderSpans(ability.paragraphText)) {
          return {
            start: ability.paragraphStart + span.localStart,
            end: ability.paragraphStart + span.localEnd,
          };
        }
      }
    }
  }

  if (scope === "structure_only") {
    return null;
  }

  return null;
}

/** True when an action emission overlaps the declared caseScope span. */
export function isActionWithinCaseScope(testCase: ScopedEvalCase, action: ActionSpan): boolean {
  const scope = testCase.caseScope ?? "full_card";
  if (scope === "full_card") return true;
  if (scope === "structure_only") return false;

  const span = resolveCaseScopeSpan(testCase);
  if (!span) return false;

  const overlapStart = Math.max(action.cardStart, span.start);
  const overlapEnd = Math.min(action.cardEnd, span.end);
  return overlapEnd > overlapStart;
}

/** True when accepted emission is a forbidden policy leak (in scope + forbidden primitive). */
export function isForbiddenPolicyLeak(input: {
  testCase: ScopedEvalCase & { forbiddenPrimitiveActions?: string[]; coverageStratum?: string };
  actionType: string;
  cardStart: number;
  cardEnd: number;
}): boolean {
  const forbidden = new Set(input.testCase.forbiddenPrimitiveActions ?? []);
  if (!forbidden.has(input.actionType)) return false;
  return isActionWithinCaseScope(input.testCase, {
    cardStart: input.cardStart,
    cardEnd: input.cardEnd,
  });
}

export type GuardrailLeakageFamily =
  | "persistent_cast_permission"
  | "trigger_event_cast_reference"
  | "reminder_mechanic_text"
  | "static_cost_reduction"
  | "activated_cost_only"
  | "static_restriction"
  | "ability_scope_exclusion"
  | "other";

export function guardrailLeakageFamily(coverageStratum?: string): GuardrailLeakageFamily {
  switch (coverageStratum) {
    case "persistent_cast_permission":
    case "trigger_event_cast_reference":
    case "reminder_mechanic_text":
    case "static_cost_reduction":
    case "activated_cost_only":
    case "static_restriction":
    case "ability_scope_exclusion":
      return coverageStratum;
    default:
      return "other";
  }
}
