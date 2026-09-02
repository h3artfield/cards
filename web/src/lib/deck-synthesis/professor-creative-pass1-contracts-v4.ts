/**
 * Creative Professor pass-1 contract v4 — lightweight strategy synthesis without typed assertion envelope.
 */
import type { EvidenceRef } from "./professor-planning-evidence-v3";
import type { DependencyLevel } from "./professor-planning-contracts-v3";

export const PROFESSOR_CREATIVE_PASS1_CONTRACTS_V4_VERSION = "professor-creative-pass1-contracts-v4";

export type CreativeProfessorPackageV4 = {
  id: string;
  concept: string;
  purpose: string;
  commanderDependence: DependencyLevel;
  whyInteresting: string;
  likelyCardsOrEffects: string[];
  evidenceRefs?: EvidenceRef[];
};

export type CreativeProfessorWinPathV4 = {
  id: string;
  description: string;
  commanderDependence: DependencyLevel;
  evidenceRefs?: EvidenceRef[];
};

export type CreativeProfessorIndependentEngineV4 = {
  id: string;
  description: string;
  worksWithoutCommander: DependencyLevel;
  evidenceRefs?: EvidenceRef[];
};

export type CreativeProfessorPass1V4 = {
  version: typeof PROFESSOR_CREATIVE_PASS1_CONTRACTS_V4_VERSION;
  commander: string;
  strategicThesis: string;
  mechanicInterpretation: string[];
  packages: CreativeProfessorPackageV4[];
  winPaths: CreativeProfessorWinPathV4[];
  independentEngines: CreativeProfessorIndependentEngineV4[];
  vulnerabilities: string[];
  openQuestions: string[];
  confidenceNotes: string[];
  evidenceRefs?: EvidenceRef[];
};

export type CreativeProfessorPass1ValidationIssueV4 = {
  path: string;
  message: string;
};

export function validateCreativeProfessorPass1V4(
  value: unknown,
): { ok: true; pass1: CreativeProfessorPass1V4 } | { ok: false; issues: CreativeProfessorPass1ValidationIssueV4[] } {
  const issues: CreativeProfessorPass1ValidationIssueV4[] = [];
  if (!value || typeof value !== "object") {
    return { ok: false, issues: [{ path: "", message: "Pass-1 output must be an object" }] };
  }
  const o = value as Record<string, unknown>;
  const reqString = (path: string, v: unknown) => {
    if (typeof v !== "string" || !v.trim()) issues.push({ path, message: "Non-empty string required" });
  };
  reqString("commander", o.commander);
  reqString("strategicThesis", o.strategicThesis);
  if (!Array.isArray(o.mechanicInterpretation) || o.mechanicInterpretation.length === 0) {
    issues.push({ path: "mechanicInterpretation", message: "Non-empty array required" });
  }
  if (!Array.isArray(o.packages) || o.packages.length === 0) {
    issues.push({ path: "packages", message: "At least one package required" });
  }
  if (!Array.isArray(o.winPaths) || o.winPaths.length === 0) {
    issues.push({ path: "winPaths", message: "At least one win path required" });
  }
  for (const field of ["vulnerabilities", "openQuestions", "confidenceNotes", "independentEngines"] as const) {
    if (!Array.isArray(o[field])) issues.push({ path: field, message: "Array required" });
  }
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, pass1: value as CreativeProfessorPass1V4 };
}
