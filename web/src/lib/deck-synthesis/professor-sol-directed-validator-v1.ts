/**
 * DETERMINISTIC VALIDATOR — factual truth only; audit counts do not rewrite Sol reasoning.
 */
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import { isCurrentlyCommanderLegal } from "../../../scripts/lib/load-deck-resolution-catalog";
import { commanderLegalInIdentity } from "@/lib/semantic-visualization/filters-v1";
import {
  cardTruthAllowsIntelligenceParticipation,
  resolveCanonicalCardTruthV4164,
} from "./professor-canonical-card-truth-v4-16-4-v1";
import {
  countCanonicalNonlandsInBlueprintV1,
  isCanonicalLandForDeckPartition,
  resolveStructuralSlotKindV1,
} from "./professor-canonical-deck-partition-v1";
import { evaluateSingletonPool } from "./professor-commander-legality-v4-9-v1";
import { COMMANDER_DECK_LIBRARY_SIZE_V47 } from "./professor-deck-completion-v4-7-v1";
import type { SolDirectedConstructedDeckV1, SolDirectedValidationV1 } from "./professor-sol-directed-types-v1";

export const PROFESSOR_SOL_DIRECTED_VALIDATOR_V1_VERSION = "professor-sol-directed-validator-v1";

function oracleTextLower(text: string): string {
  return text.toLowerCase();
}

function countByPattern(cards: Array<{ oracleText: string }>, pattern: RegExp): number {
  return cards.filter((c) => pattern.test(oracleTextLower(c.oracleText))).length;
}

export function validateSolDirectedDeckV1(args: {
  deck: SolDirectedConstructedDeckV1;
  catalog: DeckResolutionCatalog;
  bracket?: number;
}): SolDirectedValidationV1 {
  const violations: string[] = [];
  const resolvedCards: Array<{
    name: string;
    oracleId: string | null;
    oracleText: string;
    truth: ReturnType<typeof resolveCanonicalCardTruthV4164>;
  }> = [];

  for (const card of args.deck.nonlands) {
    const truth = resolveCanonicalCardTruthV4164({
      name: card.name,
      oracleId: card.oracleId || undefined,
      catalog: args.catalog,
    });
    if (!cardTruthAllowsIntelligenceParticipation(truth)) {
      violations.push(`UNRESOLVED_NONLAND:${card.name}`);
      continue;
    }
    if (isCanonicalLandForDeckPartition(truth)) {
      violations.push(`LAND_IN_NONLANDS:${card.name}`);
    }
    if (!isCurrentlyCommanderLegal(args.catalog.byOracleId.get(truth.oracleId!)!)) {
      violations.push(`ILLEGAL_CARD:${card.name}`);
    }
    if (!commanderLegalInIdentity(truth.colorIdentity, args.deck.commander.colorIdentity)) {
      violations.push(`OFF_COLOR:${card.name}`);
    }
    resolvedCards.push({ name: truth.name, oracleId: truth.oracleId, oracleText: truth.oracleText, truth });
  }

  const resolvedLands: string[] = [];
  for (const landName of args.deck.lands) {
    const truth = resolveCanonicalCardTruthV4164({ name: landName, catalog: args.catalog });
    if (!cardTruthAllowsIntelligenceParticipation(truth)) {
      violations.push(`UNRESOLVED_LAND:${landName}`);
      continue;
    }
    if (!isCanonicalLandForDeckPartition(truth)) {
      violations.push(`NONLAND_IN_LANDS:${landName}`);
    }
    if (!isCurrentlyCommanderLegal(args.catalog.byOracleId.get(truth.oracleId!)!)) {
      violations.push(`ILLEGAL_LAND:${landName}`);
    }
    if (!commanderLegalInIdentity(truth.colorIdentity, args.deck.commander.colorIdentity)) {
      violations.push(`OFF_COLOR_LAND:${landName}`);
    }
    resolvedLands.push(truth.name);
  }

  const libraryCount = resolvedCards.length + resolvedLands.length;
  if (libraryCount !== COMMANDER_DECK_LIBRARY_SIZE_V47) {
    violations.push(`LIBRARY_COUNT:${libraryCount}!=${COMMANDER_DECK_LIBRARY_SIZE_V47}`);
  }
  if (args.deck.landCount !== resolvedLands.length) {
    violations.push(`LAND_COUNT_MISMATCH:declared=${args.deck.landCount},actual=${resolvedLands.length}`);
  }

  const singleton = evaluateSingletonPool([...resolvedCards.map((c) => c.name), ...resolvedLands]);
  if (!singleton.pass) {
    violations.push(`DUPLICATES:${singleton.duplicateNonBasics.join(",")}`);
  }

  const pseudoBlueprint = {
    selectedCards: resolvedCards.map((c) => ({
      oracleId: c.oracleId ?? c.name,
      name: c.name,
    })),
  };
  const partition = countCanonicalNonlandsInBlueprintV1({
    blueprint: pseudoBlueprint as never,
    catalog: args.catalog,
  });
  if (partition.landsMisclassifiedAsNonlands.length > 0) {
    violations.push(`LANDS_AS_NONLANDS:${partition.landsMisclassifiedAsNonlands.join(",")}`);
  }

  const auditCounts = {
    ramp: countByPattern(resolvedCards, /\badd \{/),
    draw: countByPattern(resolvedCards, /draw (a|one|two|three|\d+) card|draws .* card/),
    interaction: countByPattern(resolvedCards, /destroy target|exile target|counter target|return target/),
    protection: countByPattern(resolvedCards, /hexproof|indestructible|protection from|prevent all/),
    tutorsAccess: countByPattern(resolvedCards, /search your library/),
    averageMv:
      resolvedCards.length > 0
        ? resolvedCards.reduce((s, c) => s + (c.truth.manaValue ?? 0), 0) / resolvedCards.length
        : 0,
  };

  return {
    pass: violations.length === 0,
    libraryCount,
    landCount: resolvedLands.length,
    nonlandCount: resolvedCards.length,
    violations,
    auditCounts,
  };
}

export function cardExistsInCatalogV1(name: string, catalog: DeckResolutionCatalog): boolean {
  const slot = resolveStructuralSlotKindV1({ name, catalog });
  return slot !== "unresolved";
}
