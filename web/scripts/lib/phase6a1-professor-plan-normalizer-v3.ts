/**
 * Fail-closed Professor v3 planning normalizer — runtime contract validation, affordances optional.
 */
import type {
  DependencyLevel,
  PackageRelationshipV3,
  ProfessorLensV3,
  ProfessorPlanningContextV3,
  StrategyHypothesisV3,
  StrategyPackageV3,
} from "../../src/lib/deck-synthesis/professor-planning-contracts-v3";
import type { EvidenceRef } from "../../src/lib/deck-synthesis/professor-planning-evidence-v3";
import type { CausalEdgeV3, StrategicAssertionV3 } from "../../src/lib/deck-synthesis/strategic-assertion-vocabulary-v3";
import { isAssertionPredicateV3 } from "../../src/lib/deck-synthesis/strategic-assertion-vocabulary-v3";
import { isFunctionalRoleV3 } from "../../src/lib/deck-synthesis/professor-functional-roles-v3";

export const PROFESSOR_PLAN_NORMALIZER_V3_VERSION = "phase6a1-professor-plan-normalizer-v3";

export type NormalizationIssueV3 = { path: string; message: string };

export type NormalizationResultV3 =
  | { status: "SUCCESS"; normalized: StrategyHypothesisV3[]; issues: [] }
  | { status: "NORMALIZATION_FAILURE"; normalized: null; issues: NormalizationIssueV3[] };

const VALID_LENS: ProfessorLensV3[] = ["AUTO", "DEPENDENT_SYNERGY", "INDEPENDENT_SYNERGY", "HARMONY"];
import { PROFESSOR_V3_DEPENDENCY_LEVELS } from "./phase6a1-professor-v3-plan-output-schema-v2";

function nonBlank(value: unknown, path: string, issues: NormalizationIssueV3[]): string | null {
  if (typeof value !== "string" || !value.trim()) {
    issues.push({ path, message: "Required nonblank string missing" });
    return null;
  }
  return value.trim();
}

function nonBlankStringArray(value: unknown, path: string, issues: NormalizationIssueV3[], required = false): string[] | null {
  if (!Array.isArray(value)) {
    if (required) issues.push({ path, message: "Required string array missing" });
    return required ? null : [];
  }
  const out: string[] = [];
  for (let i = 0; i < value.length; i++) {
    const item = value[i];
    if (typeof item !== "string" || !item.trim()) {
      issues.push({ path: `${path}[${i}]`, message: "Array element must be nonblank string" });
      return null;
    }
    out.push(item.trim());
  }
  if (required && out.length === 0) {
    issues.push({ path, message: "Required non-empty string array missing" });
    return null;
  }
  return out;
}

function dependencyLevel(value: unknown, path: string, issues: NormalizationIssueV3[]): DependencyLevel | null {
  if (typeof value === "boolean") {
    issues.push({ path, message: "commanderDependency/worksWithoutCommander must be HIGH|MEDIUM|LOW — boolean rejected" });
    return null;
  }
  if (PROFESSOR_V3_DEPENDENCY_LEVELS.includes(value as DependencyLevel)) return value as DependencyLevel;
  issues.push({ path, message: "commanderDependency/worksWithoutCommander must be HIGH|MEDIUM|LOW" });
  return null;
}

function functionalRolesArray(value: unknown, path: string, issues: NormalizationIssueV3[]): string[] | null {
  if (!Array.isArray(value) || value.length === 0) {
    issues.push({ path, message: "functionalRoles must be a non-empty array of versioned role tokens" });
    return null;
  }
  const out: string[] = [];
  for (let i = 0; i < value.length; i++) {
    const item = value[i];
    if (typeof item !== "string" || !item.trim()) {
      issues.push({ path: `${path}[${i}]`, message: "functionalRoles element must be nonblank string" });
      return null;
    }
    const normalized = item.trim().toUpperCase().replace(/\s+/g, "_");
    if (!isFunctionalRoleV3(normalized)) {
      issues.push({ path: `${path}[${i}]`, message: `Unknown functional role '${item}' — must be a versioned role token` });
      return null;
    }
    out.push(normalized);
  }
  return out;
}

function lensEnum(value: unknown, path: string, issues: NormalizationIssueV3[]): ProfessorLensV3 | null {
  if (VALID_LENS.includes(value as ProfessorLensV3)) return value as ProfessorLensV3;
  issues.push({ path, message: "lens must be AUTO|DEPENDENT_SYNERGY|INDEPENDENT_SYNERGY|HARMONY" });
  return null;
}

