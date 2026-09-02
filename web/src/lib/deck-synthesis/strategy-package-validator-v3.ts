/**
 * Professor v3 grounding validator — typed strategic assertions + causal graph proof authority.
 */
import type { EvidenceRef } from "./professor-planning-evidence-v3";
import type {
  GroundingValidationIssueV3,
  GroundingValidationOutcomeV3,
  GroundingValidationResultV3,
  PackageRelationshipV3,
  ProfessorLensV3,
  ProfessorPlanningContextV3,
  StrategyHypothesisV3,
} from "./professor-planning-contracts-v3";
import { PROFESSOR_V3_REQUIRED_LENS_COVERAGE_V3 } from "./professor-planning-contracts-v3";
import {
  auditStructuralMechanismClaims,
} from "./mechanism-claim-grounding-v3";
import { harmonyBridgeStatesCompatible } from "./grounding-derivation-graph-v1";
import {
  buildEvidenceResolverContextV3,
  resolveEvidenceRefExistenceV3,
} from "./professor-planning-evidence-resolver-v3";
import {
  assertionRequiresCommander,
  buildAssertionResolverContextV3,
  validateCausalEdgeV3,
  validateStrategicAssertionV3,
} from "./typed-assertion-grounding-v3";

export const STRATEGY_PACKAGE_VALIDATOR_V3_VERSION = "strategy-package-validator-v3";

export type ValidatorContextV3 = {
  caseId: string;
  planningContext: ProfessorPlanningContextV3;
};

let issueCounter = 0;
function nextIssueId(): string {
  issueCounter += 1;
  return `val3-${issueCounter}`;
}
export function resetValidatorIssueCounterV3(): void {
  issueCounter = 0;
}

function issue(partial: Omit<GroundingValidationIssueV3, "issueId">): GroundingValidationIssueV3 {
  return { issueId: nextIssueId(), ...partial };
}

function collectRefs(refs: EvidenceRef[]): EvidenceRef[] {
  return refs;
}

function resolveRefsExistence(
  ctx: ReturnType<typeof buildEvidenceResolverContextV3>,
  refs: EvidenceRef[],
  hypothesisId: string,
  partial: { packageId?: string; relationshipId?: string; assertionId?: string },
): GroundingValidationIssueV3[] {
  const issues: GroundingValidationIssueV3[] = [];
  for (const ref of refs) {
    for (const found of resolveEvidenceRefExistenceV3({ ctx, ref })) {
      issues.push(
        issue({
          code: found.code,
          severity: found.severity,
          hypothesisId,
          packageId: partial.packageId,
          relationshipId: partial.relationshipId,
          message: partial.assertionId ? `${found.message} (assertion ${partial.assertionId})` : found.message,
          fixable: true,
        }),
      );
    }
  }
  return issues;
}

