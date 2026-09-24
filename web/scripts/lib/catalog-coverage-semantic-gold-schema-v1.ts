/**
 * Catalog coverage study — parser-blind semantic gold schema (v1).
 *
 * Describes expected card semantics for RC8 comparison after gold seal.
 * Adjudicators author this blind to parser output.
 */
import type { PrimitiveActionType } from "../../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";

export const CATALOG_COVERAGE_SEMANTIC_GOLD_SCHEMA_VERSION = "catalog-coverage-semantic-gold-schema-v1";

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
  /** Whole-card understanding: vanilla/blank is fully understood with zero L2 actions. */
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

export type CatalogCoverageWholeCardClass =
  | "EXACT"
  | "MATERIAL_CORRECT"
  | "PARTIAL"
  | "NEEDS_REVIEW"
  | "ABSTAINED"
  | "INCORRECT";

export const CATALOG_COVERAGE_WHOLE_CARD_RUBRIC_VERSION = "catalog-coverage-whole-card-rubric-v1";

export type CatalogCoverageAdjudicationRecord = {
  adjudicatorId: string;
  adjudicatedAt: string;
  semanticGold: CatalogCoverageSemanticGoldCase;
  wholeCardClass?: CatalogCoverageWholeCardClass;
  wholeCardRationale?: string;
};

export type CatalogCoverageDisagreementRecord = {
  oracleId: string;
  disagreementType:
    | "primitive"
    | "ownership"
    | "ability_boundary"
    | "whole_card_class"
    | "blank_text_treatment"
    | "other";
  primaryAdjudicatorId: string;
  secondaryAdjudicatorId: string;
  primarySnapshot: CatalogCoverageSemanticGoldCase;
  secondarySnapshot: CatalogCoverageSemanticGoldCase;
  resolved: boolean;
  resolution?: string;
  finalSemanticGold?: CatalogCoverageSemanticGoldCase;
  resolvedAt?: string;
  resolverId?: string;
};
