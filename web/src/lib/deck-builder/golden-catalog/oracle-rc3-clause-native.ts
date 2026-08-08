/**
 * RC3 clause-native extraction — Oracle → AbilityBlock → Clause → ClauseRole → primitives.
 * V1/transform paths remain compatibility fallback; this module is the primary semantic engine.
 */
import { createHash } from "node:crypto";
import { segmentAbilities, segmentCardFaces } from "./oracle-ability-segmentation";
import type { OracleActionV1 } from "./oracle-action-parser-v1";
import type { SegmentedAbility } from "./oracle-action-schema";
import { classifyHandZonePrimitive, type PrimitiveActionType } from "./oracle-action-taxonomy";
import {
  classifyTextRoleAt,
  compoundClauseSpansWithRoles,
  isOneShotCastPermission,
  isPersistentZoneCastPermission,
  primitiveAllowedAtRole,
  type TextRole,
} from "./oracle-span-role-classifier";
import {
  findGrantedQuoteContexts,
  validateGrantedProvenance,
  type GrantedQuoteContext,
} from "./oracle-granted-ability-extraction";
import { parseAbilityBlock } from "./oracle-rc3-ability-block";
import { buildNativeAction } from "./oracle-rc3-action-builder";
import { tagExtractionSource, tagGrantedContext, type RC3ActionExtensions } from "./oracle-rc3-extraction-metadata";

export interface ClauseNode {
  clauseId: string;
  role: TextRole;
  text: string;
  localStart: number;
  localEnd: number;
}

export interface GrantedAbilityNode {
  grantingClauseId: string;
  grantedTo?: string;
  quotedSpan: { start: number; end: number; text: string };
  nestedAbilityBlock: {
    abilityType: string;
    clauses: ClauseNode[];
  };
}

export interface ActivatedAbilityNode {
  costRegion: { text: string; start: number; end: number };
  colonPosition: number;
  effectRegion: { text: string; start: number; end: number };
  effectClauses: ClauseNode[];
}

export interface ReplacementEffectNode {
  eventClause: ClauseNode;
  replacementClause: ClauseNode;
  condition?: ClauseNode;
  replacementActionIds: string[];
}

export interface SearchChainLink {
  actionType: PrimitiveActionType;
  objectId: string;
  referentObjectId?: string;
  evidenceText: string;
  absStart: number;
  absEnd: number;
}

export interface TransformTransitionNode {
  objectId: string;
  mode: "transform_in_place" | "exile_return_transformed" | "put_transformed";
  sourceZone?: string;
  destinationZone?: string;
  sourceFace?: string;
  destinationFace?: string;
  evidenceText: string;
  absStart: number;
}

export interface ClauseNativeExtractionResult {
  actions: OracleActionV1[];
  grantedAbilities: GrantedAbilityNode[];
  activatedAbilities: ActivatedAbilityNode[];
  replacementEffects: ReplacementEffectNode[];
  searchChains: SearchChainLink[][];
  transformTransitions: TransformTransitionNode[];
  provenance: "clause_native" | "v1_fallback";
}

