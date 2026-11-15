/**
 * F3 stand-in opponents. Stored on artifacts as opponentModel.
 */
export const DR_OPPONENT_MODEL_V1 = "passive-standard-v1";

export const OPPONENT_MODEL_NOTES = {
  opponentModel: DR_OPPONENT_MODEL_V1,
  opponents: 3,
  startingLife: 40,
  blocks: false,
  interaction: false,
  eachOpponentEachTurn: {
    draw: 1,
    castCreature: 1,
    castNoncreature: 1,
    paysRhystic: false,
    paysTithe: false,
    paysRemora: false,
    paysEsperSentinel: false,
  },
  taxesPerRound: {
    rhysticStudy: 3,
    smotheringTitheTreasures: 3,
    mysticRemora: 3,
    esperSentinel: 3,
  },
  notes:
    "Each opponent casts one creature and one noncreature on their turn. Tax permanents that trigger on any spell (Rhystic, Tithe) count once per opponent per round so B5−B4 is not a stand-in-draw artifact. Sentinel/Remora trigger on the noncreature.",
};

export type OpponentTaxPermanents = {
  rhystic: number;
  tithe: number;
  remora: number;
  sentinel: number;
};

export function opponentRoundTriggers(permanents: OpponentTaxPermanents): {
  extraCards: number;
  treasures: number;
} {
  const opp = 3;
  return {
    extraCards: opp * (permanents.rhystic + permanents.remora + permanents.sentinel),
    treasures: opp * permanents.tithe,
  };
}
