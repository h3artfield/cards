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
  { pattern: /\bdraws? (?:a |one |two |three |four |five |seven |up to \w+ )?cards?\b/i, actionType: "draw", destinationZones: ["hand"], affectedObjects: ["card"] },
  { pattern: /\bYou may draw [\w ]+/i, actionType: "draw", destinationZones: ["hand"], affectedObjects: ["card"] },
  { pattern: /\bYou may sacrifice [\w ]+/i, actionType: "sacrifice", sourceZones: ["battlefield"] },
  { pattern: /\bYou may exile [\w ]+/i, actionType: "exile", destinationZones: ["exile"] },
  { pattern: /\bYou may destroy [\w ]+/i, actionType: "destroy", sourceZones: ["battlefield"] },
  { pattern: /\bYou may counter [\w ]+/i, actionType: "counter", sourceZones: ["stack"] },
  { pattern: /\bYou may return [\w ]+/i, actionType: "return_to_hand", destinationZones: ["hand"] },
  { pattern: /\bYou may discard [\w ]+/i, actionType: "discard", sourceZones: ["hand"], destinationZones: ["graveyard"] },
  { pattern: /\bYou may put [\w ]+ onto the battlefield/i, actionType: "search_library", destinationZones: ["battlefield"] },
  { pattern: /\bYou may cast this spell from your graveyard\b/i, actionType: "cast", sourceZones: ["graveyard"], requiresPermissionVerb: true },
  { pattern: /\bYou may cast the copy\b/i, actionType: "cast", sourceZones: ["exile", "stack"], requiresPermissionVerb: true },
  { pattern: /\byou may play that card\b/i, actionType: "play", sourceZones: ["exile"], requiresPermissionVerb: true },
  { pattern: /\bplay an additional land\b/i, actionType: "play", sourceZones: ["hand"], requiresPermissionVerb: true },
  { pattern: CAST_SPELLS_FROM, actionType: "cast", sourceZones: ["graveyard", "exile"], requiresPermissionVerb: true },
  { pattern: PLAY_LANDS, actionType: "play", sourceZones: ["hand", "graveyard"], requiresPermissionVerb: true },
  { pattern: /\bput (?:a |one )?card from your hand on top of your library\b/i, actionType: "search_library", sourceZones: ["hand"], destinationZones: ["library"] },
  { pattern: /\bYou may play (?!(?:lands and cast|lands and spells))[\w ]+/i, actionType: "play", requiresPermissionVerb: true },
  { pattern: /\bDraw (?:a |one |two |three |four |five |seven |up to \w+ )?cards?\b/, actionType: "draw", destinationZones: ["hand"], affectedObjects: ["card"] },
  { pattern: /\bAdd \{[^}]+\}(?:\{[^}]+\})*/i, actionType: "add_mana", abilityType: "activated", destinationZones: ["mana_pool"] },
  { pattern: /\bAdd (?:one mana of any color|three mana of any one color|\{C\}{1,2}|\{[WUBRG]\})/i, actionType: "add_mana", destinationZones: ["mana_pool"] },
  { pattern: /\bsearch (?:your |their )?library for\b/i, actionType: "search_library", sourceZones: ["library"], destinationZones: ["hand", "battlefield", "library"] },
  { pattern: /\bDestroy all [\w ]+/i, actionType: "destroy", sourceZones: ["battlefield"], affectedObjects: ["permanent"] },
  { pattern: /\beach creature gets [-−]/i, actionType: "destroy", sourceZones: ["battlefield"], affectedObjects: ["creature"] },
  { pattern: /\bDestroy (?:target|up to (?:one|two|three) target) [\w ]+/i, actionType: "destroy", sourceZones: ["battlefield"], affectedObjects: ["permanent"] },
  { pattern: /\bExile (?:target|up to (?:one|two|three) target|all|the top) [\w ]+/i, actionType: "exile", destinationZones: ["exile"] },
  { pattern: /\bexile (?:target|the top|a \w+ card from)/i, actionType: "exile", destinationZones: ["exile"] },
  { pattern: /\bCounter (?:target|up to one target) [\w ]+/i, actionType: "counter", sourceZones: ["stack"], affectedObjects: ["spell", "ability"] },
  { pattern: /\bReturn (?:target|up to (?:one|two) target) [\w ]+ to (?:its|their) owner'?s hand\b/i, actionType: "return_to_hand", sourceZones: ["battlefield"], destinationZones: ["hand"] },
  { pattern: /\bReturn target [\w ]+ from (?:your )?graveyard to your hand\b/i, actionType: "return_to_battlefield", sourceZones: ["graveyard"], destinationZones: ["hand"] },
  { pattern: /\bReturn (?:target|up to (?:one|two) target) [\w ]+ (?:card )?from (?:your )?graveyard to (?:your hand|the battlefield)\b/i, actionType: "return_to_battlefield", sourceZones: ["graveyard"], destinationZones: ["hand", "battlefield"] },
  { pattern: /\bPut target [\w ]+ (?:card )?from a graveyard onto the battlefield\b/i, actionType: "return_to_battlefield", sourceZones: ["graveyard"], destinationZones: ["battlefield"] },
  { pattern: /\bSacrifice (?:a |an |target |up to one target )?[\w ]+/i, actionType: "sacrifice", sourceZones: ["battlefield"] },
  { pattern: /\b(?:create|creates|You may create) (?:a |an |one |up to \w+ )?(?:[\w-/]+ )*tokens?\b/i, actionType: "create_token", destinationZones: ["battlefield"], affectedObjects: ["token"] },
  { pattern: /\bCopy target (?:instant|sorcery|spell|triggered|[\w ]+)/i, actionType: "copy", sourceZones: ["stack", "battlefield"] },
  { pattern: /\bcopy target (?:instant|sorcery|spell|triggered|[\w ]+)/i, actionType: "copy", sourceZones: ["stack", "battlefield"] },
  { pattern: /\bcopy (?:that spell|the exiled card|it)\b/i, actionType: "copy", sourceZones: ["stack", "exile"] },
  { pattern: CAST_PERMISSION, actionType: "cast", sourceZones: ["graveyard", "exile", "stack"], requiresPermissionVerb: true },
  { pattern: PLAY_PERMISSION, actionType: "play", sourceZones: ["graveyard", "exile", "hand"], requiresPermissionVerb: true },
  { pattern: /\bMill (?:target )?(?:player|cards|\d+|up to \w+ cards)/i, actionType: "mill", sourceZones: ["library"], destinationZones: ["graveyard"] },
  { pattern: /\bmills? (?:half|fourteen|\d+|up to \w+) [\w ]*/i, actionType: "mill", sourceZones: ["library"], destinationZones: ["graveyard"] },
  { pattern: /\b(?:discard|discards) (?:a |one |two |three |their |up to \w+ )?[\w ]*cards?\b/i, actionType: "discard", sourceZones: ["hand"], destinationZones: ["graveyard"] },
  { pattern: /\bdeals? \d+ damage(?: to (?:any target|target [\w ]+|each [\w ]+))?/i, actionType: "deal_damage", affectedObjects: ["player", "permanent"] },
  { pattern: /\bgains? \d+ life\b/i, actionType: "gain_life", affectedObjects: ["player"] },
  { pattern: /\bloses? \d+ life\b/i, actionType: "lose_life", affectedObjects: ["player"] },
  { pattern: /\bScry \d+\b/i, actionType: "scry", sourceZones: ["library"] },
  { pattern: /\bSurveil \d+\b/i, actionType: "surveil", sourceZones: ["library"], destinationZones: ["graveyard"] },
  { pattern: /\bTap target [\w ]+/i, actionType: "tap", sourceZones: ["battlefield"] },
  { pattern: /\bUntap (?:target |two |three |four |five |\d+ )?[\w ]+/i, actionType: "untap", sourceZones: ["battlefield"] },
  { pattern: /\bPut (?:a |one |up to one )?\+?\/?\+?\d+\/?\+?\d+ counter/i, actionType: "put_counter", destinationZones: ["battlefield"] },
  { pattern: /\bexile it instead\b/i, actionType: "exile", abilityType: "replacement", destinationZones: ["exile"] },
  { pattern: /\b(?:shuffle|shuffles) (?:your |their )?(?:hand and graveyard|graveyard and hand|hand) into (?:your |their )?library\b/i, actionType: "shuffle_into_library", sourceZones: ["hand", "graveyard"], destinationZones: ["library"] },
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

function canPromoteToAccepted(input: {
  abilityType: OracleActionV1AbilityType;
  actionType: PrimitiveActionType;
  confidence: number;
  paragraph: string;
  evidenceText: string;
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
  const benignThen = tutorThenShuffle || /\bthen draw\b/i.test(input.paragraph);
  const compoundThen = /\bthen\b/i.test(input.paragraph) && !benignThen;

  if (compoundThen || input.abilityType === "replacement") return false;

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
    "put_counter",
    "shuffle_into_library",
  ];
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
  componentType: CardFaceComponentType;
  face?: SegmentedCardFace;
  faces?: SegmentedCardFace[];
  cardEvidenceStart?: number;
  cardEvidenceEnd?: number;
  replacementInsteadEffect?: boolean;
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

  if (canPromoteToAccepted(input)) return "accepted";

  if (input.confidence < 0.82) return "needs_review";
  if (/\bthen\b|\band then\b/i.test(input.paragraph)) return "needs_review";
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
}): OracleActionV1 | null {
  const evidenceText = input.match[0];
  const baseLocalStart =
    input.evidenceOffsetInParagraph ?? input.ability.paragraphText.indexOf(evidenceText);
  const localStart = baseLocalStart;
  if (localStart < 0) return null;

  if (matchStartsInTriggerCondition(input.ability.paragraphText, localStart)) {
    return null;
  }
  if (matchInsideReminderParenthetical(input.ability.paragraphText, localStart)) {
    return null;
  }
  if (
    input.rule.actionType === "cast" &&
    matchIsSpuriousCastPermission(input.ability.paragraphText, localStart, evidenceText)
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
  if (
    /\bthen\b/i.test(input.ability.paragraphText) &&
    !/\bthen draw\b/i.test(input.ability.paragraphText) &&
    !tutorThenShuffle
  ) {
    confidence = 0.8;
  }

  const reviewStatus = assignReviewStatus({
    abilityType,
    actionType: input.rule.actionType,
    confidence,
    paragraph: input.ability.paragraphText,
    evidenceText,
    componentType: input.face.componentType,
    face: input.face,
    faces: input.faces,
    cardEvidenceStart,
    cardEvidenceEnd,
    replacementInsteadEffect: input.replacementInsteadEffect,
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
    actionType: input.rule.actionType,
    sourceZones: input.rule.sourceZones ?? zones.source,
    destinationZones: input.rule.destinationZones ?? zones.dest,
    affectedObjects: input.rule.affectedObjects,
    conditions: conditions.length ? conditions : undefined,
    quantityConstraint,
    optional: optionalEffect,
    optionalEffect,
    targetMinimum: targetConstraint.targetMinimum,
    targetMaximum: targetConstraint.targetMaximum,
    quantityMayBeZero: targetConstraint.quantityMayBeZero,
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
    trigger: abilityType === "triggered" ? extractTrigger(input.ability.paragraphText) : undefined,
    cost: abilityType === "activated" || /^[+\−-]\d+:/.test(input.ability.paragraphText)
      ? extractCost(input.ability.paragraphText)
      : undefined,
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

function matchStartsInTriggerCondition(paragraph: string, localMatchStart: number): boolean {
  if (!/^(When|Whenever) /i.test(paragraph.trim())) return false;
  const commaIdx = paragraph.indexOf(", ");
  if (commaIdx < 0) return false;
  return localMatchStart < commaIdx;
}

function matchInsideReminderParenthetical(paragraph: string, localStart: number): boolean {
  const before = paragraph.slice(0, localStart);
  const openIdx = before.lastIndexOf("(");
  if (openIdx < 0) return false;
  const parenSlice = paragraph.slice(openIdx);
  return /^\((?:As (?:this|a) |\(As this )/i.test(parenSlice);
}

function matchIsSpuriousCastPermission(paragraph: string, localStart: number, evidenceText: string): boolean {
  const context = paragraph.slice(Math.max(0, localStart - 40), localStart + evidenceText.length + 40);
  if (/\badditional cost to cast this\b/i.test(context)) return true;
  if (/\bYou may cast this spell as though\b/i.test(context)) return true;
  if (/\bYou may cast this spell only if\b/i.test(context)) return true;
  return false;
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

function isKeywordOnly(text: string): boolean {
  return /^[A-Z][a-z]+(?:, [a-z]+)*\.?$/.test(text.trim()) && text.length < 80;
}

/** Deterministic-first parser — abstains when evidence cannot be validated. */
export function extractOracleActionsV1(input: {
  oracleId: string;
  oracleText: string;
  cardFace?: string;
}): OracleActionV1Result {
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

    for (const rule of ACTION_PATTERNS) {
      const match = ability.paragraphText.match(rule.pattern);
      if (!match) continue;

      const action = acceptAction({
        oracleId: input.oracleId,
        oracleText: input.oracleText,
        face,
        faces,
        ability,
        match,
        rule,
        actionIndex,
      });

      if (!action) continue;
      abilityMatches.push(action);
      matched = true;
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
