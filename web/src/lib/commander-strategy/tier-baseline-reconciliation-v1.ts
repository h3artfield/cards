/**
 * Canonical tier population labels — no ambiguous baseline terminology in training manifests.
 */
export const TIER_A_FULL_SEMANTIC_POD = "tier_a_full_semantic_pod";
export const VALID_WINNER_ALL_COMMANDER_CONFIG_KNOWN_POD =
  "valid_winner_all_commander_configuration_known_pod";

export type TierBaselineReconciliation = {
  definitions: {
    tierAFullSemanticPod: string;
    validWinnerAllCommanderConfigKnownPod: string;
  };
  historicalReference: {
    normalizedV2TierAFullSemanticJuneAugust: number;
    note: string;
  };
  finalResolverJuneAugust: {
    tierAFullSemanticPods: number;
    tierBPartialSemanticPods: number;
    tierCCommanderOnlyPods: number;
    tierXCommanderInsufficient: number;
    validWinnerAllCommanderConfigKnownPods: number;
    explanation: string;
  };
  twelveMonthFinalResolver: {
    tierAFullSemanticPods: number;
    increaseFromComparableJuneAugustBaseline: number;
    increaseFromV2PipelineHonestBaseline: number;
  };
  mislabelCorrection: {
    priorIncorrectLabel: string;
    correctLabel: string;
    whyTheyDivergedPreV3: string;
    whyTheyConvergePostV3: string;
  };
};

export function buildTierBaselineReconciliation(input: {
  v2TierAJuneAugust: number;
  juneAugustTierA: number;
  juneAugustTierB: number;
  juneAugustAllCommanderKnown: number;
  twelveMonthTierA: number;
}): TierBaselineReconciliation {
  return {
    definitions: {
      tierAFullSemanticPod:
        "Historical valid-winner pod where every seat has CommanderConfiguration resolved AND fully resolved decklist AND DeckSemanticProfile eligibility.",
      validWinnerAllCommanderConfigKnownPod:
        "Historical valid-winner pod where every seat has CommanderConfiguration resolved (commanders known). Does NOT require full mainboard card resolution.",
    },
    historicalReference: {
      normalizedV2TierAFullSemanticJuneAugust: input.v2TierAJuneAugust,
      note:
        "Pipeline-honest v2 baseline before resolver v3 card-identity repair. Most valid-winner pods with commanders known were Tier B because mainboard cards did not fully resolve.",
    },
    finalResolverJuneAugust: {
      tierAFullSemanticPods: input.juneAugustTierA,
      tierBPartialSemanticPods: input.juneAugustTierB,
      tierCCommanderOnlyPods: 0,
      tierXCommanderInsufficient: 0,
      validWinnerAllCommanderConfigKnownPods: input.juneAugustAllCommanderKnown,
      explanation:
        input.juneAugustTierA === input.juneAugustAllCommanderKnown
          ? "Under resolver v3.3, Tier A full-semantic equals valid-winner all-commander-known because Tier B (partial decklist resolution) is 0."
          : `Under resolver v3.3, Tier A (${input.juneAugustTierA}) differs from all-commander-known (${input.juneAugustAllCommanderKnown}) when some pods have commanders but incomplete decklists.`,
    },
    twelveMonthFinalResolver: {
      tierAFullSemanticPods: input.twelveMonthTierA,
      increaseFromComparableJuneAugustBaseline: input.twelveMonthTierA - input.juneAugustTierA,
      increaseFromV2PipelineHonestBaseline: input.twelveMonthTierA - input.v2TierAJuneAugust,
    },
    mislabelCorrection: {
      priorIncorrectLabel:
        "Some reports equated tierAFullSemanticPods (11,703) with a mysterious baseline; 11,703 is NOT the v2 Tier A count (2,798). The prior 11,703 figure was a June–August gate snapshot; authoritative recompute is 11,726 (+23 pods, temporal/window boundary drift).",
      correctLabel:
        "11,726 = tierAFullSemanticPods under final resolver v3.3 for June–August (same definition as 54,000 twelve-month Tier A). The label validWinnerAllCommanderConfigKnownPod applies when commanders resolve but decklists may not.",
      whyTheyDivergedPreV3:
        "Pre-v3: validWinnerAllCommanderConfigKnown ≈ 11,703 but tierAFullSemantic = 2,798 because ~8,905 pods had decklists but unresolved mainboard cards (Tier B).",
      whyTheyConvergePostV3:
        "Post-v3.3: card resolution reached 100%, moving former Tier B pods into Tier A; Tier B → 0, so Tier A ≈ all-commander-known on valid-winner pods.",
    },
  };
}
