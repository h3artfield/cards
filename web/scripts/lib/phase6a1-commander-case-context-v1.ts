/**
 * Load Phase 6A.1 review-case command-zone context with golden Oracle texts.
 */
import { ARCHETYPE_DISCOVERY_BENCHMARK_V1 } from "../../src/lib/deck-synthesis/archetype-discovery-benchmark-v1";
import { ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V5 } from "../../src/lib/deck-synthesis/archetype-discovery-blind-holdout-v5";
import {
  buildGlobalCatalogSemanticIndex,
  discoverArchetypes,
  resolveBenchmarkCommanderOracleIds,
} from "../../src/lib/deck-synthesis";
import type { CommandZoneConfiguration } from "../../src/lib/deck-synthesis/command-zone-composition-v1";
import type { CommanderBracket } from "../../src/lib/bracket-policy/bracket-policy-v1";
import { getCalibrationCaseIds } from "./phase6a-calibration-v2-gold";
import type { DeckResolutionCatalog } from "./load-deck-resolution-catalog";
import type { ShadowSemanticIndex } from "../../src/lib/commander-strategy/shadow-semantic-index";

export const COMMANDER_CASE_CONTEXT_V1_VERSION = "phase6a1-commander-case-context-v1";

export type CommanderCaseContext = {
  caseId: string;
  commanders: string[];
  commandZoneConfiguration: CommandZoneConfiguration;
  bracket: CommanderBracket;
  oracleIds: string[];
  combinedColorIdentity: string[];
  commanderOracleTexts: Array<{
    sourceOracleId: string;
    name: string;
    oracleText: string;
    colorIdentity: string[];
  }>;
};

function findBenchmarkCase(caseId: string): {
  commanders: string[];
  commandZoneConfiguration: CommandZoneConfiguration;
  bracket: CommanderBracket;
  category?: string;
} | null {
  for (const c of ARCHETYPE_DISCOVERY_BENCHMARK_V1) {
    if (c.id === caseId) {
      const commandZoneConfiguration: CommandZoneConfiguration =
        c.category === "partner"
          ? "partner_pair"
          : c.category === "background"
            ? "commander_with_background"
            : "single_commander";
      return { commanders: c.commanders, commandZoneConfiguration, bracket: c.bracket, category: c.category };
    }
  }
  for (const c of ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V5) {
    if (c.id === caseId) {
      return {
        commanders: c.commanders,
        commandZoneConfiguration: c.commandZoneConfiguration,
        bracket: c.bracket,
      };
    }
  }
  return null;
}

export function loadCommanderCaseContexts(
  catalog: DeckResolutionCatalog,
  shadowIndex: ShadowSemanticIndex,
): CommanderCaseContext[] {
  const globalIndex = buildGlobalCatalogSemanticIndex({ catalog, shadowIndex });
  const contexts: CommanderCaseContext[] = [];

  for (const caseId of getCalibrationCaseIds()) {
    const bench = findBenchmarkCase(caseId);
    if (!bench) continue;

    const resolution = resolveBenchmarkCommanderOracleIds(catalog, bench.commanders);
    if (!resolution.resolved) continue;

    const discovery = discoverArchetypes(
      { commanderOracleIds: resolution.oracleIds, bracket: bench.bracket },
      { catalog, shadowIndex, globalCatalogIndex: globalIndex },
    );

    const combinedColorIdentity = [
      ...new Set(
        discovery.commandZoneComposition?.combinedColorIdentity ??
          resolution.oracleIds.flatMap((id) => catalog.byOracleId.get(id)?.colorIdentity ?? []),
      ),
    ];

    const commanderOracleTexts = resolution.oracleIds.map((id) => {
      const card = catalog.byOracleId.get(id);
      return {
        sourceOracleId: id,
        name: card?.canonicalName ?? id,
        oracleText: card?.oracleText ?? "",
        colorIdentity: card?.colorIdentity ?? [],
      };
    });

    contexts.push({
      caseId,
      commanders: bench.commanders,
      commandZoneConfiguration: bench.commandZoneConfiguration,
      bracket: bench.bracket,
      oracleIds: resolution.oracleIds,
      combinedColorIdentity,
      commanderOracleTexts,
    });
  }

  return contexts;
}
