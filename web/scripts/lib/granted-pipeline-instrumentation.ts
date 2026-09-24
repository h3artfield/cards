/**
 * Observable granted pipeline stages — A0 candidate, A1 router, B classifier, C nested.
 * Does not modify parser behavior; read-only instrumentation for measurement.
 */
import { segmentAbilities, segmentCardFaces } from "../../src/lib/deck-builder/golden-catalog/oracle-ability-segmentation";
import { detectGrantedRulesSpans } from "../../src/lib/deck-builder/golden-catalog/oracle-rc3-granted-rules-span-detector";
import {
  routeSemanticContext,
  type SemanticContextKind,
} from "../../src/lib/deck-builder/golden-catalog/oracle-rc3-semantic-context-router";
import { classifyGrantedRulesSpan } from "../../src/lib/deck-builder/golden-catalog/oracle-rc3-granted-rules-classifier";
import type { TextSpan } from "./benchmark-identity";
import { metricsFromCounts } from "./rc3-granted-stage-metrics";

export type CardSpan = { start: number; end: number };

export function spansOverlap(a: CardSpan, b: CardSpan): boolean {
  return a.start < b.end && b.start < a.end;
}

export type DetectedCandidate = {
  abilityId: string;
  cardStart: number;
  cardEnd: number;
  localStart: number;
  localEnd: number;
  text: string;
  innerText: string;
  typography: string;
  structuralCue?: string;
};

export type RoutedCandidate = DetectedCandidate & {
  contextKind: SemanticContextKind;
  classification: string;
};

export function collectPipelineObservations(oracleText: string, oracleId: string) {
  const candidates: DetectedCandidate[] = [];
  const routed: RoutedCandidate[] = [];

  for (const face of segmentCardFaces(oracleText)) {
    for (const ability of segmentAbilities(oracleId, face.faceId, face.text, face.start)) {
      const paragraphStart = ability.paragraphStart;
      for (const span of detectGrantedRulesSpans(ability.paragraphText, ability.abilityId)) {
        const cand: DetectedCandidate = {
          abilityId: ability.abilityId,
          cardStart: paragraphStart + span.localStart,
          cardEnd: paragraphStart + span.localEnd,
          localStart: span.localStart,
          localEnd: span.localEnd,
          text: span.text,
          innerText: span.innerText,
          typography: span.typography,
          structuralCue: span.structuralCue,
        };
        candidates.push(cand);
        const route = routeSemanticContext(ability.paragraphText, span);
        const classified = classifyGrantedRulesSpan(ability.paragraphText, span).classification;
        routed.push({ ...cand, contextKind: route.contextKind, classification: classified });
      }
    }
  }

  return { candidates, routed };
}

export type GoldRegionFailureStage =
  | "success"
  | "A0_no_candidate"
  | "A1_wrong_context"
  | "B_classifier_rejected";

export function diagnoseGoldRegion(
  oracleText: string,
  oracleId: string,
  goldSpan: TextSpan,
): {
  failingStage: GoldRegionFailureStage;
  overlappingCandidates: DetectedCandidate[];
  overlappingRouted: RoutedCandidate[];
  bestRoute?: RoutedCandidate;
} {
  const { candidates, routed } = collectPipelineObservations(oracleText, oracleId);
  const gold: CardSpan = { start: goldSpan.start, end: goldSpan.end };

  const overlappingCandidates = candidates.filter((c) =>
    spansOverlap({ start: c.cardStart, end: c.cardEnd }, gold),
  );
  const overlappingRouted = routed.filter((r) => spansOverlap({ start: r.cardStart, end: r.cardEnd }, gold));

  if (overlappingCandidates.length === 0) {
    return { failingStage: "A0_no_candidate", overlappingCandidates, overlappingRouted };
  }

  const grantedRoute = overlappingRouted.find((r) => r.contextKind === "granted_rules");
  if (!grantedRoute) {
    return {
      failingStage: "A1_wrong_context",
      overlappingCandidates,
      overlappingRouted,
      bestRoute: overlappingRouted[0],
    };
  }

  if (grantedRoute.classification !== "granted_rules_ability") {
    return {
      failingStage: "B_classifier_rejected",
      overlappingCandidates,
      overlappingRouted,
      bestRoute: grantedRoute,
    };
  }

  return {
    failingStage: "success",
    overlappingCandidates,
    overlappingRouted,
    bestRoute: grantedRoute,
  };
}

export function findUnmatchedGrantedEmissions(
  oracleText: string,
  oracleId: string,
  goldSpans: TextSpan[],
): RoutedCandidate[] {
  const { routed } = collectPipelineObservations(oracleText, oracleId);
  return routed.filter(
    (r) =>
      r.contextKind === "granted_rules" &&
      r.classification === "granted_rules_ability" &&
      !goldSpans.some((g) => spansOverlap({ start: r.cardStart, end: r.cardEnd }, g)),
  );
}

export function computeStageMetrics(
  goldDiagnoses: Array<{ failingStage: GoldRegionFailureStage }>,
  unmatchedEmissionCount: number,
) {
  const a0_tp = goldDiagnoses.filter((d) => d.failingStage !== "A0_no_candidate").length;
  const a0_fn = goldDiagnoses.filter((d) => d.failingStage === "A0_no_candidate").length;
  const a0_fp = unmatchedEmissionCount;

  const a1Eligible = goldDiagnoses.filter((d) => d.failingStage !== "A0_no_candidate");
  const a1_tp = a1Eligible.filter((d) => d.failingStage === "success" || d.failingStage === "B_classifier_rejected").length;
  const a1_fn = a1Eligible.filter((d) => d.failingStage === "A1_wrong_context").length;

  const bEligible = goldDiagnoses.filter(
    (d) => d.failingStage === "success" || d.failingStage === "B_classifier_rejected",
  );
  const b_tp = bEligible.filter((d) => d.failingStage === "success").length;
  const b_fn = bEligible.filter((d) => d.failingStage === "B_classifier_rejected").length;
  const b_fp = 0;

  return {
    stageA0_candidateCoverage: {
      expectedRegions: goldDiagnoses.length,
      ...metricsFromCounts(a0_tp, a0_fp, a0_fn),
    },
    stageA1_semanticContextRouter: {
      conditionalOnA0Hit: a1Eligible.length,
      ...metricsFromCounts(a1_tp, 0, a1_fn),
    },
    stageB_grantedRulesClassifier: {
      conditionalOnGrantedRulesRoute: bEligible.length,
      ...metricsFromCounts(b_tp, b_fp, b_fn),
    },
    failureStageCounts: {
      A0_no_candidate: goldDiagnoses.filter((d) => d.failingStage === "A0_no_candidate").length,
      A1_wrong_context: goldDiagnoses.filter((d) => d.failingStage === "A1_wrong_context").length,
      B_classifier_rejected: goldDiagnoses.filter((d) => d.failingStage === "B_classifier_rejected").length,
      success: goldDiagnoses.filter((d) => d.failingStage === "success").length,
    },
  };
}
