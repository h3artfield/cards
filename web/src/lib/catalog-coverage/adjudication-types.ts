export type CatalogCoverageAbilityType =
  | "static"
  | "triggered"
  | "activated"
  | "replacement"
  | "modal_choice"
  | "saga_chapter"
  | "planeswalker_loyalty"
  | "granted_static"
  | "granted_triggered"
  | "granted_activated"
  | "keyword_static"
  | "other";

export type CatalogCoverageExecutionContext =
  | "card_native"
  | "granted_object"
  | "created_object"
  | "emblem_effect"
  | "copied_ability"
  | "face_specific";

export type CatalogCoverageSemanticOwner =
  | "source_card"
  | "granted_object"
  | "created_object"
  | "modal_option"
  | "face_front"
  | "face_back"
  | "face_other";

export type AdjudicationPhase = "calibration" | "full";

export type UiAbilityType =
  | "static"
  | "activated"
  | "triggered"
  | "spell_effect"
  | "replacement"
  | "loyalty"
  | "saga_chapter"
  | "other";

export type UiSemanticOwner = "source_card" | "granted_object" | "created_object";

export type UiExecutionContext =
  | "immediate"
  | "granted_ability"
  | "token_definition"
  | "other";

export type UiPrimitive =
  | "draw"
  | "discard"
  | "destroy"
  | "exile"
  | "deal_damage"
  | "create_token"
  | "cast"
  | "play"
  | "return_to_hand"
  | "return_to_battlefield"
  | "put_onto_battlefield"
  | "put_into_hand"
  | "search_library"
  | "shuffle_library"
  | "shuffle_into_library"
  | "mill"
  | "sacrifice"
  | "copy"
  | "gain_life"
  | "lose_life"
  | "tap"
  | "untap"
  | "put_counter"
  | "add_mana"
  | "scry"
  | "surveil"
  | "counter"
  | "other";

export type UiEvidenceSpan = {
  text: string;
  start: number;
  end: number;
  faceId: string;
};

export type UiActionDraft = {
  id: string;
  primitive: UiPrimitive;
  quantity?: string;
  evidenceSpan?: UiEvidenceSpan;
  semanticOwner: UiSemanticOwner;
  executionContext: UiExecutionContext;
  optional: boolean;
  conditional: boolean;
  conditionText?: string;
  faceId: string;
  modalOption: string;
};

export type UiAbilityDraft = {
  id: string;
  abilityType: UiAbilityType;
  faceId: string;
  paragraphText: string;
  actions: UiActionDraft[];
};

export type UiAdjudicationDraft = {
  noCardNativeL2Actions: boolean;
  abilities: UiAbilityDraft[];
  humanExplanation: string;
  officialRulingsConsulted: boolean;
};

export type BlindPackCard = {
  oracleId: string;
  canonicalName: string;
  cardStructureHash: string;
  oracleTextHash: string;
  layout?: string;
  typeLine?: string;
  populationCategory: string;
  complexityBucket: string;
  canonicalStructure: {
    combinedOracleText: string;
    faces: Array<{
      faceIndex: number;
      faceId: string;
      name: string;
      typeLine: string;
      oracleText: string;
      manaCost?: string;
      power?: string;
      toughness?: string;
      loyalty?: string;
    }>;
  };
};

export type EnrichedAdjudicationCard = BlindPackCard & {
  samplePosition: number;
  manaCost?: string;
  imageUrl?: string;
  rulingsAvailable: boolean;
};

export type AdjudicationSessionInfo = {
  phase: AdjudicationPhase;
  adjudicatorId: string;
  cardsTotal: number;
  cardsSubmitted: number;
  allSubmitted: boolean;
  cardOracleIds: string[];
  sampleIdentityHash: string;
  populationHash: string;
  calibrationBatchHash: string;
  annotationProtocolVersion: string;
  protocolFrozen: boolean;
  quorumReached: boolean;
};

export const UI_ABILITY_TYPES: Array<{ value: UiAbilityType; label: string }> = [
  { value: "static", label: "Static" },
  { value: "activated", label: "Activated" },
  { value: "triggered", label: "Triggered" },
  { value: "spell_effect", label: "Spell effect" },
  { value: "replacement", label: "Replacement" },
  { value: "loyalty", label: "Loyalty" },
  { value: "saga_chapter", label: "Saga chapter" },
  { value: "other", label: "Other" },
];

export const UI_PRIMITIVES: Array<{ value: UiPrimitive; label: string }> = [
  { value: "draw", label: "draw" },
  { value: "discard", label: "discard" },
  { value: "destroy", label: "destroy" },
  { value: "exile", label: "exile" },
  { value: "deal_damage", label: "deal_damage" },
  { value: "create_token", label: "create_token" },
  { value: "cast", label: "cast" },
  { value: "play", label: "play" },
  { value: "return_to_hand", label: "return_to_hand" },
  { value: "return_to_battlefield", label: "return_to_battlefield" },
  { value: "put_onto_battlefield", label: "put_onto_battlefield" },
  { value: "put_into_hand", label: "put_into_hand" },
  { value: "search_library", label: "search_library" },
  { value: "shuffle_library", label: "shuffle_library" },
  { value: "shuffle_into_library", label: "shuffle_into_library" },
  { value: "mill", label: "mill" },
  { value: "sacrifice", label: "sacrifice" },
  { value: "copy", label: "copy" },
  { value: "gain_life", label: "gain_life" },
  { value: "lose_life", label: "lose_life" },
  { value: "tap", label: "tap" },
  { value: "untap", label: "untap" },
  { value: "put_counter", label: "put_counter" },
  { value: "add_mana", label: "add_mana" },
  { value: "scry", label: "scry" },
  { value: "surveil", label: "surveil" },
  { value: "counter", label: "counter" },
  { value: "other", label: "other" },
];

export function mapUiAbilityType(value: UiAbilityType): CatalogCoverageAbilityType {
  const map: Record<UiAbilityType, CatalogCoverageAbilityType> = {
    static: "static",
    activated: "activated",
    triggered: "triggered",
    spell_effect: "other",
    replacement: "replacement",
    loyalty: "planeswalker_loyalty",
    saga_chapter: "saga_chapter",
    other: "other",
  };
  return map[value];
}

export function mapUiSemanticOwner(value: UiSemanticOwner): CatalogCoverageSemanticOwner {
  return value;
}

export function mapUiExecutionContext(value: UiExecutionContext): CatalogCoverageExecutionContext {
  const map: Record<UiExecutionContext, CatalogCoverageExecutionContext> = {
    immediate: "card_native",
    granted_ability: "granted_object",
    token_definition: "created_object",
    other: "face_specific",
  };
  return map[value];
}
