/**
 * Resolve an imported Commander list against the deck-resolution catalog.
 */
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import { combinedGoldenOracleText } from "../../../scripts/lib/load-golden-catalog-index";
import { commanderLegalInIdentity } from "@/lib/semantic-visualization/filters-v1";
import { resolveCatalogCardByName } from "../commander-strategy/resolve-catalog-card-by-name";
import {
  cardTruthAllowsIntelligenceParticipation,
  resolveCanonicalCardTruthV4164,
} from "./professor-canonical-card-truth-v4-16-4-v1";
import { isCanonicalLandForDeckPartition } from "./professor-canonical-deck-partition-v1";
import { inferCardSemanticFunctions } from "./professor-card-semantic-functions-v1-1-1";
import { resolveCommanderBlueprintFromCatalogV417 } from "./professor-commander-catalog-v4-17-v1";
import { isBasicLandName } from "./professor-commander-legality-v4-9-v1";
import { getSemanticOracleFactsForOracleId } from "./professor-semantic-oracle-facts-v1-1-1";
import type { CommanderBlueprintV417 } from "./professor-brew-blueprint-v4-17-v1";
import type { CanonicalCardFactsV11, SolDirectedConstructedDeckV11 } from "./professor-sol-directed-types-v1-1";
import {
  flattenImportedMainboardCopies,
  parseProfessorImportedDecklistV111,
  type ProfessorImportedDeckCardV111,
  type ProfessorImportedDeckPreviewV111,
  type ProfessorImportedResolvedCardV111,
} from "./professor-imported-decklist-v1-1-1";
import { assignImportedCardRequirementV111 } from "./professor-imported-optimize-plan-v1-1-1";

export const PROFESSOR_IMPORTED_DECK_HYDRATE_V1_1_1_VERSION = "professor-imported-deck-hydrate-v1-1-1";

export type { ProfessorImportedDeckPreviewV111, ProfessorImportedResolvedCardV111 };

function lookupCatalogCard(name: string, catalog: DeckResolutionCatalog) {
  const lookup = resolveCatalogCardByName(name, catalog);
  return lookup.status === "resolved" ? lookup.card : null;
}

function isLikelyCommanderCard(typeLine: string, oracleText: string): boolean {
  const types = typeLine.toLowerCase();
  if (types.includes("legendary") && types.includes("creature")) return true;
  return /can be your commander/i.test(oracleText);
}

export function canonicalFactsFromOracleIdV111(
  oracleId: string,
  catalog: DeckResolutionCatalog,
): CanonicalCardFactsV11 | null {
  const card = catalog.byOracleId.get(oracleId);
  if (!card) return null;
  const truth = resolveCanonicalCardTruthV4164({
    name: card.canonicalName,
    oracleId: card.oracleId,
    catalog,
  });
  if (!cardTruthAllowsIntelligenceParticipation(truth) || !truth.oracleId) return null;
  const oracleText = truth.oracleText;
  const typeLine = truth.typeLine;
  return {
    oracleId: truth.oracleId,
    name: truth.name,
    manaValue: truth.manaValue,
    typeLine,
    colorIdentity: truth.colorIdentity,
    oracleText,
    semanticFunctions: inferCardSemanticFunctions(oracleText, typeLine),
    semanticOracle: getSemanticOracleFactsForOracleId(truth.oracleId),
    commanderLegal: card.legalities?.commander === "legal" || card.legalities?.commander === "restricted",
    isLand: isCanonicalLandForDeckPartition(truth),
  };
}

