/**
 * Semantic Opportunity Service — mechanically defensible leverage above facts.
 */
import type {
  CommandZoneOpportunityModel,
  SemanticOpportunity,
  SemanticOpportunityModelCatalog,
} from "../deck-synthesis/semantic-opportunity-types-v1";

export const SEMANTIC_OPPORTUNITY_SERVICE_VERSION = "semantic-opportunity-service-v1";

let catalogLoader: (() => SemanticOpportunityModelCatalog) | null = null;

export function registerSemanticOpportunityCatalogLoader(
  loader: () => SemanticOpportunityModelCatalog,
): void {
  catalogLoader = loader;
}

export function getSemanticOpportunityCatalog(): SemanticOpportunityModelCatalog {
  if (!catalogLoader) {
    throw new Error("SemanticOpportunityService: registerSemanticOpportunityCatalogLoader() before use");
  }
  return catalogLoader();
}

export function getOpportunitiesForCase(caseId: string): CommandZoneOpportunityModel | undefined {
  return getSemanticOpportunityCatalog().cases.find((c) => c.caseId === caseId);
}

export function getOpportunityById(
  caseId: string,
  opportunityId: string,
): SemanticOpportunity | undefined {
  return getOpportunitiesForCase(caseId)?.opportunities.find((o) => o.opportunityId === opportunityId);
}

export function listOpportunityIdsForCase(caseId: string): string[] {
  return (getOpportunitiesForCase(caseId)?.opportunities ?? []).map((o) => o.opportunityId);
}