function normalizeEvidenceRefs(raw: unknown, path: string, issues: NormalizationIssueV3[]): EvidenceRef[] | null {
  if (!Array.isArray(raw) || raw.length === 0) {
    issues.push({ path, message: "evidenceRefs must be a non-empty array" });
    return null;
  }
  const out: EvidenceRef[] = [];
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    const p = `${path}[${i}]`;
    if (!item || typeof item !== "object") {
      issues.push({ path: p, message: "evidenceRef must be object" });
      return null;
    }
    const obj = item as Record<string, unknown>;
    if ("evidenceId" in obj || "evidenceType" in obj) {
      issues.push({ path: p, message: "Unsupported alias {evidenceId,evidenceType} — use kind + typed fields" });
      return null;
    }
    const kind = obj.kind;
    if (kind === "MECHANISM_FACT") {
      const factIds = nonBlankStringArray((item as { factIds?: unknown }).factIds, `${p}.factIds`, issues, true);
      if (!factIds) return null;
      out.push({ kind, factIds, statement: (item as { statement?: string }).statement?.trim() });
      continue;
    }
    if (kind === "ORACLE_CLAUSE") {
      const sourceOracleId = nonBlank((item as { sourceOracleId?: unknown }).sourceOracleId, `${p}.sourceOracleId`, issues);
      if (!sourceOracleId) return null;
      out.push({
        kind,
        sourceOracleId,
        oracleSpan: (item as { oracleSpan?: string }).oracleSpan?.trim(),
        statement: (item as { statement?: string }).statement?.trim(),
      });
      continue;
    }
    if (kind === "PRECOMPUTED_AFFORDANCE") {
      const opportunityIds = nonBlankStringArray((item as { opportunityIds?: unknown }).opportunityIds, `${p}.opportunityIds`, issues, true);
      if (!opportunityIds) return null;
      out.push({ kind, opportunityIds, statement: (item as { statement?: string }).statement?.trim() });
      continue;
    }
    if (kind === "RAG_EVIDENCE") {
      const evidenceIds = nonBlankStringArray((item as { evidenceIds?: unknown }).evidenceIds, `${p}.evidenceIds`, issues, true);
      if (!evidenceIds) return null;
      out.push({ kind, evidenceIds, statement: (item as { statement?: string }).statement?.trim() });
      continue;
    }
    if (kind === "RULES_EVIDENCE") {
      const ruleId = nonBlank((item as { ruleId?: unknown }).ruleId, `${p}.ruleId`, issues);
      if (!ruleId) return null;
      out.push({ kind, ruleId, statement: (item as { statement?: string }).statement?.trim() });
      continue;
    }
    if (kind === "SEMANTIC_RELATIONSHIP") {
      const relationshipId = nonBlank((item as { relationshipId?: unknown }).relationshipId, `${p}.relationshipId`, issues);
      if (!relationshipId) return null;
      out.push({ kind, relationshipId, statement: (item as { statement?: string }).statement?.trim() });
      continue;
    }
    if (kind === "RESEARCH_EVIDENCE") {
      const evidenceIds = nonBlankStringArray((item as { evidenceIds?: unknown }).evidenceIds, `${p}.evidenceIds`, issues, true);
      if (!evidenceIds) return null;
      out.push({ kind, evidenceIds, statement: (item as { statement?: string }).statement?.trim() });
      continue;
    }
    issues.push({ path: p, message: "Unsupported or malformed evidenceRef kind" });
    return null;
  }
  return out;
}

