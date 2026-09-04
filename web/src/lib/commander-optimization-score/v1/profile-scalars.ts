import type { CosV1AccessFeatures, CosV1ArchitectureFingerprint, CosV1ProfileAxisId } from "./types";

/**
 * `measures` states what the scalar actually counts, in the player's language.
 *
 * Every axis label is broader than its measurement, and a reader who takes the
 * label at face value will draw the wrong conclusion. "Redundancy" sounds like
 * backup plans but counts combo-piece reuse; "Resilience" sounds like surviving
 * a board wipe but counts graveyard recursion only; "Coherence" sounds like
 * strategic focus but counts how tightly the deck concentrates into semantic
 * clusters, per copy, so basic lands raise it. Showing the measurement next to
 * the number is what makes the percentile interpretable.
 */
export const COS_V1_PROFILE_META: Array<{
  id: CosV1ProfileAxisId;
  label: string;
  role: "load_bearing" | "descriptive_only";
  measures: string;
}> = [
  {
    id: "win_architecture",
    label: "Win architecture",
    role: "load_bearing",
    measures: "Verified CommanderSpellbook lines: how many, how short, and whether any is a two-card line.",
  },
  {
    id: "access_consistency",
    label: "Access / consistency",
    role: "descriptive_only",
    measures: "Share of nonland cards that search your library.",
  },
  {
    id: "mana_efficiency",
    label: "Mana efficiency",
    role: "load_bearing",
    measures: "Share of nonlands costing 2 or less, plus ramp density, less average mana value.",
  },
  {
    id: "redundancy",
    label: "Redundancy",
    role: "descriptive_only",
    measures: "How often one card is reused across your verified combo lines — not backup game plans.",
  },
  {
    id: "interaction",
    label: "Interaction",
    role: "load_bearing",
    measures: "Share of nonlands that counter, destroy, exile, fight, or damage a target.",
  },
  {
    id: "protection",
    label: "Protection",
    role: "load_bearing",
    measures: "Share of nonlands granting hexproof, indestructible, ward, or protection.",
  },
  {
    id: "resilience",
    label: "Resilience",
    role: "descriptive_only",
    measures: "Share of nonlands that recur cards from a graveyard — recursion only, not protection.",
  },
  {
    id: "card_advantage",
    label: "Card advantage",
    role: "load_bearing",
    measures: "Share of nonlands whose text draws cards.",
  },
  {
    id: "role_compression",
    label: "Role compression",
    role: "descriptive_only",
    measures: "Share of nonlands filling two or more of the roles above at once.",
  },
  {
    id: "coherence",
    label: "Coherence",
    /**
     * Presented as descriptive even though FORMULA.json lists it load_bearing.
     *
     * The ablation does not support billing this as a strength driver. Removing
     * clusterEntropy from the model costs 0.000385 held-out logloss, and adding
     * it to commander identity on its own has a negative mean per-event delta
     * (-0.00033): as a predictor it is not distinguishable from noise. It is
     * also the axis most easily moved by something unrelated to strategy — on a
     * mono-green list, 20 basic Forests are worth about 15 percentile points,
     * because entropy counts every copy.
     *
     * The scalar and the frozen 60-d feature vector are unchanged; this governs
     * only which band the axis is displayed in and whether it is quoted as a
     * reason for the score.
     */
    role: "descriptive_only",
    measures:
      "How tightly the deck concentrates into a few card-similarity clusters. Every copy counts, so a high basic-land count raises it.",
  },
];

/**
 * Axes computed purely from verified CommanderSpellbook lines.
 *
 * `win_architecture` is 0 unless a complete line exists, and `redundancy` is
 * sharedPieceConcentration — the share of combo sets containing the most
 * reused card — which is 0 when there are no sets. With no verified line
 * neither is a measurement of the deck, so a deck with no combos lands at the
 * bottom of both reference distributions no matter how it is built. Notably
 * `redundancy` does not mean strategic redundancy: a deck with many backup
 * plans and no Spellbook combo still scores 0.
 */
export const COS_V1_COMBO_DERIVED_AXES: ReadonlySet<CosV1ProfileAxisId> = new Set<CosV1ProfileAxisId>([
  "win_architecture",
  "redundancy",
]);

export function profileScalars(
  feat: CosV1AccessFeatures,
  fp: CosV1ArchitectureFingerprint | null,
): Record<CosV1ProfileAxisId, number> {
  const ncomb = fp ? Number(fp.nNormalizedCombos || 0) : 0;
  let arch = 0;
  if (ncomb > 0 && fp) {
    const routes = Math.log1p(Number(fp.nTerminalRoutes || 0));
    const two = Number(fp.nTwoCard || 0) > 0 ? 1 : 0;
    arch = routes + two - 0.25 * Number(fp.minComboCardCount || 0);
  }
  return {
    win_architecture: arch,
    access_consistency: feat.tutorFrac,
    mana_efficiency: feat.fracMvLe2 + feat.rampFrac - 0.15 * feat.meanMvNonland,
    redundancy: feat.sharedConc,
    interaction: feat.interactFrac,
    protection: feat.protectFrac,
    resilience: feat.recurFrac,
    card_advantage: feat.drawFrac,
    role_compression: feat.roleCompressFrac,
    coherence: -feat.clusterEntropy,
  };
}
