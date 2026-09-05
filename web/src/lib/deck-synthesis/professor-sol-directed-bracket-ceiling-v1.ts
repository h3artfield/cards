/**
 * Chooses which cards to remove so a deck stops exceeding the bracket that was
 * asked for.
 *
 * The attainment pass answers "this deck is too weak for what was requested".
 * Measuring nine live builds showed the opposite failure is now the common one:
 * every deck met its floor, but four of nine landed above it, and Omnath asked
 * for Core and produced an Optimized list. Shipping a deck two brackets hotter
 * than requested breaks a pod's expectations exactly as badly as shipping one
 * too weak, and the attainment pass cannot help because it only adds power.
 *
 * Every offending signal reduces to one of two removal shapes:
 *
 *   REDUCE_TO_AT_MOST  too many cards of a kind (Game Changers, tutors, extra
 *                      turns, mass land denial). Cut the cheapest surplus.
 *   BREAK_SETS         combos, where the deck is over the line because certain
 *                      *combinations* exist. Removing any one piece breaks a
 *                      set, so the cheapest fix is a set cover: prefer a card
 *                      that appears in several combos over one card per combo.
 *
 * Treating combos as a set cover matters. A deck with three combos sharing a
 * single enabler is fixed by removing that one card; cutting one piece per
 * combo would strip three cards for the same effect and do more damage to the
 * deck than the problem warranted.
 *
 * Pure: no catalog, no network, no disk. The server pass supplies candidates
 * and applies the result.
 */
import {
  BASE_BRACKET,
  EXTRA_TURN_CHAIN_THRESHOLD,
  TUTOR_DENSITY_THRESHOLD,
  UPGRADED_GAME_CHANGER_MAX,
} from "../commander-bracket-rubric/v1";
import type { CommanderBracket } from "../bracket-policy/bracket-policy-v1";

export const PROFESSOR_SOL_DIRECTED_BRACKET_CEILING_V1_VERSION =
  "professor-sol-directed-bracket-ceiling-v1";

/** Signals the ceiling pass knows how to bring down. */
export type CeilingSignalIdV1 =
  | "game_changers"
  | "mass_land_denial"
  | "extra_turns"
  | "two_card_infinite"
  | "infinite_combo"
  | "tutor_density";

export type CeilingComboSetV1 = {
  /** Stable identity for the combo, used to report which sets got broken. */
  signature: string;
  cardCount: number;
  oracleIds: string[];
};

export type CeilingDeckCardV1 = {
  oracleId: string;
  name: string;
  /** Fraction of tournament decks in identity playing this card, when known. */
  playRate: number | null;
  /** Narrow jobs this card does, used to find a like-for-like replacement. */
  specificRoles: string[];
  isCommander: boolean;
  isLand: boolean;
  isGameChanger: boolean;
  isUnrestrictedTutor: boolean;
  isExtraTurn: boolean;
  isLoopableExtraTurn: boolean;
  isMassLandDenial: boolean;
};

export type CeilingAddCandidateV1 = {
  oracleId: string;
  name: string;
  playRate: number | null;
  specificRoles: string[];
  /** A replacement must not reintroduce the problem being removed. */
  isGameChanger: boolean;
  isUnrestrictedTutor: boolean;
  isExtraTurn: boolean;
  isMassLandDenial: boolean;
  /** Combo signatures this card would complete if added. */
  completesComboSignatures: string[];
};

export type CeilingRemovalV1 = {
  oracleId: string;
  name: string;
  /** Which over-ceiling signals this removal addresses. */
  reasons: CeilingSignalIdV1[];
  /** Combo signatures broken by removing this card. */
  breaksComboSignatures: string[];
  playRate: number | null;
};

/** A basic land, used only to replace an over-bracket land. */
export type CeilingBasicLandV1 = {
  oracleId: string;
  name: string;
};

export type CeilingSwapV1 = {
  cut: CeilingRemovalV1;
  add: CeilingAddCandidateV1 | null;
  roleMatched: boolean;
  /**
   * True when this swap replaces a land with a basic, which the caller must
   * apply to the land base rather than the nonland list.
   */
  isLandSwap: boolean;
  basicLand: CeilingBasicLandV1 | null;
};

export type CeilingShortfallV1 = {
  signalId: CeilingSignalIdV1;
  reason: string;
};

