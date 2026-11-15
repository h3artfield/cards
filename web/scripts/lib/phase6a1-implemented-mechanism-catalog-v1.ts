/**
 * Implemented CommanderMechanism catalog — exact pass-through of frozen independent truth.
 * Do not reinterpret or improve adjudicated semantics here.
 */
import type {
  IndependentCommanderMechanismTruthCase,
  IndependentMechanismFact,
} from "../../src/lib/deck-synthesis/independent-truth-types-v1";
import {
  getAllTruthCaseIds,
  getMechanismTruthCase,
  INDEPENDENT_TRUTH_LOADER_V1_VERSION,
  loadIndependentMechanismTruth,
} from "./phase6a1-independent-truth-loader-v1";

export const IMPLEMENTED_MECHANISM_CATALOG_V1_VERSION = "phase6a1-implemented-mechanism-catalog-v1";
export const IMPLEMENTED_MECHANISM_TRUTH_SOURCE = "phase6a1-independent-commander-mechanism-truth-v1";

export type ImplementedMechanismCatalogEntry = IndependentCommanderMechanismTruthCase & {
  implementationSource: typeof IMPLEMENTED_MECHANISM_TRUTH_SOURCE;
  implementationVersion: typeof IMPLEMENTED_MECHANISM_CATALOG_V1_VERSION;
  loaderVersion: typeof INDEPENDENT_TRUTH_LOADER_V1_VERSION;
  adjudicationStatus: "FROZEN_DEV_TRUTH";
};

export function getImplementedMechanismCatalog(): ImplementedMechanismCatalogEntry[] {
  const truth = loadIndependentMechanismTruth();
  return truth.cases.map((c) => ({
    ...c,
    implementationSource: IMPLEMENTED_MECHANISM_TRUTH_SOURCE,
    implementationVersion: IMPLEMENTED_MECHANISM_CATALOG_V1_VERSION,
    loaderVersion: INDEPENDENT_TRUTH_LOADER_V1_VERSION,
    adjudicationStatus: "FROZEN_DEV_TRUTH" as const,
  }));
}

export function getImplementedMechanismCase(caseId: string): ImplementedMechanismCatalogEntry | undefined {
  const c = getMechanismTruthCase(caseId);
  if (!c) return undefined;
  return {
    ...c,
    implementationSource: IMPLEMENTED_MECHANISM_TRUTH_SOURCE,
    implementationVersion: IMPLEMENTED_MECHANISM_CATALOG_V1_VERSION,
    loaderVersion: INDEPENDENT_TRUTH_LOADER_V1_VERSION,
    adjudicationStatus: "FROZEN_DEV_TRUTH",
  };
}

export function getImplementedMechanismFacts(caseId: string): IndependentMechanismFact[] {
  return getMechanismTruthCase(caseId)?.independentMechanismFacts ?? [];
}

export function listImplementedCaseIds(): string[] {
  return getAllTruthCaseIds();
}
