/**
 * Oracle-action parser v1 — deterministic-first with abstention.
 * Pipeline: faces → abilities → classification → trigger/cost/effect → evidence validation.
 */
import { createHash } from "node:crypto";
import type {
  DerivedCardRole,
  OracleAbilityType,
  OracleActionExtractionResult,
  SegmentedAbility,
} from "./oracle-action-schema";
import {
  ORACLE_ACTION_PARSER_VERSION,
} from "./oracle-action-schema";
import {
  classifyAbilityType,
  segmentAbilities,
  segmentCardFaces,
  validateEvidenceSpan,
} from "./oracle-ability-segmentation";

export type OracleActionV1AbilityType =
  | "spell_effect"
  | "activated"
  | "triggered"
  | "static"
  | "replacement";

export type OracleActionV1ReviewStatus =
  | "accepted"
  | "needs_review"
  | "overridden";

export type OracleActionV1ExtractionMethod =
  | "deterministic"
  | "model_assisted"
  | "manual";

/** Production action record — every field must be evidence-anchored. */
export interface OracleActionV1 {
  oracleId: string;
  faceName?: string;
  abilityIndex: number;
  actionIndex: number;

  abilityType: OracleActionV1AbilityType;
  actionType: string;
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

  /** Stable id for role derivation references. */
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
  actionType: string;
  abilityType?: OracleActionV1AbilityType;
  optional?: boolean;
  sourceZones?: string[];
  destinationZones?: string[];
  affectedObjects?: string[];
  trigger?: (match: RegExpMatchArray) => string | undefined;
  cost?: (match: RegExpMatchArray) => string | undefined;
}

const ZONE_FROM_GY = /\bfrom (?:your )?graveyard\b/i;
const ZONE_TO_GY = /\binto (?:your )?graveyard\b/i;
const ZONE_FROM_EXILE = /\bfrom exile\b/i;
const ZONE_TO_EXILE = /\b(?:exile|Exile)\b/i;
const ZONE_FROM_HAND = /\bfrom (?:your )?hand\b/i;
const ZONE_TO_HAND = /\binto (?:your )?hand\b/i;
const ZONE_TO_BF = /\bonto the battlefield\b/i;
const ZONE_FROM_BF = /\bon the battlefield\b/i;
const ZONE_LIBRARY = /\b(?:search|shuffle|reveal).*library\b/i;

