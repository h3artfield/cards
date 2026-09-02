/**
 * Deterministic strategy/package validator v2 — fail-closed pre-gates, evidence resolution, NO_ACTIONABLE boundary.
 */
import type { PlanningEvidence } from "./professor-planning-evidence-v1";
import type { IndependentMechanismFact } from "./independent-truth-types-v1";
import type { SemanticOpportunity } from "./semantic-opportunity-types-v1";
import type {
  ProposalValidationOutcome,
  SemanticPackage,
  StrategyHypothesis,
  StrategyPackageValidationResult,
  StructuredValidationIssue,
  ValidationCheckCategory,
} from "./professor-planning-contracts-v2";

export const STRATEGY_PACKAGE_VALIDATOR_V2_VERSION = "strategy-package-validator-v2";

export type ValidatorContextV2 = {
  caseId: string;
  colorIdentity: string[];
  bracket: number;
  commandZoneConfiguration: string;
  commanders: string[];
  mechanismFacts: IndependentMechanismFact[];
  semanticOpportunities: SemanticOpportunity[];
  noActionableFactIds: Set<string>;
  knownRagEvidenceIds: Set<string>;
  /** When set, only these opportunity IDs are valid mechanical premises */
  acceptedOpportunityIds?: Set<string>;
};

let issueCounter = 0;

function nextIssueId(): string {
  issueCounter += 1;
  return `val2-${issueCounter}`;
}

function resetIssueCounter(): void {
  issueCounter = 0;
}

function issue(partial: Omit<StructuredValidationIssue, "issueId">): StructuredValidationIssue {
  return { issueId: nextIssueId(), ...partial };
}

function factIds(ctx: ValidatorContextV2): Set<string> {
  return new Set(ctx.mechanismFacts.map((f) => f.mechanismId));
}

function opportunityIds(ctx: ValidatorContextV2): Set<string> {
  return new Set(ctx.semanticOpportunities.map((o) => o.opportunityId));
}

function blob(pkg: SemanticPackage): string {
  return [
    ...pkg.causalChain,
    ...pkg.semanticRequirements.map((s) => s.requirement),
    ...pkg.requiredResources,
    ...pkg.producedResources,
    ...pkg.payoffs,
    pkg.commanderContribution,
    pkg.commanderIndependentFunction,
  ]
    .join(" ")
    .toLowerCase();
}

function checkPreValidationGates(hypothesis: StrategyHypothesis): StructuredValidationIssue[] {
  const issues: StructuredValidationIssue[] = [];
  const hid = hypothesis.hypothesisId;

  if (hypothesis.thesis.trim().length === 0) {
    issues.push(
      issue({
        category: "PRE_VALIDATION_GATE",
        severity: "ERROR",
        hypothesisId: hid,
        message: "Hypothesis thesis must be nonblank before semantic validation",
        fixable: true,
        suggestedRepair: "Provide a thesis grounded in frozen facts and opportunities",
      }),
    );
  }

  if (hypothesis.commanderMechanismFactIds.length === 0) {
    issues.push(
      issue({
        category: "PRE_VALIDATION_GATE",
        severity: "ERROR",
        hypothesisId: hid,
        message: "Hypothesis must cite at least one commanderMechanismFactId",
        fixable: true,
        suggestedRepair: "Use inspectCommanderFacts and cite frozen mechanismFactIds",
      }),
    );
  }

  if (hypothesis.semanticOpportunityIds.length === 0) {
    issues.push(
      issue({
        category: "PRE_VALIDATION_GATE",
        severity: "ERROR",
        hypothesisId: hid,
        message: "Hypothesis must cite at least one semanticOpportunityId",
        fixable: true,
        suggestedRepair: "Use inspectSemanticOpportunities and cite accepted opportunity IDs",
      }),
    );
  }

  if (hypothesis.packages.length === 0) {
    issues.push(
      issue({
        category: "PRE_VALIDATION_GATE",
        severity: "ERROR",
        hypothesisId: hid,
        message: "Hypothesis must contain at least one package — empty packages cannot be VALIDATED",
        fixable: true,
        suggestedRepair: "Add SemanticPackage objects with complete semanticRequirements",
      }),
    );
    return issues;
  }

  for (const pkg of hypothesis.packages) {
    const blankSlots = pkg.semanticRequirements.filter((s) => s.requirement.trim().length === 0);
    if (blankSlots.length > 0 || pkg.semanticRequirements.length === 0) {
      issues.push(
        issue({
          category: "PRE_VALIDATION_GATE",
          severity: "ERROR",
          hypothesisId: hid,
          packageId: pkg.packageId,
          message: "Every package must contain at least one nonblank semanticRequirement",
          fixable: true,
          suggestedRepair: "Fill semanticRequirements[].requirement with enabler functions",
        }),
      );
    }
  }

  return issues;
}

