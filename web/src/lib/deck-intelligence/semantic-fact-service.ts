/**
 * Semantic Fact Service — frozen CommanderMechanismFacts for all consumers.
 */
import type { IndependentMechanismFact } from "../deck-synthesis/independent-truth-types-v1";
import {
  buildCanonicalCommandZoneKnowledge,
  type CanonicalCommandZoneKnowledge,
} from "./canonical-knowledge-service";

export const SEMANTIC_FACT_SERVICE_VERSION = "semantic-fact-service-v1";

export type SemanticFactCaseBundle = CanonicalCommandZoneKnowledge & {
  mechanismFacts: IndependentMechanismFact[];
  factStatus: "FROZEN_DEV_TRUTH";
};

/** In-memory loader hook — scripts inject catalog; runtime may use Firestore later. */
let caseLoader: (() => SemanticFactCaseBundle[]) | null = null;

export function registerSemanticFactCaseLoader(loader: () => SemanticFactCaseBundle[]): void {
  caseLoader = loader;
}

export function getSemanticFactCases(): SemanticFactCaseBundle[] {
  if (!caseLoader) {
    throw new Error("SemanticFactService: registerSemanticFactCaseLoader() before use");
  }
  return caseLoader();
}

export function getSemanticFactCase(caseId: string): SemanticFactCaseBundle | undefined {
  return getSemanticFactCases().find((c) => c.caseId === caseId);
}

export function getMechanismFactsForCase(caseId: string): IndependentMechanismFact[] {
  return getSemanticFactCase(caseId)?.mechanismFacts ?? [];
}

export function buildSemanticFactCaseBundle(
  truthCase: Parameters<typeof buildCanonicalCommandZoneKnowledge>[0] & {
    independentMechanismFacts: IndependentMechanismFact[];
  },
): SemanticFactCaseBundle {
  return {
    ...buildCanonicalCommandZoneKnowledge(truthCase),
    mechanismFacts: truthCase.independentMechanismFacts,
    factStatus: "FROZEN_DEV_TRUTH",
  };
}
