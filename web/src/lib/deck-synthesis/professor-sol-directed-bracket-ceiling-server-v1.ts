/**
 * Server half of the bracket ceiling pass: measure the finished deck, plan the
 * removals that bring it back to the requested bracket, apply them, measure
 * again.
 *
 * Mirrors the attainment pass deliberately, including the rule that success is
 * only ever claimed when the same rubric that graded the deck agrees after the
 * fact. The two passes are exclusive by construction — a deck is either over or
 * under, never both — so they can sit side by side without fighting.
 *
 * Sourcing differs from attainment in one important way. Attainment has to
 * reach outside the retrieval pools for Game Changers, because pools rarely
 * contain any, and then register what it adds. The ceiling pass wants ordinary
 * cards, and the candidate dictionary is already full of them: everything the
 * Constructor retrieved but did not use is in-identity, legal and registered.
 * Drawing replacements from there means this pass never has to extend the
 * dictionary, so it cannot introduce the validation failure that attainment had
 * to be taught to avoid.
 *
 * Signal detection reuses the rubric's own detectors rather than re-deriving
 * "is this a tutor". If the two disagreed, the pass would cut cards that do not
 * move the measurement and leave the deck both weaker and still over-bracket.
 */
import {
  classifyCommanderBracketV1,
  type BracketRubricCard,
  type CommanderBracketRubricResult,
} from "@/lib/commander-bracket-rubric/v1";
import {
  detectExtraTurnCards,
  detectLoopableExtraTurnCards,
  detectMassLandDenial,
  detectUnrestrictedTutors,
} from "@/lib/commander-bracket-rubric/v1/detectors";
import { comboSummaryForDeck } from "@/lib/commander-bracket-rubric/v1/combos-server";
import {
  gameChangerOracleIdSet,
  loadCommanderGameChangerSnapshot,
} from "@/lib/commander-strategy/model-c/game-changer-snapshot-v1";
import { playRateFor } from "@/lib/deck-swap/v1/play-rate-server";
import { isLandType, specificRolesOf } from "@/lib/deck-swap/v1/upgrade-candidates-server";
import { loadRc8OracleTextIndex } from "@/lib/card-oracle-text/rc8-oracle-text-index";
import { getSemanticMapPoint } from "@/lib/semantic-visualization/artifact-loader";
import type { CommanderBracket } from "@/lib/bracket-policy/bracket-policy-v1";
import {
  planBracketCeilingV1,
  type BracketCeilingPlanV1,
  type CeilingAddCandidateV1,
  type CeilingComboSetV1,
  type CeilingDeckCardV1,
  type CeilingSwapV1,
} from "./professor-sol-directed-bracket-ceiling-v1";

export type BracketCeilingNonlandV1 = {
  oracleId: string;
  name: string;
  primaryArchitectRequirement: string;
};

/** An unused retrieval candidate, offered as a replacement. */
export type BracketCeilingReplacementSourceV1 = {
  oracleId: string;
  name: string;
  oracleText: string;
  typeLine: string;
};

export type BracketCeilingOutcomeV1 = {
  plan: BracketCeilingPlanV1;
  measuredBefore: CommanderBracketRubricResult;
  /** Null when the plan proposed nothing, so nothing was re-measured. */
  measuredAfter: CommanderBracketRubricResult | null;
  /** True only when the rubric confirms the deck is no longer over-bracket. */
  contained: boolean;
  cards: BracketRubricCard[];
  appliedSwaps: CeilingSwapV1[];
  notes: string[];
};

/** A basic the deck already runs, offered to replace an over-bracket land. */
export type BracketCeilingBasicLandV1 = {
  oracleId: string;
  name: string;
};

/**
 * Builds the per-card signal flags the planner needs, using the rubric's own
 * detectors so both agree on what counts.
 */