function checkMechanicalValidity(
  ctx: ValidatorContextV2,
  hypothesis: StrategyHypothesis,
): StructuredValidationIssue[] {
  const issues: StructuredValidationIssue[] = [];
  const knownFacts = factIds(ctx);
  const knownOpps = opportunityIds(ctx);

  for (const fid of hypothesis.commanderMechanismFactIds) {
    if (!knownFacts.has(fid)) {
      issues.push(
        issue({
          category: "MECHANICAL_VALIDITY",
          severity: "ERROR",
          hypothesisId: hypothesis.hypothesisId,
          message: `Referenced mechanism fact '${fid}' does not exist in canonical context`,
          fixable: true,
          suggestedRepair: "Remove or replace with valid mechanismFactId from inspectCommanderFacts",
        }),
      );
    }
  }

  for (const oid of hypothesis.semanticOpportunityIds) {
    if (!knownOpps.has(oid)) {
      issues.push(
        issue({
          category: "MECHANICAL_VALIDITY",
          severity: "ERROR",
          hypothesisId: hypothesis.hypothesisId,
          message: `Referenced opportunity '${oid}' does not exist in opportunity model`,
          fixable: true,
          suggestedRepair: "Use opportunityId from inspectSemanticOpportunities",
        }),
      );
    } else if (ctx.acceptedOpportunityIds && !ctx.acceptedOpportunityIds.has(oid)) {
      issues.push(
        issue({
          category: "MECHANICAL_VALIDITY",
          severity: "ERROR",
          hypothesisId: hypothesis.hypothesisId,
          message: `Opportunity '${oid}' is not in accepted grounding set — fact-level semantics prevail`,
          fixable: true,
          suggestedRepair: "Use independently ACCEPT/ACCEPT_LOW opportunities only",
        }),
      );
    }
  }

  for (const pkg of hypothesis.packages) {
    for (const slot of pkg.semanticRequirements) {
      for (const oid of slot.satisfiesOpportunityIds ?? []) {
        if (!knownOpps.has(oid)) {
          issues.push(
            issue({
              category: "MECHANICAL_VALIDITY",
              severity: "ERROR",
              hypothesisId: hypothesis.hypothesisId,
              packageId: pkg.packageId,
              message: `Package requirement slot '${slot.slotId}' references unknown opportunity '${oid}'`,
              fixable: true,
              suggestedRepair: "Link slot to valid opportunity or remove satisfiesOpportunityIds",
            }),
          );
        }
      }
    }
  }

  return issues;
}

