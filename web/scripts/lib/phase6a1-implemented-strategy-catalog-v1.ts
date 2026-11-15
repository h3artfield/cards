/**
 * Implemented Strategy catalog — exact pass-through of frozen independent strategy adjudication.
 * Three-path plans are separate strategy reasoning above canonical facts.
 * Do not force enabler→payoff when no causal engine exists.
 */
import type {
  CorrectedThreePathStrategy,
  IndependentStrategyAdjudicationCase,
} from "../../src/lib/deck-synthesis/independent-truth-types-v1";
import {
  getAllTruthCaseIds,
  getStrategyAdjudicationCase,
  INDEPENDENT_TRUTH_LOADER_V1_VERSION,
  loadIndependentStrategyAdjudication,
} from "./phase6a1-independent-truth-loader-v1";

export const IMPLEMENTED_STRATEGY_CATALOG_V1_VERSION = "phase6a1-implemented-strategy-catalog-v1";
export const IMPLEMENTED_STRATEGY_TRUTH_SOURCE = "phase6a1-independent-strategy-adjudication-v1";

export type ImplementedStrategyCatalogEntry = IndependentStrategyAdjudicationCase & {
  implementationSource: typeof IMPLEMENTED_STRATEGY_TRUTH_SOURCE;
  implementationVersion: typeof IMPLEMENTED_STRATEGY_CATALOG_V1_VERSION;
  loaderVersion: typeof INDEPENDENT_TRUTH_LOADER_V1_VERSION;
  adjudicationStatus: "FROZEN_DEV_TRUTH";
};

export function getImplementedStrategyCatalog(): ImplementedStrategyCatalogEntry[] {
  const truth = loadIndependentStrategyAdjudication();
  return truth.cases.map((c) => ({
    ...c,
    implementationSource: IMPLEMENTED_STRATEGY_TRUTH_SOURCE,
    implementationVersion: IMPLEMENTED_STRATEGY_CATALOG_V1_VERSION,
    loaderVersion: INDEPENDENT_TRUTH_LOADER_V1_VERSION,
    adjudicationStatus: "FROZEN_DEV_TRUTH" as const,
  }));
}

export function getImplementedStrategyCase(caseId: string): ImplementedStrategyCatalogEntry | undefined {
  const c = getStrategyAdjudicationCase(caseId);
  if (!c) return undefined;
  return {
    ...c,
    implementationSource: IMPLEMENTED_STRATEGY_TRUTH_SOURCE,
    implementationVersion: IMPLEMENTED_STRATEGY_CATALOG_V1_VERSION,
    loaderVersion: INDEPENDENT_TRUTH_LOADER_V1_VERSION,
    adjudicationStatus: "FROZEN_DEV_TRUTH",
  };
}

export function getCorrectedThreePathStrategy(caseId: string): CorrectedThreePathStrategy | undefined {
  return getStrategyAdjudicationCase(caseId)?.correctedThreePathStrategy;
}

export function listImplementedStrategyCaseIds(): string[] {
  return getAllTruthCaseIds();
}