function describeDeckCards(args: {
  cards: BracketRubricCard[];
  nonlandOracleIds: ReadonlySet<string>;
  gameChangerOracleIds: ReadonlySet<string>;
}): CeilingDeckCardV1[] {
  const idsOf = (list: BracketRubricCard[]) => new Set(list.map((card) => card.oracleId));
  const extraTurns = idsOf(detectExtraTurnCards(args.cards));
  const loopableExtraTurns = idsOf(detectLoopableExtraTurnCards(args.cards));
  const massLandDenial = idsOf(detectMassLandDenial(args.cards));
  const unrestrictedTutors = idsOf(detectUnrestrictedTutors(args.cards));

  return args.cards.map((card) => {
    const point = getSemanticMapPoint(card.oracleId);
    // A card the deck holds in its land slots is the land base pass's business.
    // Falling back to the type line covers cards with no semantic point.
    const isLand = point
      ? isLandType(point.types)
      : /\bland\b/i.test(card.typeLine) || (!args.nonlandOracleIds.has(card.oracleId) && !card.isCommander);
    return {
      oracleId: card.oracleId,
      name: card.name,
      playRate: playRateFor(card.oracleId)?.rate ?? null,
      specificRoles: specificRolesOf(point?.derivedRoles ?? []),
      isCommander: card.isCommander === true,
      isLand,
      isGameChanger: args.gameChangerOracleIds.has(card.oracleId),
      isUnrestrictedTutor: unrestrictedTutors.has(card.oracleId),
      isExtraTurn: extraTurns.has(card.oracleId),
      isLoopableExtraTurn: loopableExtraTurns.has(card.oracleId),
      isMassLandDenial: massLandDenial.has(card.oracleId),
    };
  });
}

/**
 * Turns unused retrieval candidates into replacements, flagging any that would
 * reintroduce a signal the pass is trying to remove.
 */
function sourceReplacements(args: {
  pool: readonly BracketCeilingReplacementSourceV1[];
  presentOracleIds: ReadonlySet<string>;
  gameChangerOracleIds: ReadonlySet<string>;
  comboSetsByOracleId: ReadonlyMap<string, string[]>;
}): CeilingAddCandidateV1[] {
  const asRubricCards = args.pool
    .filter((entry) => !args.presentOracleIds.has(entry.oracleId))
    .map<BracketRubricCard>((entry) => ({
      oracleId: entry.oracleId,
      name: entry.name,
      typeLine: entry.typeLine,
      oracleText: entry.oracleText,
      quantity: 1,
      isCommander: false,
    }))
    .filter((card) => !/\bland\b/i.test(card.typeLine));

  const idsOf = (list: BracketRubricCard[]) => new Set(list.map((card) => card.oracleId));
  const extraTurns = idsOf(detectExtraTurnCards(asRubricCards));
  const massLandDenial = idsOf(detectMassLandDenial(asRubricCards));
  const unrestrictedTutors = idsOf(detectUnrestrictedTutors(asRubricCards));

  return asRubricCards.map((card) => ({
    oracleId: card.oracleId,
    name: card.name,
    playRate: playRateFor(card.oracleId)?.rate ?? null,
    specificRoles: specificRolesOf(getSemanticMapPoint(card.oracleId)?.derivedRoles ?? []),
    isGameChanger: args.gameChangerOracleIds.has(card.oracleId),
    isUnrestrictedTutor: unrestrictedTutors.has(card.oracleId),
    isExtraTurn: extraTurns.has(card.oracleId),
    isMassLandDenial: massLandDenial.has(card.oracleId),
    completesComboSignatures: args.comboSetsByOracleId.get(card.oracleId) ?? [],
  }));
}