function resolveEvidenceEntry(
  ctx: ValidatorContextV2,
  ev: PlanningEvidence,
  hypothesisId: string,
  packageId?: string,
): StructuredValidationIssue[] {
  const issues: StructuredValidationIssue[] = [];
  const knownFacts = factIds(ctx);
  const knownOpps = opportunityIds(ctx);
  const base = { hypothesisId, packageId, fixable: true as const };

  if (ev.kind === "CANONICAL_FACT") {
    for (const fid of ev.factIds) {
      if (!knownFacts.has(fid)) {
        issues.push(
          issue({
            ...base,
            category: "EVIDENCE_RESOLUTION",
            severity: "ERROR",
            message: `Evidence references unknown factId '${fid}'`,
            suggestedRepair: "Use mechanismId from frozen CommanderMechanismFacts",
          }),
        );
      }
    }
    return issues;
  }

  if (ev.kind === "SEMANTIC_OPPORTUNITY") {
    for (const oid of ev.opportunityIds) {
      if (!knownOpps.has(oid)) {
        issues.push(
          issue({
            ...base,
            category: "EVIDENCE_RESOLUTION",
            severity: "ERROR",
            message: `Evidence references unknown opportunityId '${oid}'`,
            suggestedRepair: "Use opportunityId from frozen SemanticOpportunity model",
          }),
        );
      }
    }
    return issues;
  }

  if (ev.kind === "RAG_EVIDENCE") {
    for (const eid of ev.evidenceIds) {
      if (!ctx.knownRagEvidenceIds.has(eid)) {
        issues.push(
          issue({
            ...base,
            category: "EVIDENCE_RESOLUTION",
            severity: "ERROR",
            message: `Evidence references unknown RAG chunkId '${eid}'`,
            suggestedRepair: "Cite chunkId from searchMtgKnowledge results or initial RAG evidence",
          }),
        );
      }
    }
    return issues;
  }

  if (ev.kind === "RULES_EVIDENCE") {
    if (ev.ruleId.trim().length === 0) {
      issues.push(
        issue({
          ...base,
          category: "EVIDENCE_RESOLUTION",
          severity: "ERROR",
          message: "RULES_EVIDENCE requires nonblank ruleId",
        }),
      );
    }
    return issues;
  }

  if (ev.kind === "MODEL_INFERENCE") {
    if (ev.rationale.trim().length < 10) {
      issues.push(
        issue({
          ...base,
          category: "EVIDENCE_RESOLUTION",
          severity: "ERROR",
          message: "MODEL_INFERENCE requires substantive rationale",
          suggestedRepair: "Explain cross-fact reasoning and cite supporting IDs",
        }),
      );
    }
    for (const fid of ev.supportingFactIds ?? []) {
      if (!knownFacts.has(fid)) {
        issues.push(
          issue({
            ...base,
            category: "EVIDENCE_RESOLUTION",
            severity: "ERROR",
            message: `MODEL_INFERENCE references unknown supportingFactId '${fid}'`,
          }),
        );
      }
    }
    for (const oid of ev.supportingOpportunityIds ?? []) {
      if (!knownOpps.has(oid)) {
        issues.push(
          issue({
            ...base,
            category: "EVIDENCE_RESOLUTION",
            severity: "ERROR",
            message: `MODEL_INFERENCE references unknown supportingOpportunityId '${oid}'`,
          }),
        );
      }
    }
  }

  return issues;
}

function checkEvidenceResolution(
  ctx: ValidatorContextV2,
  hypothesis: StrategyHypothesis,
): StructuredValidationIssue[] {
  const issues: StructuredValidationIssue[] = [];

  if (hypothesis.evidence.length === 0) {
    issues.push(
      issue({
        category: "EVIDENCE_SUFFICIENCY",
        severity: "ERROR",
        hypothesisId: hypothesis.hypothesisId,
        message: "Strategy hypothesis must include typed planning evidence",
        fixable: true,
        suggestedRepair: "Add CANONICAL_FACT, SEMANTIC_OPPORTUNITY, RAG_EVIDENCE, or labeled MODEL_INFERENCE",
      }),
    );
  }

  for (const ev of hypothesis.evidence) {
    issues.push(...resolveEvidenceEntry(ctx, ev, hypothesis.hypothesisId));
  }

  for (const pkg of hypothesis.packages) {
    if (pkg.evidence.length === 0) {
      issues.push(
        issue({
          category: "EVIDENCE_SUFFICIENCY",
          severity: "ERROR",
          hypothesisId: hypothesis.hypothesisId,
          packageId: pkg.packageId,
          message: "Package must include typed planning evidence",
          fixable: true,
        }),
      );
    }
    for (const ev of pkg.evidence) {
      issues.push(...resolveEvidenceEntry(ctx, ev, hypothesis.hypothesisId, pkg.packageId));
    }
  }

  return issues;
}

