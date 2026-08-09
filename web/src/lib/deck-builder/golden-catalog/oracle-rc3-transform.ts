/**
 * RC3 structural transforms on V1 extraction output — new lineage, RC2 untouched.
 */
import { createHash } from "node:crypto";
import { segmentAbilities, segmentCardFaces } from "./oracle-ability-segmentation";
import type { OracleActionV1, OracleActionV1Result } from "./oracle-action-parser-v1";
import { buildOracleSemanticParse } from "./oracle-semantic-parse-builder";
import { classifyHandZonePrimitive, type PrimitiveActionType } from "./oracle-action-taxonomy";
import {
  classifyTextRoleAt,
  compoundClauseSpansWithRoles,
  isPersistentZoneCastPermission,
  primitiveAllowedAtRole,
} from "./oracle-span-role-classifier";
import {
  findGrantedQuoteContexts,
  grantedClauseSpans,
  grantedContextExtensions,
  isInsideGrantedQuote,
  type GrantedQuoteContext,
} from "./oracle-granted-ability-extraction";
import { extractClauseNativeActions, mergeClauseNativeWithV1, filterNativeActionsForPromotion } from "./oracle-rc3-clause-native";
import { getRC3PromotedFamilies } from "./oracle-rc3-promotion";
import { tagExtractionSource, tagTokenDefinitionContext, tagGrantedContext, type RC3ActionExtensions } from "./oracle-rc3-extraction-metadata";
import {
  routeCandidateRegions,
  filterTokenDefinitionRoutes,
  filterGrantedRulesRoutes,
} from "./oracle-rc3-semantic-context-router";
import { isInsideTokenGlossaryRegion } from "./oracle-rc3-token-glossary";
import type { SegmentedAbility } from "./oracle-action-schema";

export const ORACLE_ACTION_RC3_PARSER_VERSION = "oracle-action-v1.35-rc3-granted-dev";

