/**
 * Research Professor contract v4 — mechanical interrogation, semantic discovery, pass-3 gate.
 */
import type { EvidenceRef } from "./professor-planning-evidence-v3";
import type { ProfessorPlanningContextV3 } from "./professor-planning-contracts-v3";
import type { CreativeProfessorPass1V4 } from "./professor-creative-pass1-contracts-v4";

export const PROFESSOR_RESEARCH_CONTRACTS_V4_VERSION = "professor-research-contracts-v4";

export const RESEARCH_ANNOTATION_V4 = [
  "VERIFIED",
  "STRATEGICALLY_SUPPORTED",
  "NEEDS_ORACLE_VERIFICATION",
  "INCORRECT",
  "UNENCODABLE",
] as const;

export type ResearchAnnotationV4 = (typeof RESEARCH_ANNOTATION_V4)[number];

export type ResearchClaimDecompositionV4 = {
  claimId: string;
  sourcePlanElement: string;
  claim: string;
  annotation: ResearchAnnotationV4;
  evidenceRefs: EvidenceRef[];
  notes: string;
};

export type ResearchSemanticDiscoveryV4 = {
  discoveryId: string;
  mechanicalPattern: string;
  candidates: string[];
  whyItMatters: string;
  evidenceRefs: EvidenceRef[];
  noveltyEstimate: "CONVENTIONAL" | "MODERATE" | "HIGH";
};

export type ResearchProblemV4 = {
  severity: "LOW" | "MEDIUM" | "HIGH";
  type: string;
  description: string;
  affectedPlanElements: string[];
};

export type ResearchChallengeMenuItemV4 = {
  direction: string;
  mechanicalBasis: string;
  whyItMayImprovePlan: string;
};

export type ResearchPacketV4 = {
  originalThesisSummary: string;
  verifiedStrengths: string[];
  materialProblems: string[];
  genuinelyNewDiscoveries: string[];
  recommendedStrategicChanges: string[];
  keyOracleMechanismEvidence: string[];
};

export type ResearchProfessorInputV4 = {
  frozenCommanderContext: ProfessorPlanningContextV3;
  creativeProfessorPass1: CreativeProfessorPass1V4;
};

export type ResearchProfessorOutputV4 = {
  version: typeof PROFESSOR_RESEARCH_CONTRACTS_V4_VERSION;
  claimDecomposition: ResearchClaimDecompositionV4[];
  semanticDiscoveries: ResearchSemanticDiscoveryV4[];
  problems: ResearchProblemV4[];
  challengeMenu: ResearchChallengeMenuItemV4[];
  warrantSecondCreativeCall: boolean;
  secondCallReasons: string[];
  researchPacket: ResearchPacketV4 | null;
};

export function validateResearchProfessorOutputV4(
  value: unknown,
): { ok: true; output: ResearchProfessorOutputV4 } | { ok: false; issues: string[] } {
  const issues: string[] = [];
  if (!value || typeof value !== "object") return { ok: false, issues: ["Research output must be an object"] };
  const o = value as Record<string, unknown>;
  for (const field of [
    "claimDecomposition",
    "semanticDiscoveries",
    "problems",
    "challengeMenu",
    "secondCallReasons",
  ] as const) {
    if (!Array.isArray(o[field])) issues.push(`${field} must be an array`);
  }
  if (typeof o.warrantSecondCreativeCall !== "boolean") issues.push("warrantSecondCreativeCall must be boolean");
  if (o.warrantSecondCreativeCall === true && !o.researchPacket) {
    issues.push("researchPacket required when warrantSecondCreativeCall is true");
  }
  if (o.warrantSecondCreativeCall === false && o.researchPacket != null) {
    issues.push("researchPacket must be null when warrantSecondCreativeCall is false");
  }
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, output: value as ResearchProfessorOutputV4 };
}
