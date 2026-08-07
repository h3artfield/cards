/**
 * Oracle-action parser v1 — deterministic-first with abstention.
 */
import { createHash } from "node:crypto";
import type {
  CardFaceComponentType,
  DerivedCardRole,
  OracleAbilityType,
  OracleActionExtractionResult,
  OracleAbilityStructureAnnotation,
  SegmentedAbility,
  StructureAnnotationKind,
  TextRole,
} from "./oracle-action-schema";
import { ORACLE_ACTION_PARSER_VERSION } from "./oracle-action-schema";
import {
  classifyAbilityType,
  evidenceCrossesFaceBoundary,
  faceForEvidenceSpan,
  segmentAbilities,
  segmentCardFaces,
  type SegmentedCardFace,
  validateEvidenceSpan,
} from "./oracle-ability-segmentation";
import {
  attachOptionalityToAction,
  attachPlayerMayPayScopes,
  emitStructureAnnotations,
  wireConditionsToActions,
  type ConditionType,
  type OptionalityController,
} from "./oracle-action-optionality";
import {
  classifyTextRoleAt,
  clauseBoundaries,
  compoundClauseSpansWithRoles,
  extractStaticPermissions,
  findQuotedAbilitySpans,
  findReminderSpans,
  isInsideQuotedGrantedAbility,
  isOneShotCastPermission,
  isReflexiveTriggerReference,
  primitiveAllowedAtRole,
  type StaticPermissionRecord,
} from "./oracle-span-role-classifier";
import type { CompoundClauseSegment } from "./oracle-compound-clause-segmentation";
import {
  findGrantedQuoteContexts,
  grantedClauseSpans,
  isInsideGrantedQuote,
  type GrantedQuoteContext,
} from "./oracle-granted-ability-extraction";
import {
  inferDerivedRoles,
  normalizeAbilityType,
  PRIMITIVE_TO_DERIVED_ROLES,
  type PrimitiveActionType,
} from "./oracle-action-taxonomy";

export type OracleActionV1AbilityType =
  | "spell_effect"
  | "activated"
  | "triggered"
  | "static"
  | "replacement";

export type OracleActionV1ReviewStatus = "accepted" | "needs_review" | "overridden";
export type OracleActionV1ExtractionMethod = "deterministic" | "model_assisted" | "manual";

export interface OracleActionV1 {
  oracleId: string;
  faceId: string;
  faceName?: string;
  faceIndex: number;
  componentType: CardFaceComponentType;
  abilityIndex: number;
  actionIndex: number;
  abilityType: OracleActionV1AbilityType;
  actionType: PrimitiveActionType;
  sourceZones?: string[];
  destinationZones?: string[];
  affectedObjects?: string[];
  conditions?: string[];
  quantityConstraint?: string;
  optional: boolean;
  optionalEffect: boolean;
  optionalCost?: boolean;
  optionalityEvidenceText?: string;
  optionalityEvidenceStart?: number;
  optionalityEvidenceEnd?: number;
  optionalityScopeId?: string;
  optionalityController?: OptionalityController;
  conditionType?: ConditionType;
  conditionText?: string;
  conditionEvidenceStart?: number;
  conditionEvidenceEnd?: number;
  dependsOnActionIds?: string[];
  targetMinimum?: number;
  targetMaximum?: number | "X";
  quantityMayBeZero?: boolean;
  quantityType?: "literal" | "variable";
  quantityExpression?: string;
  evidenceText: string;
  evidenceStart: number;
  evidenceEnd: number;
  cardEvidenceStart: number;
  cardEvidenceEnd: number;
  faceEvidenceStart: number;
  faceEvidenceEnd: number;
  extractionMethod: OracleActionV1ExtractionMethod;
  confidence: number;
  parserVersion: string;
  reviewStatus: OracleActionV1ReviewStatus;
  actionId: string;
  trigger?: string;
  cost?: string;
  optionalityCertain?: boolean;
  textRole?: TextRole;
  clauseId?: string;
  parentAbilityId?: string;
  clauseDependencyKind?: string;
  referencedClauseId?: string;
  referentTexts?: string[];
  clauseSequenceIndex?: number;
  abilityOrigin?: "native" | "granted";
  grantedByAbilityId?: string;
  grantedAbilityType?: "activated" | "triggered" | "static";
}

export interface OracleActionV1Result {
  oracleId: string;
  faceName?: string;
  abilities: SegmentedAbility[];
  actions: OracleActionV1[];
  structureAnnotations: OracleAbilityStructureAnnotation[];
  derivedRoles: DerivedCardRole[];
  abstainedClauses: Array<{ text: string; start: number; end: number; reason: string }>;
  duplicateSuppressedCount: number;
  canonicalKeyDuplicatesRemoved: number;
  semanticDuplicatesRemoved: number;
  rawEmissionCount: number;
  modelAssistedLog: Array<{
    modelName: string;
    promptVersion: string;
    confidence: number;
    evidenceValid: boolean;
    clause: string;
  }>;
}

interface ActionPattern {
  pattern: RegExp;
  actionType: PrimitiveActionType;
  abilityType?: OracleActionV1AbilityType;
  optional?: boolean;
  sourceZones?: string[];
  destinationZones?: string[];
  affectedObjects?: string[];
  /** When true, match only if play/cast permission verb is present (never zone-only). */
  requiresPermissionVerb?: boolean;
}

const CAST_SPELLS_FROM =
  /\b(?:you may )?cast spells from(?: your [\w]+)?\b/i;
const PLAY_LANDS = /\b(?:you may )?play lands\b/i;
const CAST_PERMISSION =
  /\b(?:you may )?cast (?:target |this |that |the copy|the exiled |any number of (?:spells|nonland)|spells from(?: your [\w]+)?|it\b|a spell)/i;
const PLAY_PERMISSION =
  /\b(?:you may )?play (?:land cards from|that card|it\b|an additional land)/i;

