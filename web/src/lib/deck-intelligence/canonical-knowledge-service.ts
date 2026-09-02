/**
 * Canonical Card / Rules Knowledge — Oracle-grounded truth from frozen adjudication + golden catalog refs.
 */
import type { IndependentCommanderMechanismTruthCase } from "../deck-synthesis/independent-truth-types-v1";
import { GOLDEN_CATALOG_VERSION } from "../deck-builder/golden-catalog/version";

export const CANONICAL_KNOWLEDGE_SERVICE_VERSION = "canonical-knowledge-service-v1";

export type CanonicalOracleEntry = {
  sourceOracleId: string;
  name: string;
  oracleText: string;
  provenanceTier: "CANONICAL_FACT";
};

export type CanonicalCommandZoneKnowledge = {
  caseId: string;
  commanders: string[];
  commandZoneConfiguration: string;
  combinedColorIdentity: string[];
  bracket: number;
  oracleEntries: CanonicalOracleEntry[];
  crossMemberRelationships: Array<Record<string, unknown>>;
};

export function buildCanonicalCommandZoneKnowledge(
  truthCase: IndependentCommanderMechanismTruthCase,
): CanonicalCommandZoneKnowledge {
  return {
    caseId: truthCase.caseId,
    commanders: truthCase.commanders,
    commandZoneConfiguration: truthCase.commandZoneConfiguration,
    combinedColorIdentity: truthCase.combinedColorIdentity,
    bracket: truthCase.bracket,
    oracleEntries: truthCase.commanderOracleTexts.map((o) => ({
      sourceOracleId: o.sourceOracleId,
      name: o.name,
      oracleText: o.oracleText,
      provenanceTier: "CANONICAL_FACT" as const,
    })),
    crossMemberRelationships: truthCase.crossMemberRelationshipsAsSupplied,
  };
}

export const CANONICAL_KNOWLEDGE_SOURCES = {
  goldenCatalogVersion: GOLDEN_CATALOG_VERSION,
  mechanismTruthArtifact: "phase6a1-independent-commander-mechanism-truth-v1",
  strategyTruthArtifact: "phase6a1-independent-strategy-adjudication-v1",
} as const;