export type BracketCeilingPlanV1 = {
  version: string;
  requestedBracket: CommanderBracket;
  measuredBracket: CommanderBracket;
  /** Empty when the deck is already at or under the requested bracket. */
  swaps: CeilingSwapV1[];
  /** Signals the pass could not bring down, with the reason. */
  unresolved: CeilingShortfallV1[];
  /** Bracket the deck should measure once the swaps are applied. */
  projectedBracket: CommanderBracket;
  notes: string[];
};

/** Cheapest first: cards the deck misses least are cut first. */
function byCutPreference(a: CeilingDeckCardV1, b: CeilingDeckCardV1): number {
  // An unmeasured card is treated as more expendable than a measured one, on
  // the reasoning that cards nobody plays do not show up in the play-rate data.
  const ar = a.playRate ?? -1;
  const br = b.playRate ?? -1;
  if (ar !== br) return ar - br;
  return a.name.localeCompare(b.name);
}

/**
 * The commander can never be cut, and lands are normally left alone because the
 * land base is balanced by a separate pass that this one must not fight with.
 */
function isCuttable(card: CeilingDeckCardV1): boolean {
  return !card.isCommander && !card.isLand;
}

/**
 * Counted signals get one exception to the land rule. Several Game Changers are
 * lands — Field of the Dead, Ancient Tomb, Gaea's Cradle — and a single one of
 * them pins the deck at Upgraded, so a bracket 2 request is unreachable while
 * the land base is off limits. Measuring Omnath found exactly this: two nonland
 * cuts landed and the deck still read bracket 3 on Field of the Dead alone.
 *
 * Swapping such a land for a basic is safe in a way that cutting an arbitrary
 * land is not: the land count is unchanged and a basic in the commander's
 * identity is always legal. Combo breaking deliberately does not get this
 * exception, because a nonland piece is nearly always available there and
 * pulling lands out to break combos would do real damage to the mana base.
 */
function isCuttableForCount(card: CeilingDeckCardV1, basicAvailable: boolean): boolean {
  if (card.isCommander) return false;
  return card.isLand ? basicAvailable : true;
}

/**
 * Cards of a kind that must come down to a count. Returns the surplus, cheapest
 * first.
 */
function reduceToAtMost(args: {
  cards: CeilingDeckCardV1[];
  maxAllowed: number;
  basicAvailable: boolean;
}): CeilingDeckCardV1[] {
  const surplus = args.cards.length - args.maxAllowed;
  if (surplus <= 0) return [];
  // Uncuttable copies still count toward the signal, so a commander that is
  // itself a Game Changer can leave the deck over the line no matter what else
  // is cut. The caller checks for that and reports it as unresolved.
  return args.cards
    .filter((card) => isCuttableForCount(card, args.basicAvailable))
    // Prefer cutting nonlands, so the mana base is only touched when the
    // remaining offenders are all lands.
    .sort((a, b) => Number(a.isLand) - Number(b.isLand) || byCutPreference(a, b))
    .slice(0, surplus);
}

/**
 * Greedy set cover over combos: repeatedly remove the card that breaks the most
 * still-intact sets, tie-broken by lowest play rate.
 */
function breakSets(args: {
  sets: CeilingComboSetV1[];
  byOracleId: Map<string, CeilingDeckCardV1>;
}): { removals: Array<{ card: CeilingDeckCardV1; breaks: string[] }>; unbreakable: CeilingComboSetV1[] } {
  const remaining = [...args.sets];
  const removals: Array<{ card: CeilingDeckCardV1; breaks: string[] }> = [];
  const unbreakable: CeilingComboSetV1[] = [];

  while (remaining.length > 0) {
    const coverage = new Map<string, string[]>();
    for (const set of remaining) {
      for (const oracleId of set.oracleIds) {
        const card = args.byOracleId.get(oracleId);
        if (!card || !isCuttable(card)) continue;
        const hit = coverage.get(oracleId) ?? [];
        hit.push(set.signature);
        coverage.set(oracleId, hit);
      }
    }

    if (coverage.size === 0) {
      // Every remaining set is held together only by the commander or by lands.
      unbreakable.push(...remaining);
      break;
    }

    let best: { card: CeilingDeckCardV1; breaks: string[] } | null = null;
    for (const [oracleId, breaks] of coverage) {
      const card = args.byOracleId.get(oracleId);
      if (!card) continue;
      if (
        best === null ||
        breaks.length > best.breaks.length ||
        (breaks.length === best.breaks.length && byCutPreference(card, best.card) < 0)
      ) {
        best = { card, breaks };
      }
    }
    if (!best) break;

    removals.push(best);
    const broken = new Set(best.breaks);
    for (let i = remaining.length - 1; i >= 0; i -= 1) {
      if (broken.has(remaining[i].signature)) remaining.splice(i, 1);
    }
  }

  return { removals, unbreakable };
}