function normalizePackage(
  raw: unknown,
  index: number,
  caseId: string,
  issues: NormalizationIssueV3[],
): StrategyPackageV3 | null {
  const path = `packages[${index}]`;
  if (!raw || typeof raw !== "object") {
    issues.push({ path, message: "package must be object" });
    return null;
  }
  const o = raw as Record<string, unknown>;
  const packageId = nonBlank(o.packageId, `${path}.packageId`, issues) ?? `${caseId}-pkg-${index + 1}`;
  const purpose = nonBlank(o.purpose, `${path}.purpose`, issues);
  const functionalRoles = functionalRolesArray(o.functionalRoles, `${path}.functionalRoles`, issues);
  const inputs = nonBlankStringArray(o.inputs, `${path}.inputs`, issues) ?? [];
  const resourcesRequired = nonBlankStringArray(o.resourcesRequired, `${path}.resourcesRequired`, issues) ?? [];
  const outputs = nonBlankStringArray(o.outputs, `${path}.outputs`, issues) ?? [];
  const resourcesProduced = nonBlankStringArray(o.resourcesProduced, `${path}.resourcesProduced`, issues) ?? [];
  const commanderDependency = dependencyLevel(o.commanderDependency, `${path}.commanderDependency`, issues);
  const worksWithoutCommander = dependencyLevel(o.worksWithoutCommander, `${path}.worksWithoutCommander`, issues);
  const evidenceRefs = normalizeEvidenceRefs(o.evidenceRefs, `${path}.evidenceRefs`, issues);
  const dependsOnPackageIds = nonBlankStringArray(o.dependsOnPackageIds, `${path}.dependsOnPackageIds`, issues) ?? [];

  if (!purpose || !functionalRoles || !commanderDependency || !worksWithoutCommander || !evidenceRefs) return null;

  return {
    packageId,
    purpose,
    functionalRoles,
    inputs,
    resourcesRequired,
    outputs,
    resourcesProduced,
    commanderDependency,
    worksWithoutCommander,
    evidenceRefs,
    dependsOnPackageIds,
  };
}

function normalizeRelationship(
  raw: unknown,
  index: number,
  caseId: string,
  packageIds: Set<string>,
  issues: NormalizationIssueV3[],
): PackageRelationshipV3 | null {
  const path = `relationships[${index}]`;
  if (!raw || typeof raw !== "object") {
    issues.push({ path, message: "relationship must be object" });
    return null;
  }
  const o = raw as Record<string, unknown>;
  const relationshipId = nonBlank(o.relationshipId, `${path}.relationshipId`, issues) ?? `${caseId}-rel-${index + 1}`;
  const producer = nonBlank(o.producer, `${path}.producer`, issues);
  const consumer = nonBlank(o.consumer, `${path}.consumer`, issues);
  const relationshipType = nonBlank(o.relationshipType, `${path}.relationshipType`, issues);
  const causalReasoning = nonBlank(o.causalReasoning, `${path}.causalReasoning`, issues);
  const evidenceRefs = normalizeEvidenceRefs(o.evidenceRefs, `${path}.evidenceRefs`, issues);
  if (!producer || !consumer || !relationshipType || !causalReasoning || !evidenceRefs) return null;
  if (!packageIds.has(producer)) {
    issues.push({ path: `${path}.producer`, message: `Relationship producer '${producer}' references unknown package` });
    return null;
  }
  if (!packageIds.has(consumer)) {
    issues.push({ path: `${path}.consumer`, message: `Relationship consumer '${consumer}' references unknown package` });
    return null;
  }
  return { relationshipId, producer, consumer, relationshipType, causalReasoning, evidenceRefs };
}

function normalizeStrategicAssertion(
  raw: unknown,
  index: number,
  caseId: string,
  packageIds: Set<string>,
  issues: NormalizationIssueV3[],
): StrategicAssertionV3 | null {
  const path = `strategicAssertions[${index}]`;
  if (!raw || typeof raw !== "object") {
    issues.push({ path, message: "strategicAssertion must be object" });
    return null;
  }
  const o = raw as Record<string, unknown>;
  const assertionId = nonBlank(o.assertionId, `${path}.assertionId`, issues) ?? `${caseId}-assert-${index + 1}`;
  const packageId = nonBlank(o.packageId, `${path}.packageId`, issues);
  const predicateRaw = nonBlank(o.predicate, `${path}.predicate`, issues);
  const evidenceRefs = normalizeEvidenceRefs(o.evidenceRefs, `${path}.evidenceRefs`, issues);
  if (!packageId || !predicateRaw || !evidenceRefs) return null;
  if (!isAssertionPredicateV3(predicateRaw)) {
    issues.push({ path: `${path}.predicate`, message: "Invalid assertion predicate" });
    return null;
  }
  if (!packageIds.has(packageId)) {
    issues.push({ path: `${path}.packageId`, message: `Assertion packageId '${packageId}' references unknown package` });
    return null;
  }
  return {
    assertionId,
    packageId,
    predicate: predicateRaw,
    action: typeof o.action === "string" ? o.action.trim() : undefined,
    object: typeof o.object === "string" ? o.object.trim() : undefined,
    resourceOrState: typeof o.resourceOrState === "string" ? o.resourceOrState.trim() : undefined,
    sourceZone: typeof o.sourceZone === "string" ? o.sourceZone.trim() : undefined,
    destinationZone: typeof o.destinationZone === "string" ? o.destinationZone.trim() : undefined,
    timing: typeof o.timing === "string" ? o.timing.trim() : undefined,
    controllerScope: typeof o.controllerScope === "string" ? o.controllerScope.trim() : undefined,
    quantityOrScaling: typeof o.quantityOrScaling === "string" ? o.quantityOrScaling.trim() : undefined,
    provider: typeof o.provider === "string" ? o.provider.trim() : undefined,
    evidenceRefs,
  };
}

