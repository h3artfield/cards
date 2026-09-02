/**
 * Parse deckPreferences into deterministic retrieval / validation constraints.
 */
import type { GoldenCatalogOracleCard } from "../deck-builder/golden-catalog/schemas";
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import { isBasicLandName } from "./professor-commander-legality-v4-9-v1";
import { normalizeCardNameForMatch } from "./professor-card-name-match-client-v4-15-1-v1";
import {
  parseDeckSetRestrictions,
  type DeckSetRestrictionsV111,
} from "./professor-sol-directed-deck-preferences-parse-v1-1-1";
import type {
  RequirementPoolV11,
  SolDirectedConstructedDeckV11,
  LandPoolV11,
} from "./professor-sol-directed-types-v1-1";

export const PROFESSOR_SOL_DIRECTED_DECK_PREFERENCES_V1_1_1_VERSION =
  "professor-sol-directed-deck-preferences-v1-1-1";

export type { DeckSetRestrictionsV111 } from "./professor-sol-directed-deck-preferences-parse-v1-1-1";
export {
  isDeckPreferencesSetConstrained,
  parseDeckSetRestrictions,
} from "./professor-sol-directed-deck-preferences-parse-v1-1-1";

export function cardMatchesDeckSetRestrictions(
  card: GoldenCatalogOracleCard,
  restrictions: DeckSetRestrictionsV111,
): boolean {
  if (isBasicLandName(card.canonicalName)) return true;

  const setCode = card.releaseInformation?.setCode?.toLowerCase();
  if (setCode && restrictions.restrictToSetCodes.has(setCode)) return true;

  const setName = card.releaseInformation?.setName ?? "";
  if (restrictions.setNamePatterns.some((pattern) => pattern.test(setName))) return true;

  return false;
}

export function allowedOracleIdsForDeckPreferences(args: {
  catalog: DeckResolutionCatalog;
  deckPreferences: string;
  commanderOracleId: string;
}): Set<string> | null {
  const restrictions = parseDeckSetRestrictions(args.deckPreferences);
  if (!restrictions) return null;

  const allowed = new Set<string>();
  for (const card of args.catalog.byOracleId.values()) {
    if (card.oracleId === args.commanderOracleId) continue;
    if (cardMatchesDeckSetRestrictions(card, restrictions)) {
      allowed.add(card.oracleId);
    }
  }
  return allowed;
}

function pickReplacementOracleId(args: {
  requirementId: string;
  requirementPools: RequirementPoolV11[];
  candidateDictionary: Record<string, { oracleId: string; isLand?: boolean }>;
  allowedOracleIds: Set<string> | null;
  inDeckOracleIds: Set<string>;
}): string | null {
  const pool = args.requirementPools.find((row) => row.requirementId === args.requirementId);
  const candidates = pool?.oracleIds ?? Object.keys(args.candidateDictionary);

  for (const oracleId of candidates) {
    if (args.inDeckOracleIds.has(oracleId)) continue;
    if (args.allowedOracleIds && !args.allowedOracleIds.has(oracleId)) continue;
    const facts = args.candidateDictionary[oracleId];
    if (facts && !facts.isLand) return oracleId;
  }

  for (const oracleId of Object.keys(args.candidateDictionary)) {
    if (args.inDeckOracleIds.has(oracleId)) continue;
    if (args.allowedOracleIds && !args.allowedOracleIds.has(oracleId)) continue;
    const facts = args.candidateDictionary[oracleId];
    if (facts && !facts.isLand) return oracleId;
  }

  return null;
}

export function repairDeckSetPreferenceViolationsV111(args: {
  deck: SolDirectedConstructedDeckV11;
  catalog: DeckResolutionCatalog;
  deckPreferences: string;
  candidateDictionary: Record<string, { oracleId: string; name: string; typeLine?: string; isLand?: boolean }>;
  requirementPools: RequirementPoolV11[];
  landPool?: LandPoolV11;
}): { deck: SolDirectedConstructedDeckV11; repairs: string[] } {
  const restrictions = parseDeckSetRestrictions(args.deckPreferences);
  if (!restrictions) return { deck: args.deck, repairs: [] };

  const allowedOracleIds = allowedOracleIdsForDeckPreferences({
    catalog: args.catalog,
    deckPreferences: args.deckPreferences,
    commanderOracleId: args.deck.commander.oracleId ?? "",
  });

  const deck: SolDirectedConstructedDeckV11 = {
    ...args.deck,
    nonlands: args.deck.nonlands.map((card) => ({ ...card })),
    lands: args.deck.lands.map((land) => ({ ...land })),
  };
  const repairs: string[] = [];
  const inDeckOracleIds = new Set(deck.nonlands.map((card) => card.oracleId).filter(Boolean));

  for (let i = 0; i < deck.nonlands.length; i += 1) {
    const card = deck.nonlands[i]!;
    if (!card.oracleId) continue;
    if (allowedOracleIds?.has(card.oracleId)) continue;

    const catalogCard = args.catalog.byOracleId.get(card.oracleId);
    if (catalogCard && cardMatchesDeckSetRestrictions(catalogCard, restrictions)) continue;

    const replacementOracleId = pickReplacementOracleId({
      requirementId: card.primaryArchitectRequirement,
      requirementPools: args.requirementPools,
      candidateDictionary: args.candidateDictionary,
      allowedOracleIds,
      inDeckOracleIds,
    });
    if (!replacementOracleId) continue;

    const replacement = args.candidateDictionary[replacementOracleId];
    if (!replacement) continue;

    deck.nonlands[i] = {
      ...card,
      oracleId: replacement.oracleId,
      name: replacement.name,
      typeLine: replacement.typeLine ?? card.typeLine,
      whyInThisDeck: `Set-preference repair replaced ${card.name}.`,
    };
    inDeckOracleIds.add(replacement.oracleId);
    repairs.push(`${card.name} → ${replacement.name}`);
  }

  const allowedLandNames = new Set(
    (args.landPool?.entries ?? [])
      .filter((entry) => entry.resolved !== false)
      .map((entry) => normalizeCardNameForMatch(entry.name)),
  );
  allowedLandNames.add(normalizeCardNameForMatch("Plains"));
  allowedLandNames.add(normalizeCardNameForMatch("Snow-Covered Plains"));

  for (let i = 0; i < deck.lands.length; i += 1) {
    const land = deck.lands[i]!;
    if (isBasicLandName(land.name)) continue;

    const catalogCard = [...args.catalog.byOracleId.values()].find(
      (row) => normalizeCardNameForMatch(row.canonicalName) === normalizeCardNameForMatch(land.name),
    );
    if (catalogCard && cardMatchesDeckSetRestrictions(catalogCard, restrictions)) continue;
    if (allowedLandNames.has(normalizeCardNameForMatch(land.name))) continue;

    const replacementName =
      [...(args.landPool?.entries ?? [])]
        .map((entry) => entry.name)
        .find(
          (name) =>
            !isBasicLandName(name) &&
            allowedLandNames.has(normalizeCardNameForMatch(name)) &&
            normalizeCardNameForMatch(name) !== normalizeCardNameForMatch(land.name),
        ) ?? "Plains";

    if (replacementName === "Plains") {
      deck.lands[i] = { ...land, name: "Plains", copies: land.copies };
    } else {
      deck.lands[i] = { ...land, name: replacementName, copies: 1 };
    }
    repairs.push(`${land.name} → ${replacementName}${replacementName === "Plains" ? ` x${land.copies}` : ""}`);
  }

  return { deck, repairs };
}
