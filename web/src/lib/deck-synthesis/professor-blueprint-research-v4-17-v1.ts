/**
 * Professor v4.17 — Research Professor findings (revision proposals, not silent mutation).
 */
import type { BrewBlueprintV417, ResearchRequirementEvidenceV417 } from "./professor-brew-blueprint-v4-17-v1";
import type { RequirementCandidateEvaluationV417 } from "./professor-requirement-candidate-v4-17-v1";
import { precisionScore } from "./professor-semantic-role-v4-17-v1";

export const PROFESSOR_BLUEPRINT_RESEARCH_V4_17_V1_VERSION = "professor-blueprint-research-v4-17-v1";

export type BlueprintResearchVerdictV417 = "CONFIRM" | "STRENGTHEN" | "SUBSTITUTE" | "CHALLENGE" | "REJECT";

export type BlueprintResearchFindingV417 = {
  findingId: string;
  targetType: "PACKAGE" | "REQUIREMENT" | "WIN_HYPOTHESIS" | "STRATEGY";
  targetId: string;
  verdict: BlueprintResearchVerdictV417;
  summary: string;
  evidence: string[];
  suggestedRevision?: string;
  rulesContradiction?: boolean;
  researchEvidence?: ResearchRequirementEvidenceV417;
};

const PRECISION_SAMPLE_SIZE = 10;
const MIN_CONFIRM_PRECISION = 0.4;
const MIN_CONFIRM_QUALITY = 2;

export function buildResearchRequirementEvidenceV417(args: {
  requirementId: string;
  family: string;
  evaluations: RequirementCandidateEvaluationV417[];
}): ResearchRequirementEvidenceV417 {
  const eligible = args.evaluations.filter((e) => e.requirementEligible);
  const sample = eligible.slice(0, PRECISION_SAMPLE_SIZE);
  const representativeCandidates = sample.map((e) => ({
    name: e.cardName,
    precision: e.rolePrecision,
    score: e.finalRequirementScore,
  }));
  const precisionScores = sample.map((e) => precisionScore(e.rolePrecision));
  const falsePositiveRateSample =
    sample.length === 0 ? 1 : sample.filter((e) => e.rolePrecision === "FALSE_POSITIVE").length / sample.length;
  const minimumQualityCount = sample.filter(
    (e) => e.rolePrecision !== "FALSE_POSITIVE" && e.bracketQuality >= 60,
  ).length;
  const topCandidatePrecision = sample[0]?.rolePrecision ?? null;
  const requirementCoveragePotential =
    sample.length === 0
      ? 0
      : precisionScores.reduce((a, b) => a + b, 0) / sample.length;

  return {
    requirementId: args.requirementId,
    candidateCount: eligible.length,
    topCandidatePrecision,
    minimumQualityCount,
    representativeCandidates,
    falsePositiveRateSample,
    requirementCoveragePotential,
  };
}