const ACTION_PATTERNS: ActionPattern[] = [
  { pattern: /\bdraws? (?:a |one |two |three |four |five |seven |that many |up to \w+ )?cards?\b/i, actionType: "draw", destinationZones: ["hand"], affectedObjects: ["card"] },
  { pattern: /\bYou may draw [\w ]+/i, actionType: "draw", destinationZones: ["hand"], affectedObjects: ["card"] },
  { pattern: /\bYou may sacrifice [\w ]+/i, actionType: "sacrifice", sourceZones: ["battlefield"] },
  { pattern: /\bYou may exile [\w ]+/i, actionType: "exile", destinationZones: ["exile"] },
  { pattern: /\bYou may destroy [\w ]+/i, actionType: "destroy", sourceZones: ["battlefield"] },
  { pattern: /\bYou may counter [\w ]+/i, actionType: "counter", sourceZones: ["stack"] },
  { pattern: /\bYou may return [\w ]+to the battlefield\b/i, actionType: "return_to_battlefield", destinationZones: ["battlefield"] },
  { pattern: /\bYou may return [\w ]+to [\w ]+hand\b/i, actionType: "return_to_hand", destinationZones: ["hand"] },
  { pattern: /\breturn that (?:card|creature|permanent) to the battlefield\b/i, actionType: "return_to_battlefield", destinationZones: ["battlefield"] },
  { pattern: /\bYou may discard [\w ]+/i, actionType: "discard", sourceZones: ["hand"], destinationZones: ["graveyard"] },
  { pattern: /\bYou may put [\w ]+ from (?:your |a |their )?(?:hand|graveyard|exile)[\w ]* onto the battlefield/i, actionType: "put_onto_battlefield", destinationZones: ["battlefield"] },
  { pattern: /\bput (?:that|it|one|those|them|\w+) (?:card )?(?:from [\w ]+ )?onto the battlefield/i, actionType: "put_onto_battlefield", destinationZones: ["battlefield"] },
  { pattern: /\bput [\w ]+ from (?:your |a |their )?(?:hand|graveyard|exile)[\w ]* onto the battlefield/i, actionType: "put_onto_battlefield", destinationZones: ["battlefield"] },
  { pattern: /\bputs? all [\w ]+ exiled this way onto the battlefield/i, actionType: "put_onto_battlefield", sourceZones: ["exile"], destinationZones: ["battlefield"] },
  { pattern: /\breturn it to the battlefield transformed\b/i, actionType: "return_to_battlefield", destinationZones: ["battlefield"] },
  { pattern: /\bExile this [\w ]+/i, actionType: "exile", destinationZones: ["exile"] },
  { pattern: /\bexiles? all [\w ]+ cards from (?:their |your )?graveyard/i, actionType: "exile", sourceZones: ["graveyard"], destinationZones: ["exile"] },
  { pattern: /\b(?:Target player|Each player|that player) mills? (?:one|two|three|four|five|six|seven|eight|nine|ten|half|fourteen|\d+|up to \w+) [\w ]*/i, actionType: "mill", sourceZones: ["library"], destinationZones: ["graveyard"] },
  { pattern: /\bsacrifices? (?:a |an |all )?[\w ]+ of their choice\b/i, actionType: "sacrifice", sourceZones: ["battlefield"] },
  { pattern: /\bsacrifices? all [\w ]+ they control\b/i, actionType: "sacrifice", sourceZones: ["battlefield"] },
  { pattern: /\bYou may cast this spell from your graveyard\b/i, actionType: "cast", sourceZones: ["graveyard"], requiresPermissionVerb: true },
  { pattern: /\bYou may cast the copy\b/i, actionType: "cast", sourceZones: ["exile", "stack"], requiresPermissionVerb: true },
  { pattern: /\byou may play that card\b/i, actionType: "play", sourceZones: ["exile"], requiresPermissionVerb: true },
  { pattern: /\bplay an additional land\b/i, actionType: "play", sourceZones: ["hand"], requiresPermissionVerb: true },
  { pattern: CAST_SPELLS_FROM, actionType: "cast", sourceZones: ["graveyard", "exile"], requiresPermissionVerb: true },
  { pattern: PLAY_LANDS, actionType: "play", sourceZones: ["hand", "graveyard"], requiresPermissionVerb: true },
  { pattern: /\bput (?:a |one )?card from your hand on top of your library\b/i, actionType: "search_library", sourceZones: ["hand"], destinationZones: ["library"] },
  { pattern: /\bYou may play (?!(?:lands and cast|lands and spells))[\w ]+/i, actionType: "play", requiresPermissionVerb: true },
  { pattern: /\bDraw (?:a |one |two |three |four |five |seven |that many |up to \w+ )?cards?\b/, actionType: "draw", destinationZones: ["hand"], affectedObjects: ["card"] },
  { pattern: /\bAdd \{[^}]+\}(?:\{[^}]+\})*/i, actionType: "add_mana", abilityType: "activated", destinationZones: ["mana_pool"] },
  { pattern: /\bAdd (?:one mana of any color|three mana of any one color|\{C\}{1,2}|\{[WUBRG]\})/i, actionType: "add_mana", destinationZones: ["mana_pool"] },
  { pattern: /\bsearch (?:your |their )?library for\b/i, actionType: "search_library", sourceZones: ["library"], destinationZones: ["hand", "battlefield", "library"] },
  { pattern: /\bDestroy all [\w ]+/i, actionType: "destroy", sourceZones: ["battlefield"], affectedObjects: ["permanent"] },
  { pattern: /\beach creature gets [-−]/i, actionType: "destroy", sourceZones: ["battlefield"], affectedObjects: ["creature"] },
  { pattern: /\bDestroy (?:target|up to (?:one|two|three) target) [\w ]+/i, actionType: "destroy", sourceZones: ["battlefield"], affectedObjects: ["permanent"] },
  { pattern: /\bDestroy them\b/i, actionType: "destroy", sourceZones: ["battlefield"], affectedObjects: ["permanent"] },
  { pattern: /\bExile (?:target|all|each|the top) [\w']+/i, actionType: "exile", destinationZones: ["exile"] },
  { pattern: /\bExile up to (?:one|two|three|\w+) target [\w ]+/i, actionType: "exile", destinationZones: ["exile"] },
  { pattern: /\bexile (?:target|the top|a \w+ card from)/i, actionType: "exile", destinationZones: ["exile"] },
  { pattern: /\bCounter (?:target|up to (?:one|two|three|four|five) target) [\w ]+/i, actionType: "counter", sourceZones: ["stack"], affectedObjects: ["spell", "ability"] },
  { pattern: /\bReturn (?:target|up to (?:one|two) target) [\w ]+ to (?:its|their) owner'?s hand\b/i, actionType: "return_to_hand", sourceZones: ["battlefield"], destinationZones: ["hand"] },
  { pattern: /\bReturn (?:target|up to (?:one|two) target) [\w ]+(?: cards?)? from (?:your )?graveyard to your hand\b/i, actionType: "return_to_hand", sourceZones: ["graveyard"], destinationZones: ["hand"] },
  { pattern: /\bReturn target [\w ]+ from (?:your )?graveyard to your hand\b/i, actionType: "return_to_hand", sourceZones: ["graveyard"], destinationZones: ["hand"] },
  { pattern: /\bPut target [\w ]+ (?:card )?from (?:your |a )?graveyard onto the battlefield\b/i, actionType: "return_to_battlefield", sourceZones: ["graveyard"], destinationZones: ["battlefield"] },
  { pattern: /\bReturn (?:target|up to (?:one|two) target) [\w ]+ (?:card )?from (?:your )?graveyard to the battlefield\b/i, actionType: "return_to_battlefield", sourceZones: ["graveyard"], destinationZones: ["battlefield"] },
  { pattern: /\bPut target [\w ]+ (?:card )?from a graveyard onto the battlefield\b/i, actionType: "return_to_battlefield", sourceZones: ["graveyard"], destinationZones: ["battlefield"] },
  { pattern: /\bSacrifice (?:a |an |target |up to one target )?[\w ]+/i, actionType: "sacrifice", sourceZones: ["battlefield"] },
  { pattern: /\b(?:Each (?:opponent|player)|Target player|That player|Each opponent) sacrifices (?:a |an |all )?[\w ]+/i, actionType: "sacrifice", sourceZones: ["battlefield"] },
  { pattern: /\b(?:create|creates|You may create) (?:a |an |one |up to \w+ )?(?:[\w-/]+ )*tokens?\b/i, actionType: "create_token", destinationZones: ["battlefield"], affectedObjects: ["token"] },
  { pattern: /\bCopy target (?:instant|sorcery|spell|triggered|[\w ]+)/i, actionType: "copy", sourceZones: ["stack", "battlefield"] },
  { pattern: /\bcopy target (?:instant|sorcery|spell|triggered|[\w ]+)/i, actionType: "copy", sourceZones: ["stack", "battlefield"] },
  { pattern: /\bcopy (?:that spell|the exiled card|it)\b/i, actionType: "copy", sourceZones: ["stack", "exile"] },
  { pattern: CAST_PERMISSION, actionType: "cast", sourceZones: ["graveyard", "exile", "stack"], requiresPermissionVerb: true },
  { pattern: PLAY_PERMISSION, actionType: "play", sourceZones: ["graveyard", "exile", "hand"], requiresPermissionVerb: true },
  { pattern: /\bMill (?:target )?(?:player|cards|\d+|up to \w+ cards)/i, actionType: "mill", sourceZones: ["library"], destinationZones: ["graveyard"] },
  { pattern: /\bmills? (?:one|two|three|four|five|six|seven|eight|nine|ten|half|fourteen|\d+|up to \w+) [\w ]*/i, actionType: "mill", sourceZones: ["library"], destinationZones: ["graveyard"] },
  { pattern: /\b(?:discard|discards) (?:a |one |two |three |their |up to \w+ )?(?:[\w ]*cards?|their hand)\b/i, actionType: "discard", sourceZones: ["hand"], destinationZones: ["graveyard"] },
  { pattern: /\bdraw that many cards\b/i, actionType: "draw", destinationZones: ["hand"], affectedObjects: ["card"] },
  { pattern: /\bdeals? \d+ damage(?: to (?:any target|target [\w ]+|each [\w ]+))?/i, actionType: "deal_damage", affectedObjects: ["player", "permanent"] },
  { pattern: /\bDeal up to \d+ damage(?: to (?:any target|target [\w ]+))?/i, actionType: "deal_damage", affectedObjects: ["player", "permanent"] },
  { pattern: /\bgains? \d+ life\b/i, actionType: "gain_life", affectedObjects: ["player"] },
  { pattern: /\bloses? \d+ life\b/i, actionType: "lose_life", affectedObjects: ["player"] },
  { pattern: /\bloses? up to \d+ life\b/i, actionType: "lose_life", affectedObjects: ["player"] },
  { pattern: /\b(?:You |Target player |Each player |That player )?loses? X life\b/i, actionType: "lose_life", affectedObjects: ["player"] },
  { pattern: /\b(?:You |Target player |Each player |That player )?loses? life equal to[^.]+/i, actionType: "lose_life", affectedObjects: ["player"] },
  { pattern: /\bScry \d+\b/i, actionType: "scry", sourceZones: ["library"] },
  { pattern: /\bScry up to \d+\b/i, actionType: "scry", sourceZones: ["library"] },
  { pattern: /\bSurveil \d+\b/i, actionType: "surveil", sourceZones: ["library"], destinationZones: ["graveyard"] },
  { pattern: /\bTap target [\w ]+/i, actionType: "tap", sourceZones: ["battlefield"] },
  { pattern: /\bTap up to (?:one|two|three) target [\w ]+/i, actionType: "tap", sourceZones: ["battlefield"] },
  { pattern: /\bUntap (?:target |two |three |four |five |\d+ )?[\w ]+/i, actionType: "untap", sourceZones: ["battlefield"] },
  { pattern: /\bPut (?:a |one |up to one )?\+?\/?\+?\d+\/?\+?\d+ counter/i, actionType: "put_counter", destinationZones: ["battlefield"] },
  { pattern: /\bPut up to (?:that many|\w+) \+?\/?\+?\d+\/?\+?\d+ counters?\b/i, actionType: "put_counter", destinationZones: ["battlefield"] },
  { pattern: /\bexile it instead\b/i, actionType: "exile", abilityType: "replacement", destinationZones: ["exile"] },
  { pattern: /\bthen shuffle(?: your library|\.)?\b/i, actionType: "shuffle_library", sourceZones: ["library"], destinationZones: ["library"] },
  { pattern: /\bshuffle(?: your library|\.)?\b/i, actionType: "shuffle_library", sourceZones: ["library"], destinationZones: ["library"] },
  { pattern: /\bshuffle and put that card on top\b/i, actionType: "shuffle_library", sourceZones: ["library"], destinationZones: ["library"] },
  { pattern: /\b(?:shuffle|shuffles) (?:your |their )?(?:hand and graveyard|graveyard and hand|hand) into (?:your |their )?library\b/i, actionType: "shuffle_into_library", sourceZones: ["hand", "graveyard"], destinationZones: ["library"] },
  { pattern: /\bshuffles? (?:it|target [\w ]+) into (?:its owner's |their |your )?library\b/i, actionType: "shuffle_into_library", destinationZones: ["library"] },
  { pattern: /\bExile all cards from target player'?s library\b/i, actionType: "exile", sourceZones: ["library"], destinationZones: ["exile"] },
];

function actionId(parts: string[]): string {
  return createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 24);
}

function normalizeEvidenceSpan(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function zoneKey(zones?: string[]): string {
  return (zones ?? []).slice().sort().join(",");
}

function canonicalDedupKey(input: {
  oracleId: string;
  faceId: string;
  abilityIndex: number;
  actionType: PrimitiveActionType;
  evidenceText: string;
  sourceZones?: string[];
  destinationZones?: string[];
  affectedObjects?: string[];
}): string {
  return [
    input.oracleId,
    input.faceId,
    String(input.abilityIndex),
    input.actionType,
    normalizeEvidenceSpan(input.evidenceText),
    zoneKey(input.sourceZones),
    zoneKey(input.destinationZones),
    zoneKey(input.affectedObjects),
  ].join("|");
}

function faceDisplayName(face: SegmentedCardFace): string {
  return face.faceName;
}

function toV1AbilityType(type: OracleAbilityType | "unknown"): OracleActionV1AbilityType {
  return normalizeAbilityType(type) as OracleActionV1AbilityType;
}

function inferZones(text: string): { source?: string[]; dest?: string[] } {
  const source = new Set<string>();
  const dest = new Set<string>();
  if (/\bfrom (?:your )?graveyard\b/i.test(text)) source.add("graveyard");
  if (/\binto (?:your )?graveyard\b/i.test(text)) dest.add("graveyard");
  if (/\bfrom exile\b/i.test(text)) source.add("exile");
  if (/\bExile\b|\bexile\b/i.test(text)) dest.add("exile");
  if (/\bfrom (?:your )?hand\b/i.test(text)) source.add("hand");
  if (/\binto (?:your )?hand\b|\bto your hand\b/i.test(text)) dest.add("hand");
  if (/\bonto the battlefield\b/i.test(text)) dest.add("battlefield");
  if (/\bto the battlefield\b/i.test(text)) dest.add("battlefield");
  if (/\bsearch (?:your )?library\b/i.test(text)) source.add("library");
  return {
    source: source.size ? [...source] : undefined,
    dest: dest.size ? [...dest] : undefined,
  };
}

function extractCost(paragraph: string): string | undefined {
  const loyalty = paragraph.match(/^[+\−-]\d+:/);
  if (loyalty) return loyalty[0].slice(0, -1);
  const activated = paragraph.match(/^\{[^}]+\}(?:\{[^}]+\})*:?\s*/);
  if (activated) return activated[0].trim();
  const additional = paragraph.match(/As an additional cost[^.]+\./i);
  if (additional) return additional[0];
  return undefined;
}

function extractTrigger(paragraph: string): string | undefined {
  const m = paragraph.match(/^(When|Whenever|At the beginning of|At end of)[^.]+\./i);
  return m?.[0]?.trim();
}

function extractQuantityConstraint(text: string): string | undefined {
  const upTo = text.match(/\bup to (?:one|two|three|four|five|\w+) [\w ]+/i);
  return upTo?.[0]?.trim();
}

function parseLoseLifeQuantity(
  evidenceText: string,
): { quantityType?: "literal" | "variable"; quantityExpression?: string } {
  const variable = evidenceText.match(/\b(?:You |Target player |Each player |That player )?lose(?:s)? life equal to (.+)$/i);
  if (variable?.[1]) {
    return { quantityType: "variable", quantityExpression: variable[1].trim() };
  }
  const xLife = evidenceText.match(/\b(?:You |Target player |Each player |That player )?lose(?:s)? X life\b/i);
  if (xLife) {
    return { quantityType: "variable", quantityExpression: "X" };
  }
  const literal = evidenceText.match(/\b(?:You |Target player |Each player |That player )?lose(?:s)? (\d+|up to \d+) life\b/i);
  if (literal?.[1]) {
    return { quantityType: "literal", quantityExpression: literal[1] };
  }
  return {};
}

function parseTargetConstraint(text: string): {
  targetMinimum?: number;
  targetMaximum?: number | "X";
  quantityMayBeZero?: boolean;
} {
  const upToTarget = text.match(/\bup to (one|two|three|four|five|\w+) target/i);
  if (upToTarget) {
    const word = upToTarget[1].toLowerCase();
    const map: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5 };
    return { targetMaximum: map[word] ?? "X", quantityMayBeZero: true };
  }
  if (/\bup to that many\b/i.test(text)) {
    return { targetMaximum: "X", quantityMayBeZero: true };
  }
  const upToQty = text.match(/\bup to (one|two|three|four|five|\d+|X) (?:\+?\/?\+?\d+\/?\+?\d+ )?counters?\b/i);
  if (upToQty) {
    const word = upToQty[1].toLowerCase();
    const map: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5 };
    return { targetMaximum: map[word] ?? "X", quantityMayBeZero: true };
  }
  if (/\bAny number of target/i.test(text)) {
    return { targetMinimum: 0, quantityMayBeZero: true };
  }
  const upToQuantity = text.match(
    /\b(?:Draw|Mill|Discard|Create|Scry|Surveil) up to (one|two|three|four|five|\d+)\b/i,
  );
  if (upToQuantity) {
    const word = upToQuantity[1].toLowerCase();
    const map: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5 };
    const num = map[word] ?? Number.parseInt(word, 10);
    return { targetMaximum: Number.isFinite(num) ? num : "X", quantityMayBeZero: true };
  }
  const upToLife = text.match(/\b(?:loses|lose|gains|gain) up to (\d+) life\b/i);
  if (upToLife) {
    return { targetMaximum: Number.parseInt(upToLife[1], 10), quantityMayBeZero: true };
  }
  return {};
}