const PUT_INTO_HAND_RE =
  /\b(?:put (?:it|that card|one of them|one of those cards|two of those cards|three of those cards|four of those cards|five of those cards|up to [^.]+?) into (?:your |their )?hand|Put (?:that card|one of them|one of those cards|two of those cards|target card from [^.]+?) into (?:your |their |its owner's )?hand|reveal (?:it|that card)[^.]* and put (?:it|that card) into your hand)\b/i;

const DRAW_RE = /\b(?:Draw|draws?) (?:a |one |two |three |four |five |seven |that many |up to \w+ )?cards?\b/i;

const SEARCH_LIB_RE = /\b[Ss]earch (?:your |their )?library[^.—\n]*/i;
const SHUFFLE_LIB_RE = /\b(?:then )?[Ss]huffle(?: your library)?(?![\w ]+ into\b)/i;

const TRIGGER_CAST_RE = /^(?:Whenever|When|If) (?:you |a player )?cast\b/i;

function actionId(seed: string): string {
  return createHash("sha256").update(seed).digest("hex").slice(0, 24);
}

function reclassifyHandZone(action: OracleActionV1): OracleActionV1 {
  const classified = classifyHandZonePrimitive(action.evidenceText);
  if (!classified || classified === action.actionType) return action;
  if (action.actionType === "draw" && classified === "put_into_hand") {
    return {
      ...action,
      actionType: "put_into_hand",
      destinationZones: ["hand"],
      affectedObjects: action.affectedObjects ?? ["card"],
    };
  }
  if (action.actionType === "draw" && classified === "return_to_hand") {
    return { ...action, actionType: "return_to_hand", destinationZones: ["hand"] };
  }
  return action;
}

function isInCostRegion(ability: SegmentedAbility, localStart: number): boolean {
  const colonIdx = ability.paragraphText.indexOf(":");
  if (colonIdx < 0) return false;
  if (!/\{[^}]+\}/.test(ability.paragraphText.slice(0, colonIdx))) return false;
  return localStart < colonIdx;
}

function shouldSuppressAction(action: OracleActionV1, ability: SegmentedAbility): boolean {
  const localStart = action.evidenceStart - ability.paragraphStart;
  const localEnd = action.evidenceEnd - ability.paragraphStart;
  const role = classifyTextRoleAt({
    paragraph: ability.paragraphText,
    localStart,
    localEnd,
    abilityType: ability.abilityType,
  });

  if (isInsideGrantedQuote(ability.paragraphText, localStart)) {
    if (["gain_life", "add_mana", "draw", "discard", "sacrifice", "create_token", "copy", "untap", "put_counter"].includes(action.actionType)) {
      return true;
    }
  }
  if (role === "cost" && ["sacrifice", "discard", "tap", "exile"].includes(action.actionType)) {
    return true;
  }
  if (role === "trigger_event" && action.actionType === "cast") {
    return true;
  }
  if ((role === "static_permission" || role === "static_restriction") && action.actionType === "cast") {
    return true;
  }
  if (action.actionType === "cast" && isPersistentZoneCastPermission(action.evidenceText)) {
    return true;
  }
  if (role === "reminder_text" || role === "mechanic_reminder") {
    return true;
  }
  if (isInCostRegion(ability, localStart) && !primitiveAllowedAtRole(role, action.actionType as PrimitiveActionType)) {
    return true;
  }
  if (TRIGGER_CAST_RE.test(ability.paragraphText.slice(0, localStart + 1)) && action.actionType === "cast") {
    const before = ability.paragraphText.slice(Math.max(0, localStart - 40), localStart);
    if (/Whenever you cast|When you cast|If you cast/i.test(before)) return true;
  }
  return false;
}

function synthesizeFromMatch(input: {
  oracleId: string;
  ability: SegmentedAbility;
  faceId: string;
  match: RegExpMatchArray;
  actionType: PrimitiveActionType;
  actionIndex: number;
  grantedContext?: GrantedQuoteContext;
}): OracleActionV1 {
  const evidenceText = input.match[0];
  const localStart = input.ability.paragraphText.indexOf(evidenceText, input.match.index ?? 0);
  const absStart = input.ability.paragraphStart + Math.max(0, localStart);
  const absEnd = absStart + evidenceText.length;
  const grantedExtensions = input.grantedContext ? grantedContextExtensions(input.grantedContext) : {};
  return {
    actionId: actionId(`${input.oracleId}:${input.actionType}:${absStart}:${evidenceText}`),
    oracleId: input.oracleId,
    faceId: input.faceId,
    abilityIndex: input.ability.abilityIndex,
    actionIndex: input.actionIndex,
    abilityType: input.ability.abilityType,
    actionType: input.actionType,
    evidenceText,
    evidenceStart: absStart,
    evidenceEnd: absEnd,
    confidence: 0.9,
    reviewStatus: "accepted",
    sourceZones: input.actionType === "put_into_hand" ? ["library"] : undefined,
    destinationZones: input.actionType === "put_into_hand" || input.actionType === "draw" ? ["hand"] : undefined,
    affectedObjects: ["card"],
    textRole: "effect",
    clauseId: input.grantedContext?.grantedAbilityId,
    ...grantedExtensions,
  };
}

function extractSearchChainActions(input: {
  oracleId: string;
  ability: SegmentedAbility;
  faceId: string;
  existing: OracleActionV1[];
  nextIndex: number;
}): OracleActionV1[] {
  const text = input.ability.paragraphText;
  if (!SEARCH_LIB_RE.test(text)) return [];
  const added: OracleActionV1[] = [];
  let idx = input.nextIndex;

  const hasSearch = input.existing.some((a) => a.actionType === "search_library");
  if (!hasSearch) {
    const m = text.match(SEARCH_LIB_RE);
    if (m) {
      added.push(
        synthesizeFromMatch({
          oracleId: input.oracleId,
          ability: input.ability,
          faceId: input.faceId,
          match: m,
          actionType: "search_library",
          actionIndex: idx++,
        }),
      );
    }
  }

  if (PUT_INTO_HAND_RE.test(text) && !input.existing.some((a) => a.actionType === "put_into_hand")) {
    const m = text.match(PUT_INTO_HAND_RE);
    if (m) {
      added.push(
        synthesizeFromMatch({
          oracleId: input.oracleId,
          ability: input.ability,
          faceId: input.faceId,
          match: m,
          actionType: "put_into_hand",
          actionIndex: idx++,
        }),
      );
    }
  }

  if (SHUFFLE_LIB_RE.test(text) && !input.existing.some((a) => a.actionType === "shuffle_library")) {
    const m = text.match(SHUFFLE_LIB_RE);
    if (m && /search/i.test(text)) {
      added.push(
        synthesizeFromMatch({
          oracleId: input.oracleId,
          ability: input.ability,
          faceId: input.faceId,
          match: m,
          actionType: "shuffle_library",
          actionIndex: idx++,
        }),
      );
    }
  }

  return added;
}

const ADD_MANA_RE = /\bAdd \{[WUBRGC](?:\/\{[WUBRGC])*\}/i;

function extractGrantedSupplement(input: {
  oracleId: string;
  ability: SegmentedAbility;
  faceId: string;
  existing: OracleActionV1[];
  nextIndex: number;
}): OracleActionV1[] {
  const parentId = `${input.oracleId}:${input.faceId}:${input.ability.abilityIndex}`;
  const added: OracleActionV1[] = [];
  let idx = input.nextIndex;

  for (const granted of findGrantedQuoteContexts(input.ability.paragraphText, parentId)) {
    const inner = granted.innerText.trim();
    if (/^(Whenever|When|At the beginning)/i.test(inner)) continue;
    if (/^\{[^}]+\}/.test(inner) && inner.includes(":")) continue;
    for (const span of grantedClauseSpans(granted)) {
      if (span.role === "cost" || span.role === "trigger_event" || span.role === "replacement_event") continue;
      if (span.role !== "effect" && span.role !== "replacement_effect") continue;
      for (const pattern of [
        DRAW_RE,
        PUT_INTO_HAND_RE,
        ADD_MANA_RE,
        /\bYou gain \d+ life\b/i,
        /\bgain \d+ life\b/i,
        /\bput a \+?\/?\+?\d+\+\d+ counter/i,
        /\b[Cc]opy (?:it|target|that)\b/i,
      ]) {
        const m = span.text.match(pattern);
        if (!m) continue;
        let actionType: PrimitiveActionType = "draw";
        if (PUT_INTO_HAND_RE.test(m[0])) actionType = "put_into_hand";
        else if (ADD_MANA_RE.test(m[0])) actionType = "add_mana";
        else if (/\bYou gain \d+ life\b/i.test(m[0])) actionType = "gain_life";
        else if (/gain \d+ life/i.test(m[0])) actionType = "gain_life";
        else if (/put a/i.test(m[0])) actionType = "put_counter";
        else if (/copy/i.test(m[0])) actionType = "copy";
        else if (DRAW_RE.test(m[0])) actionType = "draw";

        const absStart = input.ability.paragraphStart + span.localStart + (m.index ?? 0);
        const dupe = input.existing.some(
          (a) => a.actionType === actionType && Math.abs(a.evidenceStart - absStart) < 8,
        );
        if (dupe) continue;

        added.push(
          synthesizeFromMatch({
            oracleId: input.oracleId,
            ability: input.ability,
            faceId: input.faceId,
            match: m,
            actionType,
            actionIndex: idx++,
            grantedContext: granted,
          }),
        );
      }
    }
  }
  return added;
}

function extractActivatedEffectClause(input: {
  oracleId: string;
  ability: SegmentedAbility;
  faceId: string;
  existing: OracleActionV1[];
  nextIndex: number;
}): OracleActionV1[] {
  const colonIdx = input.ability.paragraphText.indexOf(":");
  if (colonIdx < 0 || !/\{[^}]+\}/.test(input.ability.paragraphText.slice(0, colonIdx))) return [];
  const effectText = input.ability.paragraphText.slice(colonIdx + 1);
  const effectStart = input.ability.paragraphStart + colonIdx + 1;
  const added: OracleActionV1[] = [];
  let idx = input.nextIndex;

  for (const pattern of [DRAW_RE, PUT_INTO_HAND_RE, /\b[Dd]iscard [^.]+/i, /\b[Ss]acrifice [^.]+/i]) {
    const m = effectText.match(pattern);
    if (!m) continue;
    let actionType: PrimitiveActionType = "discard";
    if (DRAW_RE.test(m[0])) actionType = "draw";
    else if (PUT_INTO_HAND_RE.test(m[0])) actionType = "put_into_hand";
    else if (/sacrifice/i.test(m[0])) actionType = "sacrifice";

    const absStart = effectStart + (m.index ?? 0);
    if (input.existing.some((a) => a.actionType === actionType && Math.abs(a.evidenceStart - absStart) < 5)) {
      continue;
    }
    added.push(
      synthesizeFromMatch({
        oracleId: input.oracleId,
        ability: input.ability,
        faceId: input.faceId,
        match: m,
        actionType,
        actionIndex: idx,
      }),
    );
    idx++;
  }
  return added;
}

