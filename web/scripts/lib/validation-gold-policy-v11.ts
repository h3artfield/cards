/**
 * Rule-driven validation gold policy corrections (v10 → v11).
 * Applies three-layer semantics without consulting parser output.
 */
import type { ExpectedPrimitiveAction, OracleActionEvalCaseV2 } from "../audit-oracle-action-eval-cases";
import type { PrimitiveActionType } from "../../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";
import { findReminderSpans } from "../../src/lib/deck-builder/golden-catalog/oracle-span-role-classifier";

export const VALIDATION_GOLD_POLICY_V11_ID = "validation-gold-policy-v11-three-layer-semantics";

export type PolicyViolationFamily =
  | "gy_to_hand_primitive"
  | "activated_cost_sacrifice"
  | "trigger_event_sacrifice"
  | "mechanic_reminder_primitive"
  | "static_restriction_draw"
  | "static_restriction_cast_sacrifice"
  | "trigger_event_draw"
  | "missing_gy_to_hand"
  | "missing_variable_lose_life";

export type PolicyViolation = {
  family: PolicyViolationFamily;
  caseId: string;
  cardName: string;
  oracleSnippet: string;
  currentGold: ExpectedPrimitiveAction | null;
  correctPolicy: string;
  verdict: "gold_bug" | "diagnosis_bug";
};

function evidenceInOracle(oracleText: string, evidence: string): boolean {
  return oracleText.toLowerCase().includes(evidence.toLowerCase());
}

function isGyToHandEvidence(evidence: string): boolean {
  return (
    /\bfrom (?:your |a )?graveyard\b/i.test(evidence) &&
    /\bto (?:your )?hand\b/i.test(evidence)
  );
}

function evidenceSpanInOracle(oracleText: string, evidence: string): { start: number; end: number } | null {
  const idx = oracleText.toLowerCase().indexOf(evidence.toLowerCase());
  if (idx < 0) return null;
  return { start: idx, end: idx + evidence.length };
}

function isInsideReminderSpan(oracleText: string, evidence: string): boolean {
  const span = evidenceSpanInOracle(oracleText, evidence);
  if (!span) return false;
  let offset = 0;
  for (const line of oracleText.split("\n")) {
    const lineEnd = offset + line.length;
    if (span.start >= offset && span.start < lineEnd) {
      const localStart = span.start - offset;
      const localEnd = span.end - offset;
      const reminders = findReminderSpans(line);
      if (reminders.some((r) => localStart >= r.localStart && localEnd <= r.localEnd)) return true;
      return false;
    }
    offset = lineEnd + 1;
  }
  return false;
}

function isActivatedCostSacrifice(oracleText: string, evidence: string): boolean {
  if (!/\bSacrifice this\b/i.test(evidence)) return false;
  if (isInsideReminderSpan(oracleText, evidence)) return false;
  const lines = oracleText.split("\n");
  for (const line of lines) {
    const colonIdx = line.indexOf(":");
    if (colonIdx < 0) continue;
    const costPart = line.slice(0, colonIdx);
    if (!/\bSacrifice\b/i.test(costPart)) continue;
    if (line.toLowerCase().includes(evidence.toLowerCase().slice(0, Math.min(30, evidence.length)))) {
      return /\{T\}/.test(costPart) || /^[\s{}\w,]+Sacrifice/i.test(costPart.trim());
    }
  }
  return false;
}

function isTriggerEventSacrifice(oracleText: string, evidence: string): boolean {
  if (!/\bsacrifice\b/i.test(evidence)) return false;
  const idx = oracleText.toLowerCase().indexOf(evidence.toLowerCase().slice(0, 20));
  if (idx < 0) return false;
  const before = oracleText.slice(Math.max(0, idx - 80), idx);
  return /\b(?:Whenever|When) you sacrifice\b/i.test(before + evidence);
}

function isMechanicReminderSpan(oracleText: string, evidence: string): boolean {
  return isInsideReminderSpan(oracleText, evidence);
}

function isStaticDrawRestriction(oracleText: string, evidence: string): boolean {
  const line =
    oracleText.split("\n").find((l) => l.toLowerCase().includes(evidence.toLowerCase())) ?? evidence;
  return /\bcan't draw\b/i.test(line) || /\bdon't draw more\b/i.test(line);
}

