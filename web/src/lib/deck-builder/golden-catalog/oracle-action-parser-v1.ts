/**
 * Oracle-action parser v1 — deterministic-first with abstention.
 */
import { createHash } from "node:crypto";
import type {
  DerivedCardRole,
  OracleAbilityType,
  OracleActionExtractionResult,
  SegmentedAbility,
} from "./oracle-action-schema";
import { ORACLE_ACTION_PARSER_VERSION } from "./oracle-action-schema";
import {
  classifyAbilityType,
  segmentAbilities,
  segmentCardFaces,
  validateEvidenceSpan,
} from "./oracle-ability-segmentation";
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
  faceName?: string;
  abilityIndex: number;
  actionIndex: number;
  abilityType: OracleActionV1AbilityType;
  actionType: PrimitiveActionType;
  sourceZones?: string[];
  destinationZones?: string[];
  affectedObjects?: string[];
  conditions?: string[];
  optional: boolean;
  evidenceText: string;
  evidenceStart: number;
  evidenceEnd: number;
  extractionMethod: OracleActionV1ExtractionMethod;
  confidence: number;
  parserVersion: string;
  reviewStatus: OracleActionV1ReviewStatus;
  actionId: string;
  trigger?: string;
  cost?: string;
}

export interface OracleActionV1Result {
  oracleId: string;
  faceName?: string;
  abilities: SegmentedAbility[];
  actions: OracleActionV1[];
  derivedRoles: DerivedCardRole[];
  abstainedClauses: Array<{ text: string; start: number; end: number; reason: string }>;
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
}