function applyOptionalityPostProcess(
  actions: OracleActionV1[],
  abilities: SegmentedAbility[],
  oracleText: string,
): OracleActionV1[] {
  type Enriched = OracleActionV1 & {
    optionalityCertain?: boolean;
    conditionEvidenceStart?: number;
    conditionEvidenceEnd?: number;
  };

  const byAbility = new Map<string, Enriched[]>();
  for (const action of actions) {
    const key = `${action.faceId}:${action.abilityIndex}`;
    const list = byAbility.get(key) ?? [];
    list.push({ ...action });
    byAbility.set(key, list);
  }

  const result: Enriched[] = [];

  for (const [key, group] of byAbility) {
    const [faceId, abilityIndexStr] = key.split(":");
    const ability = abilities.find(
      (a) => a.cardFaceId === faceId && a.abilityIndex === Number.parseInt(abilityIndexStr, 10),
    );
    if (!ability) {
      result.push(...group);
      continue;
    }

    let enriched: Enriched[] = group.map((action) => {
      const siblings = group.map((s) => ({
        actionId: s.actionId,
        evidenceStart: s.evidenceStart,
        evidenceEnd: s.evidenceEnd,
        evidenceText: s.evidenceText,
        abilityIndex: s.abilityIndex,
        abilityType: s.abilityType,
      }));
      const attach = attachOptionalityToAction({
        action: {
          actionId: action.actionId,
          evidenceStart: action.evidenceStart,
          evidenceEnd: action.evidenceEnd,
          evidenceText: action.evidenceText,
          abilityIndex: action.abilityIndex,
          abilityType: action.abilityType,
        },
        ability,
        oracleText,
        siblingActions: siblings,
      });
      const mergedConditions = action.conditions ?? [];
      if (attach.conditionText && !mergedConditions.includes(attach.conditionText)) {
        mergedConditions.push(attach.conditionText);
      }
      return {
        ...action,
        optional: attach.optionalEffect,
        optionalEffect: attach.optionalEffect,
        optionalCost: attach.optionalCost || undefined,
        optionalityEvidenceText: attach.optionalityEvidenceText,
        optionalityEvidenceStart: attach.optionalityEvidenceStart,
        optionalityEvidenceEnd: attach.optionalityEvidenceEnd,
        optionalityScopeId: attach.optionalityScopeId,
        optionalityController: attach.optionalityController,
        optionalityCertain: attach.optionalityCertain,
        conditions: mergedConditions.length ? mergedConditions : undefined,
      };
    });

    enriched = wireConditionsToActions({ actions: enriched, ability });
    enriched = attachPlayerMayPayScopes({ actions: enriched, ability });

    for (const action of enriched) {
      let reviewStatus = action.reviewStatus;
      const paragraphHasMay = /\b(?:You|An opponent|That player|Each player|Its controller) may\b/i.test(
        ability.paragraphText,
      );

      if (paragraphHasMay && !action.optionalityCertain && !action.conditionType) {
        const governed = enriched.some(
          (o) =>
            o.actionId !== action.actionId &&
            (o.optionalEffect || o.optionalCost) &&
            o.evidenceStart <= action.evidenceStart,
        );
        if (!governed) reviewStatus = "needs_review";
      }
      if (
        (action.conditionType === "if_you_do" || action.conditionType === "when_you_do") &&
        !action.dependsOnActionIds?.length
      ) {
        reviewStatus = "needs_review";
      }
      if ((action.optionalEffect || action.optionalCost) && !action.optionalityCertain) {
        reviewStatus = "needs_review";
      }
      if (action.conditionType && !action.conditionText) {
        reviewStatus = "needs_review";
      }

      const mergedConditions = action.conditions ?? [];
      if (action.conditionText && !mergedConditions.includes(action.conditionText)) {
        mergedConditions.push(action.conditionText);
      }

      result.push({
        ...action,
        conditions: mergedConditions.length ? mergedConditions : undefined,
        reviewStatus,
      });
    }
  }

  return result.sort((a, b) => a.evidenceStart - b.evidenceStart || a.actionIndex - b.actionIndex);
}

