/**
 * Production Oracle-action schema, gates, and pipeline types.
 * Missing structured information is acceptable; incorrect structured information is not.
 */

export type OracleAbilityType =
  | "static"
  | "activated"
  | "triggered"
  | "spell_effect"
  | "replacement"
  | "preventing"
  | "special_action";

export type OracleActionReviewStatus =
  | "accepted"
  | "needs_review"
  | "abstained"
  | "overridden";

export type OracleActionExtractionMethod =
  | "deterministic"
  | "model_assisted"
  | "manual_override";

export interface OracleActionCost {
  type: string;
  amount?: number;
  object?: string;
}

export interface OracleActionEffect {
  actionType: string;
  objectTypes?: string[];
  sourceZone?: string[];
  destinationZone?: string[];
  controller?: "you" | "opponent" | "any";
  quantity?: string;
  duration?: string;
  conditions?: string[];
}

export interface OracleActionTrigger {
  event: string;
  subject?: string;
  conditions?: string[];
  interveningIf?: string;
}

/** Observable rules-text operation anchored to evidence span. */
export interface OracleAction {
  actionId: string;
  oracleId: string;
  cardFaceId: string;
  abilityIndex: number;
  actionIndex: number;

  abilityType: OracleAbilityType;

  trigger?: OracleActionTrigger;
  costs?: OracleActionCost[];
  effects: OracleActionEffect[];

  evidenceText: string;
  evidenceStart: number;
  evidenceEnd: number;
  parserVersion: string;
  extractionMethod: OracleActionExtractionMethod;
  confidence: number;
  reviewStatus: OracleActionReviewStatus;
}

/** Deck-building interpretation — lower certainty than actions. */
export interface DerivedCardRole {
  role: string;
  score: number;
  evidenceActionIds: string[];
  derivationVersion: string;
}

export interface SegmentedAbility {
  abilityIndex: number;
  cardFaceId: string;
  abilityType: OracleAbilityType | "unknown";
  paragraphText: string;
  paragraphStart: number;
  paragraphEnd: number;
}

export interface OracleActionExtractionResult {
  oracleId: string;
  cardFaceId: string;
  abilities: SegmentedAbility[];
  actions: OracleAction[];
  derivedRoles: DerivedCardRole[];
  abstainedClauses: Array<{ text: string; start: number; end: number; reason: string }>;
}

/** Critical production gates — parser must meet all before full catalog extraction. */
export const ORACLE_ACTION_PRODUCTION_GATES = {
  evidenceSpanValidity: { target: 1.0, label: "100%" },
  oracleIdAndCardFaceAccuracy: { target: 1.0, label: "100%" },
  unsupportedInventedEffects: { target: 0, label: "0%" },
  actionTypePrecision: { target: 0.98, label: "≥98%" },
  actionTypeRecall: { target: 0.95, label: "≥95%" },
  zoneTransitionPrecision: { target: 0.98, label: "≥98%" },
  triggerClassificationPrecision: { target: 0.98, label: "≥98%" },
  costClassificationPrecision: { target: 0.98, label: "≥98%" },
  falsePositiveRate: { target: 0.02, label: "≤2%" },
} as const;

export const ORACLE_ACTION_PARSER_VERSION = "oracle-action-v1-deterministic";

export const HIGH_VALUE_ACTION_TYPES = [
  "draw",
  "ramp / add mana",
  "tutor",
  "destroy",
  "exile",
  "counter",
  "bounce",
  "sacrifice",
  "create tokens",
  "copy",
  "reanimate",
  "mill",
  "discard",
  "cast/play from exile",
  "graveyard recursion",
  "protection",
  "board wipe",
] as const;

/** Rules-answer priority — catalogRulings is layer 3 only. */
export const RULES_ANSWER_PRIORITY = [
  "comprehensive_rules",
  "canonical_oracle_text",
  "official_card_rulings",
  "explanation",
] as const;

/** Pipeline stages — abilities must be segmented before action extraction. */
export const ORACLE_ACTION_PIPELINE = [
  "oracle_card",
  "card_faces",
  "ability_paragraph_segmentation",
  "ability_type_classification",
  "trigger_cost_effect_extraction",
  "evidence_span_validation",
  "functional_role_derivation",
] as const;