const ACTION_PATTERNS: ActionPattern[] = [
  {
    pattern: /\bdraw (?:a |one |two |three |four |\d+ )?cards?\b/i,
    actionType: "draw",
    affectedObjects: ["card"],
    destinationZones: ["hand"],
  },
  {
    pattern: /\bAdd \{[^}]+\}(?:\{[^}]+\})*/i,
    actionType: "add_mana",
    abilityType: "activated",
    destinationZones: ["mana_pool"],
  },
  {
    pattern: /\bAdd (?:one mana of any color|{C}{C}|\{C\}|\{W\}|\{U\}|\{B\}|\{R\}|\{G\})/i,
    actionType: "add_mana",
    destinationZones: ["mana_pool"],
  },
  {
    pattern: /\bsearch (?:your )?library for (?:a |an |up to \d+ )?[\w ]+/i,
    actionType: "tutor",
    sourceZones: ["library"],
    destinationZones: ["hand", "battlefield", "library"],
  },
  {
    pattern: /\bDestroy all [\w ]+/i,
    actionType: "board_wipe",
    sourceZones: ["battlefield"],
    affectedObjects: ["permanent"],
  },
  {
    pattern: /\bDestroy (?:target|up to one target) [\w ]+/i,
    actionType: "destroy",
    sourceZones: ["battlefield"],
    affectedObjects: ["permanent"],
  },
  {
    pattern: /\bExile (?:target|up to one target|all) [\w ]+/i,
    actionType: "exile",
    sourceZones: ["battlefield", "graveyard", "hand", "stack"],
    destinationZones: ["exile"],
    affectedObjects: ["permanent", "card"],
  },
  {
    pattern: /\bCounter target (?:spell|ability|[\w ]+)/i,
    actionType: "counter",
    sourceZones: ["stack"],
    affectedObjects: ["spell", "ability"],
  },
  {
    pattern: /\bReturn (?:target|up to one target) [\w ]+ to (?:its|their) owner'?s hand\b/i,
    actionType: "bounce",
    sourceZones: ["battlefield"],
    destinationZones: ["hand"],
    affectedObjects: ["permanent"],
  },
  {
    pattern: /\bSacrifice (?:a |an |target |up to one target )?[\w ]+/i,
    actionType: "sacrifice",
    sourceZones: ["battlefield"],
    affectedObjects: ["permanent"],
  },
  {
    pattern: /\bcreate (?:a |one |\d+\/\d+ )?(?:[\w-]+ )*tokens?\b/i,
    actionType: "create_token",
    destinationZones: ["battlefield"],
    affectedObjects: ["token"],
  },
  {
    pattern: /\bCopy target (?:spell|[\w ]+)/i,
    actionType: "copy",
    sourceZones: ["stack", "battlefield"],
    affectedObjects: ["spell", "permanent"],
  },
  {
    pattern: /\b(?:return|put) (?:target )?[\w ]+ (?:card )?from (?:your )?graveyard (?:to your hand|onto the battlefield)/i,
    actionType: "reanimate",
    sourceZones: ["graveyard"],
    destinationZones: ["hand", "battlefield"],
    affectedObjects: ["creature", "permanent"],
  },
  {
    pattern: /\bMill (?:target )?(?:player|cards|\d+)/i,
    actionType: "mill",
    sourceZones: ["library"],
    destinationZones: ["graveyard"],
    affectedObjects: ["card"],
  },
  {
    pattern: /\bdiscard (?:a |one |two |three |\d+ )?cards?\b/i,
    actionType: "discard",
    sourceZones: ["hand"],
    destinationZones: ["graveyard"],
    affectedObjects: ["card"],
  },
  {
    pattern: /\b(?:cast|play) (?:it|that card|the exiled card|spells?) (?:from exile|this turn|without paying)/i,
    actionType: "cast_from_exile",
    sourceZones: ["exile"],
    destinationZones: ["stack", "battlefield"],
    optional: true,
  },
  {
    pattern: /\b(?:hexproof|shroud|indestructible|prevented|can't be (?:destroyed|targeted)|phases out)\b/i,
    actionType: "protection",
    abilityType: "static",
  },
  {
    pattern: /\bIf you would [\w ,]+ instead\b/i,
    actionType: "replacement",
    abilityType: "replacement",
  },
  {
    pattern: /\bYou may [\w ,]+(?:\.|,)/i,
    actionType: "optional_effect",
    optional: true,
  },
  {
    pattern: /\bup to (?:one|two|three|\d+) target [\w ]+/i,
    actionType: "targeted_effect",
    optional: true,
  },
  {
    pattern: /\bdeals? \d+ damage to (?:any target|target [\w ]+|each [\w ]+)/i,
    actionType: "deal_damage",
    affectedObjects: ["player", "permanent"],
  },
  {
    pattern: /\bgain \d+ life\b/i,
    actionType: "gain_life",
    affectedObjects: ["player"],
  },
  {
    pattern: /\bloses? \d+ life\b/i,
    actionType: "lose_life",
    affectedObjects: ["player"],
  },
  {
    pattern: /\bScry \d+\b/i,
    actionType: "scry",
    sourceZones: ["library"],
  },
  {
    pattern: /\bSurveil \d+\b/i,
    actionType: "surveil",
    sourceZones: ["library"],
    destinationZones: ["graveyard"],
  },
];

function actionId(parts: string[]): string {
  return createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 24);
}

function toV1AbilityType(type: OracleAbilityType | "unknown"): OracleActionV1AbilityType {
  if (type === "preventing" || type === "special_action") return "static";
  if (type === "unknown") return "spell_effect";
  return type;
}

function inferZones(text: string): { source?: string[]; dest?: string[] } {
  const source = new Set<string>();
  const dest = new Set<string>();
  if (ZONE_FROM_GY.test(text)) source.add("graveyard");
  if (ZONE_TO_GY.test(text)) dest.add("graveyard");
  if (ZONE_FROM_EXILE.test(text)) source.add("exile");
  if (ZONE_TO_EXILE.test(text)) dest.add("exile");
  if (ZONE_FROM_HAND.test(text)) source.add("hand");
  if (ZONE_TO_HAND.test(text)) dest.add("hand");
  if (ZONE_TO_BF.test(text)) dest.add("battlefield");
  if (ZONE_FROM_BF.test(text)) source.add("battlefield");
  if (ZONE_LIBRARY.test(text)) source.add("library");
  return {
    source: source.size ? [...source] : undefined,
    dest: dest.size ? [...dest] : undefined,
  };
}