function isStaticCastSacrificeRestriction(oracleText: string, evidence: string, actionType: PrimitiveActionType): boolean {
  if (actionType !== "cast" && actionType !== "sacrifice") return false;
  const lines = oracleText.split("\n");
  for (const line of lines) {
    if (/\bPlayers can't\b/i.test(line) || /\bcan't pay life or sacrifice\b/i.test(line)) {
      if (line.toLowerCase().includes(evidence.toLowerCase().slice(0, 25))) return true;
    }
  }
  return false;
}

function isTriggerEventDraw(oracleText: string, evidence: string): boolean {
  if (!/\bdraw\b/i.test(evidence)) return false;
  const line =
    oracleText.split("\n").find((l) => l.toLowerCase().includes(evidence.toLowerCase())) ?? oracleText;
  // Effect draw after trigger comma — not a trigger-event primitive.
  if (/^(When|Whenever)[^,]+,\s/i.test(line.trim())) {
    const afterComma = line.replace(/^[^,]+,\s*/, "");
    if (afterComma.toLowerCase().includes(evidence.toLowerCase())) return false;
  }
  // Subject-draw trigger header: "Whenever an opponent draws a card"
  if (/\b(?:Whenever|When) [\w ,']+ draws? (?:a |one |two |three |\d+ )?cards?\b/i.test(line)) {
    const drawVerb = line.match(/\b(?:Whenever|When) [\w ,']+ draws? (?:a |one |two |three |\d+ )?cards?\b/i);
    if (drawVerb && line.toLowerCase().indexOf(evidence.toLowerCase()) <= drawVerb.index! + drawVerb[0].length) {
      return true;
    }
  }
  return false;
}

export function detectPolicyViolations(testCase: OracleActionEvalCaseV2): PolicyViolation[] {
  const violations: PolicyViolation[] = [];
  const { oracleText, expectedPrimitiveActions, id, cardName } = testCase;

  for (const exp of expectedPrimitiveActions) {
    if (exp.negative) continue;
    const ev = exp.evidenceContains;

    if (exp.actionType === "return_to_battlefield" && isGyToHandEvidence(ev)) {
      violations.push({
        family: "gy_to_hand_primitive",
        caseId: id,
        cardName: cardName ?? id,
        oracleSnippet: ev,
        currentGold: exp,
        correctPolicy: "return_to_hand (graveyard → hand)",
        verdict: "gold_bug",
      });
    }

    if (exp.actionType === "sacrifice" && isActivatedCostSacrifice(oracleText, ev)) {
      violations.push({
        family: "activated_cost_sacrifice",
        caseId: id,
        cardName: cardName ?? id,
        oracleSnippet: ev,
        currentGold: exp,
        correctPolicy: "Layer 1 cost only — no Layer-2 sacrifice",
        verdict: "gold_bug",
      });
    }

    if (exp.actionType === "sacrifice" && isTriggerEventSacrifice(oracleText, ev)) {
      violations.push({
        family: "trigger_event_sacrifice",
        caseId: id,
        cardName: cardName ?? id,
        oracleSnippet: ev,
        currentGold: exp,
        correctPolicy: "Layer 1 trigger_event — no Layer-2 sacrifice",
        verdict: "gold_bug",
      });
    }

    if (
      (exp.actionType === "sacrifice" || exp.actionType === "draw" || exp.actionType === "add_mana") &&
      isMechanicReminderSpan(oracleText, ev)
    ) {
      violations.push({
        family: "mechanic_reminder_primitive",
        caseId: id,
        cardName: cardName ?? id,
        oracleSnippet: ev,
        currentGold: exp,
        correctPolicy: "Mechanic/reminder structure — no card-specific Layer-2 action",
        verdict: "gold_bug",
      });
    }

    if (exp.actionType === "draw" && isStaticDrawRestriction(oracleText, ev)) {
      violations.push({
        family: "static_restriction_draw",
        caseId: id,
        cardName: cardName ?? id,
        oracleSnippet: ev,
        currentGold: exp,
        correctPolicy: "static_restriction — no Layer-2 draw",
        verdict: "gold_bug",
      });
    }

    if (isStaticCastSacrificeRestriction(oracleText, ev, exp.actionType)) {
      violations.push({
        family: "static_restriction_cast_sacrifice",
        caseId: id,
        cardName: cardName ?? id,
        oracleSnippet: ev,
        currentGold: exp,
        correctPolicy: "static_restriction — no Layer-2 cast/sacrifice",
        verdict: "gold_bug",
      });
    }

    if (exp.actionType === "draw" && isTriggerEventDraw(oracleText, ev)) {
      violations.push({
        family: "trigger_event_draw",
        caseId: id,
        cardName: cardName ?? id,
        oracleSnippet: ev,
        currentGold: exp,
        correctPolicy: "Layer 1 trigger_event — no Layer-2 draw",
        verdict: "gold_bug",
      });
    }
  }

  const gyHandMatches = oracleText.match(
    /\bReturn (?:up to )?[\w ]+ from (?:your |a )?graveyard to (?:your )?hand\b/gi,
  );
  if (gyHandMatches) {
    for (const snippet of gyHandMatches) {
      const hasGold = expectedPrimitiveActions.some(
        (e) =>
          !e.negative &&
          (e.actionType === "return_to_hand" || e.actionType === "return_to_battlefield") &&
          (snippet.toLowerCase().includes(e.evidenceContains.toLowerCase()) ||
            e.evidenceContains.toLowerCase().includes(snippet.toLowerCase().slice(0, 30))),
      );
      if (!hasGold) {
        violations.push({
          family: "missing_gy_to_hand",
          caseId: id,
          cardName: cardName ?? id,
          oracleSnippet: snippet,
          currentGold: null,
          correctPolicy: "return_to_hand",
          verdict: "gold_bug",
        });
      }
    }
  }

  const loseLifeMatches = oracleText.match(/\b(?:You |Target player |Each player )?lose(?:s)? life equal to[^.\n]+/gi);
  if (loseLifeMatches) {
    for (const snippet of loseLifeMatches) {
      const hasGold = expectedPrimitiveActions.some(
        (e) => !e.negative && e.actionType === "lose_life" && evidenceInOracle(snippet, e.evidenceContains),
      );
      if (!hasGold) {
        violations.push({
          family: "missing_variable_lose_life",
          caseId: id,
          cardName: cardName ?? id,
          oracleSnippet: snippet.trim(),
          currentGold: null,
          correctPolicy: "lose_life (variable quantity)",
          verdict: "gold_bug",
        });
      }
    }
  }

  return violations;
}

export function applyValidationGoldPolicyV11(testCase: OracleActionEvalCaseV2): {
  testCase: OracleActionEvalCaseV2;
  violations: PolicyViolation[];
  changed: boolean;
} {
  const violations = detectPolicyViolations(testCase);
  let primitives = [...testCase.expectedPrimitiveActions];

  for (const v of violations) {
    if (v.family === "gy_to_hand_primitive" && v.currentGold) {
      primitives = primitives.map((p) =>
        p === v.currentGold || (p.evidenceContains === v.currentGold!.evidenceContains && p.actionType === "return_to_battlefield")
          ? { ...p, actionType: "return_to_hand" as PrimitiveActionType }
          : p,
      );
    }
    if (
      v.family === "activated_cost_sacrifice" ||
      v.family === "trigger_event_sacrifice" ||
      v.family === "mechanic_reminder_primitive" ||
      v.family === "static_restriction_draw" ||
      v.family === "static_restriction_cast_sacrifice" ||
      v.family === "trigger_event_draw"
    ) {
      if (v.currentGold) {
        primitives = primitives.filter(
          (p) =>
            !(
              p.actionType === v.currentGold!.actionType &&
              p.evidenceContains === v.currentGold!.evidenceContains
            ),
        );
      }
    }
    if (v.family === "missing_gy_to_hand") {
      primitives.push({ actionType: "return_to_hand", evidenceContains: v.oracleSnippet });
    }
    if (v.family === "missing_variable_lose_life") {
      primitives.push({ actionType: "lose_life", evidenceContains: v.oracleSnippet });
    }
  }

  primitives = dedupePrimitives(primitives);
  const changed =
    JSON.stringify(primitives) !== JSON.stringify(testCase.expectedPrimitiveActions);

  return {
    testCase: {
      ...testCase,
      expectedPrimitiveActions: primitives,
      goldReviewVersion: "validation-gold-policy-v11",
      goldReviewer: VALIDATION_GOLD_POLICY_V11_ID,
    },
    violations,
    changed,
  };
}

function dedupePrimitives(primitives: ExpectedPrimitiveAction[]): ExpectedPrimitiveAction[] {
  const kept: ExpectedPrimitiveAction[] = [];
  for (const p of primitives) {
    const dupe = kept.some(
      (k) => k.actionType === p.actionType && k.evidenceContains === p.evidenceContains,
    );
    if (!dupe) kept.push(p);
  }
  return kept;
}