function extractCompoundSecondClause(input: {
  oracleId: string;
  ability: SegmentedAbility;
  faceId: string;
  existing: OracleActionV1[];
  nextIndex: number;
}): OracleActionV1[] {
  const sentences = input.ability.paragraphText.split(/\.\s+/);
  if (sentences.length < 2) return [];
  const added: OracleActionV1[] = [];
  let idx = input.nextIndex;
  let offset = 0;
  for (let i = 1; i < sentences.length; i++) {
    const sent = sentences[i]!;
    offset += sentences[i - 1]!.length + 2;
    for (const pattern of [/\b[Dd]iscard [^.]+/i, DRAW_RE, PUT_INTO_HAND_RE]) {
      const m = sent.match(pattern);
      if (!m) continue;
      let actionType: PrimitiveActionType = "discard";
      if (DRAW_RE.test(m[0])) actionType = "draw";
      else if (PUT_INTO_HAND_RE.test(m[0])) actionType = "put_into_hand";
      const absStart = input.ability.paragraphStart + offset + (m.index ?? 0);
      if (input.existing.some((a) => Math.abs(a.evidenceStart - absStart) < 5)) continue;
      added.push(
        synthesizeFromMatch({
          oracleId: input.oracleId,
          ability: input.ability,
          faceId: input.faceId,
          match: m,
          actionType,
          actionIndex: idx++,
        }),
      );
    }
  }
  return added;
}