function collectCitedFactIds(hypothesis: StrategyHypothesis, pkg?: SemanticPackage): Set<string> {
  const cited = new Set<string>(hypothesis.commanderMechanismFactIds);
  const evidence = [...hypothesis.evidence, ...(pkg?.evidence ?? [])];
  for (const ev of evidence) {
    if (ev.kind === "CANONICAL_FACT") ev.factIds.forEach((id) => cited.add(id));
    if (ev.kind === "MODEL_INFERENCE") ev.supportingFactIds?.forEach((id) => cited.add(id));
  }
  return cited;
}

function hasActionableGrounding(
  ctx: ValidatorContextV2,
  hypothesis: StrategyHypothesis,
  pkg: SemanticPackage,
): boolean {
  const citedFacts = collectCitedFactIds(hypothesis, pkg);
  const hasNonNoActionableFact = [...citedFacts].some((id) => !ctx.noActionableFactIds.has(id));
  if (hasNonNoActionableFact) return true;

  const allEvidence = [...hypothesis.evidence, ...pkg.evidence];
  const hasOpportunityEvidence = allEvidence.some(
    (ev) => ev.kind === "SEMANTIC_OPPORTUNITY" && ev.opportunityIds.length > 0,
  );
  if (hasOpportunityEvidence) return true;

  const hasCrossFactInference = allEvidence.some(
    (ev) =>
      ev.kind === "MODEL_INFERENCE" &&
      ((ev.supportingOpportunityIds?.length ?? 0) > 0 ||
        (ev.supportingFactIds?.some((id) => !ctx.noActionableFactIds.has(id)) ?? false)),
  );
  return hasCrossFactInference;
}

function checkNoActionableBoundary(
  ctx: ValidatorContextV2,
  hypothesis: StrategyHypothesis,
): StructuredValidationIssue[] {
  const issues: StructuredValidationIssue[] = [];

  for (const pkg of hypothesis.packages) {
    const citedFacts = collectCitedFactIds(hypothesis, pkg);
    const citesNoActionable = [...citedFacts].some((id) => ctx.noActionableFactIds.has(id));
    if (!citesNoActionable) continue;

    if (!hasActionableGrounding(ctx, hypothesis, pkg)) {
      issues.push(
        issue({
          category: "NO_ACTIONABLE_BOUNDARY",
          severity: "ERROR",
          hypothesisId: hypothesis.hypothesisId,
          packageId: pkg.packageId,
          message:
            "Package is grounded only on NO_ACTIONABLE facts — keyword/mechanical facts alone cannot become positive planning packages",
          fixable: true,
          suggestedRepair:
            "Ground package in accepted SemanticOpportunity IDs or MODEL_INFERENCE with cross-fact support beyond NO_ACTIONABLE facts",
        }),
      );
    }
  }

  return issues;
}

function checkPackageDependencyReferences(
  hypothesis: StrategyHypothesis,
): StructuredValidationIssue[] {
  const issues: StructuredValidationIssue[] = [];
  const validIds = new Set(hypothesis.packages.map((p) => p.packageId));

  for (const pkg of hypothesis.packages) {
    for (const depId of pkg.dependsOnPackageIds) {
      if (!validIds.has(depId)) {
        issues.push(
          issue({
            category: "PACKAGE_DEPENDENCY_REFERENCE",
            severity: "ERROR",
            hypothesisId: hypothesis.hypothesisId,
            packageId: pkg.packageId,
            message: `dependsOnPackageIds references unknown package '${depId}'`,
            fixable: true,
            suggestedRepair: "Use packageId values from the same hypothesis",
          }),
        );
      }
    }
    for (const oid of pkg.overlapsWithPackageIds) {
      if (!validIds.has(oid)) {
        issues.push(
          issue({
            category: "PACKAGE_DEPENDENCY_REFERENCE",
            severity: "ERROR",
            hypothesisId: hypothesis.hypothesisId,
            packageId: pkg.packageId,
            message: `overlapsWithPackageIds references unknown package '${oid}'`,
            fixable: true,
          }),
        );
      }
    }
  }

  return issues;
}

