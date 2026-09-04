/**
 * Applies the bracket attainment plan to a real sol-directed deck.
 *
 * Everything here exists to satisfy the terminal validator, which rejects a
 * nonland the Constructor never retrieved. So each addition is resolved through
 * the deck resolution catalog — not the semantic map — and registered in the
 * candidate dictionary before validation runs. Resolving through the catalog
 * also pins the oracle id the validator will compute, avoiding ORACLE_ID_DRIFT.
 *
 * An addition is dropped rather than forced whenever the catalog disagrees with
 * the plan: unresolvable, a land, off identity, or not commander legal. Shipping
 * a deck one bracket short is recoverable; shipping an illegal one is not.
 */
import { canonicalFactsFromOracleIdV111 } from "./professor-imported-deck-hydrate-v1-1-1";
import { attainRequestedBracketV1 } from "./professor-sol-directed-bracket-attainment-server-v1";
import { resolveCanonicalCardTruthV4164 } from "./professor-canonical-card-truth-v4-16-4-v1";
import { commanderLegalInIdentity } from "@/lib/semantic-visualization/filters-v1";
import type { BracketRubricCard } from "@/lib/commander-bracket-rubric/v1";
import type { CommanderBracket } from "@/lib/bracket-policy/bracket-policy-v1";
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import type {
  CanonicalCardFactsV11,
  SolDirectedConstructedDeckV11,
} from "./professor-sol-directed-types-v1-1";
import type { BracketAttainmentOutcomeV1 } from "./professor-sol-directed-bracket-attainment-server-v1";

export type BracketAttainmentApplicationV111 = {
  deck: SolDirectedConstructedDeckV11;
  /** Dictionary extended with the additions, or the original when nothing changed. */
  candidateDictionary: Record<string, CanonicalCardFactsV11>;
  outcome: BracketAttainmentOutcomeV1 | null;
  /** One line per applied swap, for the build artifact. */
  changes: string[];
  skipped: string[];
};

/** Rubric cards for the whole deck, read from the catalog the validator uses. */
function rubricCardsFromDeck(args: {
  deck: SolDirectedConstructedDeckV11;
  catalog: DeckResolutionCatalog;
}): BracketRubricCard[] {
  const cards: BracketRubricCard[] = [];
  const push = (name: string, oracleId: string | undefined, quantity: number, isCommander: boolean) => {
    const truth = resolveCanonicalCardTruthV4164({
      name,
      oracleId: oracleId || undefined,
      catalog: args.catalog,
    });
    if (!truth.oracleId) return;
    cards.push({
      oracleId: truth.oracleId,
      name: truth.name,
      typeLine: truth.typeLine,
      oracleText: truth.oracleText,
      quantity,
      isCommander,
    });
  };

  push(args.deck.commander.name, args.deck.commander.oracleId, 1, true);
  for (const card of args.deck.nonlands) push(card.name, card.oracleId, 1, false);
  for (const land of args.deck.lands) push(land.name, undefined, land.copies, false);
  return cards;
}

export async function applyBracketAttainmentV111(args: {
  deck: SolDirectedConstructedDeckV11;
  catalog: DeckResolutionCatalog;
  candidateDictionary: Record<string, CanonicalCardFactsV11>;
  requestedBracket: CommanderBracket;
  prohibitedOracleIds?: string[];
}): Promise<BracketAttainmentApplicationV111> {
  const unchanged: BracketAttainmentApplicationV111 = {
    deck: args.deck,
    candidateDictionary: args.candidateDictionary,
    outcome: null,
    changes: [],
    skipped: [],
  };

  const cards = rubricCardsFromDeck({ deck: args.deck, catalog: args.catalog });
  if (cards.length === 0) return unchanged;

  const outcome = await attainRequestedBracketV1({
    cards,
    nonlands: args.deck.nonlands
      .filter((card) => card.oracleId)
      .map((card) => ({
        oracleId: card.oracleId,
        name: card.name,
        primaryArchitectRequirement: card.primaryArchitectRequirement,
      })),
    commanderColorIdentity: args.deck.commander.colorIdentity,
    requestedBracket: args.requestedBracket,
    replaceableFlex: args.deck.replaceableFlex,
    excludeOracleIds: new Set(args.prohibitedOracleIds ?? []),
  });

  if (outcome.appliedSwaps.length === 0) return { ...unchanged, outcome };

  const dictionary = { ...args.candidateDictionary };
  const nonlands = [...args.deck.nonlands];
  const changes: string[] = [];
  const skipped: string[] = [];

  for (const swap of outcome.appliedSwaps) {
    const facts = canonicalFactsFromOracleIdV111(swap.add.oracleId, args.catalog);
    if (!facts) {
      skipped.push(`${swap.add.name}: not resolvable in the deck catalog`);
      continue;
    }
    if (facts.isLand) {
      skipped.push(`${swap.add.name}: is a land and cannot occupy a nonland slot`);
      continue;
    }
    if (!facts.commanderLegal) {
      skipped.push(`${swap.add.name}: not commander legal`);
      continue;
    }
    if (!commanderLegalInIdentity(facts.colorIdentity, args.deck.commander.colorIdentity)) {
      skipped.push(`${swap.add.name}: outside the commander's colour identity`);
      continue;
    }
    if (nonlands.some((card) => card.oracleId === facts.oracleId)) {
      skipped.push(`${swap.add.name}: already in the deck`);
      continue;
    }
    const index = nonlands.findIndex((card) => card.oracleId === swap.cut.oracleId);
    if (index === -1) {
      skipped.push(`${swap.cut.name}: no longer in the deck to cut`);
      continue;
    }

    const outgoing = nonlands[index]!;
    nonlands[index] = {
      ...outgoing,
      oracleId: facts.oracleId,
      name: facts.name,
      typeLine: facts.typeLine,
      // The requirement is inherited so the architect's per-requirement counts
      // still add up after the swap.
      primaryArchitectRequirement: outgoing.primaryArchitectRequirement,
      whyInThisDeck: swap.reason,
    };
    dictionary[facts.oracleId] = facts;
    changes.push(`${swap.cut.name} → ${facts.name}`);
  }

  if (changes.length === 0) {
    return { ...unchanged, outcome, skipped };
  }

  return {
    deck: { ...args.deck, nonlands },
    candidateDictionary: dictionary,
    outcome,
    changes,
    skipped,
  };
}
