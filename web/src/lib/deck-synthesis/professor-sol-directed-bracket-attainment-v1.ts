/**
 * Professor v1.1 — closes the gap between the bracket a player asked for and
 * the bracket the rubric measures on the finished deck.
 *
 * Ranking pools by power (see professor-sol-directed-bracket-power-ranking-v1)
 * made stronger cards more likely to be offered, but measurement showed it did
 * not move the assigned bracket: bracket floors are *count* thresholds, and a
 * per-card ranking bonus has no notion of reaching a count. One measured build
 * tripled its Game Changers from 1 to 3 and still sat on the Upgraded ceiling,
 * one short of Optimized.
 *
 * This planner aims at the threshold instead. It computes the smallest number
 * of Game Changers that reaches the requested bracket, then pairs each addition
 * with the safest card to cut, one for one so deck size and per-requirement
 * counts survive.
 *
 * Two deliberate limits:
 *  - It never plans past the requested bracket. Asking for Upgraded must not
 *    produce an Optimized deck.
 *  - It only ever proposes swaps. Applying them, re-measuring, and re-validating
 *    belong to the caller, so a plan can be shown to a player rather than
 *    silently applied.
 */
import {
  BASE_BRACKET,
  MAX_INFERABLE_BRACKET,
  UPGRADED_GAME_CHANGER_MAX,
} from "@/lib/commander-bracket-rubric/v1";
import { getBracketPolicy, type CommanderBracket } from "@/lib/bracket-policy/bracket-policy-v1";

export const PROFESSOR_SOL_DIRECTED_BRACKET_ATTAINMENT_V1_VERSION =
  "professor-sol-directed-bracket-attainment-v1";

export type BracketAttainmentCutCandidateV1 = {
  oracleId: string;
  name: string;
  /** Inherited by the incoming card so architect counts stay intact. */
  primaryArchitectRequirement: string;
  /** Share of colour-eligible tournament decks playing the card, or null. */
  playRate: number | null;
  /** The Constructor described this card as replaceable in its own plan. */
  declaredReplaceable: boolean;
  /** Cutting a combo piece can lower the bracket, so these are never cut. */
  isComboPiece: boolean;
  isGameChanger: boolean;
  /** Narrow roles only. Broad ones like board_interaction describe no job. */
  specificRoles: string[];
};

export type BracketAttainmentAddCandidateV1 = {
  oracleId: string;
  name: string;
  playRate: number | null;
  isGameChanger: boolean;
  /** Narrow roles only, used to pair the addition against the slot it can fill. */
  specificRoles: string[];
  /** Roles the deck already uses, so additions that fit are offered first. */
  sharedRoles?: string[];
};

export type BracketAttainmentSwapV1 = {
  cut: { oracleId: string; name: string; primaryArchitectRequirement: string };
  add: { oracleId: string; name: string };
  /** Plain reading a player can check, e.g. why this card and why this cut. */
  reason: string;
  /** True only when the addition shares a narrow role with the card it replaces. */
  roleMatched: boolean;
  /** The narrow roles both cards share, empty when the swap is a power change. */
  matchedRoles: string[];
};

export type BracketAttainmentPlanV1 = {
  version: typeof PROFESSOR_SOL_DIRECTED_BRACKET_ATTAINMENT_V1_VERSION;
  requestedBracket: CommanderBracket;
  measuredBracket: CommanderBracket;
  /** Game Changer count that would reach the requested bracket. */
  targetGameChangerCount: number;
  /** Additions still needed after accounting for what the deck already has. */
  shortfall: number;
  swaps: BracketAttainmentSwapV1[];
  /** True when the plan cannot fully reach the requested bracket. */
  incomplete: boolean;
  notes: string[];
};

/**
 * Smallest Game Changer count whose rubric floor reaches the requested bracket.
 * Bracket 2 and below have no floor to reach, and bracket 5 is never inferable
 * from a card list, so it is treated as Optimized.
 */