function extractCostFromParagraph(paragraph: string): string | undefined {
  const activated = paragraph.match(/^\{[^}]+\}(?:\{[^}]+\})*:?\s*/);
  if (activated) return activated[0].trim();
  const additional = paragraph.match(/As an additional cost[^.]+\./i);
  if (additional) return additional[0];
  return undefined;
}

function extractTriggerFromParagraph(paragraph: string): string | undefined {
  const m = paragraph.match(/^(When|Whenever|At the beginning of|At end of)[^.]+\./i);
  return m?.[0]?.trim();
}

function acceptAction(
  input: {
    oracleId: string;
    oracleText: string;
    faceName: string;
    ability: SegmentedAbility;
    match: RegExpMatchArray;
    rule: ActionPattern;
    actionIndex: number;
  },
): OracleActionV1 | null {
  const evidenceText = matchText(input.match);
  const localStart = input.ability.paragraphText.indexOf(evidenceText);
  if (localStart < 0) return null;

  const evidenceStart = input.ability.paragraphStart + localStart;
  const evidenceEnd = evidenceStart + evidenceText.length;
  const span = validateEvidenceSpan(
    input.oracleText,
    evidenceText,
    evidenceStart,
    evidenceEnd,
  );
  if (!span.valid) return null;

  const abilityType =
    input.rule.abilityType ??
    toV1AbilityType(
      input.ability.abilityType === "unknown"
        ? classifyAbilityType(input.ability.paragraphText)
        : input.ability.abilityType,
    );

  const zones = inferZones(input.ability.paragraphText);
  const optional =
    input.rule.optional ??
    /\bYou may\b|\bup to\b/i.test(evidenceText);

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
    confidence: 0.85,
    parserVersion: ORACLE_ACTION_PARSER_VERSION,
    reviewStatus: "accepted",
    trigger:
      abilityType === "triggered"
        ? input.rule.trigger?.(input.match) ?? extractTriggerFromParagraph(input.ability.paragraphText)
        : undefined,
    cost:
      abilityType === "activated"
        ? input.rule.cost?.(input.match) ?? extractCostFromParagraph(input.ability.paragraphText)
        : undefined,
  };
}

function matchText(match: RegExpMatchArray): string {
  return match[0];
}

function deriveRolesFromActions(actions: OracleActionV1[]): DerivedCardRole[] {
  const roleMap: Record<string, string[]> = {
    add_mana: ["ramp", "mana_acceleration"],
    draw: ["card_advantage"],
    tutor: ["tutor"],
    board_wipe: ["board_wipe"],
    destroy: ["removal"],
    exile: ["removal"],
    counter: ["interaction", "stack_interaction"],
    create_token: ["token_generator"],
    reanimate: ["recursion"],
    cast_from_exile: ["gravesyard_cast", "exile_cast"],
    protection: ["protection"],
    sacrifice: ["sacrifice_outlet"],
    deal_damage: ["removal"],
  };

  const roles: DerivedCardRole[] = [];
  for (const action of actions) {
    const mapped = roleMap[action.actionType];
    if (!mapped) continue;
    for (const role of mapped) {
      roles.push({
        role,
        score: action.confidence * 0.75,
        evidenceActionIds: [action.actionId],
        derivationVersion: "role-derivation-v1",
      });
    }
  }
  return roles;
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
  const abstainedClauses: OracleActionV1Result["abstainedClauses"] = [];
  let actionIndex = 0;

  for (const ability of abilities) {
    let matched = false;
    for (const rule of ACTION_PATTERNS) {
      const match = ability.paragraphText.match(rule.pattern);
      if (!match) continue;

      const action = acceptAction({
        oracleId: input.oracleId,
        oracleText: input.oracleText,
        faceName: ability.cardFaceId,
        ability,
        match,
        rule,
        actionIndex,
      });

      if (!action) {
        abstainedClauses.push({
          text: match[0],
          start: ability.paragraphStart,
          end: ability.paragraphEnd,
          reason: "evidence_validation_failed",
        });
        continue;
      }

      matched = true;
      actions.push({ ...action, actionIndex: actionIndex++ });
    }

    if (!matched && ability.paragraphText.length > 20 && !isKeywordOnly(ability.paragraphText)) {
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

function isKeywordOnly(text: string): boolean {
  return /^[A-Z][a-z]+(?:, [a-z]+)*\.?$/.test(text.trim()) && text.length < 80;
}

/** Adapter to legacy extraction result shape for existing eval harness. */
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
