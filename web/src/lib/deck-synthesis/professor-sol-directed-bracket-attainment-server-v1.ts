/**
 * Server half of the bracket attainment pass: measure the finished deck, plan
 * the swaps that reach the requested bracket, apply them, then measure again.
 *
 * The re-measurement is the point. A plan that claims to reach bracket 3 is
 * worth nothing until the same rubric that graded the deck agrees, so this
 * module never reports success on the strength of its own arithmetic.
 *
 * Sourcing note: additions come from the published Game Changer snapshot rather
 * than the retrieval pools. Pools are built to fill architect requirements and
 * frequently contain no Game Changer at all, which is exactly why ranking pools
 * by power failed to move the measured bracket. Anything added here is therefore
 * returned in `candidateDictionaryAdditions` so the caller can register it before
 * validation, which otherwise rejects nonlands the Constructor never retrieved.
 */
import {
  classifyCommanderBracketV1,
  type BracketRubricCard,
  type CommanderBracketRubricResult,
} from "@/lib/commander-bracket-rubric/v1";
import { comboSummaryForDeck } from "@/lib/commander-bracket-rubric/v1/combos-server";
import {
  gameChangerOracleIdSet,
  loadCommanderGameChangerSnapshot,
} from "@/lib/commander-strategy/model-c/game-changer-snapshot-v1";
import { playRateFor } from "@/lib/deck-swap/v1/play-rate-server";
import { isLandType, specificRolesOf } from "@/lib/deck-swap/v1/upgrade-candidates-server";
import { loadRc8OracleTextIndex } from "@/lib/card-oracle-text/rc8-oracle-text-index";
import { getSemanticMapPoint } from "@/lib/semantic-visualization/artifact-loader";
import { commanderLegalInIdentity } from "@/lib/semantic-visualization/filters-v1";
import type { CommanderBracket } from "@/lib/bracket-policy/bracket-policy-v1";
import {
  declaredReplaceableNamesV1,
  planBracketAttainmentV1,
  type BracketAttainmentAddCandidateV1,
  type BracketAttainmentCutCandidateV1,
  type BracketAttainmentPlanV1,
  type BracketAttainmentSwapV1,
} from "./professor-sol-directed-bracket-attainment-v1";

export type BracketAttainmentNonlandV1 = {
  oracleId: string;
  name: string;
  primaryArchitectRequirement: string;
};

export type BracketAttainmentOutcomeV1 = {
  plan: BracketAttainmentPlanV1;
  measuredBefore: CommanderBracketRubricResult;
  /** Null when the plan proposed nothing, so nothing was re-measured. */
  measuredAfter: CommanderBracketRubricResult | null;
  /** True only when the rubric itself confirms the requested bracket was reached. */
  attained: boolean;
  /** Deck cards after the applied swaps, ready for validation. */
  cards: BracketRubricCard[];
  /** The subset of the plan that was actually applied and re-measured. */
  appliedSwaps: BracketAttainmentSwapV1[];
  /** Oracle IDs the caller must register as retrieved before validating. */
  candidateDictionaryAdditions: string[];
  notes: string[];
};

function rolesInDeck(cards: readonly BracketRubricCard[]): Set<string> {
  const roles = new Set<string>();
  for (const card of cards) {
    const point = getSemanticMapPoint(card.oracleId);
    if (!point) continue;
    for (const role of point.derivedRoles) roles.add(role);
  }
  return roles;
}

/** In-identity, not-already-present Game Changers, with the roles they share with the deck. */
function sourceAddCandidates(args: {
  commanderColorIdentity: string[];
  presentOracleIds: ReadonlySet<string>;
  excludeOracleIds: ReadonlySet<string>;
  deckRoles: ReadonlySet<string>;
}): BracketAttainmentAddCandidateV1[] {
  const candidates: BracketAttainmentAddCandidateV1[] = [];
  for (const entry of loadCommanderGameChangerSnapshot().cards) {
    if (args.presentOracleIds.has(entry.oracleId)) continue;
    if (args.excludeOracleIds.has(entry.oracleId)) continue;
    const point = getSemanticMapPoint(entry.oracleId);
    // Without a semantic point there is no colour identity to check, and adding
    // an off-identity card would fail validation.
    if (!point) continue;
    if (!commanderLegalInIdentity(point.colorIdentity, args.commanderColorIdentity)) continue;
    // Several Game Changers are lands (Ancient Tomb, Gaea's Cradle). They are
    // swapped one-for-one against nonlands here, and the validator rejects a
    // land sitting in the nonland list, so they are not eligible additions. The
    // bracket rubric would not catch this: it does not model the partition.
    if (isLandType(point.types)) continue;
    candidates.push({
      oracleId: entry.oracleId,
      name: point.name || entry.canonicalName,
      playRate: playRateFor(entry.oracleId)?.rate ?? null,
      isGameChanger: true,
      specificRoles: specificRolesOf(point.derivedRoles),
      sharedRoles: point.derivedRoles.filter((role) => args.deckRoles.has(role)),
    });
  }
  return candidates;
}