export function targetGameChangerCountV1(requestedBracket: CommanderBracket): number {
  const effective = Math.min(requestedBracket, MAX_INFERABLE_BRACKET) as CommanderBracket;
  if (effective <= BASE_BRACKET) return 0;
  if (effective === 3) return 1;
  return UPGRADED_GAME_CHANGER_MAX + 1;
}

/**
 * The Constructor's replaceable list arrives in two shapes depending on the
 * run: bare card names ("Cultivate"), or prose ("Squirrel Nest can be exchanged
 * for another fair token producer, provided Earthcraft is not added"). Both are
 * handled by looking for deck card names inside each line, but only the first
 * name in a line is taken as its subject — otherwise the Earthcraft in that
 * sentence, mentioned as a card to avoid, reads as a card to cut.
 *
 * A miss costs nothing: the planner falls back to play rate.
 */
export function declaredReplaceableNamesV1(args: {
  replaceableFlex: readonly string[];
  nonlandNames: readonly string[];
}): Set<string> {
  const declared = new Set<string>();
  for (const line of args.replaceableFlex) {
    const haystack = line.toLowerCase();
    let subject: string | null = null;
    let subjectAt = Number.POSITIVE_INFINITY;
    for (const name of args.nonlandNames) {
      const at = haystack.indexOf(name.toLowerCase());
      if (at === -1 || at >= subjectAt) continue;
      subject = name;
      subjectAt = at;
    }
    if (subject) declared.add(subject);
  }
  return declared;
}

/** Safest cuts first: the Constructor's own replaceables, then least-played. */
function orderCutCandidates(
  candidates: BracketAttainmentCutCandidateV1[],
): BracketAttainmentCutCandidateV1[] {
  return candidates
    .filter((candidate) => !candidate.isComboPiece && !candidate.isGameChanger)
    .slice()
    .sort((a, b) => {
      if (a.declaredReplaceable !== b.declaredReplaceable) {
        return a.declaredReplaceable ? -1 : 1;
      }
      // An unmeasured card is treated as mid-tier rather than most cuttable,
      // so missing tournament data never makes a card look disposable.
      const rateA = a.playRate ?? Number.POSITIVE_INFINITY;
      const rateB = b.playRate ?? Number.POSITIVE_INFINITY;
      if (rateA !== rateB) return rateA - rateB;
      return a.name.localeCompare(b.name);
    });
}

/** Best additions first: cards that fit a role the deck already wants, then most-played. */
function orderAddCandidates(
  candidates: BracketAttainmentAddCandidateV1[],
): BracketAttainmentAddCandidateV1[] {
  return candidates
    .filter((candidate) => candidate.isGameChanger)
    .slice()
    .sort((a, b) => {
      const roleA = (a.sharedRoles?.length ?? 0) > 0;
      const roleB = (b.sharedRoles?.length ?? 0) > 0;
      if (roleA !== roleB) return roleA ? -1 : 1;
      const rateA = a.playRate ?? 0;
      const rateB = b.playRate ?? 0;
      if (rateA !== rateB) return rateB - rateA;
      return a.name.localeCompare(b.name);
    });
}

/**
 * Reaching a bracket must never cost the deck a better card. Role matching on
 * its own will happily trade Sol Ring for Chrome Mox because both are mana
 * rocks, so a swap is refused whenever the outgoing card is played more often
 * than the incoming one. Unmeasured cards are not treated as downgrades, since
 * absent data is not evidence of quality.
 */
function isPlayRateDowngrade(
  cut: BracketAttainmentCutCandidateV1,
  add: BracketAttainmentAddCandidateV1,
): boolean {
  if (cut.playRate === null || add.playRate === null) return false;
  return cut.playRate > add.playRate;
}