function normalizeCausalEdge(
  raw: unknown,
  index: number,
  caseId: string,
  assertionIds: Set<string>,
  issues: NormalizationIssueV3[],
): CausalEdgeV3 | null {
  const path = `causalEdges[${index}]`;
  if (!raw || typeof raw !== "object") {
    issues.push({ path, message: "causalEdge must be object" });
    return null;
  }
  const o = raw as Record<string, unknown>;
  const edgeId = nonBlank(o.edgeId, `${path}.edgeId`, issues) ?? `${caseId}-edge-${index + 1}`;
  const producerAssertionId = nonBlank(o.producerAssertionId, `${path}.producerAssertionId`, issues);
  const consumerAssertionId = nonBlank(o.consumerAssertionId, `${path}.consumerAssertionId`, issues);
  const resourceOrState = nonBlank(o.resourceOrState, `${path}.resourceOrState`, issues);
  const evidenceRefs = normalizeEvidenceRefs(o.evidenceRefs, `${path}.evidenceRefs`, issues);
  if (!producerAssertionId || !consumerAssertionId || !resourceOrState || !evidenceRefs) return null;
  if (!assertionIds.has(producerAssertionId)) {
    issues.push({ path: `${path}.producerAssertionId`, message: `Unknown producerAssertionId '${producerAssertionId}'` });
    return null;
  }
  if (!assertionIds.has(consumerAssertionId)) {
    issues.push({ path: `${path}.consumerAssertionId`, message: `Unknown consumerAssertionId '${consumerAssertionId}'` });
    return null;
  }
  return { edgeId, producerAssertionId, consumerAssertionId, resourceOrState, evidenceRefs };
}

