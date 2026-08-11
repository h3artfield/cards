import type { GoldenCatalogOracleCard } from "@/lib/deck-builder/golden-catalog/schemas";
import type { SemanticAbility, SemanticAction } from "@/lib/deck-builder/golden-catalog/oracle-semantic-parse-schema";

/** Minimal shadow semantic input for visualization — read-only RC8 output. */
export type ShadowSemanticInput = {
  oracleId: string;
  canonicalName: string;
  parserVersion: string;
  publishable: boolean;
  structuralInvalid: boolean;
  needsReviewActions: SemanticAction[];
  semantic: {
    abilities: SemanticAbility[];
    actions: SemanticAction[];
  };
};

export function qualityStatusFromShadow(shadow: ShadowSemanticInput): "publishable" | "needs_review" | "quarantined" {
  if (shadow.structuralInvalid || !shadow.publishable) return "quarantined";
  if (shadow.needsReviewActions.length > 0) return "needs_review";
  return "publishable";
}

export type { GoldenCatalogOracleCard, SemanticAbility, SemanticAction };