function resolveImportedLine(args: {
  sourceName: string;
  copies: number;
  catalog: DeckResolutionCatalog;
  commanderColorIdentity: string[];
}): ProfessorImportedResolvedCardV111 {
  const card = lookupCatalogCard(args.sourceName, args.catalog);
  if (!card) {
    return {
      sourceName: args.sourceName,
      copies: args.copies,
      resolved: false,
      name: args.sourceName,
      oracleId: null,
      typeLine: "",
      isLand: false,
      commanderLegal: false,
      colorIdentity: [],
      offColor: false,
    };
  }
  const truth = resolveCanonicalCardTruthV4164({
    name: card.canonicalName,
    oracleId: card.oracleId,
    catalog: args.catalog,
  });
  const colorIdentity = truth.colorIdentity ?? card.colorIdentity ?? [];
  const offColor =
    args.commanderColorIdentity.length > 0 &&
    !commanderLegalInIdentity(colorIdentity, args.commanderColorIdentity);
  return {
    sourceName: args.sourceName,
    copies: args.copies,
    resolved: cardTruthAllowsIntelligenceParticipation(truth),
    name: truth.name || card.canonicalName,
    oracleId: truth.oracleId,
    typeLine: truth.typeLine || card.typeLine || "",
    isLand: isCanonicalLandForDeckPartition(truth),
    commanderLegal: card.legalities?.commander === "legal" || card.legalities?.commander === "restricted",
    colorIdentity,
    offColor,
  };
}

function inferCommanderName(args: {
  parsedCommanderNames: string[];
  selectedCommanderName?: string;
  mainboard: ProfessorImportedDeckCardV111[];
  catalog: DeckResolutionCatalog;
}): string | null {
  if (args.selectedCommanderName?.trim()) return args.selectedCommanderName.trim();
  if (args.parsedCommanderNames[0]) return args.parsedCommanderNames[0]!;
  for (const card of args.mainboard) {
    const resolved = lookupCatalogCard(card.name, args.catalog);
    if (!resolved) continue;
    const oracleText = combinedGoldenOracleText(resolved);
    if (isLikelyCommanderCard(resolved.typeLine ?? "", oracleText)) return resolved.canonicalName;
  }
  return null;
}

export function previewProfessorImportedDeckV111(args: {
  decklist?: string;
  importedCards?: ProfessorImportedDeckCardV111[];
  selectedCommanderName?: string;
  catalog: DeckResolutionCatalog;
}): ProfessorImportedDeckPreviewV111 {
  const parsed = args.decklist?.trim()
    ? parseProfessorImportedDecklistV111(args.decklist)
    : { commanderNames: [], mainboard: flattenImportedMainboardCopies(args.importedCards ?? []), rawLineCount: 0 };

  const extraCommanders = parsed.commanderNames.slice(1).map((name) => ({ name, copies: 1 }));
  const mainboard = flattenImportedMainboardCopies([...parsed.mainboard, ...extraCommanders]);
  const commanderName = inferCommanderName({
    parsedCommanderNames: parsed.commanderNames,
    selectedCommanderName: args.selectedCommanderName,
    mainboard,
    catalog: args.catalog,
  });

  let commanderResolved = false;
  let commanderColorIdentity: string[] = [];
  if (commanderName) {
    try {
      const commander = resolveCommanderBlueprintFromCatalogV417({
        catalog: args.catalog,
        commanderName,
      });
      commanderResolved = true;
      commanderColorIdentity = commander.colorIdentity;
    } catch {
      commanderResolved = false;
    }
  }

  const commanderKey = commanderName?.trim().toLowerCase() ?? "";
  const cards = mainboard
    .filter((card) => card.name.trim().toLowerCase() !== commanderKey)
    .map((card) =>
      resolveImportedLine({
        sourceName: card.name,
        copies: card.copies,
        catalog: args.catalog,
        commanderColorIdentity,
      }),
    );

  const recognized = cards.filter((card) => card.resolved).reduce((sum, card) => sum + card.copies, 0);
  const total = cards.reduce((sum, card) => sum + card.copies, 0);
  const unresolvedNames = [...new Set(cards.filter((card) => !card.resolved).map((card) => card.sourceName))];
  const offColorNames = [...new Set(cards.filter((card) => card.offColor).map((card) => card.name))];
  const landCount = cards.filter((card) => card.resolved && card.isLand).reduce((sum, card) => sum + card.copies, 0);
  const nonlandCount = cards
    .filter((card) => card.resolved && !card.isLand)
    .reduce((sum, card) => sum + card.copies, 0);
  const libraryCount = landCount + nonlandCount;

  const blockers: string[] = [];
  if (!commanderName) blockers.push("No commander found — add a Commanders section or pick one.");
  else if (!commanderResolved) blockers.push(`Commander “${commanderName}” is not in the catalog.`);
  if (total < 80) blockers.push(`List is too small (${total} cards besides the commander). Need about 99.`);
  if (unresolvedNames.length > 5) {
    blockers.push(`${unresolvedNames.length} cards could not be recognized.`);
  } else if (unresolvedNames.length > 0 && recognized < 90) {
    blockers.push("Too many unrecognized cards to optimize this list.");
  }
  if (offColorNames.length > 0) {
    blockers.push(`${offColorNames.length} card${offColorNames.length === 1 ? "" : "s"} outside the commander's colors.`);
  }

  return {
    commanderName,
    commanderResolved,
    cards,
    recognized,
    total,
    unresolvedNames,
    offColorNames,
    libraryCount,
    landCount,
    nonlandCount,
    canOptimize: blockers.length === 0 && commanderResolved,
    blockers,
  };
}