const ACTION_PATTERNS: ActionPattern[] = [
  { pattern: /\bdraw (?:a |one |two |three |four |five |seven |up to \w+ )?cards?\b/i, actionType: "draw", destinationZones: ["hand"], affectedObjects: ["card"] },
  { pattern: /\bDraw (?:a |one |two |three |four |five |seven |up to \w+ )?cards?\b/, actionType: "draw", destinationZones: ["hand"], affectedObjects: ["card"] },
  { pattern: /\bAdd \{[^}]+\}(?:\{[^}]+\})*/i, actionType: "add_mana", abilityType: "activated", destinationZones: ["mana_pool"] },
  { pattern: /\bAdd (?:one mana of any color|three mana of any one color|\{C\}{1,2}|\{[WUBRG]\})/i, actionType: "add_mana", destinationZones: ["mana_pool"] },
  { pattern: /\bsearch (?:your )?library for\b/i, actionType: "search_library", sourceZones: ["library"], destinationZones: ["hand", "battlefield", "library"] },
  { pattern: /\bDestroy all [\w ]+/i, actionType: "destroy", sourceZones: ["battlefield"], affectedObjects: ["permanent"] },
  { pattern: /\beach creature gets [-−]/i, actionType: "destroy", sourceZones: ["battlefield"], affectedObjects: ["creature"] },
  { pattern: /\bDestroy (?:target|up to (?:one|two|three) target) [\w ]+/i, actionType: "destroy", sourceZones: ["battlefield"], affectedObjects: ["permanent"] },
  { pattern: /\bExile (?:target|up to (?:one|two|three) target|all|the top) [\w ]+/i, actionType: "exile", destinationZones: ["exile"] },
  { pattern: /\bexile (?:target|the top|a \w+ card from)/i, actionType: "exile", destinationZones: ["exile"] },
  { pattern: /\bCounter (?:target|up to one target) [\w ]+/i, actionType: "counter", sourceZones: ["stack"], affectedObjects: ["spell", "ability"] },
  { pattern: /\bReturn (?:target|up to (?:one|two) target) [\w ]+ to (?:its|their) owner'?s hand\b/i, actionType: "return_to_hand", sourceZones: ["battlefield"], destinationZones: ["hand"] },
  { pattern: /\bReturn target [\w ]+ from (?:your )?graveyard to your hand\b/i, actionType: "return_to_battlefield", sourceZones: ["graveyard"], destinationZones: ["hand"] },
  { pattern: /\bSacrifice (?:a |an |target |up to one target )?[\w ]+/i, actionType: "sacrifice", sourceZones: ["battlefield"] },
  { pattern: /\bcreate (?:a |an |one |up to \w+ )?(?:[\w-]+ )*tokens?\b/i, actionType: "create_token", destinationZones: ["battlefield"], affectedObjects: ["token"] },
  { pattern: /\bCopy target (?:instant|sorcery|spell|[\w ]+)/i, actionType: "copy", sourceZones: ["stack", "battlefield"] },
  { pattern: /\bcopy target (?:instant|sorcery|spell|[\w ]+)/i, actionType: "copy", sourceZones: ["stack", "battlefield"] },
  { pattern: /\b(?:return|put) target [\w ]+ (?:card )?from (?:your )?graveyard (?:to your hand|onto the battlefield)/i, actionType: "return_to_battlefield", sourceZones: ["graveyard"], destinationZones: ["hand", "battlefield"] },
  { pattern: /\bPut target [\w ]+ (?:card )?from a graveyard onto the battlefield/i, actionType: "return_to_battlefield", sourceZones: ["graveyard"], destinationZones: ["battlefield"] },
  { pattern: /\b(?:play|cast) (?:lands and )?spells? from (?:your )?graveyard\b/i, actionType: "play", sourceZones: ["graveyard"], destinationZones: ["stack", "battlefield"] },
  { pattern: /\b(?:play|cast) (?:it|that card|the exiled card|lands and spells|any number of spells) (?:from exile|this turn|without paying)/i, actionType: "cast", sourceZones: ["exile"], optional: true },
  { pattern: /\bMill (?:target )?(?:player|cards|\d+|up to \w+ cards)/i, actionType: "mill", sourceZones: ["library"], destinationZones: ["graveyard"] },
  { pattern: /\b(?:discard|discards) (?:a |one |two |three |up to \w+ )?cards?\b/i, actionType: "discard", sourceZones: ["hand"], destinationZones: ["graveyard"] },
  { pattern: /\bdeals? \d+ damage(?: to (?:any target|target [\w ]+|each [\w ]+))?/i, actionType: "deal_damage", affectedObjects: ["player", "permanent"] },
  { pattern: /\bgain \d+ life\b/i, actionType: "gain_life", affectedObjects: ["player"] },
  { pattern: /\bloses? \d+ life\b/i, actionType: "lose_life", affectedObjects: ["player"] },
  { pattern: /\bScry \d+\b/i, actionType: "scry", sourceZones: ["library"] },
  { pattern: /\bSurveil \d+\b/i, actionType: "surveil", sourceZones: ["library"], destinationZones: ["graveyard"] },
  { pattern: /\bTap target [\w ]+/i, actionType: "tap", sourceZones: ["battlefield"] },
  { pattern: /\bPut (?:a |one |up to one )?\+?\/?\+?\d+\/?\+?\d+ counter/i, actionType: "put_counter", destinationZones: ["battlefield"] },
  { pattern: /\bexile it instead\b/i, actionType: "exile", abilityType: "replacement", destinationZones: ["exile"] },
  { pattern: /\bshuffle (?:your |their )?(?:hand and graveyard|graveyard and hand|hand) into (?:your |their )?library\b/i, actionType: "shuffle_into_library", sourceZones: ["hand", "graveyard"], destinationZones: ["library"] },
  { pattern: /\bExile all cards from target player'?s library\b/i, actionType: "exile", sourceZones: ["library"], destinationZones: ["exile"] },
  { pattern: /\bfrom (?:your )?graveyard\b/i, actionType: "play", sourceZones: ["graveyard"] },
];

function actionId(parts: string[]): string {
  return createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 24);
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

function acceptAction(input: {
  oracleId: string;
  oracleText: string;
  faceName: string;
  ability: SegmentedAbility;
  match: RegExpMatchArray;
  rule: ActionPattern;
  actionIndex: number;
}): OracleActionV1 | null {
  const evidenceText = input.match[0];
  const localStart = input.ability.paragraphText.indexOf(evidenceText);
  if (localStart < 0) return null;

  const evidenceStart = input.ability.paragraphStart + localStart;
  const evidenceEnd = evidenceStart + evidenceText.length;
  const span = validateEvidenceSpan(input.oracleText, evidenceText, evidenceStart, evidenceEnd);
  if (!span.valid) return null;

  const classified =
    input.ability.abilityType === "unknown"
      ? classifyAbilityType(input.ability.paragraphText)
      : input.ability.abilityType;
  const abilityType = input.rule.abilityType ?? toV1AbilityType(classified);
  const zones = inferZones(input.ability.paragraphText);
  const optional = input.rule.optional ?? /\bYou may\b|\bup to\b/i.test(input.ability.paragraphText);

  const conditions: string[] = [];
  const intervening = input.ability.paragraphText.match(/\bif (?:it|that|you|they|there)[^.]+\./i);
  if (intervening) conditions.push(intervening[0].trim());

  return {
    actionId: actionId([
      input.oracleId,
      input.faceName,
      String(input.ability.abilityIndex),
      String(input.actionIndex),
      evidenceText,
    ]),
    oracleId: input.oracleId,
    faceName: input.faceName === "front" ? undefined : input.faceName,
    abilityIndex: input.ability.abilityIndex,
    actionIndex: input.actionIndex,
    abilityType,
    actionType: input.rule.actionType,
    sourceZones: input.rule.sourceZones ?? zones.source,
    destinationZones: input.rule.destinationZones ?? zones.dest,
    affectedObjects: input.rule.affectedObjects,
    conditions: conditions.length ? conditions : undefined,
    optional,
    evidenceText,
    evidenceStart,
    evidenceEnd,
    extractionMethod: "deterministic",
    confidence: 0.88,
    parserVersion: ORACLE_ACTION_PARSER_VERSION,
    reviewStatus: "accepted",
    trigger: abilityType === "triggered" ? extractTrigger(input.ability.paragraphText) : undefined,
    cost: abilityType === "activated" || /^[+\−-]\d+:/.test(input.ability.paragraphText)
      ? extractCost(input.ability.paragraphText)
      : undefined,
  };
}

function deriveRolesFromActions(actions: OracleActionV1[]): DerivedCardRole[] {
  const primitives = actions.map((a) => a.actionType);
  const roles = inferDerivedRoles(primitives);
  return roles.map((role) => ({
    role,
    score: 0.75,
    evidenceActionIds: actions
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

  const abilities = targetFaces.flatMap((face) =>
    segmentAbilities(input.oracleId, face.faceId, face.text, face.start),
  );

  const actions: OracleActionV1[] = [];
  const seenEvidence = new Set<string>();
  const abstainedClauses: OracleActionV1Result["abstainedClauses"] = [];
  let actionIndex = 0;

  for (const ability of abilities) {
    let matched = false;

    for (const rule of ACTION_PATTERNS) {
      const match = ability.paragraphText.match(rule.pattern);
      if (!match) continue;

      const dedupeKey = `${ability.abilityIndex}:${match[0]}`;
      if (seenEvidence.has(dedupeKey)) continue;

      const action = acceptAction({
        oracleId: input.oracleId,
        oracleText: input.oracleText,
        faceName: ability.cardFaceId,
        ability,
        match,
        rule,
        actionIndex,
      });

      if (!action) continue;

      seenEvidence.add(dedupeKey);
      matched = true;
      actions.push({ ...action, actionIndex: actionIndex++ });
    }

    if (!matched && ability.paragraphText.length > 24 && !isKeywordOnly(ability.paragraphText)) {
      abstainedClauses.push({
        text: ability.paragraphText,
        start: ability.paragraphStart,
        end: ability.paragraphEnd,
        reason: "no_deterministic_match",
      });
    }
  }

  return {
    oracleId: input.oracleId,
    faceName: targetFaces[0]?.faceId,
    abilities,
    actions,
    derivedRoles: deriveRolesFromActions(actions),
    abstainedClauses,
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
      cardFaceId: a.faceName ?? "front",
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
      }],
      evidenceText: a.evidenceText,
      evidenceStart: a.evidenceStart,
      evidenceEnd: a.evidenceEnd,
      parserVersion: a.parserVersion,
      extractionMethod: a.extractionMethod === "manual" ? "manual_override" : a.extractionMethod,
      confidence: a.confidence,
      reviewStatus: a.reviewStatus === "overridden" ? "overridden" : a.reviewStatus === "accepted" ? "accepted" : "needs_review",
    })),
    derivedRoles: result.derivedRoles,
    abstainedClauses: result.abstainedClauses,
  };
}
