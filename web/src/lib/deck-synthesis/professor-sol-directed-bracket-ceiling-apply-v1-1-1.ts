/**
 * Applies the bracket ceiling plan to a real sol-directed deck.
 *
 * The mirror of the attainment apply step, with one structural advantage:
 * replacements are drawn from the candidate dictionary, so every card this pass
 * introduces was already retrieved and is already registered. That removes the
 * whole class of validation failure attainment had to be taught to avoid, and
 * this module never extends the dictionary.
 *
 * Land swaps are the exception worth being careful about. A Game Changer land
 * is the one thing that can hold a deck above bracket 2 no matter how many
 * nonlands are cut, so the pass may replace one with a basic. The basic is only
 * ever chosen from basics the deck already runs, which means the swap cannot
 * introduce a colour the mana base was not already producing.
 *
 * A swap is dropped rather than forced whenever the catalog disagrees with the
 * plan. Shipping a deck one bracket hot is recoverable; shipping an illegal one
 * is not.
 */
import { containRequestedBracketV1 } from "./professor-sol-directed-bracket-ceiling-server-v1";
import { canonicalFactsFromOracleIdV111 } from "./professor-imported-deck-hydrate-v1-1-1";
import { resolveCanonicalCardTruthV4164 } from "./professor-canonical-card-truth-v4-16-4-v1";
import { commanderLegalInIdentity } from "@/lib/semantic-visualization/filters-v1";
import type { BracketRubricCard } from "@/lib/commander-bracket-rubric/v1";
import type { CommanderBracket } from "@/lib/bracket-policy/bracket-policy-v1";
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import type {
  CanonicalCardFactsV11,
  SolDirectedConstructedDeckV11,
} from "./professor-sol-directed-types-v1-1";
import type {
  BracketCeilingOutcomeV1,
  BracketCeilingReplacementSourceV1,
} from "./professor-sol-directed-bracket-ceiling-server-v1";

const BASIC_LAND_NAMES = new Set(["Plains", "Island", "Swamp", "Mountain", "Forest", "Wastes"]);

export type BracketCeilingApplicationV111 = {
  deck: SolDirectedConstructedDeckV11;
  outcome: BracketCeilingOutcomeV1 | null;
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

/** Retrieved-but-unused candidates, which need no dictionary registration. */
function replacementPoolFromDictionary(args: {
  candidateDictionary: Record<string, CanonicalCardFactsV11>;
  deck: SolDirectedConstructedDeckV11;
  commanderColorIdentity: string[];
}): BracketCeilingReplacementSourceV1[] {
  const present = new Set<string>([
    args.deck.commander.oracleId,
    ...args.deck.nonlands.map((card) => card.oracleId),
  ]);
  const pool: BracketCeilingReplacementSourceV1[] = [];
  for (const facts of Object.values(args.candidateDictionary)) {
    if (present.has(facts.oracleId)) continue;
    if (facts.isLand) continue;
    if (!facts.commanderLegal) continue;
    if (!commanderLegalInIdentity(facts.colorIdentity, args.commanderColorIdentity)) continue;
    pool.push({
      oracleId: facts.oracleId,
      name: facts.name,
      oracleText: facts.oracleText,
      typeLine: facts.typeLine,
    });
  }
  return pool;
}

export async function applyBracketCeilingV111(args: {
  deck: SolDirectedConstructedDeckV11;
  catalog: DeckResolutionCatalog;
  candidateDictionary: Record<string, CanonicalCardFactsV11>;
  requestedBracket: CommanderBracket;
}): Promise<BracketCeilingApplicationV111> {
  const unchanged: BracketCeilingApplicationV111 = {
    deck: args.deck,
    outcome: null,
    changes: [],
    skipped: [],
  };

  const cards = rubricCardsFromDeck({ deck: args.deck, catalog: args.catalog });
  if (cards.length === 0) return unchanged;

  // Only a basic the deck already runs, so the mana base keeps its colours.
  const basicInDeck = args.deck.lands.find((land) => BASIC_LAND_NAMES.has(land.name));
  const basicTruth = basicInDeck
    ? resolveCanonicalCardTruthV4164({ name: basicInDeck.name, catalog: args.catalog })
    : null;

  const outcome = await containRequestedBracketV1({
    cards,
    nonlands: args.deck.nonlands
      .filter((card) => card.oracleId)
      .map((card) => ({
        oracleId: card.oracleId,
        name: card.name,
        primaryArchitectRequirement: card.primaryArchitectRequirement,
      })),
    requestedBracket: args.requestedBracket,
    replacementPool: replacementPoolFromDictionary({
      candidateDictionary: args.candidateDictionary,
      deck: args.deck,
      commanderColorIdentity: args.deck.commander.colorIdentity,
    }),
    basicLandReplacement:
      basicTruth?.oracleId && basicInDeck
        ? { oracleId: basicTruth.oracleId, name: basicTruth.name }
        : null,
  });

  if (outcome.appliedSwaps.length === 0) return { ...unchanged, outcome };

  const nonlands = [...args.deck.nonlands];
  const lands = args.deck.lands.map((land) => ({ ...land }));
  const changes: string[] = [];
  const skipped: string[] = [];

  for (const swap of outcome.appliedSwaps) {
    if (swap.isLandSwap) {
      if (!swap.basicLand || !basicInDeck) {
        skipped.push(`${swap.cut.name}: no basic available to replace it`);
        continue;
      }
      const index = lands.findIndex((land) => land.name === swap.cut.name);
      if (index === -1) {
        skipped.push(`${swap.cut.name}: no longer in the land base to cut`);
        continue;
      }
      const outgoing = lands[index]!;
      // Fold the copies into the existing basic rather than leaving a duplicate
      // entry, so the land base stays one row per card.
      const basicIndex = lands.findIndex((land) => land.name === swap.basicLand!.name);
      if (basicIndex === -1) {
        skipped.push(`${swap.basicLand.name}: not present in the land base`);
        continue;
      }
      lands[basicIndex] = { ...lands[basicIndex]!, copies: lands[basicIndex]!.copies + outgoing.copies };
      lands.splice(index, 1);
      changes.push(`${outgoing.name} → ${swap.basicLand.name} (land)`);
      continue;
    }

    if (!swap.add) continue;
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
      // Inherited so the architect's per-requirement counts still add up.
      primaryArchitectRequirement: outgoing.primaryArchitectRequirement,
      whyInThisDeck: `Swapped in to keep the deck at bracket ${args.requestedBracket}, replacing ${outgoing.name}.`,
    };
    changes.push(`${outgoing.name} → ${facts.name}`);
  }

  if (changes.length === 0) return { ...unchanged, outcome, skipped };

  return { deck: { ...args.deck, nonlands, lands }, outcome, changes, skipped };
}