export function hydrateProfessorImportedDeckV111(args: {
  importedCards: ProfessorImportedDeckCardV111[];
  commanderName: string;
  catalog: DeckResolutionCatalog;
  playstyle: string;
  deckTheme?: string;
}): {
  commander: CommanderBlueprintV417;
  deck: SolDirectedConstructedDeckV11;
  preview: ProfessorImportedDeckPreviewV111;
} {
  const commander = resolveCommanderBlueprintFromCatalogV417({
    catalog: args.catalog,
    commanderName: args.commanderName,
  });
  const preview = previewProfessorImportedDeckV111({
    importedCards: args.importedCards,
    selectedCommanderName: commander.name,
    catalog: args.catalog,
  });

  const lands: Array<{ name: string; copies: number }> = [];
  const nonlands: SolDirectedConstructedDeckV11["nonlands"] = [];

  for (const card of preview.cards) {
    if (!card.resolved || !card.oracleId) continue;
    const facts = canonicalFactsFromOracleIdV111(card.oracleId, args.catalog);
    if (!facts) continue;
    if (facts.isLand) {
      const existing = lands.find((row) => row.name === facts.name);
      if (existing) existing.copies += card.copies;
      else lands.push({ name: facts.name, copies: card.copies });
      continue;
    }
    const requirement = assignImportedCardRequirementV111(facts);
    for (let i = 0; i < card.copies; i += 1) {
      if (!isBasicLandName(facts.name) && nonlands.some((row) => row.oracleId === facts.oracleId)) continue;
      nonlands.push({
        oracleId: facts.oracleId,
        name: facts.name,
        typeLine: facts.typeLine,
        primaryArchitectRequirement: requirement.requirementId,
        primaryRole: requirement.primaryRole,
        secondaryRoles: facts.semanticFunctions,
        packageMembership: [],
        whyInThisDeck: "Imported from the customer's existing list.",
        structuralNecessity: "FLEX",
      });
    }
  }

  const landCount = lands.reduce((sum, land) => sum + land.copies, 0);
  const theme = args.deckTheme?.trim();
  const deck: SolDirectedConstructedDeckV11 = {
    commander,
    landCount,
    lands,
    nonlands,
    primaryWinPaths: theme
      ? [`Preserve the imported ${commander.name} list's existing win conditions (${theme}).`]
      : [`Preserve the imported ${commander.name} list's existing win conditions.`],
    secondaryWinPaths: [],
    expectedPlayPattern: args.playstyle,
    structuralNecessities: [commander.name],
    replaceableFlex: nonlands.map((card) => card.name),
  };

  return { commander, deck, preview };
}
