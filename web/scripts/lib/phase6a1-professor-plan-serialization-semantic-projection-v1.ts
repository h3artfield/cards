/**
 * Deterministic required-semantic projection for Professor+validator ↔ runtime-input-v8 losslessness.
 */
import { createHash } from "node:crypto";
import type {
  SemanticPackage,
  StrategyHypothesis,
  StrategyPackageValidationResult,
  ThreeLensPortfolioSelection,
} from "../../src/lib/deck-synthesis/professor-planning-contracts-v2";
import type { ProfessorCaseExperimentRecordV2 } from "./phase6a1-professor-plan-agent-v2";
import type { PackageSynergyTypedEdge } from "./phase6a1-package-synergy-graph-v8";
import type { RuntimeInputV8 } from "./phase6a1-professor-plan-serializer-v1";

export const PROFESSOR_PLAN_SERIALIZATION_SEMANTIC_PROJECTION_V1_VERSION =
  "phase6a1-professor-plan-serialization-semantic-projection-v1";

export type ProjectedSemanticRequirement = {
  slotId: string;
  requirement: string;
  alternatives?: string[];
  satisfiesOpportunityIds?: string[];
};

export type ProjectedSemanticPackage = {
  packageId: string;
  title: string;
  purpose: string;
  causalChain: string[];
  semanticRequirements: ProjectedSemanticRequirement[];
  requiredResources: string[];
  producedResources: string[];
  payoffs: string[];
  commanderContribution: string;
  commanderIndependentFunction: string;
  commanderDependency: string;
  worksWithoutCommander: string;
  dependsOnPackageIds: string[];
  overlapsWithPackageIds: string[];
  vulnerabilities: string[];
  evidence: unknown[];
};

export type ProjectedHypothesis = {
  hypothesisId: string;
  title: string;
  thesis: string;
  commanderMechanismFactIds: string[];
  semanticOpportunityIds: string[];
  strengths: string[];
  vulnerabilities: string[];
  evidence: unknown[];
  packages: ProjectedSemanticPackage[];
};

export type RequiredSemanticProjectionV1 = {
  version: typeof PROFESSOR_PLAN_SERIALIZATION_SEMANTIC_PROJECTION_V1_VERSION;
  hypotheses: ProjectedHypothesis[];
  validationResults: StrategyPackageValidationResult[];
  validatedPackageIds: string[];
  rejectedPackageIds: string[];
  threeLensPortfolios: ThreeLensPortfolioSelection;
  packageSynergyTypedEdges: PackageSynergyTypedEdge[];
};

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) out[key] = sortValue(obj[key]);
    return out;
  }
  return value;
}

export function canonicalizeRequiredSemanticProjection(projection: RequiredSemanticProjectionV1): string {
  return JSON.stringify(sortValue(projection));
}

export function requiredSemanticProjectionSha256(projection: RequiredSemanticProjectionV1): string {
  return createHash("sha256").update(canonicalizeRequiredSemanticProjection(projection)).digest("hex");
}

function projectPackage(pkg: SemanticPackage): ProjectedSemanticPackage {
  return {
    packageId: pkg.packageId,
    title: pkg.title,
    purpose: pkg.purpose,
    causalChain: [...pkg.causalChain],
    semanticRequirements: pkg.semanticRequirements.map((s) => ({
      slotId: s.slotId,
      requirement: s.requirement,
      ...(s.alternatives ? { alternatives: [...s.alternatives] } : {}),
      ...(s.satisfiesOpportunityIds ? { satisfiesOpportunityIds: [...s.satisfiesOpportunityIds] } : {}),
    })),
    requiredResources: [...pkg.requiredResources],
    producedResources: [...pkg.producedResources],
    payoffs: [...pkg.payoffs],
    commanderContribution: pkg.commanderContribution,
    commanderIndependentFunction: pkg.commanderIndependentFunction,
    commanderDependency: pkg.commanderDependency,
    worksWithoutCommander: pkg.worksWithoutCommander,
    dependsOnPackageIds: [...pkg.dependsOnPackageIds],
    overlapsWithPackageIds: [...pkg.overlapsWithPackageIds],
    vulnerabilities: [...pkg.vulnerabilities],
    evidence: pkg.evidence.map((e) => structuredClone(e)),
  };
}

