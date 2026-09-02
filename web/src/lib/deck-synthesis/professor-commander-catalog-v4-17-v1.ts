/**
 * Professor v4.17 — resolve CommanderBlueprintV417 from Golden Catalog.
 */
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import { combinedGoldenOracleText } from "../../../scripts/lib/load-golden-catalog-index";
import type { GoldenCatalogOracleCard } from "@/lib/deck-builder/golden-catalog/schemas";
import type { CommanderBlueprintV417 } from "./professor-brew-blueprint-v4-17-v1";
import { resolveBenchmarkCommanderName } from "./benchmark-commander-resolver-v1";
import { inferCardSemanticFunctions } from "./professor-card-semantic-functions-v1-1-1";

export const PROFESSOR_COMMANDER_CATALOG_V4_17_V1_VERSION = "professor-commander-catalog-v4-17-v1";

export type Slice3CommanderSpecV417 = {
  caseId: string;
  archetype: string;
  commanderName: string;
  requestedBracket: number;
};

export const SLICE3_LIVE_COMMANDER_SPECS_V417: Slice3CommanderSpecV417[] = [
  { caseId: "graveyard-ultimecia", archetype: "graveyard/recursion", commanderName: "Ultimecia, Time Sorceress // Ultimecia, Omnipotent", requestedBracket: 4 },
  { caseId: "spellslinger-kess", archetype: "spellslinger/cast-event", commanderName: "Kess, Dissident Mage", requestedBracket: 4 },
  { caseId: "voltron-sigarda", archetype: "creature combat/Voltron", commanderName: "Sigarda, Host of Herons", requestedBracket: 3 },
  { caseId: "tokens-chatterfang", archetype: "tokens/sacrifice", commanderName: "Chatterfang, Squirrel General", requestedBracket: 3 },
  { caseId: "resource-korvold", archetype: "resource conversion", commanderName: "Korvold, Fae-Cursed King", requestedBracket: 4 },
];

export function resolveCommanderBlueprintFromCatalogV417(args: {
  catalog: DeckResolutionCatalog;
  commanderName: string;
}): CommanderBlueprintV417 {
  const resolved = resolveBenchmarkCommanderName(args.catalog, args.commanderName);
  const card: GoldenCatalogOracleCard | undefined = resolved.oracleId
    ? args.catalog.byOracleId.get(resolved.oracleId)
    : undefined;
  if (!card) {
    throw new Error(`COMMANDER_NOT_IN_CATALOG:${args.commanderName}`);
  }
  const oracleText = combinedGoldenOracleText(card);
  const semanticFunctions = inferCardSemanticFunctions(oracleText, card.typeLine ?? "");
  return {
    oracleId: card.oracleId,
    name: card.canonicalName,
    colorIdentity: card.colorIdentity ?? card.colors ?? [],
    manaValue: card.manaValue ?? card.cmc ?? null,
    oracleText,
    semanticFunctions,
    mechanics: semanticFunctions.map((f) => f.toLowerCase()),
    resourcesProduced: semanticFunctions.filter((f) => /TOKEN|DRAW|MANA|EXTRA/.test(f)),
    resourcesConsumed: semanticFunctions.filter((f) => /GRAVEYARD|SACRIFICE|EXILE/.test(f)),
    triggeredEvents: [],
    zoneRelationships: semanticFunctions.includes("GRAVEYARD_RECURSION") ? ["graveyard→battlefield"] : [],
    exploitOpportunities: semanticFunctions.map((f) => f.toLowerCase()),
    provenance: ["golden_catalog"],
  };
}
