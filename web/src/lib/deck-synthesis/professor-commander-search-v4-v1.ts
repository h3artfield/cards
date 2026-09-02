/**
 * Paper-eligible sole-commander filter for Professor commander search.
 */
import { normalizeOracleName } from "@/lib/deck-builder/golden-catalog/normalize-name";
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import { resolveBenchmarkCommanderName } from "./benchmark-commander-resolver-v1";
import { auditProfessorBrewCommanderEligibility } from "./professor-brew-commander-resolver-v4-4-v1";

export const PROFESSOR_COMMANDER_SEARCH_V4_V1_VERSION = "professor-commander-search-v4-v1";

let paperEligibleSoleCommanderNames: Set<string> | null = null;

export function buildPaperEligibleSoleCommanderNameSet(catalog: DeckResolutionCatalog): Set<string> {
  const names = new Set<string>();
  for (const card of catalog.byOracleId.values()) {
    if (auditProfessorBrewCommanderEligibility(catalog, card).ok) {
      names.add(normalizeOracleName(card.canonicalName));
    }
  }
  return names;
}

export function getPaperEligibleSoleCommanderNameSet(catalog: DeckResolutionCatalog): Set<string> {
  if (!paperEligibleSoleCommanderNames) {
    paperEligibleSoleCommanderNames = buildPaperEligibleSoleCommanderNameSet(catalog);
  }
  return paperEligibleSoleCommanderNames;
}

export function isPaperEligibleSoleCommanderName(
  catalog: DeckResolutionCatalog,
  commanderName: string,
): boolean {
  const audit = resolveBenchmarkCommanderName(catalog, commanderName);
  if (!audit.resolved || !audit.oracleId) return false;
  const card = catalog.byOracleId.get(audit.oracleId);
  if (!card) return false;
  return auditProfessorBrewCommanderEligibility(catalog, card).ok;
}

/** Test helper — reset cached name set between tests. */
export function clearPaperEligibleCommanderNameSetCacheForTest(): void {
  paperEligibleSoleCommanderNames = null;
}
