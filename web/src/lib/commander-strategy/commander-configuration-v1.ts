import { createHash } from "node:crypto";
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import type { NormalizedDeckInstance } from "./types";

export const COMMANDER_CONFIGURATION_SCHEMA_VERSION = "commander-configuration-v1";

export type CommanderConfigurationType =
  | "single"
  | "partner"
  | "friends_forever"
  | "choose_a_background"
  | "doctors_companion"
  | "other";

export type CommanderConfiguration = {
  commanderConfigurationId: string;
  commanderOracleIds: string[];
  commanderNames: string[];
  configurationType: CommanderConfigurationType;
};

export function inferConfigurationType(oracleIdCount: number): CommanderConfigurationType {
  if (oracleIdCount <= 1) return "single";
  if (oracleIdCount === 2) return "partner";
  return "other";
}

export function buildCommanderConfigurationId(sortedOracleIds: string[]): string {
  return createHash("sha256").update(sortedOracleIds.join("|")).digest("hex").slice(0, 16);
}

export function buildCommanderConfiguration(input: {
  commanderOracleIds: string[];
  commanderNames: string[];
}): CommanderConfiguration | null {
  const commanderOracleIds = [...new Set(input.commanderOracleIds.filter(Boolean))].sort();
  if (commanderOracleIds.length === 0) return null;
  const commanderNames = input.commanderNames.length
    ? input.commanderNames
    : commanderOracleIds;
  return {
    commanderConfigurationId: buildCommanderConfigurationId(commanderOracleIds),
    commanderOracleIds,
    commanderNames,
    configurationType: inferConfigurationType(commanderOracleIds.length),
  };
}

export function commanderConfigurationFromDeck(
  deck: NormalizedDeckInstance,
  catalog?: DeckResolutionCatalog,
): CommanderConfiguration | null {
  const names = deck.commanders.map((c) => {
    if (c.oracleId && catalog?.byOracleId.get(c.oracleId)?.canonicalName) {
      return catalog.byOracleId.get(c.oracleId)!.canonicalName.split("//")[0]?.trim() ?? c.sourceName;
    }
    return c.sourceName;
  });
  return buildCommanderConfiguration({
    commanderOracleIds: deck.commanderOracleIds,
    commanderNames: names,
  });
}

export function commanderConfigurationLabel(
  config: CommanderConfiguration,
  catalog?: DeckResolutionCatalog,
): string {
  if (config.commanderNames.length) {
    return config.commanderNames.join(" + ");
  }
  if (!catalog) return config.commanderConfigurationId;
  return config.commanderOracleIds
    .map((id) => catalog.byOracleId.get(id)?.canonicalName.split("//")[0]?.trim() ?? id)
    .join(" + ");
}