function checkCausalCoherence(pkg: SemanticPackage, hypothesisId: string): StructuredValidationIssue[] {
  const issues: StructuredValidationIssue[] = [];
  const text = blob(pkg);

  const payoffCreatureDeath =
    /creature.*dies|when.*creature.*dies|creatures? you control die|death trigger.*creature/i.test(text);
  const mentionsArtifactSacrifice =
    /noncreature artifacts?|artifact fodder|sacrifice artifacts?|artifact sacrifice outlet/i.test(text);
  const mentionsCreatureSacrifice =
    /sacrifice creatures?|creature fodder|artifact creatures?|creature sacrifice/i.test(text);
  const fodderNoncreature = mentionsArtifactSacrifice && !mentionsCreatureSacrifice;
  const fodderCreature = mentionsCreatureSacrifice;

  if (payoffCreatureDeath && fodderNoncreature && !fodderCreature) {
    issues.push(
      issue({
        category: "CAUSAL_COHERENCE",
        severity: "ERROR",
        hypothesisId,
        packageId: pkg.packageId,
        message: "Payoff reacts to CREATURE_DIES but package primarily sacrifices noncreature artifacts",
        missing: ["artifact-sacrifice payoff", "artifact-creature fodder constraint"],
        suggestedRepair:
          "Either constrain fodder to artifact creatures or choose payoff that responds to artifact sacrifice",
        fixable: true,
      }),
    );
  }

  if (pkg.payoffs.length === 0 && pkg.producedResources.length === 0) {
    issues.push(
      issue({
        category: "CAUSAL_COHERENCE",
        severity: "ERROR",
        hypothesisId,
        packageId: pkg.packageId,
        message: "Package defines no payoffs or produced resources",
        fixable: true,
        suggestedRepair: "Add payoffs that follow from causalChain and semanticRequirements",
      }),
    );
  }

  if (pkg.causalChain.length < 2) {
    issues.push(
      issue({
        category: "CAUSAL_COHERENCE",
        severity: "ERROR",
        hypothesisId,
        packageId: pkg.packageId,
        message: "Causal chain must have at least two steps (enabler → effect)",
        fixable: true,
      }),
    );
  }

  return issues;
}

function checkColorIdentity(
  ctx: ValidatorContextV2,
  pkg: SemanticPackage,
  hypothesisId: string,
): StructuredValidationIssue[] {
  const issues: StructuredValidationIssue[] = [];
  const colors = new Set(ctx.colorIdentity.map((c) => c.toUpperCase()));
  const offColorPattern = /\b(W|U|B|R|G)\b/g;
  const text = blob(pkg);

  for (const match of text.matchAll(offColorPattern)) {
    const pip = match[1];
    if (pip && !colors.has(pip) && !text.includes("colorless")) {
      issues.push(
        issue({
          category: "COLOR_IDENTITY",
          severity: "WARNING",
          hypothesisId,
          packageId: pkg.packageId,
          message: `Package references color pip '${pip}' outside identity [${ctx.colorIdentity.join("")}]`,
          fixable: true,
          suggestedRepair: "Restrict requirements to color identity or colorless options",
        }),
      );
      break;
    }
  }

  return issues;
}

function checkCommanderLegality(ctx: ValidatorContextV2, hypothesisId: string): StructuredValidationIssue[] {
  if (ctx.commanders.length === 0) {
    return [
      issue({
        category: "COMMANDER_LEGALITY",
        severity: "ERROR",
        hypothesisId,
        message: "No commanders in command zone context",
        fixable: false,
      }),
    ];
  }
  return [];
}

