/**
 * Goldfish speed feature. The live input is goldfish-sim-v1 (threat-turn
 * median / coverage). The old tag-table stand-in remains only as a fallback
 * when a list has no oracle text.
 */
import { familiesFromCardV1_1 } from "./tag-families-v1.1";
import { classifyGoldfishCard, simulateGoldfish, type GoldfishSimResult } from "./goldfish-sim-v1";

export const DR_GOLDFISH_SPEED_VERSION = "deck-rating-goldfish-speed-v1.1";

export type GoldfishSpeedCard = {
  oracleId?: string;
  name?: string;
  typeLine?: string;
  oracleText?: string;
  manaValue?: number;
  power?: number | null;
  quantity?: number;
  isCommander?: boolean;
};

export function goldfishSpeedFeatureV1_1(cards: GoldfishSpeedCard[]): {
  version: typeof DR_GOLDFISH_SPEED_VERSION;
  source: "stand-in-tags" | "goldfish-sim";
  threatTurn: number;
  feature: number;
  coverage?: number;
  lowConfidence?: boolean;
  sim?: GoldfishSimResult;
} {
  if (cards.some((c) => c.oracleId && (c.typeLine || c.oracleText))) {
    const simCards = cards.flatMap((c) => {
      const one = classifyGoldfishCard({
        oracleId: c.oracleId ?? c.name ?? "unknown",
        name: c.name ?? "",
        typeLine: c.typeLine,
        text: c.oracleText,
        cmc: c.manaValue,
        power: c.power,
        isCommander: c.isCommander,
      });
      return Array.from({ length: c.quantity ?? 1 }, () => one);
    });
    const sim = simulateGoldfish({ cards: simCards });
    return {
      version: DR_GOLDFISH_SPEED_VERSION,
      source: "goldfish-sim",
      threatTurn: sim.rmst15,
      feature: Math.max(0, (8.4 - sim.p50) / 6),
      coverage: sim.coverage,
      lowConfidence: sim.lowConfidence,
      sim,
    };
  }
  let ramp = 0;
  let draw = 0;
  let cheap = 0;
  let mv = 0;
  let n = 0;
  for (const card of cards) {
    const q = card.quantity ?? 1;
    const fam = familiesFromCardV1_1({ typeLine: card.typeLine, oracleText: card.oracleText });
    if (fam.has("ramp")) ramp += q;
    if (fam.has("draw") || fam.has("tutor")) draw += q;
    const cmc = card.manaValue ?? 3;
    mv += cmc * q;
    n += q;
    if (!card.isCommander && cmc <= 1 && !/\bland\b/i.test(card.typeLine ?? "")) cheap += q;
  }
  const meanMv = n ? mv / n : 3;
  const threatTurn = Math.min(12, Math.max(2.5, 8.4 - 0.12 * ramp - 0.08 * draw - 0.05 * cheap + 0.15 * (meanMv - 3)));
  return {
    version: DR_GOLDFISH_SPEED_VERSION,
    source: "stand-in-tags",
    threatTurn,
    feature: Math.max(0, (8.4 - threatTurn) / 6),
  };
}