export async function containRequestedBracketV1(args: {
  cards: BracketRubricCard[];
  nonlands: readonly BracketCeilingNonlandV1[];
  requestedBracket: CommanderBracket;
  /** Retrieved-but-unused candidates, already registered for validation. */
  replacementPool: readonly BracketCeilingReplacementSourceV1[];
  /**
   * A basic the deck already runs. Supplying it lets the pass replace a Game
   * Changer land, which is otherwise the one thing that can hold a deck above
   * bracket 2 no matter how many nonlands are cut.
   */
  basicLandReplacement?: BracketCeilingBasicLandV1 | null;
}): Promise<BracketCeilingOutcomeV1> {
  const notes: string[] = [];
  const gameChangerOracleIds = gameChangerOracleIdSet(loadCommanderGameChangerSnapshot());

  const combosBefore = await comboSummaryForDeck({ cards: args.cards });
  const measuredBefore = classifyCommanderBracketV1({
    cards: args.cards,
    gameChangerOracleIds,
    combos: combosBefore,
  });

  const emptyPlan = planBracketCeilingV1({
    requestedBracket: args.requestedBracket,
    measuredBracket: measuredBefore.assignedBracket,
    deckCards: [],
    comboSets: [],
    addCandidates: [],
  });
  const unchanged: BracketCeilingOutcomeV1 = {
    plan: emptyPlan,
    measuredBefore,
    measuredAfter: null,
    contained: measuredBefore.assignedBracket <= args.requestedBracket,
    cards: args.cards,
    appliedSwaps: [],
    notes,
  };
  if (measuredBefore.assignedBracket <= args.requestedBracket) return unchanged;

  const comboSets: CeilingComboSetV1[] = (combosBefore.comboSets ?? []).map((set) => ({
    signature: set.cards.map((card) => card.oracleId).join("|"),
    cardCount: set.cardCount,
    oracleIds: set.cards.map((card) => card.oracleId),
  }));
  const comboSetsByOracleId = new Map<string, string[]>();
  for (const set of comboSets) {
    for (const oracleId of set.oracleIds) {
      const existing = comboSetsByOracleId.get(oracleId) ?? [];
      existing.push(set.signature);
      comboSetsByOracleId.set(oracleId, existing);
    }
  }

  const nonlandOracleIds = new Set(args.nonlands.map((nonland) => nonland.oracleId));
  const deckCards = describeDeckCards({
    cards: args.cards,
    nonlandOracleIds,
    gameChangerOracleIds,
  });
  const addCandidates = sourceReplacements({
    pool: args.replacementPool,
    presentOracleIds: new Set(args.cards.map((card) => card.oracleId)),
    gameChangerOracleIds,
    comboSetsByOracleId,
  });

  const plan = planBracketCeilingV1({
    requestedBracket: args.requestedBracket,
    measuredBracket: measuredBefore.assignedBracket,
    deckCards,
    comboSets,
    addCandidates,
    basicLandReplacement: args.basicLandReplacement ?? null,
  });

  if (plan.swaps.length === 0) {
    return { ...unchanged, plan, contained: false, notes: [...notes, ...plan.notes] };
  }

  const oracleText = await loadRc8OracleTextIndex();
  const swapByCutOracleId = new Map(plan.swaps.map((swap) => [swap.cut.oracleId, swap] as const));
  const appliedSwaps: CeilingSwapV1[] = [];
  const cards: BracketRubricCard[] = [];

  for (const card of args.cards) {
    const swap = swapByCutOracleId.get(card.oracleId);
    if (!swap) {
      cards.push(card);
      continue;
    }
    if (swap.isLandSwap && swap.basicLand) {
      const basic = oracleText.get(swap.basicLand.oracleId);
      if (!basic) {
        cards.push(card);
        notes.push(`Kept ${card.name}: no oracle text for the basic meant to replace it.`);
        continue;
      }
      cards.push({
        oracleId: swap.basicLand.oracleId,
        name: basic.name || swap.basicLand.name,
        typeLine: getSemanticMapPoint(swap.basicLand.oracleId)?.typeLine ?? "Basic Land",
        oracleText: basic.oracleText,
        quantity: card.quantity,
        isCommander: false,
      });
      appliedSwaps.push(swap);
      continue;
    }
    if (!swap.add) {
      // No replacement exists. Dropping the card outright would leave the deck
      // at 98, which the validator rejects, so the over-bracket card stays and
      // the shortfall is reported instead.
      cards.push(card);
      notes.push(`Kept ${card.name}: no eligible replacement was available.`);
      continue;
    }
    const entry = oracleText.get(swap.add.oracleId);
    const point = getSemanticMapPoint(swap.add.oracleId);
    if (!entry || !point) {
      cards.push(card);
      notes.push(`Skipped ${swap.add.name}: no oracle text available to verify the change.`);
      continue;
    }
    cards.push({
      oracleId: swap.add.oracleId,
      name: entry.name || swap.add.name,
      typeLine: point.typeLine,
      oracleText: entry.oracleText,
      quantity: card.quantity,
      isCommander: false,
    });
    appliedSwaps.push(swap);
  }

  if (appliedSwaps.length === 0) {
    return { ...unchanged, plan, contained: false, notes: [...notes, ...plan.notes] };
  }

  const combosAfter = await comboSummaryForDeck({ cards });
  const measuredAfter = classifyCommanderBracketV1({
    cards,
    gameChangerOracleIds,
    combos: combosAfter,
  });

  const contained = measuredAfter.assignedBracket <= args.requestedBracket;
  if (!contained) {
    notes.push(
      `Applied ${appliedSwaps.length} swap(s) but the rubric still measures bracket ${measuredAfter.assignedBracket} against a request of ${args.requestedBracket}.`,
    );
  }
  if (measuredAfter.assignedBracket < args.requestedBracket) {
    // Trimming too far is its own failure: the deck now undershoots.
    notes.push(
      `Undershot: deck now measures bracket ${measuredAfter.assignedBracket} against a request of ${args.requestedBracket}.`,
    );
  }

  return {
    plan,
    measuredBefore,
    measuredAfter,
    contained,
    cards,
    appliedSwaps,
    notes: [...notes, ...plan.notes],
  };
}
