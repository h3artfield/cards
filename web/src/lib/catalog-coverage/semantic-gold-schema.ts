/** Shared semantic gold schema — mirrored for web app + study scripts. */
import type { PrimitiveActionType } from "@/lib/deck-builder/golden-catalog/oracle-action-taxonomy";

export const CATALOG_COVERAGE_SEMANTIC_GOLD_SCHEMA_VERSION =
  "catalog-coverage-semantic-gold-schema-v1";

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

export type CatalogCoverageEvidenceSpan = {
  text: string;
  start?: number;
  end?: number;
  faceId?: string;
};

export type CatalogCoverageExpectedL2Action = {
  primitive: PrimitiveActionType;
  evidenceSpan: CatalogCoverageEvidenceSpan;
  optionalEffect?: boolean;
  optionalCost?: boolean;
  conditionText?: string;
  semanticOwner: CatalogCoverageSemanticOwner;
  executionContext: CatalogCoverageExecutionContext;
  sourceZone?: string;
  destinationZone?: string;
  modalOptionId?: string;
  sagaChapterId?: string;
  loyaltyCost?: string;
  abilityIndex: number;
  negative?: boolean;
};

export type CatalogCoverageExpectedAbility = {
  abilityIndex: number;
  faceId: string;
  abilityType: CatalogCoverageAbilityType;
  boundaryStart?: number;
  boundaryEnd?: number;
  paragraphText: string;
  semanticOwner: CatalogCoverageSemanticOwner;
  executionContext: CatalogCoverageExecutionContext;
  grantedObjectName?: string;
  createdObjectKind?: string;
  modalOptionIds?: string[];
  expectedL2Actions: CatalogCoverageExpectedL2Action[];
};

export type CatalogCoverageBlankTextGold = {
  legitimateCard: true;
  oracleRulesTextEmpty: true;
  expectedCardNativeL2Actions: [];
  abilities: [];
  expectedWholeCardUnderstanding: "complete_blank_card";
};

export type CatalogCoverageSemanticGoldCase = {
  schemaVersion: typeof CATALOG_COVERAGE_SEMANTIC_GOLD_SCHEMA_VERSION;
  oracleId: string;
  canonicalName: string;
  cardStructureHash: string;
  oracleTextHash: string;
  layout?: string;
  populationCategory: string;
  complexityBucket: string;
  legitimateCard: boolean;
  oracleRulesTextEmpty: boolean;
  expectedCardNativeL2Actions: CatalogCoverageExpectedL2Action[];
  abilities: CatalogCoverageExpectedAbility[];
  blankTextGold?: CatalogCoverageBlankTextGold;
  officialRulingsConsulted: boolean;
  rulingReferences?: string[];
  adjudicationNotes?: string;
};