function extractConditions(paragraph: string): string[] {
  const found: string[] = [];
  const patterns = [
    /\bIf you do\b[^.]*/i,
    /\bWhen you do\b[^.]*/i,
    /\bonly if [^.]+/i,
    /\bunless [^.]+/i,
    /\b(?:As long as|For as long as) [^.]+/i,
    /\bAt the beginning of the next [^.]+/i,
    /\bif (?:you|they|it|that|there|a source) [^.]+/i,
  ];
  for (const pattern of patterns) {
    const m = paragraph.match(pattern);
    if (m) found.push(m[0].trim());
  }
  if (/\bwould\b.*\binstead\b/i.test(paragraph)) {
    found.push("replacement: would instead");
  }
  return [...new Set(found)];
}

function evidenceContainedInFace(
  face: SegmentedCardFace,
  cardEvidenceStart: number,
  cardEvidenceEnd: number,
): boolean {
  return cardEvidenceStart >= face.start && cardEvidenceEnd <= face.end;
}

function multifaceFaceUnambiguous(
  faces: SegmentedCardFace[],
  cardEvidenceStart: number,
  cardEvidenceEnd: number,
): boolean {
  const overlapping = faces.filter((f) => cardEvidenceStart < f.end && cardEvidenceEnd > f.start);
  return overlapping.length === 1;
}

function actionInDistinctThenClause(paragraph: string, _evidenceText: string, localStart: number): boolean {
  const bounds = clauseBoundaries(paragraph);
  for (let i = 0; i < bounds.length; i++) {
    const start = bounds[i];
    const end = bounds[i + 1] ?? paragraph.length;
    if (localStart < start || localStart >= end) continue;
    if (i === 0) return true;
    const delimiter = paragraph.slice(bounds[i - 1], start);
    return /(?:,\s*then\s+|\.\s+Then\s+|;\s*)/i.test(delimiter);
  }
  return true;
}

function compoundClauseSpans(paragraph: string): Array<{ localStart: number; text: string }> {
  const spans = new Map<string, { localStart: number; text: string }>();
  const add = (localStart: number, text: string) => {
    const trimmed = text.trim();
    if (trimmed.length < 4) return;
    spans.set(`${localStart}:${trimmed.slice(0, 20)}`, { localStart, text: trimmed });
  };
  add(0, paragraph);
  for (const m of paragraph.matchAll(/,\s*then\s+/gi)) {
    if (m.index !== undefined) add(m.index + m[0].length, paragraph.slice(m.index + m[0].length));
  }
  for (const m of paragraph.matchAll(/\.\s+Then\s+/g)) {
    if (m.index !== undefined) add(m.index + m[0].length, paragraph.slice(m.index + m[0].length));
  }
  const thenMatch = paragraph.match(/\bthen\b/i);
  if (thenMatch?.index !== undefined && thenMatch.index > 0) {
    add(0, paragraph.slice(0, thenMatch.index).replace(/,\s*$/, ""));
  }
  return [...spans.values()];
}

function* iterPatternMatches(
  text: string,
  pattern: RegExp,
): Generator<{ match: RegExpMatchArray; index: number }> {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const re = new RegExp(pattern.source, flags);
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    yield { match: m, index: m.index };
    if (m[0].length === 0) re.lastIndex += 1;
  }
}

let extractionFeaturePromotion = true;

function canPromoteToAccepted(input: {
  abilityType: OracleActionV1AbilityType;
  actionType: PrimitiveActionType;
  confidence: number;
  paragraph: string;
  evidenceText: string;
  evidenceLocalStart?: number;
  replacementInsteadEffect?: boolean;
}): boolean {
  if (input.replacementInsteadEffect && input.confidence >= 0.92) return true;

  if (
    (input.actionType === "cast" && /\bcast spells from\b/i.test(input.evidenceText)) ||
    (input.actionType === "play" && /\bplay lands\b/i.test(input.evidenceText))
  ) {
    return input.confidence >= 0.88 && /\b(?:graveyard|exile)\b/i.test(input.paragraph);
  }

  const tutorThenShuffle = /\bsearch (?:your )?library for\b[\s\S]*\bthen shuffle\b/i.test(input.paragraph);
  const benignThen =
    tutorThenShuffle ||
    /\bthen draw that many cards\b/i.test(input.paragraph) ||
    /\bthen draw\b/i.test(input.paragraph) ||
    /\bthen put\b/i.test(input.paragraph) ||
    /\bthen that player shuffles\b/i.test(input.paragraph) ||
    /\bthen shuffle\b/i.test(input.paragraph);
  const compoundThen = /\bthen\b/i.test(input.paragraph) && !benignThen;
  const localStart =
    input.evidenceLocalStart ??
    input.paragraph.toLowerCase().indexOf(input.evidenceText.toLowerCase().trim());
  if (compoundThen && localStart >= 0 && !actionInDistinctThenClause(input.paragraph, input.evidenceText, localStart)) {
    return false;
  }

  const reliablePrimitives: PrimitiveActionType[] = [
    "draw",
    "destroy",
    "exile",
    "search_library",
    "create_token",
    "discard",
    "untap",
    "gain_life",
    "lose_life",
    "deal_damage",
    "sacrifice",
    "counter",
    "return_to_hand",
    "return_to_battlefield",
    "mill",
    "scry",
    "surveil",
    "tap",
    "add_mana",
    "copy",
    "cast",
    "play",
    "put_onto_battlefield",
    "put_counter",
    "shuffle_library",
    "shuffle_into_library",
  ];
  if (input.abilityType === "replacement" && !input.replacementInsteadEffect) return false;
  if (input.confidence >= 0.88 && reliablePrimitives.includes(input.actionType)) {
    return true;
  }

  return false;
}