export function normalizeProfessorPlanningResponseV3(args: {
  parsedModelResponse: unknown;
  ctx: ProfessorPlanningContextV3;
}): NormalizationResultV3 {
  const issues: NormalizationIssueV3[] = [];
  const parsed = args.parsedModelResponse;
  if (!parsed || typeof parsed !== "object") {
    issues.push({ path: "strategyHypotheses", message: "Top-level object required" });
    return { status: "NORMALIZATION_FAILURE", normalized: null, issues };
  }
  const rawHyps = (parsed as { strategyHypotheses?: unknown }).strategyHypotheses;
  if (!Array.isArray(rawHyps) || rawHyps.length === 0) {
    issues.push({ path: "strategyHypotheses", message: "Non-empty strategyHypotheses array required" });
    return { status: "NORMALIZATION_FAILURE", normalized: null, issues };
  }

  const normalized: StrategyHypothesisV3[] = [];
  const hypothesisIds = new Set<string>();

  for (let i = 0; i < rawHyps.length; i++) {
    const raw = rawHyps[i];
    const path = `strategyHypotheses[${i}]`;
    if (!raw || typeof raw !== "object") {
      issues.push({ path, message: "hypothesis must be object" });
      continue;
    }
    const o = raw as Record<string, unknown>;
    const hypothesisId = nonBlank(o.hypothesisId, `${path}.hypothesisId`, issues) ?? `${args.ctx.caseId}-hyp-${i + 1}`;
    if (hypothesisIds.has(hypothesisId)) {
      issues.push({ path: `${path}.hypothesisId`, message: `Duplicate hypothesisId '${hypothesisId}'` });
      continue;
    }
    hypothesisIds.add(hypothesisId);

    const title = nonBlank(o.title, `${path}.title`, issues);
    const strategicClaim = nonBlank(o.strategicClaim, `${path}.strategicClaim`, issues);
    const causalReasoning = nonBlank(o.causalReasoning, `${path}.causalReasoning`, issues);
    const evidenceRefs = normalizeEvidenceRefs(o.evidenceRefs, `${path}.evidenceRefs`, issues);
    const lens = lensEnum(o.lens, `${path}.lens`, issues);
    const commanderDependency = dependencyLevel(o.commanderDependency, `${path}.commanderDependency`, issues);
    if (!title || !strategicClaim || !causalReasoning || !evidenceRefs || !lens || !commanderDependency) continue;

    const packagesRaw = Array.isArray(o.packages) ? o.packages : [];
    if (packagesRaw.length === 0) {
      issues.push({ path: `${path}.packages`, message: "At least one package required" });
      continue;
    }

    const packages: StrategyPackageV3[] = [];
    const packageIds = new Set<string>();
    for (let pi = 0; pi < packagesRaw.length; pi++) {
      const pkg = normalizePackage(packagesRaw[pi], pi, args.ctx.caseId, issues);
      if (!pkg) continue;
      if (packageIds.has(pkg.packageId)) {
        issues.push({ path: `${path}.packages[${pi}].packageId`, message: `Duplicate packageId '${pkg.packageId}'` });
        continue;
      }
      packageIds.add(pkg.packageId);
      packages.push(pkg);
    }
    if (packages.length === 0) continue;

    for (const pkg of packages) {
      for (const depId of pkg.dependsOnPackageIds ?? []) {
        if (!packageIds.has(depId)) {
          issues.push({
            path: `${path}.packages`,
            message: `Package '${pkg.packageId}' dependsOnPackageIds references unknown package '${depId}'`,
          });
        }
      }
    }

    const relationships: PackageRelationshipV3[] = [];
    const relationshipIds = new Set<string>();
    const relRaw = Array.isArray(o.relationships) ? o.relationships : [];
    for (let ri = 0; ri < relRaw.length; ri++) {
      const rel = normalizeRelationship(relRaw[ri], ri, args.ctx.caseId, packageIds, issues);
      if (!rel) continue;
      if (relationshipIds.has(rel.relationshipId)) {
        issues.push({
          path: `${path}.relationships[${ri}].relationshipId`,
          message: `Duplicate relationshipId '${rel.relationshipId}'`,
        });
        continue;
      }
      relationshipIds.add(rel.relationshipId);
      relationships.push(rel);
    }

    const strategicAssertions: StrategicAssertionV3[] = [];
    const assertionIds = new Set<string>();
    const assertRaw = Array.isArray(o.strategicAssertions) ? o.strategicAssertions : [];
    if (assertRaw.length === 0) {
      issues.push({ path: `${path}.strategicAssertions`, message: "At least one strategicAssertion required" });
      continue;
    }
    for (let ai = 0; ai < assertRaw.length; ai++) {
      const assertion = normalizeStrategicAssertion(assertRaw[ai], ai, args.ctx.caseId, packageIds, issues);
      if (!assertion) continue;
      if (assertionIds.has(assertion.assertionId)) {
        issues.push({ path: `${path}.strategicAssertions[${ai}].assertionId`, message: `Duplicate assertionId '${assertion.assertionId}'` });
        continue;
      }
      assertionIds.add(assertion.assertionId);
      strategicAssertions.push(assertion);
    }
    if (strategicAssertions.length === 0) continue;

    const causalEdges: CausalEdgeV3[] = [];
    const edgeIds = new Set<string>();
    const edgeRaw = Array.isArray(o.causalEdges) ? o.causalEdges : [];
    for (let ei = 0; ei < edgeRaw.length; ei++) {
      const edge = normalizeCausalEdge(edgeRaw[ei], ei, args.ctx.caseId, assertionIds, issues);
      if (!edge) continue;
      if (edgeIds.has(edge.edgeId)) {
        issues.push({ path: `${path}.causalEdges[${ei}].edgeId`, message: `Duplicate edgeId '${edge.edgeId}'` });
        continue;
      }
      edgeIds.add(edge.edgeId);
      causalEdges.push(edge);
    }

    normalized.push({
      hypothesisId,
      title,
      strategicClaim,
      causalReasoning,
      evidenceRefs,
      strategicAssertions,
      causalEdges,
      commanderDependency,
      lens,
      packages,
      relationships,
      strengths: nonBlankStringArray(o.strengths, `${path}.strengths`, issues) ?? [],
      vulnerabilities: nonBlankStringArray(o.vulnerabilities, `${path}.vulnerabilities`, issues) ?? [],
    });
  }

  if (issues.length > 0 || normalized.length === 0) {
    return { status: "NORMALIZATION_FAILURE", normalized: null, issues };
  }
  return { status: "SUCCESS", normalized, issues: [] };
}