function tagActionsBySemanticContext(
  actions: OracleActionV1[],
  abilities: SegmentedAbility[],
): OracleActionV1[] {
  return actions.map((action) => {
    const ability = abilities.find(
      (a) => a.abilityIndex === action.abilityIndex && a.cardFaceId === action.faceId,
    );
    if (!ability) return action;

    const localStart = action.evidenceStart - ability.paragraphStart;
    const localEnd = action.evidenceEnd - ability.paragraphStart;

    if (isInsideTokenGlossaryRegion(ability.paragraphText, localStart, localEnd)) {
      const parentId = `${action.oracleId}:${action.faceId}:${action.abilityIndex}`;
      return {
        ...action,
        ...tagTokenDefinitionContext({
          action: { extractionSource: (action as RC3ActionExtensions).extractionSource ?? "rc3_transform" },
          grantingClauseId: parentId,
          grantedAbilityId: `${parentId}:token-glossary:${localStart}`,
        }),
      };
    }

    const routes = routeCandidateRegions(ability.paragraphText, `${action.oracleId}:${action.faceId}:${action.abilityIndex}`);

    for (const route of filterTokenDefinitionRoutes(routes)) {
      if (localStart >= route.span.localStart && localEnd <= route.span.localEnd) {
        const parentId = `${action.oracleId}:${action.faceId}:${action.abilityIndex}`;
        return {
          ...action,
          ...tagTokenDefinitionContext({
            action: { extractionSource: (action as RC3ActionExtensions).extractionSource ?? "rc3_transform" },
            grantingClauseId: parentId,
            grantedAbilityId: `${parentId}:token-def:${route.span.localStart}`,
          }),
        };
      }
    }

    for (const route of filterGrantedRulesRoutes(routes)) {
      if (localStart >= route.span.localStart && localEnd <= route.span.localEnd) {
        const parentId = `${action.oracleId}:${action.faceId}:${action.abilityIndex}`;
        return {
          ...action,
          ...tagGrantedContext({
            action: { extractionSource: (action as RC3ActionExtensions).extractionSource ?? "rc3_transform" },
            grantingClauseId: parentId,
            grantedAbilityId: `${parentId}:granted:${route.span.localStart}`,
            grantedTo: route.span.grantedTo,
          }),
        };
      }
    }

    return action;
  });
}