/** What each signal is allowed to be at the requested bracket. */
function ceilingRequirements(requested: CommanderBracket): {
  maxGameChangers: number;
  allowMassLandDenial: boolean;
  maxExtraTurns: number;
  maxLoopableExtraTurns: number;
  maxUnrestrictedTutors: number;
  allowTwoCardCombos: boolean;
  allowAnyCombos: boolean;
} {
  return {
    maxGameChangers: requested >= 4 ? Number.POSITIVE_INFINITY : requested === 3 ? UPGRADED_GAME_CHANGER_MAX : 0,
    allowMassLandDenial: requested >= 4,
    maxExtraTurns: requested >= 3 ? Number.POSITIVE_INFINITY : 0,
    maxLoopableExtraTurns: requested >= 4 ? Number.POSITIVE_INFINITY : EXTRA_TURN_CHAIN_THRESHOLD - 1,
    maxUnrestrictedTutors: requested >= 3 ? Number.POSITIVE_INFINITY : TUTOR_DENSITY_THRESHOLD - 1,
    allowTwoCardCombos: requested >= 4,
    allowAnyCombos: requested >= 3,
  };
}

/**
 * Picks the replacement for a cut card: same narrow job where possible, and
 * never one that reintroduces the signal being removed.
 */
/** Does this candidate carry the signal named? */
function candidateCarriesSignal(
  candidate: CeilingAddCandidateV1,
  signalId: CeilingSignalIdV1,
): boolean {
  if (signalId === "game_changers") return candidate.isGameChanger;
  if (signalId === "mass_land_denial") return candidate.isMassLandDenial;
  if (signalId === "extra_turns") return candidate.isExtraTurn;
  if (signalId === "tutor_density") return candidate.isUnrestrictedTutor;
  return false;
}

function chooseReplacement(args: {
  cut: CeilingRemovalV1;
  cutRoles: string[];
  candidates: CeilingAddCandidateV1[];
  used: Set<string>;
  requirements: ReturnType<typeof ceilingRequirements>;
  survivingComboSignatures: Set<string>;
  /**
   * Signals this pass is actively bringing down. A replacement carrying one of
   * them undoes the cut that was just made, which is how a Florian build cut a
   * Game Changer and shipped another one in its place: the bracket-3 allowance
   * of three is greater than zero, so the old `maxGameChangers <= 0` guard let
   * a fourth straight back in and the deck still measured bracket 4. Anything
   * being reduced is off the table entirely, whatever the bracket allows.
   */
  reducedSignals: ReadonlySet<CeilingSignalIdV1>;
}): { add: CeilingAddCandidateV1 | null; roleMatched: boolean } {
  const eligible = args.candidates.filter((candidate) => {
    if (args.used.has(candidate.oracleId)) return false;
    for (const signalId of args.reducedSignals) {
      if (candidateCarriesSignal(candidate, signalId)) return false;
    }
    if (candidate.isGameChanger && args.requirements.maxGameChangers <= 0) return false;
    if (candidate.isMassLandDenial && !args.requirements.allowMassLandDenial) return false;
    if (candidate.isExtraTurn && args.requirements.maxExtraTurns <= 0) return false;
    if (candidate.isUnrestrictedTutor && args.requirements.maxUnrestrictedTutors <= 0) return false;
    // Adding a card that completes a combo would undo the removal that was just
    // made, so anything that closes a set the deck still has pieces for is out.
    if (
      !args.requirements.allowAnyCombos &&
      candidate.completesComboSignatures.some((sig) => args.survivingComboSignatures.has(sig))
    ) {
      return false;
    }
    return true;
  });
  if (eligible.length === 0) return { add: null, roleMatched: false };

  const roles = new Set(args.cutRoles);
  const matched = eligible.filter((candidate) =>
    candidate.specificRoles.some((role) => roles.has(role)),
  );
  // Strongest available replacement, so trimming the ceiling does not also
  // hollow the deck out.
  const rank = (list: CeilingAddCandidateV1[]) =>
    [...list].sort((a, b) => (b.playRate ?? 0) - (a.playRate ?? 0) || a.name.localeCompare(b.name))[0];

  if (matched.length > 0) return { add: rank(matched), roleMatched: true };
  if (roles.size > 0) {
    // No like-for-like replacement exists. Leaving the slot to the generic pool
    // is still better than shipping over-bracket, but say so in the plan.
    return { add: rank(eligible), roleMatched: false };
  }
  return { add: rank(eligible), roleMatched: false };
}

