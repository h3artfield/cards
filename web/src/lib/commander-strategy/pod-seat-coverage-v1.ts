import type { NormalizedDeckInstance, TopdeckPodGame } from "./types";

export type PodSeatCoverageMetrics = {
  podSeatAppearances: number;
  podSeatDecklistAppearances: number;
  podSeatFullyResolvedDecklistAppearances: number;
  podSeatSemanticProfileEligibleAppearances: number;
  podSeatDecklistCoveragePct: { count: number; denominator: number; pct: number };
  podSeatFullyResolvedCoveragePct: { count: number; denominator: number; pct: number };
  podSeatSemanticProfileCoveragePct: { count: number; denominator: number; pct: number };
};

export function computePodSeatCoverageMetrics(input: {
  pods: TopdeckPodGame[];
  deckById: Map<string, NormalizedDeckInstance>;
}): PodSeatCoverageMetrics {
  let podSeatAppearances = 0;
  let podSeatDecklistAppearances = 0;
  let podSeatFullyResolvedDecklistAppearances = 0;
  let podSeatSemanticProfileEligibleAppearances = 0;

  for (const pod of input.pods) {
    for (const seat of pod.participants) {
      podSeatAppearances += 1;
      const deck = input.deckById.get(seat.deckInstanceId);
      if (deck?.decklistAvailable || deck?.deckObjAvailable) podSeatDecklistAppearances += 1;
      if (
        deck &&
        deck.mainboard.length > 0 &&
        deck.mainboard.every((c) => c.resolutionStatus === "resolved") &&
        deck.commanderResolutionStatus === "resolved"
      ) {
        podSeatFullyResolvedDecklistAppearances += 1;
      }
      if (deck && !deck.deckHash.startsWith("unresolved:") && deck.commanderOracleIds.length > 0) {
        podSeatSemanticProfileEligibleAppearances += 1;
      }
    }
  }

  const pct = (count: number, denominator: number) => ({
    count,
    denominator,
    pct: denominator > 0 ? Number(((count / denominator) * 100).toFixed(2)) : 0,
  });

  return {
    podSeatAppearances,
    podSeatDecklistAppearances,
    podSeatFullyResolvedDecklistAppearances,
    podSeatSemanticProfileEligibleAppearances,
    podSeatDecklistCoveragePct: pct(podSeatDecklistAppearances, podSeatAppearances),
    podSeatFullyResolvedCoveragePct: pct(podSeatFullyResolvedDecklistAppearances, podSeatAppearances),
    podSeatSemanticProfileCoveragePct: pct(
      podSeatSemanticProfileEligibleAppearances,
      podSeatAppearances,
    ),
  };
}
