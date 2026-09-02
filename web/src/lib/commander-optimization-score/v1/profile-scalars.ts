import type { CosV1AccessFeatures, CosV1ArchitectureFingerprint, CosV1ProfileAxisId } from "./types";

export const COS_V1_PROFILE_META: Array<{
  id: CosV1ProfileAxisId;
  label: string;
  role: "load_bearing" | "descriptive_only";
}> = [
  { id: "win_architecture", label: "Win architecture", role: "load_bearing" },
  { id: "access_consistency", label: "Access / consistency", role: "descriptive_only" },
  { id: "mana_efficiency", label: "Mana efficiency", role: "load_bearing" },
  { id: "redundancy", label: "Redundancy", role: "descriptive_only" },
  { id: "interaction", label: "Interaction", role: "load_bearing" },
  { id: "protection", label: "Protection", role: "load_bearing" },
  { id: "resilience", label: "Resilience", role: "descriptive_only" },
  { id: "card_advantage", label: "Card advantage", role: "load_bearing" },
  { id: "role_compression", label: "Role compression", role: "descriptive_only" },
  { id: "coherence", label: "Coherence", role: "load_bearing" },
];

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
