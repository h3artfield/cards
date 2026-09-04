/**
 * Professor v1.1 — lets the requested bracket influence which cards a
 * requirement pool offers the Constructor.
 *
 * Requirement scoring is text- and role-driven, so it reads what a card does
 * but not how hard it hits. Two cards that both satisfy "ramp" score alike
 * whether they are Sol Ring or a three-mana rock, which is why builds landed
 * below the bracket the player asked for. These adjustments reorder a pool by
 * tournament play rate and Game Changer membership, scaled to the bracket's
 * appetite for power.
 *
 * The adjustment is deliberately a tiebreaker, not an override: callers apply
 * it on top of the requirement score and after the functional-match sort, so a
 * powerful card that does not serve the requirement never outranks one that
 * does.
 */
import { getBracketPolicy, type CommanderBracket } from "@/lib/bracket-policy/bracket-policy-v1";

export const PROFESSOR_SOL_DIRECTED_BRACKET_POWER_RANKING_V1_VERSION =
  "professor-sol-directed-bracket-power-ranking-v1";

/**
 * How much a bracket rewards tournament-proven cards. Bracket 1-2 decks are
 * built around a theme rather than a win rate, so play rate barely moves them;
 * bracket 4-5 decks are judged on how fast and reliably they win.
 */
const PLAY_RATE_WEIGHT_BY_BRACKET: Record<CommanderBracket, number> = {
  1: 4,
  2: 8,
  3: 16,
  4: 32,
  5: 40,
};

/**
 * Flat bonus for a Game Changer at brackets that permit them. Bracket 3 allows
 * at most three, so the nudge stays small; bracket 4-5 have no ceiling.
 */
const GAME_CHANGER_BONUS_BY_BRACKET: Record<CommanderBracket, number> = {
  1: 0,
  2: 0,
  3: 6,
  4: 12,
  5: 16,
};

export type BracketPowerAppetiteV1 = {
  version: typeof PROFESSOR_SOL_DIRECTED_BRACKET_POWER_RANKING_V1_VERSION;
  bracket: CommanderBracket;
  /**
   * True when the bracket's hard rules allow zero Game Changers. Those cards
   * are dropped from the pool rather than ranked last, because a pool that
   * still offers them lets the Constructor build a deck the bracket forbids.
   */
  gameChangersForbidden: boolean;
  gameChangerBonus: number;
  playRateWeight: number;
};

export function bracketPowerAppetiteV1(bracket: CommanderBracket): BracketPowerAppetiteV1 {
  const gameChangerMax = getBracketPolicy(bracket).hardRules.gameChangerMax;
  return {
    version: PROFESSOR_SOL_DIRECTED_BRACKET_POWER_RANKING_V1_VERSION,
    bracket,
    gameChangersForbidden: gameChangerMax === 0,
    gameChangerBonus: GAME_CHANGER_BONUS_BY_BRACKET[bracket],
    playRateWeight: PLAY_RATE_WEIGHT_BY_BRACKET[bracket],
  };
}

export type BracketPowerAdjustmentV1 = {
  /** The card must not enter the pool at all. */
  excluded: boolean;
  /** Added to the requirement score before ranking. */
  bonus: number;
};

export function bracketPowerAdjustmentV1(args: {
  appetite: BracketPowerAppetiteV1;
  isGameChanger: boolean;
  /** Share of colour-eligible tournament decks playing the card, or null when unmeasured. */
  playRate: number | null;
}): BracketPowerAdjustmentV1 {
  if (args.isGameChanger && args.appetite.gameChangersForbidden) {
    return { excluded: true, bonus: 0 };
  }

  const playRate = args.playRate;
  // An unmeasured card is not treated as an unplayed one — it gets no bonus
  // and no penalty, so absence of tournament data never buries a card.
  const playRateBonus =
    playRate == null || !Number.isFinite(playRate) || playRate <= 0
      ? 0
      : Math.min(1, playRate) * args.appetite.playRateWeight;

  const gameChangerBonus = args.isGameChanger ? args.appetite.gameChangerBonus : 0;

  return { excluded: false, bonus: playRateBonus + gameChangerBonus };
}