export function evaluateResearchFindingsV417(args: {
  blueprint: BrewBlueprintV417;
  retrievalResults: Array<{
    requirementId: string;
    eligibleCount: number;
    family: string;
    researchEvidence?: ResearchRequirementEvidenceV417;
    topEvaluations?: RequirementCandidateEvaluationV417[];
  }>;
}): BlueprintResearchFindingV417[] {
  const findings: BlueprintResearchFindingV417[] = [];
  for (const result of args.retrievalResults) {
    const evidence =
      result.researchEvidence ??
      (result.topEvaluations
        ? buildResearchRequirementEvidenceV417({
            requirementId: result.requirementId,
            family: result.family,
            evaluations: result.topEvaluations,
          })
        : null);

    if (!evidence) {
      if (result.eligibleCount === 0) {
        findings.push({
          findingId: `rf-${result.requirementId}-challenge`,
          targetType: "REQUIREMENT",
          targetId: result.requirementId,
          verdict: "CHALLENGE",
          summary: `Requirement ${result.requirementId} has no eligible candidates in catalog scan`,
          evidence: ["eligibleCount=0"],
          suggestedRevision: "Revise requirement semantics or package scope",
        });
      }
      continue;
    }

    const confirmable =
      evidence.candidateCount >= 3 &&
      evidence.requirementCoveragePotential >= MIN_CONFIRM_PRECISION &&
      evidence.minimumQualityCount >= MIN_CONFIRM_QUALITY &&
      evidence.topCandidatePrecision !== "FALSE_POSITIVE" &&
      evidence.falsePositiveRateSample < 0.6;

    if (confirmable) {
      findings.push({
        findingId: `rf-${result.requirementId}-confirm`,
        targetType: "REQUIREMENT",
        targetId: result.requirementId,
        verdict: "CONFIRM",
        summary: `Requirement ${result.requirementId} has ${evidence.candidateCount} eligible candidates with precision ${evidence.requirementCoveragePotential.toFixed(2)}`,
        evidence: [
          `candidateCount=${evidence.candidateCount}`,
          `coveragePotential=${evidence.requirementCoveragePotential.toFixed(2)}`,
          `falsePositiveRate=${evidence.falsePositiveRateSample.toFixed(2)}`,
          `topPrecision=${evidence.topCandidatePrecision}`,
        ],
        researchEvidence: evidence,
      });
    } else if (evidence.candidateCount === 0) {
      findings.push({
        findingId: `rf-${result.requirementId}-challenge`,
        targetType: "REQUIREMENT",
        targetId: result.requirementId,
        verdict: "CHALLENGE",
        summary: `Requirement ${result.requirementId} has no eligible candidates in catalog scan`,
        evidence: ["eligibleCount=0"],
        suggestedRevision: "Revise requirement semantics or package scope",
        researchEvidence: evidence,
      });
    } else if (evidence.falsePositiveRateSample >= 0.6 || evidence.topCandidatePrecision === "FALSE_POSITIVE") {
      findings.push({
        findingId: `rf-${result.requirementId}-challenge`,
        targetType: "REQUIREMENT",
        targetId: result.requirementId,
        verdict: "CHALLENGE",
        summary: `Requirement ${result.requirementId} retrieval dominated by false-positive role matches (${Math.round(evidence.falsePositiveRateSample * 100)}% in top ${PRECISION_SAMPLE_SIZE})`,
        evidence: [
          `falsePositiveRate=${evidence.falsePositiveRateSample.toFixed(2)}`,
          `topPrecision=${evidence.topCandidatePrecision}`,
          ...evidence.representativeCandidates.slice(0, 3).map((c) => `${c.name}:${c.precision}`),
        ],
        suggestedRevision: "Tighten semantic role assertions (actor/object/target) for this requirement",
        researchEvidence: evidence,
      });
    } else if (evidence.candidateCount <= 2) {
      findings.push({
        findingId: `rf-${result.requirementId}-substitute`,
        targetType: "REQUIREMENT",
        targetId: result.requirementId,
        verdict: "SUBSTITUTE",
        summary: `Requirement ${result.requirementId} has thin support (${evidence.candidateCount} eligible)`,
        evidence: [`eligibleCount=${evidence.candidateCount}`],
        suggestedRevision: "Consider broadening acceptable functional alternatives",
        researchEvidence: evidence,
      });
    } else {
      findings.push({
        findingId: `rf-${result.requirementId}-strengthen`,
        targetType: "REQUIREMENT",
        targetId: result.requirementId,
        verdict: "STRENGTHEN",
        summary: `Requirement ${result.requirementId} has candidates but precision/quality below CONFIRM threshold`,
        evidence: [
          `coveragePotential=${evidence.requirementCoveragePotential.toFixed(2)}`,
          `minimumQualityCount=${evidence.minimumQualityCount}`,
        ],
        suggestedRevision: "Refine ranking weights or requirement bracket contract",
        researchEvidence: evidence,
      });
    }
  }

  const feasibility = args.blueprint.slotFeasibility;
  if (feasibility && !feasibility.feasible) {
    findings.push({
      findingId: "rf-blueprint-overconstrained",
      targetType: "STRATEGY",
      targetId: "blueprint",
      verdict: "CHALLENGE",
      summary: `Blueprint remains physically overconstrained after corrected accounting (${feasibility.minimumPhysicalStillRequired}/${feasibility.remainingPhysicalSlots})`,
      evidence: feasibility.violations,
      suggestedRevision: "Reduce package physical floors or remove distinct-card requirements",
    });
  }

  for (const pkg of args.blueprint.packages) {
    if (pkg.core && pkg.minimumPhysicalContribution > 20 && !feasibility?.feasible) {
      findings.push({
        findingId: `rf-${pkg.packageId}-reject`,
        targetType: "PACKAGE",
        targetId: pkg.packageId,
        verdict: "REJECT",
        summary: `Core package ${pkg.name} consumes too many physical slots`,
        evidence: [`minimumPhysicalContribution=${pkg.minimumPhysicalContribution}`],
        suggestedRevision: "Reduce package minimum physical contribution",
      });
    }
  }
  return findings;
}

export function rulesContradictionFindingV417(args: {
  requirementId: string;
  reason: string;
}): BlueprintResearchFindingV417 {
  return {
    findingId: `rf-rules-${args.requirementId}`,
    targetType: "REQUIREMENT",
    targetId: args.requirementId,
    verdict: "REJECT",
    summary: args.reason,
    evidence: ["RULES_CONTRADICTION"],
    rulesContradiction: true,
    suggestedRevision: "Remove or replace affected requirement after rules veto",
  };
}