function checkBracketCompatibility(ctx: ValidatorContextV2, hypothesisId: string): StructuredValidationIssue[] {
  if (ctx.bracket < 1 || ctx.bracket > 5) {
    return [
      issue({
        category: "BRACKET_COMPATIBILITY",
        severity: "ERROR",
        hypothesisId,
        message: `Invalid bracket ${ctx.bracket} — must be 1–5`,
        fixable: false,
      }),
    ];
  }
  return [];
}

function checkCommanderDependencyClaim(
  pkg: SemanticPackage,
  hypothesisId: string,
  ctx: ValidatorContextV2,
): StructuredValidationIssue[] {
  const issues: StructuredValidationIssue[] = [];
  const contrib = pkg.commanderContribution.toLowerCase();

  if (pkg.commanderDependency === "HIGH" && contrib.length < 10) {
    issues.push(
      issue({
        category: "COMMANDER_DEPENDENCY_CLAIM",
        severity: "ERROR",
        hypothesisId,
        packageId: pkg.packageId,
        message: "Package claims HIGH commander dependency but commanderContribution is empty or vague",
        fixable: true,
        suggestedRepair: "Describe which commander mechanism the package amplifies",
      }),
    );
  }

  if (pkg.commanderDependency === "HIGH") {
    const referencesFact = ctx.mechanismFacts.some(
      (f) =>
        contrib.includes(f.mechanismId) ||
        contrib.includes(f.evidenceSpan.slice(0, 20).toLowerCase()) ||
        /commander ability|commander trigger|commander output/i.test(contrib),
    );
    if (!referencesFact && contrib.length < 30) {
      issues.push(
        issue({
          category: "COMMANDER_DEPENDENCY_CLAIM",
          severity: "WARNING",
          hypothesisId,
          packageId: pkg.packageId,
          message: "HIGH dependency claim should reference a specific commander mechanism",
          fixable: true,
        }),
      );
    }
  }

  return issues;
}

function checkCommanderIndependenceClaim(pkg: SemanticPackage, hypothesisId: string): StructuredValidationIssue[] {
  const issues: StructuredValidationIssue[] = [];
  const indep = pkg.commanderIndependentFunction.toLowerCase();
  const mentionsCommander = /commander|command zone/i.test(indep);

  if (pkg.worksWithoutCommander === "HIGH" && mentionsCommander) {
    issues.push(
      issue({
        category: "COMMANDER_INDEPENDENCE_CLAIM",
        severity: "ERROR",
        hypothesisId,
        packageId: pkg.packageId,
        message: "Package claims HIGH works-without-commander but independent function references commander",
        fixable: true,
      }),
    );
  }

  return issues;
}

function checkPackageCompleteness(pkg: SemanticPackage, hypothesisId: string): StructuredValidationIssue[] {
  const issues: StructuredValidationIssue[] = [];
  const required = ["purpose", "commanderContribution", "commanderIndependentFunction"] as const;
  for (const field of required) {
    const val = pkg[field];
    if (val.trim().length < 5) {
      issues.push(
        issue({
          category: "PACKAGE_COMPLETENESS",
          severity: "ERROR",
          hypothesisId,
          packageId: pkg.packageId,
          message: `Package field '${field}' is missing or too short`,
          fixable: true,
        }),
      );
    }
  }
  return issues;
}

function deriveOutcome(issues: StructuredValidationIssue[]): ProposalValidationOutcome {
  const errors = issues.filter((i) => i.severity === "ERROR");
  if (errors.some((e) => e.category === "PRE_VALIDATION_GATE")) return "REJECTED_MECHANICALLY";
  if (errors.some((e) => e.category === "COMMANDER_LEGALITY")) return "REJECTED_LEGALITY";
  if (
    errors.some(
      (e) =>
        e.category === "MECHANICAL_VALIDITY" ||
        e.category === "CAUSAL_COHERENCE" ||
        e.category === "NO_ACTIONABLE_BOUNDARY" ||
        e.category === "EVIDENCE_RESOLUTION" ||
        e.category === "PACKAGE_DEPENDENCY_REFERENCE",
    )
  ) {
    return "REJECTED_MECHANICALLY";
  }
  if (errors.length > 0) return "PARTIALLY_SUPPORTED";
  const warnings = issues.filter((i) => i.severity === "WARNING");
  if (warnings.length > 0) return "VALID_WITH_CONSTRAINT";
  return "VALIDATED";
}

