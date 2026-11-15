/**
 * F4 mulligan v2. London: first mull bottoms 0 (max(0, mull-1)).
 */
export const DR_MULLIGAN_V2 = "deck-rating-goldfish-mulligan-v2";

export type MullCard = {
  name: string;
  oracleId: string;
  cmc: number;
  countsAsLand: boolean;
  isManaSource: boolean;
  isPlanCard: boolean;
  castableByT2: boolean;
};

export type MulliganDecision = {
  keep: boolean;
  reason: string;
};

export function isManaSourceV2(input: {
  countsAsLand: boolean;
  cmc: number;
  isLand: boolean;
  name: string;
  rampMana: number;
  text?: string;
  authoredFast?: boolean;
}): boolean {
  if (input.countsAsLand) return true;
  if (input.isLand) return true;
  if (input.cmc > 1) return false;
  if (input.authoredFast) return true;
  if (input.rampMana > 0) return true;
  if (/lotus petal|mox |chrome mox|mana crypt|sol ring/i.test(input.name)) return true;
  if (/\{T\}: Add |add \{[WUBRGC]/i.test(input.text ?? "")) return true;
  return false;
}

export function keepMulliganV2(args: {
  hand: MullCard[];
  mull: number;
  hasTerminalLine: boolean;
}): MulliganDecision {
  const lands = args.hand.filter((c) => c.countsAsLand).length;
  const manaSources = args.hand.filter((c) => c.isManaSource).length;
  const planCards = args.hand.filter((c) => c.isPlanCard).length;
  const castableByT2 = args.hand.filter((c) => c.castableByT2).length;
  if (args.mull === 0) {
    const keep =
      lands >= 1 &&
      manaSources >= 2 &&
      manaSources <= 5 &&
      (planCards >= 1 || castableByT2 >= 2);
    return { keep, reason: keep ? "open-keep" : "open-mull" };
  }
  if (args.mull >= 1) {
    const keep = lands >= 1 && manaSources >= 2;
    return { keep, reason: keep ? "later-keep" : "later-mull" };
  }
  return { keep: true, reason: "force" };
}

export function bottomMulliganV2<T extends MullCard>(hand: T[], putBack: number): T[] {
  if (putBack <= 0) return [];
  const lands = hand.filter((c) => c.countsAsLand).length;
  const ranked = hand
    .map((c, i) => ({ c, i }))
    .sort((a, b) => {
      const aLandExcess = a.c.countsAsLand && lands > 3 ? 1 : 0;
      const bLandExcess = b.c.countsAsLand && lands > 3 ? 1 : 0;
      if (aLandExcess !== bLandExcess) return bLandExcess - aLandExcess;
      const aPlan = a.c.isPlanCard ? 1 : 0;
      const bPlan = b.c.isPlanCard ? 1 : 0;
      if (aPlan !== bPlan) return aPlan - bPlan;
      return b.c.cmc - a.c.cmc;
    });
  return ranked.slice(0, putBack).map((x) => x.c);
}
