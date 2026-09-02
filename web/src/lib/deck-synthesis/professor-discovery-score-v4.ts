/**
 * DiscoveryScore v4 — multi-axis scoring with classification beyond raw thresholds.
 */
import type { ResearchAnnotationV4 } from "./professor-research-contracts-v4";

export const PROFESSOR_DISCOVERY_SCORE_V4_VERSION = "professor-discovery-score-v4";

export const DISCOVERY_CLASSIFICATION_V4 = [
  "QUIET_INTEGRATION",
  "IDEA_BOARD",
  "ESCALATE_TO_CREATIVE",
  "MAJOR_CONTRADICTION",
] as const;

export type DiscoveryClassificationV4 = (typeof DISCOVERY_CLASSIFICATION_V4)[number];

export type DiscoveryScoreAxesV4 = {
  novelty: number;
  mechanicalConfidence: number;
  strategicImpact: number;
  packageCompatibility: number;
  commanderRelevance: number;
  resilienceGain: number;
  roleCompression: number;
};

export type ScoredDiscoveryV4 = {
  discoveryId: string;
  mechanicalPattern: string;
  axes: DiscoveryScoreAxesV4;
  compositeScore: number;
  classification: DiscoveryClassificationV4;
  classificationReason: string;
  contradictsThesis: boolean;
};

export function computeCompositeDiscoveryScoreV4(axes: DiscoveryScoreAxesV4): number {
  const weights = [0.2, 0.2, 0.15, 0.1, 0.15, 0.1, 0.1];
  const values = [
    axes.novelty,
    axes.mechanicalConfidence,
    axes.strategicImpact,
    axes.packageCompatibility,
    axes.commanderRelevance,
    axes.resilienceGain,
    axes.roleCompression,
  ];
  return values.reduce((sum, v, i) => sum + v * weights[i]!, 0);
}

export function classifyDiscoveryV4(args: {
  axes: DiscoveryScoreAxesV4;
  mechanicalPattern: string;
  contradictsThesis: boolean;
  annotation?: ResearchAnnotationV4;
}): { classification: DiscoveryClassificationV4; reason: string } {
  if (args.contradictsThesis && args.axes.mechanicalConfidence >= 0.6) {
    return {
      classification: "MAJOR_CONTRADICTION",
      reason: "Mechanically verified contradiction to existing thesis — escalates regardless of novelty.",
    };
  }
  if (args.annotation === "INCORRECT" && args.axes.strategicImpact >= 0.5) {
    return {
      classification: "MAJOR_CONTRADICTION",
      reason: "Validator marked claim INCORRECT with strategic materiality.",
    };
  }
  if (args.axes.novelty >= 0.75 && args.axes.strategicImpact < 0.25) {
    return {
      classification: "IDEA_BOARD",
      reason: "High novelty but low strategic relevance — park on idea board, do not escalate.",
    };
  }
  if (
    args.axes.strategicImpact >= 0.65 &&
    args.axes.mechanicalConfidence >= 0.55 &&
    (args.axes.novelty >= 0.45 || args.mechanicalPattern.includes("CROSS_RESOURCE"))
  ) {
    return {
      classification: "ESCALATE_TO_CREATIVE",
      reason: "Material strategic discovery with sufficient mechanical confidence.",
    };
  }
  if (args.axes.novelty >= 0.5 && args.axes.mechanicalConfidence >= 0.4) {
    return {
      classification: "IDEA_BOARD",
      reason: "Useful exploration branch — add to idea board without escalating.",
    };
  }
  return {
    classification: "QUIET_INTEGRATION",
    reason: "Verified or conventional finding — integrate quietly into working theory.",
  };
}

export function scoreDiscoveryV4(args: {
  discoveryId: string;
  mechanicalPattern: string;
  axes: DiscoveryScoreAxesV4;
  contradictsThesis?: boolean;
  annotation?: ResearchAnnotationV4;
}): ScoredDiscoveryV4 {
  const contradictsThesis = args.contradictsThesis ?? false;
  const compositeScore = computeCompositeDiscoveryScoreV4(args.axes);
  const { classification, reason } = classifyDiscoveryV4({
    axes: args.axes,
    mechanicalPattern: args.mechanicalPattern,
    contradictsThesis,
    annotation: args.annotation,
  });
  return {
    discoveryId: args.discoveryId,
    mechanicalPattern: args.mechanicalPattern,
    axes: args.axes,
    compositeScore,
    classification,
    classificationReason: reason,
    contradictsThesis,
  };
}

export function anyDiscoveryEscalatesV4(discoveries: ScoredDiscoveryV4[]): boolean {
  return discoveries.some(
    (d) => d.classification === "ESCALATE_TO_CREATIVE" || d.classification === "MAJOR_CONTRADICTION",
  );
}
