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

export type OptionalityController =
  | "you"
  | "opponent"
  | "target_player"
  | "each_player"
  | "object_controller";

export type ConditionType =
  | "if_you_do"
  | "when_you_do"
  | "unless"
  | "intervening_if"
  | "general";

export type OracleActionExtractionMethod =
  | "deterministic"
  | "model_assisted"
  | "manual_override";

/** Card-face component kinds — per-face granularity for split / MDFC / adventure / room. */
export type CardFaceComponentType =
  | "single_face"
  | "split_half"
  | "aftermath_half"
  | "adventure"
  | "adventure_creature"
  | "mdfc_front"
  | "mdfc_back"
  | "transform_front"
  | "transform_back"
  | "room_left"
  | "room_right";

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
  faceId?: string;
  faceName?: string;
  faceIndex?: number;
  componentType?: CardFaceComponentType;
  abilityIndex: number;
  actionIndex: number;

  abilityType: OracleAbilityType;

  trigger?: OracleActionTrigger;
  costs?: OracleActionCost[];
  effects: OracleActionEffect[];

  evidenceText: string;
  evidenceStart: number;
  evidenceEnd: number;
  cardEvidenceStart?: number;
  cardEvidenceEnd?: number;
  faceEvidenceStart?: number;
  faceEvidenceEnd?: number;
  optionalEffect?: boolean;
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
  structureAnnotations: OracleAbilityStructureAnnotation[];
  derivedRoles: DerivedCardRole[];
  abstainedClauses: Array<{ text: string; start: number; end: number; reason: string }>;
}

/** Text span role — classifies oracle text before Layer 2 primitive extraction. */
export type TextRole =
  | "effect"
  | "cost"
  | "trigger_event"
  | "condition"
  | "replacement_event"
  | "replacement_effect"
  | "static_permission"
  | "static_restriction"
  | "reminder_text"
  | "mechanic_reminder"
  | "target_or_choice_structure"
  | "unknown";

/** Layer 1 structure markers — not primitive Oracle actions. */
export type StructureAnnotationKind =
  | "optional_cost"
  | "optional_effect"
  | "choice_or_target"
  | "static_restriction"
  | "static_permission"
  | "replacement_condition"
  | "replacement_event"
  | "trigger_event"
  | "cost"
  | "reminder_text"
  | "mechanic_reminder"
  | "condition_only";

export interface OracleAbilityStructureAnnotation {
  annotationId: string;
  oracleId: string;
  faceId: string;
  faceName?: string;
  faceIndex?: number;
  componentType?: CardFaceComponentType;
  abilityIndex: number;
  kind: StructureAnnotationKind;
  evidenceText: string;
  evidenceStart: number;
  evidenceEnd: number;
  cardEvidenceStart?: number;
  cardEvidenceEnd?: number;
  faceEvidenceStart?: number;
  faceEvidenceEnd?: number;
  optionalEffect?: boolean;
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
  textRole?: TextRole;
  permissionType?: "cast" | "play";
  permittedFromZone?: string[];
  permissionSubject?: string;
  parserVersion: string;
  reviewStatus: "needs_review";
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

export const ORACLE_ACTION_PARSER_VERSION = "oracle-action-v1.20-variable-lose-life-dev";
export const ORACLE_ACTION_TAXONOMY_VERSION = "three-layer-v1.3";

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
  "deal damage",
  "gain life",
  "lose life",
  "scry",
  "surveil",
  "tap",
  "put counter",
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