export function planBracketCeilingV1(input: {
  requestedBracket: CommanderBracket;
  measuredBracket: CommanderBracket;
  deckCards: CeilingDeckCardV1[];
  comboSets: CeilingComboSetV1[];
  addCandidates: CeilingAddCandidateV1[];
  /** Supplied when the deck can absorb a basic in place of an offending land. */
  basicLandReplacement?: CeilingBasicLandV1 | null;
}): BracketCeilingPlanV1 {
  const notes: string[] = [];
  const unresolved: CeilingShortfallV1[] = [];

  const base = {
    version: PROFESSOR_SOL_DIRECTED_BRACKET_CEILING_V1_VERSION,
    requestedBracket: input.requestedBracket,
    measuredBracket: input.measuredBracket,
  };

  if (input.measuredBracket <= input.requestedBracket) {
    return {
      ...base,
      swaps: [],
      unresolved: [],
      projectedBracket: input.measuredBracket,
      notes: ["Deck is already at or below the requested bracket; nothing to trim."],
    };
  }

  const requirements = ceilingRequirements(input.requestedBracket);
  const byOracleId = new Map(input.deckCards.map((card) => [card.oracleId, card] as const));
  const basicLand = input.basicLandReplacement ?? null;
  const basicAvailable = basicLand !== null;

  // Accumulate removals across signals; one card can answer several at once.
  const removalReasons = new Map<string, Set<CeilingSignalIdV1>>();
  const removalBreaks = new Map<string, Set<string>>();
  const noteRemoval = (card: CeilingDeckCardV1, signalId: CeilingSignalIdV1, breaks: string[] = []) => {
    const reasons = removalReasons.get(card.oracleId) ?? new Set<CeilingSignalIdV1>();
    reasons.add(signalId);
    removalReasons.set(card.oracleId, reasons);
    if (breaks.length > 0) {
      const existing = removalBreaks.get(card.oracleId) ?? new Set<string>();
      for (const sig of breaks) existing.add(sig);
      removalBreaks.set(card.oracleId, existing);
    }
  };

  // Signals this run is bringing down, so replacements cannot reintroduce them.
  const reducedSignals = new Set<CeilingSignalIdV1>();

  const countdown = (
    signalId: CeilingSignalIdV1,
    cards: CeilingDeckCardV1[],
    maxAllowed: number,
    blockedReason: string,
  ) => {
    if (!Number.isFinite(maxAllowed) || cards.length <= maxAllowed) return;
    reducedSignals.add(signalId);
    const removals = reduceToAtMost({ cards, maxAllowed, basicAvailable });
    for (const card of removals) noteRemoval(card, signalId);
    const stillOver = cards.length - removals.length > maxAllowed;
    if (stillOver) unresolved.push({ signalId, reason: blockedReason });
  };

  countdown(
    "game_changers",
    input.deckCards.filter((c) => c.isGameChanger),
    requirements.maxGameChangers,
    "Game Changers remain that cannot be cut (commander or land).",
  );
  countdown(
    "mass_land_denial",
    input.deckCards.filter((c) => c.isMassLandDenial),
    requirements.allowMassLandDenial ? Number.POSITIVE_INFINITY : 0,
    "Mass land denial remains that cannot be cut.",
  );
  countdown(
    "extra_turns",
    input.deckCards.filter((c) => c.isExtraTurn),
    requirements.maxExtraTurns,
    "Extra-turn effects remain that cannot be cut.",
  );
  countdown(
    "extra_turns",
    input.deckCards.filter((c) => c.isLoopableExtraTurn),
    requirements.maxLoopableExtraTurns,
    "Loopable extra-turn effects remain that cannot be cut.",
  );
  countdown(
    "tutor_density",
    input.deckCards.filter((c) => c.isUnrestrictedTutor),
    requirements.maxUnrestrictedTutors,
    "Unrestricted tutors remain that cannot be cut.",
  );

  // Combos: only the sets that actually breach the requested bracket.
  const offendingSets = input.comboSets.filter((set) => {
    if (!requirements.allowAnyCombos) return true;
    if (!requirements.allowTwoCardCombos) return set.cardCount === 2;
    return false;
  });
  const comboSignalId: CeilingSignalIdV1 = requirements.allowAnyCombos
    ? "two_card_infinite"
    : "infinite_combo";

  const alreadyRemoved = new Set(removalReasons.keys());
  const stillIntact = offendingSets.filter(
    (set) => !set.oracleIds.some((id) => alreadyRemoved.has(id)),
  );
  if (stillIntact.length > 0) {
    const cover = breakSets({ sets: stillIntact, byOracleId });
    for (const { card, breaks } of cover.removals) noteRemoval(card, comboSignalId, breaks);
    if (cover.unbreakable.length > 0) {
      unresolved.push({
        signalId: comboSignalId,
        reason: `${cover.unbreakable.length} combo${cover.unbreakable.length === 1 ? "" : "s"} can only be broken by cutting the commander or a land.`,
      });
    }
  }
  if (offendingSets.length > stillIntact.length) {
    notes.push(
      `${offendingSets.length - stillIntact.length} combo${offendingSets.length - stillIntact.length === 1 ? " was" : "s were"} already broken by another removal.`,
    );
  }

  // Pair each removal with a replacement so the deck keeps its card count.
  const removedIds = new Set(removalReasons.keys());
  const survivingComboSignatures = new Set(
    input.comboSets
      .filter((set) => !set.oracleIds.some((id) => removedIds.has(id)))
      .map((set) => set.signature),
  );
  const used = new Set<string>(input.deckCards.map((c) => c.oracleId));
  const swaps: CeilingSwapV1[] = [];

  for (const [oracleId, reasons] of removalReasons) {
    const card = byOracleId.get(oracleId);
    if (!card) continue;
    const cut: CeilingRemovalV1 = {
      oracleId,
      name: card.name,
      reasons: [...reasons],
      breaksComboSignatures: [...(removalBreaks.get(oracleId) ?? [])],
      playRate: card.playRate,
    };

    // A land leaves the deck as a land, so the replacement is a basic and the
    // nonland pool is not consulted at all.
    if (card.isLand) {
      swaps.push({ cut, add: null, roleMatched: false, isLandSwap: true, basicLand });
      continue;
    }

    const { add, roleMatched } = chooseReplacement({
      cut,
      cutRoles: card.specificRoles,
      candidates: input.addCandidates,
      used,
      requirements,
      survivingComboSignatures,
      reducedSignals,
    });
    if (add) used.add(add.oracleId);
    swaps.push({ cut, add, roleMatched, isLandSwap: false, basicLand: null });
  }

  // Cut the most impactful removals first so a partial application still helps.
  swaps.sort((a, b) => b.cut.reasons.length - a.cut.reasons.length || a.cut.name.localeCompare(b.cut.name));

  const projectedBracket: CommanderBracket =
    unresolved.length === 0
      ? input.requestedBracket
      : input.measuredBracket;
  if (unresolved.length > 0) {
    notes.push("Some signals could not be brought down; the deck will still measure above the request.");
  }
  if (swaps.some((s) => s.add === null && !s.isLandSwap)) {
    notes.push("Some cuts had no eligible replacement and will leave the deck short a card.");
  }
  if (swaps.some((s) => s.isLandSwap)) {
    notes.push("An over-bracket land was replaced with a basic to keep the land count intact.");
  }
  if (swaps.some((s) => !s.roleMatched && s.add !== null)) {
    notes.push("Some replacements do not cover the same narrow job as the card they replace.");
  }

  return {
    ...base,
    swaps,
    unresolved,
    projectedBracket: Math.max(projectedBracket, BASE_BRACKET) as CommanderBracket,
    notes,
  };
}