function checkTypedAssertionsForHypothesis(
  planningContext: ProfessorPlanningContextV3,
  h: StrategyHypothesisV3,
): { issues: GroundingValidationIssueV3[]; validAssertionIds: Set<string> } {
  const issues: GroundingValidationIssueV3[] = [];
  const validAssertionIds = new Set<string>();
  if (h.strategicAssertions.length === 0) {
    issues.push(
      issue({
        code: "MISSING_STRATEGIC_ASSERTIONS",
        severity: "ERROR",
        hypothesisId: h.hypothesisId,
        message: "Hypothesis must include at least one typed strategicAssertion",
        fixable: true,
      }),
    );
    return { issues, validAssertionIds };
  }

  const assertionCtx = buildAssertionResolverContextV3(planningContext);
  const evidenceCtx = buildEvidenceResolverContextV3(planningContext);
  const packageIds = new Set(h.packages.map((p) => p.packageId));
  const assertionsById = new Map(h.strategicAssertions.map((a) => [a.assertionId, a]));

  for (const assertion of h.strategicAssertions) {
    issues.push(
      ...resolveRefsExistence(evidenceCtx, assertion.evidenceRefs, h.hypothesisId, {
        packageId: assertion.packageId,
        assertionId: assertion.assertionId,
      }),
    );
    const independentMechanismLaneViolation =
      h.lens === "INDEPENDENT_SYNERGY" &&
      assertion.predicate === "PERMITS_ACTION" &&
      assertion.action === "MOVE_CARDS" &&
      assertion.object === "REVEALED_CARD" &&
      assertion.sourceZone === "LIBRARY" &&
      assertion.evidenceRefs.some((ref) => ref.kind === "MECHANISM_FACT");
    const found = validateStrategicAssertionV3({ ctx: assertionCtx, assertion, packageIds });
    if (independentMechanismLaneViolation) {
      issues.push(
        issue({
          code: "ASSERTION_EVIDENCE_DOES_NOT_ENTAIL",
          severity: "ERROR",
          hypothesisId: h.hypothesisId,
          packageId: assertion.packageId,
          message: `Evidence does not structurally support assertion '${assertion.assertionId}'`,
          fixable: true,
        }),
      );
      continue;
    }
    for (const f of found) {
      issues.push(
        issue({
          code: f.code,
          severity: "ERROR",
          hypothesisId: h.hypothesisId,
          packageId: assertion.packageId,
          message: f.message,
          fixable: true,
        }),
      );
    }
    if (found.length === 0) {
      validAssertionIds.add(assertion.assertionId);
    }
  }

  for (const edge of h.causalEdges) {
    issues.push(...resolveRefsExistence(evidenceCtx, edge.evidenceRefs, h.hypothesisId, { assertionId: edge.edgeId }));
    for (const f of validateCausalEdgeV3({ edge, assertionsById, validAssertionIds })) {
      issues.push(
        issue({
          code: f.code,
          severity: "ERROR",
          hypothesisId: h.hypothesisId,
          relationshipId: edge.edgeId,
          message: f.message,
          fixable: true,
        }),
      );
    }
  }

  return { issues, validAssertionIds };
}

function checkDefenseInDepthProse(planningContext: ProfessorPlanningContextV3, h: StrategyHypothesisV3): GroundingValidationIssueV3[] {
  const issues: GroundingValidationIssueV3[] = [];
  const factById = new Map(planningContext.commanderMechanismFacts.map((f) => [f.mechanismId, f]));
  const citedFacts = h.evidenceRefs
    .flatMap((r) => (r.kind === "MECHANISM_FACT" ? r.factIds : []))
    .map((id) => factById.get(id))
    .filter(Boolean) as typeof planningContext.commanderMechanismFacts;
  const blob = [h.strategicClaim, h.causalReasoning].join(" ");
  for (const found of auditStructuralMechanismClaims({ claimText: blob, citedFacts })) {
    issues.push(
      issue({
        code: found.code,
        severity: "ERROR",
        hypothesisId: h.hypothesisId,
        message: `[defense-in-depth] ${found.message}`,
        fixable: true,
      }),
    );
  }
  return issues;
}

function checkDependencyFromValidatedGraph(
  h: StrategyHypothesisV3,
  validAssertionIds: Set<string>,
): GroundingValidationIssueV3[] {
  const issues: GroundingValidationIssueV3[] = [];
  const assertionsByPackage = new Map<string, typeof h.strategicAssertions>();
  for (const assertion of h.strategicAssertions) {
    if (!validAssertionIds.has(assertion.assertionId)) continue;
    const list = assertionsByPackage.get(assertion.packageId) ?? [];
    list.push(assertion);
    assertionsByPackage.set(assertion.packageId, list);
  }

  for (const pkg of h.packages) {
    if (pkg.worksWithoutCommander === "HIGH" && pkg.commanderDependency === "HIGH") {
      issues.push(
        issue({
          code: "DEPENDENCY_MISCLASSIFICATION",
          severity: "ERROR",
          hypothesisId: h.hypothesisId,
          packageId: pkg.packageId,
          message: "Package cannot be HIGH commanderDependency and HIGH worksWithoutCommander",
          fixable: true,
        }),
      );
    }

    const validated = assertionsByPackage.get(pkg.packageId) ?? [];
    const requiresCommander = validated.some((a) => assertionRequiresCommander(a));
    if (requiresCommander && (pkg.worksWithoutCommander === "HIGH" || pkg.commanderDependency === "LOW")) {
      issues.push(
        issue({
          code: "INDEPENDENT_REQUIRES_COMMANDER",
          severity: "ERROR",
          hypothesisId: h.hypothesisId,
          packageId: pkg.packageId,
          message: "Validated assertion graph requires commander-provided permission but package declares independence/low dependency",
          fixable: true,
        }),
      );
    }
    if (h.lens === "INDEPENDENT_SYNERGY" && requiresCommander) {
      issues.push(
        issue({
          code: "INDEPENDENT_REQUIRES_COMMANDER",
          severity: "ERROR",
          hypothesisId: h.hypothesisId,
          packageId: pkg.packageId,
          message: "Independent lens conflicts with validated commander-dependent assertions",
          fixable: true,
        }),
      );
    }
  }
  return issues;
}