function projectHypothesis(h: StrategyHypothesis): ProjectedHypothesis {
  return {
    hypothesisId: h.hypothesisId,
    title: h.title,
    thesis: h.thesis,
    commanderMechanismFactIds: [...h.commanderMechanismFactIds],
    semanticOpportunityIds: [...h.semanticOpportunityIds],
    strengths: [...h.strengths],
    vulnerabilities: [...h.vulnerabilities],
    evidence: h.evidence.map((e) => structuredClone(e)),
    packages: h.packages.map(projectPackage),
  };
}

export function buildRequiredSemanticProjectionFromRecord(
  record: ProfessorCaseExperimentRecordV2,
  args: {
    validatedPackageIds: string[];
    rejectedPackageIds: string[];
    packageSynergyTypedEdges: PackageSynergyTypedEdge[];
  },
): RequiredSemanticProjectionV1 {
  return {
    version: PROFESSOR_PLAN_SERIALIZATION_SEMANTIC_PROJECTION_V1_VERSION,
    hypotheses: record.proposedHypotheses.map(projectHypothesis),
    validationResults: record.validationResults.map((r) => structuredClone(r)),
    validatedPackageIds: [...args.validatedPackageIds].sort(),
    rejectedPackageIds: [...args.rejectedPackageIds].sort(),
    threeLensPortfolios: structuredClone(record.threeLensPortfolios),
    packageSynergyTypedEdges: args.packageSynergyTypedEdges.map((e) => structuredClone(e)),
  };
}

export function buildRequiredSemanticProjectionFromRuntime(runtime: RuntimeInputV8): RequiredSemanticProjectionV1 {
  const projection = runtime.serializationProvenance.requiredSemanticProjection;
  const lensMembership = {
    DEPENDENT_SYNERGY: runtime.lenses.DEPENDENT_SYNERGY.validatedPackages.map((p) => p.packageRefId).sort(),
    INDEPENDENT_SYNERGY: runtime.lenses.INDEPENDENT_SYNERGY.validatedPackages.map((p) => p.packageRefId).sort(),
    HARMONY: runtime.lenses.HARMONY.validatedPackages.map((p) => p.packageRefId).sort(),
  };
  const portfolioMembership = {
    DEPENDENT_SYNERGY: [...projection.threeLensPortfolios.dependent.selectedPackageIds].sort(),
    INDEPENDENT_SYNERGY: [...projection.threeLensPortfolios.independent.selectedPackageIds].sort(),
    HARMONY: [...projection.threeLensPortfolios.harmony.selectedPackageIds].sort(),
  };
  for (const lens of ["DEPENDENT_SYNERGY", "INDEPENDENT_SYNERGY", "HARMONY"] as const) {
    if (JSON.stringify(lensMembership[lens]) !== JSON.stringify(portfolioMembership[lens])) {
      throw new Error(`RUNTIME_LENS_MEMBERSHIP_MISMATCH:${lens}`);
    }
  }
  return projection;
}

export type SemanticProjectionDiff = {
  path: string;
  sourceValue: unknown;
  runtimeValue: unknown;
};

function collectDiffs(source: unknown, runtime: unknown, path = ""): SemanticProjectionDiff[] {
  if (source === runtime) return [];
  if (typeof source !== typeof runtime) {
    return [{ path: path || "$", sourceValue: source, runtimeValue: runtime }];
  }
  if (source == null || runtime == null) {
    if (source !== runtime) return [{ path: path || "$", sourceValue: source, runtimeValue: runtime }];
    return [];
  }
  if (Array.isArray(source) && Array.isArray(runtime)) {
    if (source.length !== runtime.length) {
      return [{ path: `${path}.length`, sourceValue: source.length, runtimeValue: runtime.length }];
    }
    const out: SemanticProjectionDiff[] = [];
    for (let i = 0; i < source.length; i++) {
      out.push(...collectDiffs(source[i], runtime[i], `${path}[${i}]`));
    }
    return out;
  }
  if (typeof source === "object" && typeof runtime === "object") {
    const sObj = source as Record<string, unknown>;
    const rObj = runtime as Record<string, unknown>;
    const keys = [...new Set([...Object.keys(sObj), ...Object.keys(rObj)])].sort();
    const out: SemanticProjectionDiff[] = [];
    for (const key of keys) {
      out.push(...collectDiffs(sObj[key], rObj[key], path ? `${path}.${key}` : key));
    }
    return out;
  }
  return [{ path: path || "$", sourceValue: source, runtimeValue: runtime }];
}

export function diffRequiredSemanticProjections(
  source: RequiredSemanticProjectionV1,
  runtime: RequiredSemanticProjectionV1,
): SemanticProjectionDiff[] {
  return collectDiffs(sortValue(source), sortValue(runtime));
}