export async function attainRequestedBracketV1(args: {
  cards: BracketRubricCard[];
  nonlands: readonly BracketAttainmentNonlandV1[];
  commanderColorIdentity: string[];
  requestedBracket: CommanderBracket;
  replaceableFlex?: readonly string[];
  /** Cards a guardrail already ruled out, e.g. a prohibited-combo list. */
  excludeOracleIds?: ReadonlySet<string>;
}): Promise<BracketAttainmentOutcomeV1> {
  const notes: string[] = [];
  const gameChangerOracleIds = gameChangerOracleIdSet(loadCommanderGameChangerSnapshot());

  const combosBefore = await comboSummaryForDeck({ cards: args.cards });
  const measuredBefore = classifyCommanderBracketV1({
    cards: args.cards,
    gameChangerOracleIds,
    combos: combosBefore,
  });

  const unchanged: BracketAttainmentOutcomeV1 = {
    plan: planBracketAttainmentV1({
      requestedBracket: args.requestedBracket,
      measuredBracket: measuredBefore.assignedBracket,
      currentGameChangerCount: 0,
      cutCandidates: [],
      addCandidates: [],
    }),
    measuredBefore,
    measuredAfter: null,
    attained: measuredBefore.assignedBracket >= args.requestedBracket,
    cards: args.cards,
    appliedSwaps: [],
    candidateDictionaryAdditions: [],
    notes,
  };
  if (measuredBefore.assignedBracket >= args.requestedBracket) return unchanged;

  const presentOracleIds = new Set(args.cards.map((card) => card.oracleId));
  const comboOracleIds = new Set(
    (combosBefore.comboSets ?? []).flatMap((set) => set.cards.map((card) => card.oracleId)),
  );
  const currentGameChangerCount = args.cards.filter(
    (card) => gameChangerOracleIds.has(card.oracleId) && !card.isCommander,
  ).length;

  const declared = declaredReplaceableNamesV1({
    replaceableFlex: args.replaceableFlex ?? [],
    nonlandNames: args.nonlands.map((nonland) => nonland.name),
  });

  const cutCandidates: BracketAttainmentCutCandidateV1[] = args.nonlands.map((nonland) => ({
    oracleId: nonland.oracleId,
    name: nonland.name,
    primaryArchitectRequirement: nonland.primaryArchitectRequirement,
    playRate: playRateFor(nonland.oracleId)?.rate ?? null,
    declaredReplaceable: declared.has(nonland.name),
    isComboPiece: comboOracleIds.has(nonland.oracleId),
    isGameChanger: gameChangerOracleIds.has(nonland.oracleId),
    specificRoles: specificRolesOf(getSemanticMapPoint(nonland.oracleId)?.derivedRoles ?? []),
  }));

  const addCandidates = sourceAddCandidates({
    commanderColorIdentity: args.commanderColorIdentity,
    presentOracleIds,
    excludeOracleIds: args.excludeOracleIds ?? new Set(),
    deckRoles: rolesInDeck(args.cards),
  });

  const plan = planBracketAttainmentV1({
    requestedBracket: args.requestedBracket,
    measuredBracket: measuredBefore.assignedBracket,
    currentGameChangerCount,
    cutCandidates,
    addCandidates,
  });

  if (plan.swaps.length === 0) {
    return { ...unchanged, plan, attained: false, notes: [...notes, ...plan.notes] };
  }

  // Rubric detectors read oracle text, so an addition with no text on hand would
  // measure as an inert card and quietly fail to move the bracket.
  const oracleText = await loadRc8OracleTextIndex();
  const cutByOracleId = new Map(plan.swaps.map((swap) => [swap.cut.oracleId, swap] as const));
  const applied: string[] = [];
  const appliedSwaps: BracketAttainmentSwapV1[] = [];
  const cards: BracketRubricCard[] = [];

  for (const card of args.cards) {
    const swap = cutByOracleId.get(card.oracleId);
    if (!swap) {
      cards.push(card);
      continue;
    }
    const entry = oracleText.get(swap.add.oracleId);
    const point = getSemanticMapPoint(swap.add.oracleId);
    if (!entry || !point) {
      // Keep the incumbent rather than ship a card the rubric cannot read.
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
    applied.push(swap.add.oracleId);
    appliedSwaps.push(swap);
  }

  if (applied.length === 0) {
    return { ...unchanged, plan, attained: false, notes: [...notes, ...plan.notes] };
  }

  const combosAfter = await comboSummaryForDeck({ cards });
  const measuredAfter = classifyCommanderBracketV1({
    cards,
    gameChangerOracleIds,
    combos: combosAfter,
  });

  const attained = measuredAfter.assignedBracket >= args.requestedBracket;
  if (!attained) {
    notes.push(
      `Applied ${applied.length} swap(s) but the rubric still measures bracket ${measuredAfter.assignedBracket}.`,
    );
  }
  if (measuredAfter.assignedBracket > args.requestedBracket) {
    notes.push(
      `Overshot: deck now measures bracket ${measuredAfter.assignedBracket} against a request of ${args.requestedBracket}.`,
    );
  }

  return {
    plan,
    measuredBefore,
    measuredAfter,
    attained,
    cards,
    appliedSwaps,
    candidateDictionaryAdditions: applied,
    notes: [...notes, ...plan.notes],
  };
}