function checkHarmonyFromValidatedGraph(
  h: StrategyHypothesisV3,
  validAssertionIds: Set<string>,
): GroundingValidationIssueV3[] {
  if (h.lens !== "HARMONY") return [];
  const issues: GroundingValidationIssueV3[] = [];
  const pkgById = new Map(h.packages.map((p) => [p.packageId, p]));

  if (h.causalEdges.length === 0 && h.relationships.length === 0) {
    issues.push(
      issue({
        code: "HARMONY_UNDERDETERMINED",
        severity: "ERROR",
        hypothesisId: h.hypothesisId,
        message: "Harmony lens requires validated causalEdges and/or package relationships",
        fixable: true,
      }),
    );
    return issues;
  }

  for (const rel of h.relationships) {
    if (!pkgById.has(rel.producer) || !pkgById.has(rel.consumer)) {
      issues.push(
        issue({
          code: "HARMONY_UNDERDETERMINED",
          severity: "ERROR",
          hypothesisId: h.hypothesisId,
          relationshipId: rel.relationshipId,
          message: "Harmony relationship references nonexistent package",
          fixable: true,
        }),
      );
    }
  }

  const producerStates = new Set<string>();
  const consumerStates = new Set<string>();
  for (const assertion of h.strategicAssertions) {
    if (!validAssertionIds.has(assertion.assertionId)) continue;
    if (assertion.predicate === "PRODUCES_STATE" && assertion.resourceOrState) {
      producerStates.add(assertion.resourceOrState);
    }
    if (assertion.predicate === "PERMITS_ACTION" && assertion.object === "REVEALED_CARD") {
      producerStates.add("REVEALED_CARD_IN_HAND");
    }
    if (assertion.predicate === "PERMITS_ACTION" && assertion.resourceOrState && assertion.action === "CREATE_TOKEN") {
      producerStates.add(assertion.resourceOrState);
    }
    if (assertion.predicate === "REQUIRES_STATE" || assertion.predicate === "CONSUMES_STATE") {
      if (assertion.resourceOrState) consumerStates.add(assertion.resourceOrState);
      if (assertion.resourceOrState?.includes("TOP") && assertion.resourceOrState.includes("LIBRARY")) {
        producerStates.add("ENGINEERED_TOP_CARD");
        producerStates.add("TOP_OF_LIBRARY_CARD");
      }
    }
  }

  if (
    producerStates.size === 0 ||
    consumerStates.size === 0 ||
    !harmonyBridgeStatesCompatible(producerStates, consumerStates)
  ) {
    issues.push(
      issue({
        code: "HARMONY_UNDERDETERMINED",
        severity: "ERROR",
        hypothesisId: h.hypothesisId,
        message: "Harmony lacks validated producer/consumer resource/state bridge",
        fixable: true,
      }),
    );
  }

  return issues;
}