export function planBracketAttainmentV1(args: {
  requestedBracket: CommanderBracket;
  measuredBracket: CommanderBracket;
  currentGameChangerCount: number;
  cutCandidates: BracketAttainmentCutCandidateV1[];
  addCandidates: BracketAttainmentAddCandidateV1[];
}): BracketAttainmentPlanV1 {
  const notes: string[] = [];
  const targetGameChangerCount = targetGameChangerCountV1(args.requestedBracket);

  const base: BracketAttainmentPlanV1 = {
    version: PROFESSOR_SOL_DIRECTED_BRACKET_ATTAINMENT_V1_VERSION,
    requestedBracket: args.requestedBracket,
    measuredBracket: args.measuredBracket,
    targetGameChangerCount,
    shortfall: 0,
    swaps: [],
    incomplete: false,
    notes,
  };

  if (args.measuredBracket >= args.requestedBracket) {
    notes.push(
      `Deck already measures at bracket ${args.measuredBracket}; no attainment changes needed.`,
    );
    return base;
  }

  if (targetGameChangerCount === 0) {
    notes.push(
      `Bracket ${args.requestedBracket} has no measurable floor to reach, so no changes are proposed.`,
    );
    return base;
  }

  // Never plan past what the requested bracket permits.
  const permittedMax = getBracketPolicy(args.requestedBracket).hardRules.gameChangerMax;
  if (permittedMax !== null && targetGameChangerCount > permittedMax) {
    notes.push(
      `Reaching bracket ${args.requestedBracket} would need ${targetGameChangerCount} Game Changers but the bracket allows ${permittedMax}; no changes are proposed.`,
    );
    return { ...base, incomplete: true };
  }

  const shortfall = Math.max(0, targetGameChangerCount - args.currentGameChangerCount);
  if (shortfall === 0) {
    notes.push(
      `Deck already holds ${args.currentGameChangerCount} Game Changer(s); the shortfall to bracket ${args.requestedBracket} is not a Game Changer count.`,
    );
    return { ...base, incomplete: true };
  }

  const cuts = orderCutCandidates(args.cutCandidates);
  const adds = orderAddCandidates(args.addCandidates);
  const swaps: BracketAttainmentSwapV1[] = [];
  const used = new Set<string>();

  for (const add of adds) {
    if (swaps.length >= shortfall) break;
    const available = cuts.filter(
      (candidate) => !used.has(candidate.oracleId) && !isPlayRateDowngrade(candidate, add),
    );
    if (available.length === 0) continue;

    // Prefer replacing a card that does the same job. Because cuts are already
    // ordered safest-first, the first role match is also the most cuttable one.
    // Without this the pass cuts whatever tournament data plays least, which for
    // a green midrange deck means cutting its finisher to add a mana rock.
    const addRoles = new Set(add.specificRoles);
    const matched = available.find((candidate) =>
      candidate.specificRoles.some((role) => addRoles.has(role)),
    );
    const cut = matched ?? available[0];
    const matchedRoles = matched
      ? matched.specificRoles.filter((role) => addRoles.has(role))
      : [];

    used.add(cut.oracleId);
    swaps.push({
      cut: {
        oracleId: cut.oracleId,
        name: cut.name,
        primaryArchitectRequirement: cut.primaryArchitectRequirement,
      },
      add: { oracleId: add.oracleId, name: add.name },
      roleMatched: matchedRoles.length > 0,
      matchedRoles,
      reason: matchedRoles.length
        ? `${add.name} replaces ${cut.name}, which does the same job (${matchedRoles.slice(0, 2).join(", ")}), and raises the deck toward bracket ${args.requestedBracket}.`
        : `${add.name} replaces ${cut.name} to reach bracket ${args.requestedBracket}. The two cards do different jobs, so this is a power change rather than a like-for-like upgrade.`,
    });
  }

  const incomplete = swaps.length < shortfall;
  if (incomplete) {
    notes.push(
      `Reaching bracket ${args.requestedBracket} needs ${shortfall} addition(s) but only ${swaps.length} legal swap(s) were available.`,
    );
  }
  if (swaps.some((swap) => !swap.roleMatched)) {
    notes.push(
      "At least one swap is not role-matched. Surface these as power changes so a player can decline them.",
    );
  }

  return { ...base, shortfall, swaps, incomplete };
}
