import { createHash } from "node:crypto";
import type {
  OracleAction,
  OracleActionExtractionResult,
  DerivedCardRole,
} from "./oracle-action-schema";
import { ORACLE_ACTION_PARSER_VERSION } from "./oracle-action-schema";
import {
  classifyAbilityType,
  segmentAbilities,
  segmentCardFaces,
  validateEvidenceSpan,
} from "./oracle-ability-segmentation";

const ACTION_PATTERNS: Array<{
  pattern: RegExp;
  actionType: string;
  abilityType?: import("./oracle-action-schema").OracleAbilityType;
}> = [
  { pattern: /\bdraw (?:a |one |two |three |\d+ )?cards?\b/i, actionType: "draw" },
  { pattern: /\bAdd \{[^}]+\}/i, actionType: "ramp / add mana", abilityType: "activated" },
  { pattern: /\bsearch (?:your )?library\b/i, actionType: "tutor" },
  { pattern: /\bDestroy (?:target|up to|all)\b/i, actionType: "destroy" },
  { pattern: /\bDestroy all\b/i, actionType: "board wipe" },
  { pattern: /\bExile (?:target|up to|all)\b/i, actionType: "exile" },
  { pattern: /\bCounter target\b/i, actionType: "counter" },
  { pattern: /\bReturn target .* to (?:its|their) owner'?s hand\b/i, actionType: "bounce" },
  { pattern: /\bSacrifice\b/i, actionType: "sacrifice" },
  { pattern: /\bcreate (?:a |one |\d+\/\d+ )?(?:\w+ )*tokens?\b/i, actionType: "create tokens" },
  { pattern: /\bCopy target\b/i, actionType: "copy" },
  { pattern: /\b(?:return|put) target .* from (?:your )?graveyard\b/i, actionType: "reanimate" },
  { pattern: /\bMill (?:target )?(?:player|cards)\b/i, actionType: "mill" },
  { pattern: /\bdiscard (?:a |one |two |\d+ )?cards?\b/i, actionType: "discard" },
  { pattern: /\b(?:cast|play) (?:it|that card|spells?) (?:from|this turn)\b/i, actionType: "cast/play from exile" },
  { pattern: /\bfrom (?:your )?graveyard\b/i, actionType: "graveyard recursion" },
  { pattern: /\bhexproof\b|\bshroud\b|\bindestructible\b|\bprevented\b|\bphases out\b/i, actionType: "protection" },
  { pattern: /\bIf you would\b/i, actionType: "replacement", abilityType: "replacement" },
];

function actionId(parts: string[]): string {
  return createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 24);
}

/** Segmented deterministic extractor — abstains when evidence span invalid. */
export function extractOracleActionsSegmented(input: {
  oracleId: string;
  oracleText: string;
  cardFace?: string;
}): OracleActionExtractionResult {
  const faces = segmentCardFaces(input.oracleText);
  const targetFaces = input.cardFace
    ? faces.filter((f) => f.faceId === input.cardFace)
    : faces;

  const abilities = targetFaces.flatMap((face) =>
    segmentAbilities(input.oracleId, face.faceId, face.text, face.start),
  );

  const actions: OracleAction[] = [];
  const abstainedClauses: OracleActionExtractionResult["abstainedClauses"] = [];
  let actionIndex = 0;

  for (const ability of abilities) {
    const abilityType = ability.abilityType === "unknown"
      ? classifyAbilityType(ability.paragraphText)
      : ability.abilityType;

    for (const rule of ACTION_PATTERNS) {
      const match = ability.paragraphText.match(rule.pattern);
      if (!match) continue;

      const evidenceText = match[0];
      const localStart = ability.paragraphText.indexOf(evidenceText);
      if (localStart < 0) {
        abstainedClauses.push({
          text: ability.paragraphText,
          start: ability.paragraphStart,
          end: ability.paragraphEnd,
          reason: "evidence_not_found_in_paragraph",
        });
        continue;
      }

      const evidenceStart = ability.paragraphStart + localStart;
      const evidenceEnd = evidenceStart + evidenceText.length;

      const span = validateEvidenceSpan(
        input.oracleText,
        evidenceText,
        evidenceStart,
        evidenceEnd,
      );

      if (!span.valid) {
        abstainedClauses.push({
          text: evidenceText,
          start: evidenceStart,
          end: evidenceEnd,
          reason: span.reason ?? "invalid_span",
        });
        continue;
      }

      actions.push({
        actionId: actionId([input.oracleId, ability.cardFaceId, String(ability.abilityIndex), String(actionIndex)]),
        oracleId: input.oracleId,
        cardFaceId: ability.cardFaceId,
        abilityIndex: ability.abilityIndex,
        actionIndex: actionIndex++,
        abilityType: rule.abilityType ?? (abilityType === "unknown" ? "spell_effect" : abilityType),
        trigger:
          abilityType === "triggered"
            ? { event: evidenceText.slice(0, 60) }
            : undefined,
        effects: [{ actionType: rule.actionType }],
        evidenceText,
        evidenceStart,
        evidenceEnd,
        parserVersion: ORACLE_ACTION_PARSER_VERSION,
        extractionMethod: "deterministic",
        confidence: 0.75,
        reviewStatus: "needs_review",
      });
    }
  }

  const derivedRoles: DerivedCardRole[] = deriveRolesFromActions(actions);

  return {
    oracleId: input.oracleId,
    cardFaceId: targetFaces[0]?.faceId ?? "front",
    abilities,
    actions,
    derivedRoles,
    abstainedClauses,
    structureAnnotations: [],
  };
}

function deriveRolesFromActions(actions: OracleAction[]): DerivedCardRole[] {
  const roles: DerivedCardRole[] = [];
  const roleMap: Record<string, string> = {
    "ramp / add mana": "ramp",
    draw: "card advantage",
    tutor: "tutor",
    "board wipe": "board wipe",
    destroy: "removal",
    exile: "removal",
    counter: "interaction",
    "create tokens": "token generator",
    reanimate: "recursion",
    "graveyard recursion": "recursion",
    protection: "protection",
  };

  for (const action of actions) {
    for (const effect of action.effects) {
      const role = roleMap[effect.actionType];
      if (!role) continue;
      roles.push({
        role,
        score: action.confidence * 0.8,
        evidenceActionIds: [action.actionId],
        derivationVersion: "role-derivation-v0",
      });
    }
  }

  return roles;
}