function assignReviewStatus(input: {
  abilityType: OracleActionV1AbilityType;
  actionType: PrimitiveActionType;
  confidence: number;
  paragraph: string;
  evidenceText: string;
  evidenceLocalStart?: number;
  componentType: CardFaceComponentType;
  face?: SegmentedCardFace;
  faces?: SegmentedCardFace[];
  cardEvidenceStart?: number;
  cardEvidenceEnd?: number;
  replacementInsteadEffect?: boolean;
  featurePromotion?: boolean;
}): OracleActionV1ReviewStatus {
  if (input.abilityType === "replacement" && !input.replacementInsteadEffect) return "needs_review";

  const isMultiface = input.faces && input.faces.length > 1 && input.face;
  if (isMultiface) {
    const start = input.cardEvidenceStart ?? 0;
    const end = input.cardEvidenceEnd ?? 0;
    if (!evidenceContainedInFace(input.face!, start, end)) return "needs_review";
    if (evidenceCrossesFaceBoundary(input.faces!, start, end)) return "needs_review";
    if (!multifaceFaceUnambiguous(input.faces!, start, end)) return "needs_review";
    const containing = faceForEvidenceSpan(input.faces!, start, end);
    if (!containing || containing.faceId !== input.face!.faceId) return "needs_review";
    if (input.confidence < 0.88) return "needs_review";
    return "accepted";
  }

  if (input.featurePromotion !== false && canPromoteToAccepted(input)) return "accepted";

  if (input.confidence < 0.82) return "needs_review";
  const tutorCompound =
    /\bsearch (?:your |their )?library for\b/i.test(input.paragraph) &&
    /\bput [\w ]+ onto the battlefield\b/i.test(input.paragraph);
  const benignCompoundParagraph =
    tutorCompound ||
    /\bthen draw that many cards\b/i.test(input.paragraph) ||
    /\bIf you do,\s/i.test(input.paragraph) ||
    /\bExile this Saga, then return\b/i.test(input.paragraph) ||
    /\bexiles? all [\w ]+ cards from (?:their |your )?graveyard, then\b/i.test(input.paragraph);
  if (
    /\bthen\b/i.test(input.paragraph) &&
    !benignCompoundParagraph &&
    input.evidenceLocalStart !== undefined &&
    !actionInDistinctThenClause(input.paragraph, input.evidenceText, input.evidenceLocalStart)
  ) {
    return "needs_review";
  }
  if (
    /\bthen\b|\band then\b/i.test(input.paragraph) &&
    !benignCompoundParagraph &&
    input.evidenceLocalStart !== undefined &&
    actionInDistinctThenClause(input.paragraph, input.evidenceText, input.evidenceLocalStart)
  ) {
    return "accepted";
  }
  if (input.actionType === "play" && /\bcast\b/i.test(input.evidenceText)) return "needs_review";
  if (input.actionType === "cast" && /\bplay land\b/i.test(input.evidenceText)) return "needs_review";
  return "accepted";
}