const ALL_CATEGORIES: ValidationCheckCategory[] = [
  "PRE_VALIDATION_GATE",
  "MECHANICAL_VALIDITY",
  "CAUSAL_COHERENCE",
  "COLOR_IDENTITY",
  "COMMANDER_LEGALITY",
  "BRACKET_COMPATIBILITY",
  "COMMANDER_DEPENDENCY_CLAIM",
  "COMMANDER_INDEPENDENCE_CLAIM",
  "PACKAGE_COMPLETENESS",
  "BRIDGE_VALIDITY",
  "EVIDENCE_SUFFICIENCY",
  "EVIDENCE_RESOLUTION",
  "NO_ACTIONABLE_BOUNDARY",
  "PACKAGE_DEPENDENCY_REFERENCE",
];

export function validateStrategyHypothesisV2(
  ctx: ValidatorContextV2,
  hypothesis: StrategyHypothesis,
): StrategyPackageValidationResult {
  resetIssueCounter();
  const issues: StructuredValidationIssue[] = [];

  issues.push(...checkPreValidationGates(hypothesis));
  if (issues.some((i) => i.severity === "ERROR" && i.category === "PRE_VALIDATION_GATE")) {
    const failed = new Set(issues.map((i) => i.category));
    return {
      hypothesisId: hypothesis.hypothesisId,
      outcome: deriveOutcome(issues),
      issues,
      passedChecks: ALL_CATEGORIES.filter((c) => !failed.has(c)),
      failedChecks: [...failed],
    };
  }

  issues.push(...checkMechanicalValidity(ctx, hypothesis));
  issues.push(...checkEvidenceResolution(ctx, hypothesis));
  issues.push(...checkNoActionableBoundary(ctx, hypothesis));
  issues.push(...checkPackageDependencyReferences(hypothesis));
  issues.push(...checkCommanderLegality(ctx, hypothesis.hypothesisId));
  issues.push(...checkBracketCompatibility(ctx, hypothesis.hypothesisId));

  for (const pkg of hypothesis.packages) {
    issues.push(...checkCausalCoherence(pkg, hypothesis.hypothesisId));
    issues.push(...checkColorIdentity(ctx, pkg, hypothesis.hypothesisId));
    issues.push(...checkCommanderDependencyClaim(pkg, hypothesis.hypothesisId, ctx));
    issues.push(...checkCommanderIndependenceClaim(pkg, hypothesis.hypothesisId));
    issues.push(...checkPackageCompleteness(pkg, hypothesis.hypothesisId));
  }

  const failed = new Set(issues.map((i) => i.category));
  return {
    hypothesisId: hypothesis.hypothesisId,
    outcome: deriveOutcome(issues),
    issues,
    passedChecks: ALL_CATEGORIES.filter((c) => !failed.has(c)),
    failedChecks: [...failed],
  };
}

export function buildValidatorContextV2FromPlanning(input: {
  caseId: string;
  colorIdentity: string[];
  bracket: number;
  commandZoneConfiguration: string;
  commanders: string[];
  mechanismFacts: IndependentMechanismFact[];
  semanticOpportunities: SemanticOpportunity[];
  noActionableFactIds: string[];
  knownRagEvidenceIds: string[];
}): ValidatorContextV2 {
  return {
    ...input,
    noActionableFactIds: new Set(input.noActionableFactIds),
    knownRagEvidenceIds: new Set(input.knownRagEvidenceIds),
  };
}