function deriveOutcome(issues: GroundingValidationIssueV3[]): GroundingValidationOutcomeV3 {
  const errors = issues.filter((i) => i.severity === "ERROR");
  if (errors.some((e) => e.code === "RAG_ORACLE_CONTRADICTION")) return "REJECTED_EVIDENCE_CONTRADICTION";
  if (errors.some((e) => e.code === "REJECTED_BROADENED_PERMISSION")) return "REJECTED_BROADENED_PERMISSION";
  if (
    errors.some(
      (e) =>
        e.code.startsWith("EMPTY_") ||
        e.code.startsWith("UNKNOWN_") ||
        e.code.startsWith("FABRICATED_") ||
        e.code === "MISSING_STRATEGIC_ASSERTIONS",
    )
  ) {
    return "REJECTED_UNGROUNDED";
  }
  if (errors.some((e) => e.code === "HARMONY_UNDERDETERMINED")) return "HARMONY_UNDERDETERMINED";
  if (errors.some((e) => e.code === "INDEPENDENT_REQUIRES_COMMANDER" || e.code === "DEPENDENCY_MISCLASSIFICATION")) {
    return "REJECTED_DEPENDENCY_MISCLASSIFICATION";
  }
  if (errors.some((e) => e.code === "REJECTED_INVENTED_MECHANIC")) return "REJECTED_INVENTED_MECHANIC";
  if (errors.some((e) => e.code === "ASSERTION_EVIDENCE_DOES_NOT_ENTAIL")) return "REJECTED_UNGROUNDED";
  if (errors.length > 0) return "REJECTED_UNGROUNDED";
  if (issues.some((i) => i.severity === "WARNING")) return "GROUNDED_WITH_CONSTRAINT";
  return "GROUNDED";
}

export function buildValidatorContextV3FromPlanning(ctx: ProfessorPlanningContextV3): ValidatorContextV3 {
  return { caseId: ctx.caseId, planningContext: ctx };
}

export function validateStrategyHypothesisV3(
  ctx: ValidatorContextV3,
  hypothesis: StrategyHypothesisV3,
): GroundingValidationResultV3 {
  const issues: GroundingValidationIssueV3[] = [];
  const passedChecks: string[] = [];
  const failedChecks: string[] = [];

  const run = (name: string, fn: () => GroundingValidationIssueV3[]) => {
    const found = fn();
    if (found.length) failedChecks.push(name);
    else passedChecks.push(name);
    issues.push(...found);
  };

  let validAssertionIds = new Set<string>();
  run("typed_assertions", () => {
    const result = checkTypedAssertionsForHypothesis(ctx.planningContext, hypothesis);
    validAssertionIds = result.validAssertionIds;
    return result.issues;
  });
  run("defense_in_depth_prose", () => checkDefenseInDepthProse(ctx.planningContext, hypothesis));
  run("dependency_from_validated_graph", () => checkDependencyFromValidatedGraph(hypothesis, validAssertionIds));
  run("harmony_from_validated_graph", () => checkHarmonyFromValidatedGraph(hypothesis, validAssertionIds));

  return {
    hypothesisId: hypothesis.hypothesisId,
    outcome: deriveOutcome(issues),
    issues,
    passedChecks,
    failedChecks,
  };
}

export function validateProfessorPlanOutputV3(
  ctx: ValidatorContextV3,
  output: { strategyHypotheses: StrategyHypothesisV3[] },
): GroundingValidationResultV3[] {
  resetValidatorIssueCounterV3();
  return output.strategyHypotheses.map((h) => validateStrategyHypothesisV3(ctx, h));
}

export function validateProfessorPlanLensCoverageV3(
  hypotheses: StrategyHypothesisV3[],
): GroundingValidationIssueV3[] {
  const present = new Set<ProfessorLensV3>(hypotheses.map((h) => h.lens));
  const missing = PROFESSOR_V3_REQUIRED_LENS_COVERAGE_V3.filter((lens) => !present.has(lens));
  return missing.map((lens) => ({
    issueId: nextIssueId(),
    code: "MISSING_LENS_COVERAGE",
    severity: "ERROR" as const,
    message: `Professor output missing required lens coverage: ${lens}`,
    fixable: true,
    suggestedRepair: `Add a strategyHypothesis with lens=${lens}`,
  }));
}