function acceptAction(input: {
  oracleId: string;
  oracleText: string;
  face: SegmentedCardFace;
  faces: SegmentedCardFace[];
  ability: SegmentedAbility;
  match: RegExpMatchArray;
  rule: ActionPattern;
  actionIndex: number;
  replacementInsteadEffect?: boolean;
  evidenceOffsetInParagraph?: number;
  clause?: CompoundClauseSegment;
  grantedContext?: GrantedQuoteContext;
}): OracleActionV1 | null {
  let evidenceText = input.match[0];
  const baseLocalStart =
    input.evidenceOffsetInParagraph ?? input.ability.paragraphText.indexOf(evidenceText);
  const localStart = baseLocalStart;
  if (localStart < 0) return null;

  if (input.rule.actionType === "lose_life") {
    const extended = input.ability.paragraphText
      .slice(localStart)
      .match(/^((?:You |Target player |Each player |That player )?loses? (?:X|\d+|up to \d+) life|(?:You |Target player |Each player |That player )?loses? life equal to[^.]+)/i);
    if (extended?.[1]) {
      evidenceText = extended[1].trim();
    }
  }

  const localEnd = localStart + evidenceText.length;
  const loseLifeQuantity =
    input.rule.actionType === "lose_life" ? parseLoseLifeQuantity(evidenceText) : {};
  const roleParagraph = input.grantedContext?.innerText ?? input.ability.paragraphText;
  const roleLocalStart = input.grantedContext
    ? localStart - input.grantedContext.innerLocalStart
    : localStart;
  const roleLocalEnd = input.grantedContext
    ? roleLocalStart + evidenceText.length
    : localEnd;

  if (matchStartsInTriggerCondition(roleParagraph, roleLocalStart)) {
    return null;
  }
  if (matchInsideReminderParenthetical(input.ability.paragraphText, localStart)) {
    return null;
  }
  if (
    isCyclingDefinitionParagraph(input.ability.paragraphText) ||
    isAftermathDefinitionParagraph(input.ability.paragraphText)
  ) {
    return null;
  }
  if (!input.grantedContext && isInsideGrantedQuote(input.ability.paragraphText, localStart)) {
    return null;
  }
  if (isInsideQuotedGrantedAbility(input.ability.paragraphText, localStart, input.rule.actionType)) {
    return null;
  }
  if (
    (input.rule.actionType === "sacrifice" || input.rule.actionType === "discard") &&
    isReflexiveTriggerReference(input.ability.paragraphText, evidenceText)
  ) {
    return null;
  }
  if (
    input.rule.actionType === "cast" &&
    matchIsSpuriousCastPermission(input.ability.paragraphText, localStart, evidenceText)
  ) {
    return null;
  }
  if (
    (input.rule.actionType === "cast" || input.rule.actionType === "play") &&
    classifyTextRoleAt({
      paragraph: input.ability.paragraphText,
      localStart,
      localEnd,
      abilityType: input.ability.abilityType,
    }) === "static_permission" &&
    !isOneShotCastPermission(input.ability.paragraphText, localStart, evidenceText)
  ) {
    return null;
  }
  if (matchIsStaticActionRestriction(input.ability.paragraphText, localStart, input.rule.actionType)) {
    return null;
  }
  if (matchIsAlternativeCostClause(input.ability.paragraphText, localStart, input.rule.actionType)) {
    return null;
  }

  const textRole: TextRole = input.replacementInsteadEffect
    ? "replacement_effect"
    : classifyTextRoleAt({
        paragraph: roleParagraph,
        localStart: roleLocalStart,
        localEnd: roleLocalEnd,
        abilityType: input.grantedContext?.grantedAbilityType ?? input.ability.abilityType,
      });

  if (
    !primitiveAllowedAtRole(textRole, input.rule.actionType, {
      paragraph: input.ability.paragraphText,
      localStart,
      localEnd,
    })
  ) {
    return null;
  }

  if (
    (input.rule.actionType === "cast" || input.rule.actionType === "play") &&
    textRole === "static_permission" &&
    !isOneShotCastPermission(input.ability.paragraphText, localStart, evidenceText)
  ) {
    return null;
  }
  if (
    input.rule.actionType === "search_library" &&
    /\bput [\w ]+ onto the battlefield\b/i.test(evidenceText) &&
    !/\bsearch (?:your |their )?library\b/i.test(evidenceText)
  ) {
    return null;
  }
  if (input.rule.actionType === "shuffle_library") {
    if (/\bshuffles? [\w ]+ into [\w']+ library\b/i.test(evidenceText)) return null;
    const para = input.ability.paragraphText;
    const genericShuffle =
      /\bthen shuffle\b/i.test(para) ||
      /\bThen shuffle\b/i.test(para) ||
      /\bshuffle and put that card on top\b/i.test(evidenceText);
    const orphanShuffleClause =
      /^shuffle(?: your library|\.)?$/i.test(evidenceText.trim()) &&
      /\bsearch (?:your |their )?library for\b/i.test(para);
    if (!genericShuffle && !orphanShuffleClause) return null;
  }
  if (
    input.rule.actionType === "shuffle_into_library" &&
    !/\binto (?:its owner's |their |your )?library\b/i.test(evidenceText)
  ) {
    return null;
  }

  if (input.rule.requiresPermissionVerb) {
    if (
      !CAST_PERMISSION.test(evidenceText) &&
      !PLAY_PERMISSION.test(evidenceText) &&
      !PLAY_LANDS.test(evidenceText) &&
      !CAST_SPELLS_FROM.test(evidenceText)
    ) {
      return null;
    }
  }

  if (/\bIf you would [^,]+, instead\b/i.test(input.ability.paragraphText) && !input.replacementInsteadEffect) {
    const wouldClause = input.ability.paragraphText.match(/\bIf you would ([^,]+), instead/i)?.[1]?.trim();
    if (wouldClause && evidenceText.trim().toLowerCase() === wouldClause.toLowerCase()) {
      return null;
    }
  }

  const cardEvidenceStart = input.ability.paragraphStart + localStart;
  const cardEvidenceEnd = cardEvidenceStart + evidenceText.length;
  const faceEvidenceStart = cardEvidenceStart - input.face.start;
  const faceEvidenceEnd = cardEvidenceEnd - input.face.start;
  const span = validateEvidenceSpan(input.oracleText, evidenceText, cardEvidenceStart, cardEvidenceEnd);
  if (!span.valid) return null;

  const classified =
    input.ability.abilityType === "unknown"
      ? classifyAbilityType(input.ability.paragraphText)
      : input.ability.abilityType;
  const abilityType = input.replacementInsteadEffect
    ? "replacement"
    : input.rule.abilityType ?? toV1AbilityType(classified);
  const zones = inferZones(input.ability.paragraphText);
  const permissionWindow = input.ability.paragraphText.slice(Math.max(0, localStart - 24), localStart);
  const optionalEffect =
    input.rule.optional === true ||
    /\b(?:you|they|that player|its controller) may\b/i.test(permissionWindow) ||
    /\b(?:you|they) may\b/i.test(evidenceText);
  const quantityConstraint = extractQuantityConstraint(evidenceText);
  const targetConstraint = parseTargetConstraint(evidenceText);
  const conditions = extractConditions(input.ability.paragraphText);

  let confidence = 0.9;
  if (input.replacementInsteadEffect) confidence = 0.92;
  else if (abilityType === "replacement") confidence = 0.78;
  else if (
    (input.rule.actionType === "cast" && CAST_SPELLS_FROM.test(evidenceText)) ||
    (input.rule.actionType === "play" && PLAY_LANDS.test(evidenceText))
  ) {
    confidence = 0.9;
  }
  const tutorThenShuffle = /\bsearch (?:your )?library for\b[\s\S]*\bthen shuffle\b/i.test(
    input.ability.paragraphText,
  );
  const distinctThenClause = actionInDistinctThenClause(
    input.ability.paragraphText,
    evidenceText,
    localStart,
  );
  if (
    /\bthen\b/i.test(input.ability.paragraphText) &&
    !/\bthen draw\b/i.test(input.ability.paragraphText) &&
    !/\bthen draw that many cards\b/i.test(input.ability.paragraphText) &&
    !/\bthen put\b/i.test(input.ability.paragraphText) &&
    !/\bthen shuffle\b/i.test(input.ability.paragraphText) &&
    !/\bthen that player shuffles\b/i.test(input.ability.paragraphText) &&
    !tutorThenShuffle &&
    !distinctThenClause
  ) {
    confidence = 0.8;
  }

  const resolvedActionType = resolveActionTypeFromSemantics(input.rule.actionType, evidenceText);

  const reviewStatus = assignReviewStatus({
    abilityType,
    actionType: resolvedActionType,
    confidence,
    paragraph: input.ability.paragraphText,
    evidenceText,
    evidenceLocalStart: localStart,
    componentType: input.face.componentType,
    face: input.face,
    faces: input.faces,
    cardEvidenceStart,
    cardEvidenceEnd,
    replacementInsteadEffect: input.replacementInsteadEffect,
    featurePromotion: extractionFeaturePromotion,
  });

  return {
    actionId: actionId([
      input.oracleId,
      input.face.faceId,
      String(input.ability.abilityIndex),
      String(input.actionIndex),
      evidenceText,
    ]),
    oracleId: input.oracleId,
    faceId: input.face.faceId,
    faceName: faceDisplayName(input.face),
    faceIndex: input.face.faceIndex,
    componentType: input.face.componentType,
    abilityIndex: input.ability.abilityIndex,
    actionIndex: input.actionIndex,
    abilityType,
    actionType: resolvedActionType,
    sourceZones:
      resolvedActionType === "return_to_battlefield" &&
      input.rule.actionType === "put_onto_battlefield"
        ? ["graveyard"]
        : (input.rule.sourceZones ?? zones.source),
    destinationZones: input.rule.destinationZones ?? zones.dest,
    affectedObjects: input.rule.affectedObjects,
    conditions: conditions.length ? conditions : undefined,
    quantityConstraint,
    optional: optionalEffect,
    optionalEffect,
    targetMinimum: targetConstraint.targetMinimum,
    targetMaximum: targetConstraint.targetMaximum,
    quantityMayBeZero: targetConstraint.quantityMayBeZero,
    quantityType: loseLifeQuantity.quantityType,
    quantityExpression: loseLifeQuantity.quantityExpression,
    evidenceText,
    evidenceStart: cardEvidenceStart,
    evidenceEnd: cardEvidenceEnd,
    cardEvidenceStart,
    cardEvidenceEnd,
    faceEvidenceStart,
    faceEvidenceEnd,
    extractionMethod: "deterministic",
    confidence,
    parserVersion: ORACLE_ACTION_PARSER_VERSION,
    reviewStatus,
    clauseId: input.clause?.clauseId,
    parentAbilityId: input.clause?.parentAbilityId,
    clauseDependencyKind: input.clause?.dependency.kind,
    referencedClauseId: input.clause?.dependency.referencedClauseId,
    referentTexts: input.clause?.referentTexts.length ? input.clause.referentTexts : undefined,
    clauseSequenceIndex: input.clause?.sequenceIndex,
    abilityOrigin: input.grantedContext ? "granted" : "native",
    grantedByAbilityId: input.grantedContext?.grantedAbilityId,
    grantedAbilityType: input.grantedContext?.grantedAbilityType,
    trigger: abilityType === "triggered" ? extractTrigger(input.ability.paragraphText) : undefined,
    cost: abilityType === "activated" || /^[+\−-]\d+:/.test(input.ability.paragraphText)
      ? extractCost(input.ability.paragraphText)
      : undefined,
    textRole,
  };
}

function spanContains(
  outer: { evidenceStart: number; evidenceEnd: number },
  inner: { evidenceStart: number; evidenceEnd: number },
): boolean {
  return outer.evidenceStart <= inner.evidenceStart && inner.evidenceEnd <= outer.evidenceEnd;
}

function sameAbilityAction(a: OracleActionV1, b: OracleActionV1): boolean {
  return (
    a.oracleId === b.oracleId &&
    a.faceId === b.faceId &&
    a.abilityIndex === b.abilityIndex &&
    a.actionType === b.actionType
  );
}

/** True when candidate is a shorter/overlapping re-match of keeper within one ability. */
function isSemanticDuplicate(keeper: OracleActionV1, candidate: OracleActionV1): boolean {
  if (!sameAbilityAction(keeper, candidate)) return false;
  if (spanContains(keeper, candidate)) return true;
  const keeperNorm = normalizeEvidenceSpan(keeper.evidenceText);
  const candidateNorm = normalizeEvidenceSpan(candidate.evidenceText);
  return keeperNorm.includes(candidateNorm) && keeper.evidenceStart <= candidate.evidenceStart;
}

/** Remove shorter overlapping matches, preserving separate clauses/abilities. */
function filterDominatedActions(actions: OracleActionV1[]): OracleActionV1[] {
  const sorted = [...actions].sort(
    (a, b) =>
      b.evidenceText.length - a.evidenceText.length ||
      a.evidenceStart - b.evidenceStart ||
      a.actionIndex - b.actionIndex,
  );
  const kept: OracleActionV1[] = [];
  for (const action of sorted) {
    if (kept.some((k) => isSemanticDuplicate(k, action))) continue;
    kept.push(action);
  }
  return kept.sort((a, b) => a.evidenceStart - b.evidenceStart || a.actionIndex - b.actionIndex);
}

function resolveActionTypeFromSemantics(
  ruleType: PrimitiveActionType,
  evidenceText: string,
): PrimitiveActionType {
  if (
    ruleType === "put_onto_battlefield" &&
    /\bfrom (?:your |a |their )?graveyard\b/i.test(evidenceText) &&
    /\bonto the battlefield\b/i.test(evidenceText)
  ) {
    return "return_to_battlefield";
  }
  return ruleType;
}

function matchStartsInTriggerCondition(paragraph: string, localMatchStart: number): boolean {
  if (!/^(When|Whenever) /i.test(paragraph.trim())) return false;
  const commaIdx = paragraph.indexOf(", ");
  if (commaIdx < 0) return false;
  return localMatchStart < commaIdx;
}

function matchInsideReminderParenthetical(paragraph: string, localStart: number): boolean {
  const reminders = findReminderSpans(paragraph);
  if (reminders.some((r) => localStart >= r.localStart && localStart < r.localEnd)) return true;
  return findQuotedAbilitySpans(paragraph).some(
    (r) => r.role === "reminder_text" && localStart >= r.localStart && localStart < r.localEnd,
  );
}

function matchIsSpuriousCastPermission(paragraph: string, localStart: number, evidenceText: string): boolean {
  const context = paragraph.slice(Math.max(0, localStart - 40), localStart + evidenceText.length + 40);
  if (/\bcan'?t cast\b/i.test(context)) return true;
  if (/\badditional cost to cast this\b/i.test(context)) return true;
  if (/\bYou may cast this spell as though\b/i.test(context)) return true;
  if (/\bYou may cast this spell only if\b/i.test(context)) return true;
  if (/\bSpend this mana only to cast\b/i.test(context)) return true;
  if (/\bGain the next level as a sorcery\b/i.test(context)) return true;
  if (/\bCast it as a sorcery on a later turn\b/i.test(context)) return true;
  if (/\bPlot only as a sorcery\b/i.test(context)) return true;
  if (/\bcast this turn\b/i.test(evidenceText)) return true;
  if (/\bYou may cast this spell with different mana cost\b/i.test(evidenceText)) return true;
  if (/\bIf you cast this spell for its mutate cost\b/i.test(context)) return true;
  if (/\bYou may cast this card from your hand for its warp cost\b/i.test(context)) return true;
  if (/\b've cast this\b/i.test(context) || /\bve cast this\b/i.test(context)) return true;
  if (/\bWhenever you cast an instant or sorcery spell\b/i.test(paragraph) && /\bcast this\b/i.test(evidenceText)) {
    return true;
  }
  return false;
}

function matchIsAlternativeCostClause(paragraph: string, localStart: number, actionType: PrimitiveActionType): boolean {
  if (actionType !== "exile" && actionType !== "sacrifice") return false;
  const context = paragraph.slice(Math.max(0, localStart - 20), localStart + 120);
  if (/\brather than pay\b/i.test(context)) return true;
  if (/\bas an additional cost\b/i.test(context)) return true;
  return false;
}

function matchIsStaticActionRestriction(paragraph: string, localStart: number, actionType: PrimitiveActionType): boolean {
  const windowStart = Math.max(0, localStart - 8);
  const lineStart = paragraph.lastIndexOf("\n", localStart) + 1;
  const clause = paragraph.slice(Math.min(lineStart, windowStart), localStart + 80);
  if (actionType === "cast" || actionType === "play") {
    if (/\bcan'?t cast\b/i.test(clause)) return true;
    if (/\bcan'?t be cast\b/i.test(clause)) return true;
  }
  if (actionType === "untap") {
    if (/\b(?:doesn't|don't|does not|cannot|can't) untap\b/i.test(clause)) return true;
  }
  return false;
}

function isCyclingDefinitionParagraph(paragraph: string): boolean {
  return /^Cycling \{/i.test(paragraph.trim());
}

function isAftermathDefinitionParagraph(paragraph: string): boolean {
  return /^Aftermath \(/i.test(paragraph.trim());
}

function insteadClauseSpan(paragraph: string): { localStart: number; text: string } | null {
  const m = paragraph.match(/\binstead (.+?)(?:\.|$)/i);
  if (!m || m.index === undefined || !m[1]) return null;
  const text = m[1].trim();
  const offset = m[0].indexOf(text);
  if (offset < 0) return null;
  return { localStart: m.index + offset, text };
}

function canonicalDedupePass(actions: OracleActionV1[]): OracleActionV1[] {
  const best = new Map<string, OracleActionV1>();
  for (const action of actions) {
    const key = [
      action.oracleId,
      action.faceId,
      String(action.abilityIndex),
      action.actionType,
      action.clauseId ?? String(action.evidenceStart),
    ].join("|");
    const existing = best.get(key);
    if (!existing || action.evidenceText.length > existing.evidenceText.length) {
      best.set(key, action);
    }
  }
  return [...best.values()].sort((a, b) => a.evidenceStart - b.evidenceStart || a.actionIndex - b.actionIndex);
}

function dedupeActions(rawActions: OracleActionV1[]): {
  actions: OracleActionV1[];
  canonicalKeyDuplicatesRemoved: number;
  semanticDuplicatesRemoved: number;
} {
  const afterCanonical = canonicalDedupePass(rawActions);
  const canonicalKeyDuplicatesRemoved = Math.max(0, rawActions.length - afterCanonical.length);
  const afterSemantic = filterDominatedActions(afterCanonical);
  const semanticDuplicatesRemoved = Math.max(0, afterCanonical.length - afterSemantic.length);
  return {
    actions: afterSemantic,
    canonicalKeyDuplicatesRemoved,
    semanticDuplicatesRemoved,
  };
}

function deriveRolesFromActions(actions: OracleActionV1[]): DerivedCardRole[] {
  const accepted = actions.filter((a) => a.reviewStatus === "accepted");
  const primitives = accepted.map((a) => a.actionType);
  const roles = inferDerivedRoles(primitives);
  return roles.map((role) => ({
    role,
    score: 0.75,
    evidenceActionIds: accepted
      .filter((a) => (PRIMITIVE_TO_DERIVED_ROLES[a.actionType] ?? []).includes(role as never))
      .map((a) => a.actionId),
    derivationVersion: "role-derivation-v2",
  })).filter((r) => r.evidenceActionIds.length > 0);
}

function roleToStructureKind(role: TextRole): StructureAnnotationKind {
  switch (role) {
    case "cost":
      return "cost";
    case "trigger_event":
      return "trigger_event";
    case "replacement_event":
      return "replacement_event";
    case "static_permission":
      return "static_permission";
    case "static_restriction":
      return "static_restriction";
    case "reminder_text":
      return "reminder_text";
    case "mechanic_reminder":
      return "mechanic_reminder";
    case "condition":
      return "condition_only";
    case "target_or_choice_structure":
      return "choice_or_target";
    default:
      return "condition_only";
  }
}

function emitSpanRoleStructureAnnotations(input: {
  oracleId: string;
  face?: SegmentedCardFace;
  ability: SegmentedAbility;
  parserVersion: string;
  annotationId: (parts: string[]) => string;
}): OracleAbilityStructureAnnotation[] {
  const { ability, face } = input;
  const faceId = face?.faceId ?? ability.cardFaceId;
  const paragraph = ability.paragraphText;
  const annotations: OracleAbilityStructureAnnotation[] = [];
  const faceEvidence = (cardStart: number, cardEnd: number) => ({
    cardEvidenceStart: cardStart,
    cardEvidenceEnd: cardEnd,
    faceEvidenceStart: face ? cardStart - face.start : undefined,
    faceEvidenceEnd: face ? cardEnd - face.start : undefined,
  });

  for (const span of findReminderSpans(paragraph)) {
    annotations.push({
      annotationId: input.annotationId([
        input.oracleId,
        faceId,
        String(ability.abilityIndex),
        span.role,
        span.text.slice(0, 40),
      ]),
      oracleId: input.oracleId,
      faceId,
      faceName: face?.faceName,
      faceIndex: face?.faceIndex,
      componentType: face?.componentType,
      abilityIndex: ability.abilityIndex,
      kind: roleToStructureKind(span.role),
      evidenceText: span.text,
      evidenceStart: ability.paragraphStart + span.localStart,
      evidenceEnd: ability.paragraphStart + span.localEnd,
      ...faceEvidence(ability.paragraphStart + span.localStart, ability.paragraphStart + span.localEnd),
      textRole: span.role,
      parserVersion: input.parserVersion,
      reviewStatus: "needs_review",
    });
  }

  for (const perm of extractStaticPermissions(paragraph)) {
    annotations.push({
      annotationId: input.annotationId([
        input.oracleId,
        faceId,
        String(ability.abilityIndex),
        "static-permission",
        perm.evidenceText.slice(0, 40),
      ]),
      oracleId: input.oracleId,
      faceId,
      faceName: face?.faceName,
      faceIndex: face?.faceIndex,
      componentType: face?.componentType,
      abilityIndex: ability.abilityIndex,
      kind: "static_permission",
      evidenceText: perm.evidenceText,
      evidenceStart: ability.paragraphStart + perm.localStart,
      evidenceEnd: ability.paragraphStart + perm.localEnd,
      ...faceEvidence(ability.paragraphStart + perm.localStart, ability.paragraphStart + perm.localEnd),
      textRole: "static_permission",
      permissionType: perm.permissionType,
      permittedFromZone: perm.permittedFromZone,
      permissionSubject: perm.permissionSubject,
      condition: perm.condition,
      parserVersion: input.parserVersion,
      reviewStatus: "needs_review",
    });
  }

  const trigEnd = paragraph.match(/^(When|Whenever|At the beginning of)[^,]+,\s*/i);
  if (trigEnd?.index === 0) {
    const eventText = trigEnd[0].trim();
    annotations.push({
      annotationId: input.annotationId([
        input.oracleId,
        faceId,
        String(ability.abilityIndex),
        "trigger-event",
        eventText.slice(0, 40),
      ]),
      oracleId: input.oracleId,
      faceId,
      faceName: face?.faceName,
      faceIndex: face?.faceIndex,
      componentType: face?.componentType,
      abilityIndex: ability.abilityIndex,
      kind: "trigger_event",
      evidenceText: eventText,
      evidenceStart: ability.paragraphStart,
      evidenceEnd: ability.paragraphStart + trigEnd[0].length,
      ...faceEvidence(ability.paragraphStart, ability.paragraphStart + trigEnd[0].length),
      textRole: "trigger_event",
      parserVersion: input.parserVersion,
      reviewStatus: "needs_review",
    });
  }

  const replMatch = paragraph.match(/\bIf (?:a |an |target |you |each |that )[^,]+ would [^,]+,\s*/i);
  if (replMatch?.index !== undefined) {
    annotations.push({
      annotationId: input.annotationId([
        input.oracleId,
        faceId,
        String(ability.abilityIndex),
        "replacement-event",
        replMatch[0].slice(0, 40),
      ]),
      oracleId: input.oracleId,
      faceId,
      faceName: face?.faceName,
      faceIndex: face?.faceIndex,
      componentType: face?.componentType,
      abilityIndex: ability.abilityIndex,
      kind: "replacement_event",
      evidenceText: replMatch[0].trim(),
      evidenceStart: ability.paragraphStart + replMatch.index,
      evidenceEnd: ability.paragraphStart + replMatch.index + replMatch[0].length,
      ...faceEvidence(
        ability.paragraphStart + replMatch.index,
        ability.paragraphStart + replMatch.index + replMatch[0].length,
      ),
      textRole: "replacement_event",
      parserVersion: input.parserVersion,
      reviewStatus: "needs_review",
    });
  }

  const colonIdx = paragraph.indexOf(":");
  if (colonIdx > 0 && colonIdx <= 80 && !/^(When|Whenever|At the beginning|If )/i.test(paragraph.trim())) {
    const costText = paragraph.slice(0, colonIdx).trim();
    if (costText.length > 0 && costText.length <= 80) {
      annotations.push({
      annotationId: input.annotationId([
        input.oracleId,
        faceId,
        String(ability.abilityIndex),
        "activated-cost",
        costText.slice(0, 40),
      ]),
      oracleId: input.oracleId,
      faceId,
      faceName: face?.faceName,
      faceIndex: face?.faceIndex,
      componentType: face?.componentType,
      abilityIndex: ability.abilityIndex,
      kind: "cost",
      evidenceText: costText,
      evidenceStart: ability.paragraphStart,
      evidenceEnd: ability.paragraphStart + colonIdx,
      ...faceEvidence(ability.paragraphStart, ability.paragraphStart + colonIdx),
      textRole: "cost",
      parserVersion: input.parserVersion,
      reviewStatus: "needs_review",
    });
    }
  }

  return annotations;
}

function isKeywordOnly(text: string): boolean {
  return /^[A-Z][a-z]+(?:, [a-z]+)*\.?$/.test(text.trim()) && text.length < 80;
}

/** Deterministic-first parser — abstains when evidence cannot be validated. */
export function extractOracleActionsV1(input: {
  oracleId: string;
  oracleText: string;
  cardFace?: string;
  /** When false, feature-specific promotion rules are disabled (for metric accounting baseline). */
  featurePromotion?: boolean;
}): OracleActionV1Result {
  extractionFeaturePromotion = input.featurePromotion !== false;
  const faces = segmentCardFaces(input.oracleText);
  const targetFaces = input.cardFace
    ? faces.filter((f) => f.faceId === input.cardFace)
    : faces;

  const abilities = targetFaces.flatMap((face, faceIndex) =>
    segmentAbilities(input.oracleId, face.faceId, face.text, face.start).map((a) => ({
      ...a,
      faceIndex: faces.findIndex((f) => f.faceId === face.faceId),
    })),
  );

  const rawActions: OracleActionV1[] = [];
  const abstainedClauses: OracleActionV1Result["abstainedClauses"] = [];
  let actionIndex = 0;

  for (const ability of abilities) {
    const face = faces.find((f) => f.faceId === ability.cardFaceId);
    if (!face) continue;
    let matched = false;
    const abilityMatches: OracleActionV1[] = [];

    const parentAbilityId = `${input.oracleId}:${ability.cardFaceId}:${ability.abilityIndex}`;

    for (const span of compoundClauseSpansWithRoles(ability.paragraphText, parentAbilityId)) {
      for (const rule of ACTION_PATTERNS) {
        for (const { match, index } of iterPatternMatches(span.text, rule.pattern)) {
          const action = acceptAction({
            oracleId: input.oracleId,
            oracleText: input.oracleText,
            face,
            faces,
            ability,
            match,
            rule,
            actionIndex,
            evidenceOffsetInParagraph: span.localStart + index,
            clause: span.clause,
          });
          if (!action) continue;
          abilityMatches.push(action);
          matched = true;
        }
      }
    }

    for (const granted of findGrantedQuoteContexts(ability.paragraphText, parentAbilityId)) {
      for (const span of grantedClauseSpans(granted)) {
        for (const rule of ACTION_PATTERNS) {
          for (const { match, index } of iterPatternMatches(span.text, rule.pattern)) {
            const action = acceptAction({
              oracleId: input.oracleId,
              oracleText: input.oracleText,
              face,
              faces,
              ability,
              match,
              rule,
              actionIndex,
              evidenceOffsetInParagraph: span.localStart + index,
              grantedContext: granted,
            });
            if (!action) continue;
            abilityMatches.push(action);
            matched = true;
          }
        }
      }
    }

    const insteadSpan = insteadClauseSpan(ability.paragraphText);
    if (insteadSpan) {
      for (const rule of ACTION_PATTERNS) {
        const match = insteadSpan.text.match(rule.pattern);
        if (!match) continue;
        const innerOffset = insteadSpan.text.indexOf(match[0]);
        if (innerOffset < 0) continue;
        const action = acceptAction({
          oracleId: input.oracleId,
          oracleText: input.oracleText,
          face,
          faces,
          ability,
          match,
          rule,
          actionIndex,
          replacementInsteadEffect: true,
          evidenceOffsetInParagraph: insteadSpan.localStart + innerOffset,
        });
        if (!action) continue;
        abilityMatches.push(action);
        matched = true;
      }
    }

    rawActions.push(...abilityMatches);

    if (!matched && ability.paragraphText.length > 24 && !isKeywordOnly(ability.paragraphText)) {
      abstainedClauses.push({
        text: ability.paragraphText,
        start: ability.paragraphStart,
        end: ability.paragraphEnd,
        reason: "no_deterministic_match",
      });
    }

    void face;
  }

  const preDedupCount = rawActions.length;
  const { actions, canonicalKeyDuplicatesRemoved, semanticDuplicatesRemoved } = dedupeActions(rawActions);
  const withOptionality = applyOptionalityPostProcess(actions, abilities, input.oracleText);

  const structureAnnotations: OracleAbilityStructureAnnotation[] = [];
  for (const ability of abilities) {
    const face = faces.find((f) => f.faceId === ability.cardFaceId);
    const inAbility = withOptionality.filter(
      (a) => a.faceId === ability.cardFaceId && a.abilityIndex === ability.abilityIndex,
    );
    structureAnnotations.push(
      ...emitStructureAnnotations({
        oracleId: input.oracleId,
        face,
        ability,
        existingInAbility: inAbility,
        parserVersion: ORACLE_ACTION_PARSER_VERSION,
        annotationId: actionId,
      }),
      ...emitSpanRoleStructureAnnotations({
        oracleId: input.oracleId,
        face,
        ability,
        parserVersion: ORACLE_ACTION_PARSER_VERSION,
        annotationId: actionId,
      }),
    );
  }

  const indexedActions = withOptionality.map((a, i) => ({ ...a, actionIndex: i }));
  const duplicateSuppressedCount = Math.max(0, preDedupCount - indexedActions.length);

  return {
    oracleId: input.oracleId,
    faceName: targetFaces[0]?.faceId,
    abilities,
    actions: indexedActions,
    structureAnnotations,
    derivedRoles: deriveRolesFromActions(indexedActions),
    abstainedClauses,
    duplicateSuppressedCount,
    canonicalKeyDuplicatesRemoved,
    semanticDuplicatesRemoved,
    rawEmissionCount: preDedupCount,
    modelAssistedLog: [],
  };
}

export function toLegacyExtractionResult(result: OracleActionV1Result): OracleActionExtractionResult {
  return {
    oracleId: result.oracleId,
    cardFaceId: result.faceName ?? "front",
    abilities: result.abilities,
    actions: result.actions.map((a) => ({
      actionId: a.actionId,
      oracleId: a.oracleId,
      cardFaceId: a.faceId,
      faceId: a.faceId,
      faceName: a.faceName,
      faceIndex: a.faceIndex,
      componentType: a.componentType,
      abilityIndex: a.abilityIndex,
      actionIndex: a.actionIndex,
      abilityType: a.abilityType,
      trigger: a.trigger ? { event: a.trigger } : undefined,
      costs: a.cost ? [{ type: a.cost }] : undefined,
      effects: [{
        actionType: a.actionType,
        sourceZone: a.sourceZones,
        destinationZone: a.destinationZones,
        objectTypes: a.affectedObjects,
        conditions: a.conditions,
        quantity: a.quantityConstraint,
      }],
      evidenceText: a.evidenceText,
      evidenceStart: a.evidenceStart,
      evidenceEnd: a.evidenceEnd,
      cardEvidenceStart: a.cardEvidenceStart,
      cardEvidenceEnd: a.cardEvidenceEnd,
      faceEvidenceStart: a.faceEvidenceStart,
      faceEvidenceEnd: a.faceEvidenceEnd,
      optionalEffect: a.optionalEffect,
      optionalCost: a.optionalCost,
      optionalityEvidenceText: a.optionalityEvidenceText,
      optionalityEvidenceStart: a.optionalityEvidenceStart,
      optionalityEvidenceEnd: a.optionalityEvidenceEnd,
      optionalityScopeId: a.optionalityScopeId,
      optionalityController: a.optionalityController,
      conditionType: a.conditionType,
      conditionText: a.conditionText,
      conditionEvidenceStart: a.conditionEvidenceStart,
      conditionEvidenceEnd: a.conditionEvidenceEnd,
      dependsOnActionIds: a.dependsOnActionIds,
      targetMinimum: a.targetMinimum,
      targetMaximum: a.targetMaximum,
      quantityMayBeZero: a.quantityMayBeZero,
      parserVersion: a.parserVersion,
      extractionMethod: a.extractionMethod === "manual" ? "manual_override" : a.extractionMethod,
      confidence: a.confidence,
      reviewStatus: a.reviewStatus === "overridden" ? "overridden" : a.reviewStatus,
    })),
    structureAnnotations: result.structureAnnotations,
    derivedRoles: result.derivedRoles,
    abstainedClauses: result.abstainedClauses,
  };
}
