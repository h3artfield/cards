import { createHash } from "node:crypto";
import {
  HIGH_VALUE_ACTION_TYPES,
  ORACLE_ACTION_PARSER_VERSION,
  type OracleAction,
  type OracleAbilityType,
} from "./oracle-action-schema";

const KEYWORD_ACTION_MAP: Array<{
  pattern: RegExp;
  actionType: string;
  abilityType: OracleAbilityType;
}> = [
  { pattern: /\bdraw (?:a |one |two |three |\d+ )?cards?\b/i, actionType: "draw", abilityType: "spell_effect" },
  { pattern: /\badd \{[^}]+\}/i, actionType: "ramp / add mana", abilityType: "activated" },
  { pattern: /\bsearch (?:your )?library\b/i, actionType: "tutor", abilityType: "spell_effect" },
  { pattern: /\bdestroy (?:target|up to)\b/i, actionType: "destroy", abilityType: "spell_effect" },
  { pattern: /\bexile (?:target|up to)\b/i, actionType: "exile", abilityType: "spell_effect" },
  { pattern: /\bcounter (?:target )?(?:spell|ability)\b/i, actionType: "counter", abilityType: "spell_effect" },
  { pattern: /\breturn (?:target ).* to (?:its|their) owner'?s hand\b/i, actionType: "bounce", abilityType: "spell_effect" },
  { pattern: /\bsacrifice\b/i, actionType: "sacrifice", abilityType: "spell_effect" },
  { pattern: /\bcreate (?:a |one |\d+\/\d+ )?(?:\w+ )*tokens?\b/i, actionType: "create tokens", abilityType: "spell_effect" },
  { pattern: /\bcopy (?:target|the)\b/i, actionType: "copy", abilityType: "spell_effect" },
  { pattern: /\breturn (?:target ).* from (?:your )?graveyard\b/i, actionType: "reanimate", abilityType: "spell_effect" },
  { pattern: /\bmill (?:target )?(?:player|cards)\b/i, actionType: "mill", abilityType: "spell_effect" },
  { pattern: /\bdiscard (?:a |one |two |\d+ )?cards?\b/i, actionType: "discard", abilityType: "spell_effect" },
  { pattern: /\bcast (?:it|the copy|that card)\b/i, actionType: "cast/play from exile", abilityType: "spell_effect" },
  { pattern: /\bif you would draw\b/i, actionType: "draw", abilityType: "replacement" },
  { pattern: /\bwhenever\b/i, actionType: "triggered", abilityType: "triggered" },
  { pattern: /\bat the beginning of\b/i, actionType: "triggered", abilityType: "triggered" },
  { pattern: /\bwhen (?:this|target)\b/i, actionType: "triggered", abilityType: "triggered" },
];

function actionId(oracleId: string, evidenceText: string, index: number): string {
  return createHash("sha256")
    .update(`${oracleId}|${evidenceText}|${index}`)
    .digest("hex")
    .slice(0, 24);
}

/** Minimal deterministic stub for evaluation — not production extraction. */
export function extractOracleActionsStub(input: {
  oracleId: string;
  oracleText: string;
  cardFace?: string;
}): OracleAction[] {
  const faces = input.cardFace
    ? [input.oracleText]
    : input.oracleText.split(/\n\/\/\n|\n\/\/\n/);

  const actions: OracleAction[] = [];
  let index = 0;

  for (const faceText of faces) {
    for (const rule of KEYWORD_ACTION_MAP) {
      const match = faceText.match(rule.pattern);
      if (!match) continue;
      if (rule.actionType === "triggered" && !HIGH_VALUE_ACTION_TYPES.includes(rule.actionType as never)) {
        continue;
      }
      const evidenceText = match[0];
      const start = match.index ?? 0;
      actions.push({
        actionId: actionId(input.oracleId, evidenceText, index++),
        oracleId: input.oracleId,
        cardFace: input.cardFace,
        abilityType: rule.abilityType,
        trigger:
          rule.abilityType === "triggered"
            ? { event: evidenceText.slice(0, 40) }
            : undefined,
        effects: [
          {
            actionType:
              rule.actionType === "triggered" ? "triggered" : rule.actionType,
          },
        ],
        roles: [],
        evidenceText,
        evidenceStart: start,
        evidenceEnd: start + evidenceText.length,
        parserVersion: ORACLE_ACTION_PARSER_VERSION,
        extractionMethod: "deterministic",
        confidence: 0.6,
        reviewStatus: "needs_review",
      });
    }
  }

  return actions;
}