const PRIMITIVE_PATTERNS: Array<{
  pattern: RegExp;
  actionType: PrimitiveActionType;
  sourceZones?: string[];
  destinationZones?: string[];
}> = [
  { pattern: /\b[Ss]earch (?:your |their )?library[^.—\n]*/i, actionType: "search_library", sourceZones: ["library"] },
  {
    pattern:
      /\b(?:put (?:it|that card|one of them|one of those cards|two of those cards|three of those cards|four of those cards|five of those cards|up to [^.]+?) into (?:your |their )?hand|Put (?:that card|one of them|one of those cards|two of those cards|target card from [^.]+?) into (?:your |their |its owner's )?hand|reveal (?:it|that card)[^.]* and put (?:it|that card) into your hand)\b/i,
    actionType: "put_into_hand",
    sourceZones: ["library"],
    destinationZones: ["hand"],
  },
  { pattern: /\b(?:then )?[Ss]huffle(?: your library)?(?![\w ]+ into\b)/i, actionType: "shuffle_library" },
  { pattern: /\b[Dd]raw (?:a |one |two |three |four |five |seven |that many |up to \w+ )?cards?\b/, actionType: "draw", destinationZones: ["hand"] },
  { pattern: /\b[Dd]iscard [^.]+/i, actionType: "discard" },
  { pattern: /\b[Ss]acrifice [^.]+/i, actionType: "sacrifice" },
  { pattern: /\b[Cc]reate [^.]*tokens?\b/i, actionType: "create_token" },
  { pattern: /\b[Ee]xile [^.]+/i, actionType: "exile" },
  { pattern: /\b[Dd]estroy [^.]+/i, actionType: "destroy" },
  { pattern: /\b[Cc]opy [^.]+/i, actionType: "copy" },
  { pattern: /\b[Rr]eturn [^.]+ to (?:your |their )?hand\b/i, actionType: "return_to_hand", destinationZones: ["hand"] },
  { pattern: /\b[Pp]ut [^.]+ onto the battlefield\b/i, actionType: "put_onto_battlefield", destinationZones: ["battlefield"] },
  { pattern: /\b[Cc]ounter target [^.]+\b/i, actionType: "counter" },
  { pattern: /\b[Tt]ransform\b/i, actionType: "transform" },
];

function actionId(seed: string): string {
  return createHash("sha256").update(seed).digest("hex").slice(0, 24);
}

function parseActivatedAbility(paragraph: string, abilityId: string): ActivatedAbilityNode | null {
  const trimmed = paragraph.trimStart();
  const offset = paragraph.length - trimmed.length;
  if (/^(When|Whenever|At the beginning|If |Choose one)/i.test(trimmed)) return null;

  let colonIdx = -1;
  let depth = 0;
  let inQuote = false;
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (ch === '"') {
      inQuote = !inQuote;
      continue;
    }
    if (inQuote) continue;
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    else if (ch === ":" && depth === 0) {
      colonIdx = i;
      break;
    }
  }
  if (colonIdx < 0) return null;

  const before = trimmed.slice(0, colonIdx).trim();
  const looksLikeCost =
    /^[+\−-]\d/.test(before) ||
    /\{[WUBRGC\d]+\}/.test(before) ||
    /\{T\}/.test(before) ||
    /\b(?:Discard|Sacrifice|Exile|Pay|Tap)\b/i.test(before);
  if (!looksLikeCost) return null;

  const effectStart = offset + colonIdx + 1;
  const effectText = paragraph.slice(effectStart).trimStart();
  const effectAbsStart = effectStart + (paragraph.slice(effectStart).length - effectText.length);

  const effectClauses: ClauseNode[] = compoundClauseSpansWithRoles(effectText, `${abilityId}:effect`).map(
    (span, idx) => ({
      clauseId: `${abilityId}:effect:clause-${idx}`,
      role: span.role,
      text: span.text,
      localStart: effectAbsStart + span.localStart,
      localEnd: effectAbsStart + span.localStart + span.text.length,
    }),
  );

  return {
    costRegion: { text: before, start: offset, end: offset + colonIdx },
    colonPosition: offset + colonIdx,
    effectRegion: { text: effectText, start: effectAbsStart, end: paragraph.length },
    effectClauses,
  };
}

function parseReplacementEffect(paragraph: string, abilityId: string): ReplacementEffectNode | null {
  const m = paragraph.match(/\bIf ([^.]+ would [^,]+),\s*(.+)$/is);
  if (!m) return null;
  const eventText = `If ${m[1]} would ${m[2]?.split(",")[0] ?? ""}`.trim();
  const insteadIdx = paragraph.search(/\binstead\b/i);
  if (insteadIdx < 0) return null;

  const eventEnd = paragraph.indexOf(",", paragraph.indexOf("would"));
  const eventClause: ClauseNode = {
    clauseId: `${abilityId}:repl-event`,
    role: "replacement_event",
    text: paragraph.slice(0, insteadIdx).trim(),
    localStart: 0,
    localEnd: insteadIdx,
  };
  const replacementClause: ClauseNode = {
    clauseId: `${abilityId}:repl-effect`,
    role: "replacement_effect",
    text: paragraph.slice(insteadIdx).trim(),
    localStart: insteadIdx,
    localEnd: paragraph.length,
  };
  return { eventClause, replacementClause };
}

function parseGrantedAbility(ctx: GrantedQuoteContext, parentAbilityId: string): GrantedAbilityNode {
  const clauses: ClauseNode[] = compoundClauseSpansWithRoles(ctx.innerText, ctx.grantedAbilityId).map((span, idx) => ({
    clauseId: `${ctx.grantedAbilityId}:clause-${idx}`,
    role: span.role,
    text: span.text,
    localStart: span.localStart,
    localEnd: span.localStart + span.text.length,
  }));

  const grantMatch = ctx.innerText.match(/^(Whenever|When|At the beginning)/i);
  return {
    grantingClauseId: parentAbilityId,
    quotedSpan: {
      start: ctx.quoteLocalStart,
      end: ctx.quoteLocalEnd,
      text: `"${ctx.innerText}"`,
    },
    nestedAbilityBlock: {
      abilityType: ctx.grantedAbilityType,
      clauses,
    },
  };
}

function extractPrimitivesFromClause(input: {
  oracleId: string;
  ability: SegmentedAbility;
  faceId: string;
  clause: ClauseNode;
  actionIndexStart: number;
  objectIdPrefix: string;
  suppressCast?: boolean;
  extensions?: RC3ActionExtensions;
}): OracleActionV1[] {
  const actions: OracleActionV1[] = [];
  let idx = input.actionIndexStart;

  if (!primitiveAllowedAtRole(input.clause.role, "draw")) {
    if (input.clause.role !== "effect" && input.clause.role !== "replacement_effect") {
      return actions;
    }
  }

  for (const rule of PRIMITIVE_PATTERNS) {
    if (input.suppressCast && rule.actionType === "cast") continue;
    if (!primitiveAllowedAtRole(input.clause.role, rule.actionType)) continue;

    const re = new RegExp(rule.pattern.source, rule.pattern.flags.includes("g") ? rule.pattern.flags : `${rule.pattern.flags}g`);
    let m: RegExpExecArray | null;
    while ((m = re.exec(input.clause.text)) !== null) {
      const evidenceText = m[0];
      const matchOffset = m.index ?? 0;
      const startInParagraph = input.clause.localStart + matchOffset;
      const absStartFixed = input.ability.paragraphStart + startInParagraph;
      const absEnd = absStartFixed + evidenceText.length;

      if (rule.actionType === "cast") {
        const localInParagraph = startInParagraph;
        if (
          classifyTextRoleAt({
            paragraph: input.ability.paragraphText,
            localStart: localInParagraph,
            localEnd: localInParagraph + evidenceText.length,
            abilityType: input.ability.abilityType,
          }) === "static_permission"
        ) {
          continue;
        }
        if (isPersistentZoneCastPermission(evidenceText)) continue;
      }

      let actionType = rule.actionType;
      if (rule.actionType !== "search_library") {
        const handClass = classifyHandZonePrimitive(evidenceText);
        if (handClass) actionType = handClass;
      }

      actions.push({
        ...buildNativeAction({
          oracleId: input.oracleId,
          ability: input.ability,
          faceId: input.faceId,
          actionType,
          evidenceText,
          evidenceStart: absStartFixed,
          evidenceEnd: absEnd,
          actionIndex: idx++,
          textRole: input.clause.role,
          clauseId: input.clause.clauseId,
          sourceZones: rule.sourceZones,
          destinationZones: rule.destinationZones,
          extensions: input.extensions,
        }),
      });
    }
  }
  return actions;
}

function extractSearchChain(input: {
  oracleId: string;
  ability: SegmentedAbility;
  faceId: string;
  clauses: ClauseNode[];
  actionIndexStart: number;
}): { links: SearchChainLink[]; actions: OracleActionV1[] } {
  const text = input.ability.paragraphText;
  if (!/\b[Ss]earch (?:your |their )?library/i.test(text)) {
    return { links: [], actions: [] };
  }

  const objectId = `object-${input.oracleId}-${input.ability.abilityIndex}`;
  const links: SearchChainLink[] = [];
  const actions: OracleActionV1[] = [];
  let idx = input.actionIndexStart;
  let referentId: string | undefined;

  for (const clause of input.clauses) {
    if (clause.role !== "effect" && clause.role !== "replacement_effect") continue;

    for (const rule of PRIMITIVE_PATTERNS) {
      if (!["search_library", "put_into_hand", "shuffle_library"].includes(rule.actionType)) continue;

      let m: RegExpMatchArray | null;
      if (rule.actionType === "put_into_hand") {
        m = clause.text.match(
          /\b(?:put (?:it|that card|one of them|one of those cards|two of those cards|three of those cards|four of those cards|five of those cards|up to [^.]+?) into (?:your |their |its owner's )?hand|Put (?:that card|one of them|one of those cards|two of those cards|target card from [^.]+?) into (?:your |their |its owner's )?hand|reveal (?:it|that card)[^.]* and put (?:it|that card) into your hand)\b/i,
        );
        if (!m) continue;
        if (/search (?:your |their )?library/i.test(m[0])) continue;
        if (!referentId) continue;
      } else if (rule.actionType === "shuffle_library") {
        m = clause.text.match(rule.pattern);
        if (!m) continue;
        if (!referentId) continue;
      } else {
        m = clause.text.match(rule.pattern);
        if (!m) continue;
      }

      const startInParagraph = clause.localStart + (m.index ?? 0);
      const absStart = input.ability.paragraphStart + startInParagraph;
      const absEnd = absStart + m[0].length;

      if (rule.actionType === "search_library") {
        referentId = objectId;
        links.push({
          actionType: "search_library",
          objectId,
          evidenceText: m[0],
          absStart,
          absEnd,
        });
      } else if (rule.actionType === "put_into_hand") {
        links.push({
          actionType: "put_into_hand",
          objectId: `${objectId}-hand`,
          referentObjectId: referentId ?? objectId,
          evidenceText: m[0],
          absStart,
          absEnd,
        });
      } else if (rule.actionType === "shuffle_library") {
        links.push({
          actionType: "shuffle_library",
          objectId: `${objectId}-shuffle`,
          referentObjectId: referentId,
          evidenceText: m[0],
          absStart,
          absEnd,
        });
      }

      let actionType = rule.actionType as PrimitiveActionType;
      if (rule.actionType !== "search_library") {
        const handClass = classifyHandZonePrimitive(m[0]);
        if (handClass) actionType = handClass;
      }

      actions.push(
        buildNativeAction({
          oracleId: input.oracleId,
          ability: input.ability,
          faceId: input.faceId,
          actionType,
          evidenceText: m[0],
          evidenceStart: absStart,
          evidenceEnd: absEnd,
          actionIndex: idx++,
          textRole: clause.role,
          clauseId: clause.clauseId,
          sourceZones: rule.sourceZones,
          destinationZones: rule.destinationZones,
          extensions: { referentObjectId: referentId, executionContext: "immediate" },
        }),
      );
    }
  }

  return { links, actions };
}

function extractTransformTransitions(input: {
  ability: SegmentedAbility;
  oracleId: string;
}): TransformTransitionNode[] {
  const text = input.ability.paragraphText;
  const transitions: TransformTransitionNode[] = [];
  const objectId = `object-${input.oracleId}-${input.ability.abilityIndex}`;

  const inPlace = text.match(/\bTransform\b/i);
  if (inPlace && !/\bexile\b[^.]*\breturn\b/i.test(text)) {
    transitions.push({
      objectId,
      mode: "transform_in_place",
      evidenceText: inPlace[0],
      absStart: input.ability.paragraphStart + (inPlace.index ?? 0),
    });
  }

  const exileReturn = text.match(/\bExile [^.]+ Return it transformed\b/i);
  if (exileReturn) {
    transitions.push({
      objectId,
      mode: "exile_return_transformed",
      sourceZone: "battlefield",
      destinationZone: "battlefield",
      evidenceText: exileReturn[0],
      absStart: input.ability.paragraphStart + (exileReturn.index ?? 0),
    });
  }

  const putTransformed = text.match(/\bPut [^.]+ onto the battlefield transformed\b/i);
  if (putTransformed) {
    transitions.push({
      objectId,
      mode: "put_transformed",
      destinationZone: "battlefield",
      evidenceText: putTransformed[0],
      absStart: input.ability.paragraphStart + (putTransformed.index ?? 0),
    });
  }

  return transitions;
}

function dedupeActions(actions: OracleActionV1[]): OracleActionV1[] {
  const kept: OracleActionV1[] = [];
  for (const action of actions) {
    const dupe = kept.some(
      (k) =>
        k.actionType === action.actionType &&
        Math.abs(k.evidenceStart - action.evidenceStart) < 6 &&
        k.evidenceText.slice(0, 20) === action.evidenceText.slice(0, 20),
    );
    if (!dupe) kept.push(action);
  }
  return kept;
}

/** Clause-native primary extraction pass. */
export function extractClauseNativeActions(input: {
  oracleId: string;
  oracleText: string;
  cardFace?: string;
}): ClauseNativeExtractionResult {
  const faces = segmentCardFaces(input.oracleText);
  const targetFaces = input.cardFace ? faces.filter((f) => f.faceId === input.cardFace) : faces;

  const actions: OracleActionV1[] = [];
  const grantedAbilities: GrantedAbilityNode[] = [];
  const activatedAbilities: ActivatedAbilityNode[] = [];
  const replacementEffects: ReplacementEffectNode[] = [];
  const searchChains: SearchChainLink[][] = [];
  const transformTransitions: TransformTransitionNode[] = [];
  let actionIndex = 0;

  for (const face of targetFaces) {
    const abilities = segmentAbilities(input.oracleId, face.faceId, face.text, face.start);
    for (const ability of abilities) {
      const abilityId = `${input.oracleId}:${face.faceId}:${ability.abilityIndex}`;
      const parentId = abilityId;

      const abilityBlock = parseAbilityBlock({
        abilityId,
        paragraphText: ability.paragraphText,
        paragraphStart: ability.paragraphStart,
        hostAbilityType: ability.abilityType,
      });

      if (abilityBlock.costRegion && abilityBlock.effectRegion) {
        activatedAbilities.push({
          costRegion: {
            text: abilityBlock.costRegion.text,
            start: ability.paragraphStart + abilityBlock.costRegion.localStart,
            end: ability.paragraphStart + abilityBlock.costRegion.localEnd,
          },
          colonPosition: abilityBlock.costRegion.localEnd,
          effectRegion: {
            text: abilityBlock.effectRegion.text,
            start: ability.paragraphStart + abilityBlock.effectRegion.localStart,
            end: ability.paragraphStart + abilityBlock.effectRegion.localEnd,
          },
          effectClauses: abilityBlock.clauses.map((c) => ({
            clauseId: c.clauseId,
            role: c.role,
            text: c.text,
            localStart: c.localStart,
            localEnd: c.localEnd,
          })),
        });
      }

      const insteadIdx = ability.paragraphText.search(/\binstead\b/i);
      const isReplacementAbility = insteadIdx > 0 && /\bwould\b/i.test(ability.paragraphText.slice(0, insteadIdx));

      if (isReplacementAbility) {
        const replId = `${abilityId}:replacement`;
        const eventClause: ClauseNode = {
          clauseId: `${replId}:event`,
          role: "replacement_event",
          text: ability.paragraphText.slice(0, insteadIdx).trim(),
          localStart: 0,
          localEnd: insteadIdx,
        };
        const replacementClause: ClauseNode = {
          clauseId: `${replId}:effect`,
          role: "replacement_effect",
          text: ability.paragraphText.slice(insteadIdx).trim(),
          localStart: insteadIdx,
          localEnd: ability.paragraphText.length,
        };
        const replActions = extractPrimitivesFromClause({
          oracleId: input.oracleId,
          ability,
          faceId: face.faceId,
          clause: replacementClause,
          actionIndexStart: actionIndex,
          objectIdPrefix: replId,
          extensions: { executionContext: "replacement_effect" },
        });
        replacementEffects.push({
          eventClause,
          replacementClause,
          replacementActionIds: replActions.map((a) => a.actionId),
        });
        actions.push(...replActions);
        actionIndex = actions.length;
      }

      const isActivatedSplit = !!(abilityBlock.costRegion && abilityBlock.effectRegion);

      const topClauses: ClauseNode[] = abilityBlock.clauses.map((c) => ({
        clauseId: c.clauseId,
        role: c.role,
        text: c.text,
        localStart: c.localStart,
        localEnd: c.localEnd,
      }));

      if (isActivatedSplit && !isReplacementAbility) {
        for (const clause of topClauses) {
          if (clause.localStart < abilityBlock.effectRegion!.localStart) continue;
          if (clause.role !== "effect" && clause.role !== "replacement_effect") continue;
          actions.push(
            ...extractPrimitivesFromClause({
              oracleId: input.oracleId,
              ability,
              faceId: face.faceId,
              clause,
              actionIndexStart: actionIndex,
              objectIdPrefix: `${abilityId}:activated-effect`,
              extensions: { executionContext: "immediate", activatedEffectRegion: true },
            }),
          );
          actionIndex = actions.length;
        }
      } else if (abilityBlock.effectRegion && !isReplacementAbility) {
        for (const clause of topClauses) {
          if (clause.role !== "effect" && clause.role !== "replacement_effect") continue;
          actions.push(
            ...extractPrimitivesFromClause({
              oracleId: input.oracleId,
              ability,
              faceId: face.faceId,
              clause,
              actionIndexStart: actionIndex,
              objectIdPrefix: abilityId,
              extensions: { executionContext: "immediate" },
            }),
          );
          actionIndex = actions.length;
        }
      } else if (!isReplacementAbility) {
        for (const clause of topClauses) {
          if (clause.role === "cost" || clause.role === "trigger_event" || clause.role === "replacement_event") {
            continue;
          }
          actions.push(
            ...extractPrimitivesFromClause({
              oracleId: input.oracleId,
              ability,
              faceId: face.faceId,
              clause,
              actionIndexStart: actionIndex,
              objectIdPrefix: abilityId,
              extensions: { executionContext: "immediate" },
            }),
          );
          actionIndex = actions.length;
        }
      }

      transformTransitions.push(...extractTransformTransitions({ ability, oracleId: input.oracleId }));

      if (!isReplacementAbility) {
      const { links, actions: chainActions } = extractSearchChain({
        oracleId: input.oracleId,
        ability,
        faceId: face.faceId,
        clauses: topClauses,
        actionIndexStart: actionIndex,
      });
      if (links.length > 0) {
        searchChains.push(links);
        actions.push(...chainActions);
        actionIndex = actions.length;
      }

      for (const ctx of findGrantedQuoteContexts(ability.paragraphText, parentId)) {
        const grantedNode = parseGrantedAbility(ctx, parentId);
        grantedAbilities.push(grantedNode);

        const nestedBlock = parseAbilityBlock({
          abilityId: ctx.grantedAbilityId,
          paragraphText: ctx.innerText,
          paragraphStart: ability.paragraphStart + ctx.innerLocalStart,
          hostAbilityType: ability.abilityType,
        });
        grantedNode.nestedAbilityBlock.clauses = nestedBlock.clauses.map((c) => ({
          clauseId: c.clauseId,
          role: c.role,
          text: c.text,
          localStart: c.localStart,
          localEnd: c.localEnd,
        }));
        grantedNode.nestedAbilityBlock.abilityType = String(nestedBlock.abilityType);

        const nestedAbility: SegmentedAbility = {
          ...ability,
          paragraphText: ctx.innerText,
          paragraphStart: ability.paragraphStart + ctx.innerLocalStart,
          abilityType:
            nestedBlock.abilityType === "triggered"
              ? "triggered"
              : nestedBlock.abilityType === "activated"
                ? "activated"
                : ability.abilityType,
        };

        for (const clause of nestedBlock.clauses) {
          if (clause.role === "cost" || clause.role === "trigger_event" || clause.role === "replacement_event") {
            continue;
          }
          const grantedExtensions = tagGrantedContext({
            action: { extractionSource: "rc3_clause_native" },
            grantingClauseId: parentId,
            grantedAbilityId: ctx.grantedAbilityId,
          });
          actions.push(
            ...extractPrimitivesFromClause({
              oracleId: input.oracleId,
              ability: nestedAbility,
              faceId: face.faceId,
              clause: {
                clauseId: clause.clauseId,
                role: clause.role,
                text: clause.text,
                localStart: clause.localStart,
                localEnd: clause.localEnd,
              },
              actionIndexStart: actionIndex,
              objectIdPrefix: ctx.grantedAbilityId,
              extensions: grantedExtensions,
            }),
          );
          actionIndex = actions.length;
        }
      }
      }
    }
  }

  return {
    actions: dedupeActions(actions),
    grantedAbilities,
    activatedAbilities,
    replacementEffects,
    searchChains,
    transformTransitions,
    provenance: "clause_native",
  };
}

function semanticActionKey(action: OracleActionV1): string {
  const ext = action as OracleActionV1 & RC3ActionExtensions;
  return [
    action.actionType,
    action.abilityIndex,
    ext.clauseId ?? "",
    ext.referentObjectId ?? "",
    (action.destinationZones ?? []).join(","),
    action.evidenceText.trim().slice(0, 32),
  ].join("|");
}

/** Merge clause-native actions with V1 baseline — semantic dedupe, native supplements gaps. */
export function mergeClauseNativeWithV1(
  v1Actions: OracleActionV1[],
  native: ClauseNativeExtractionResult,
): { actions: OracleActionV1[]; stats: { v1Only: number; nativeOnly: number; overlap: number; disagreements: number } } {
  const positionKey = (a: OracleActionV1) =>
    `${a.actionType}:${Math.round(a.evidenceStart / 8)}:${a.evidenceText.slice(0, 16)}`;

  const v1Semantic = new Set(v1Actions.map(semanticActionKey));
  const v1Keys = new Set(v1Actions.map(positionKey));
  let overlap = 0;
  let disagreements = 0;

  for (const nativeAction of native.actions) {
    const key = positionKey(nativeAction);
    const v1Match = v1Actions.find((v) => positionKey(v) === key);
    if (v1Match) {
      overlap++;
      if (v1Match.actionType !== nativeAction.actionType) disagreements++;
    } else if (v1Semantic.has(semanticActionKey(nativeAction))) {
      overlap++;
    }
  }

  const nativeOnly = native.actions.filter(
    (n) => !v1Keys.has(positionKey(n)) && !v1Semantic.has(semanticActionKey(n)),
  );
  const merged = dedupeActions([...v1Actions, ...nativeOnly]);

  return {
    actions: merged.map((a, i) => ({ ...a, actionIndex: i })),
    stats: {
      v1Only: v1Actions.length - overlap,
      nativeOnly: nativeOnly.length,
      overlap,
      disagreements,
    },
  };
}

/** Select clause-native actions eligible for family-scoped promotion. */
export function filterNativeActionsForPromotion(
  native: ClauseNativeExtractionResult,
  families: Array<"granted_ability_quote" | "search_put_shuffle_chain" | "activated_post_colon_effect">,
): OracleActionV1[] {
  const promoted: OracleActionV1[] = [];
  const seen = new Set<string>();

  const add = (action: OracleActionV1) => {
    const tagged = tagExtractionSource(action as OracleActionV1 & RC3ActionExtensions, "rc3_clause_native");
    const key = `${tagged.actionType}:${tagged.evidenceStart}:${tagged.evidenceText.slice(0, 20)}`;
    if (seen.has(key)) return;
    seen.add(key);
    promoted.push(tagged);
  };

  if (families.includes("granted_ability_quote")) {
    for (const granted of native.grantedAbilities) {
      for (const action of native.actions) {
        if (action.clauseId?.includes(":granted:") || action.clauseId?.startsWith(granted.grantingClauseId)) {
          add(action);
        }
      }
    }
  }

  if (families.includes("search_put_shuffle_chain")) {
    for (const chain of native.searchChains) {
      for (const link of chain) {
        const action = native.actions.find(
          (a) => a.actionType === link.actionType && Math.abs(a.evidenceStart - link.absStart) < 3,
        );
        if (action) add(action);
      }
    }
  }

  if (families.includes("activated_post_colon_effect")) {
    for (const activated of native.activatedAbilities) {
      const effectClauseIds = new Set(
        activated.effectClauses
          .filter((c) => c.role === "effect" || c.role === "replacement_effect")
          .map((c) => c.clauseId),
      );
      for (const action of native.actions) {
        const ext = action as OracleActionV1 & RC3ActionExtensions;
        if (!ext.activatedEffectRegion) continue;
        if (action.evidenceStart < activated.effectRegion.start) continue;
        if (action.evidenceEnd <= activated.costRegion.end) continue;
        if (action.clauseId && effectClauseIds.size > 0 && !effectClauseIds.has(action.clauseId)) continue;
        if (action.actionType === "transform") continue;
        if (action.actionType === "copy") continue;
        add(action);
      }
    }
  }

  return promoted;
}