/** Apply RC3 structural transforms to a V1 extraction result. */
export function applyRC3Transforms(
  base: OracleActionV1Result,
  input: { oracleId: string; oracleText: string; cardFace?: string },
): OracleActionV1Result {
  const faces = segmentCardFaces(input.oracleText);
  const targetFaces = input.cardFace ? faces.filter((f) => f.faceId === input.cardFace) : faces;

  let actions = base.actions
    .map(reclassifyHandZone)
    .map((a) => tagExtractionSource(a as OracleActionV1 & RC3ActionExtensions, "v1_legacy"));

  const abilities = targetFaces.flatMap((face) =>
    segmentAbilities(input.oracleId, face.faceId, face.text, face.start),
  );

  actions = actions.filter((action) => {
    const ability = abilities.find((a) => a.abilityIndex === action.abilityIndex && a.cardFaceId === action.faceId);
    if (!ability) return true;
    return !shouldSuppressAction(action, ability);
  });

  let nextIndex = actions.length;
  const supplemental: OracleActionV1[] = [];

  for (const ability of abilities) {
    const inAbility = actions.filter((a) => a.abilityIndex === ability.abilityIndex && a.faceId === ability.cardFaceId);
    supplemental.push(
      ...extractSearchChainActions({
        oracleId: input.oracleId,
        ability,
        faceId: ability.cardFaceId,
        existing: [...inAbility, ...supplemental],
        nextIndex,
      }),
    );
    nextIndex += supplemental.length;
    supplemental.push(
      ...extractGrantedSupplement({
        oracleId: input.oracleId,
        ability,
        faceId: ability.cardFaceId,
        existing: [...inAbility, ...supplemental],
        nextIndex,
      }),
    );
    nextIndex += supplemental.length;
    supplemental.push(
      ...extractActivatedEffectClause({
        oracleId: input.oracleId,
        ability,
        faceId: ability.cardFaceId,
        existing: [...inAbility, ...supplemental],
        nextIndex,
      }),
    );
    nextIndex += supplemental.length;
    supplemental.push(
      ...extractCompoundSecondClause({
        oracleId: input.oracleId,
        ability,
        faceId: ability.cardFaceId,
        existing: [...inAbility, ...supplemental],
        nextIndex,
      }),
    );
    nextIndex += supplemental.length;
  }

  actions = [...actions, ...supplemental.map((a) => tagExtractionSource(a as OracleActionV1 & RC3ActionExtensions, "rc3_transform"))].map(
    (a, i) => ({
      ...a,
      actionIndex: i,
      parserVersion: ORACLE_ACTION_RC3_PARSER_VERSION,
    }),
  );

  const clauseNative = extractClauseNativeActions(input);
  const promoted = getRC3PromotedFamilies();
  const toPromote = filterNativeActionsForPromotion(clauseNative, promoted);
  const grantedStructural = clauseNative.actions.filter(
    (a) => (a as RC3ActionExtensions).executionContext === "granted_ability",
  );
  const nativeForMerge = [...toPromote];
  for (const grantedAction of grantedStructural) {
    const key = `${grantedAction.actionType}:${grantedAction.evidenceStart}:${grantedAction.evidenceText.slice(0, 20)}`;
    if (
      !nativeForMerge.some(
        (a) => `${a.actionType}:${a.evidenceStart}:${a.evidenceText.slice(0, 20)}` === key,
      )
    ) {
      nativeForMerge.push(grantedAction);
    }
  }
  const merged = mergeClauseNativeWithV1(actions, { ...clauseNative, actions: nativeForMerge });
  actions = merged.actions.map((a) => ({ ...a, parserVersion: ORACLE_ACTION_RC3_PARSER_VERSION }));
  actions = tagActionsBySemanticContext(actions, abilities);
  const clauseNativeStats = {
    ...merged.stats,
    mergedIntoOutput: toPromote.length > 0,
    promotedFamilies: promoted,
  };

  const legacyPayload = {
    ...base,
    actions,
    parserVersion: ORACLE_ACTION_RC3_PARSER_VERSION,
    clauseNativeStats,
  };

  const semanticParse = buildOracleSemanticParse(legacyPayload, input.oracleText);
  for (const action of semanticParse.actions) {
    action.parserVersion = ORACLE_ACTION_RC3_PARSER_VERSION;
    if (action.actionType === "put_into_hand" && !action.arguments.destinationZone?.length) {
      action.arguments.destinationZone = ["hand"];
      if (!action.arguments.sourceZone?.length) {
        action.arguments.sourceZone = ["library"];
      }
    }
  }

  return { ...legacyPayload, semanticParse };
}
