/**
 * Deterministic strategy/package validator v1.
 * Professor may propose; validator certifies. No deck quality scoring.
 */
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

export const STRATEGY_PACKAGE_VALIDATOR_V1_VERSION = "strategy-package-validator-v1";

export type ValidatorContext = {
  caseId: string;
  colorIdentity: string[];
  bracket: number;
  commandZoneConfiguration: string;
  commanders: string[];
  mechanismFacts: IndependentMechanismFact[];
  semanticOpportunities: SemanticOpportunity[];
  /** When set, only these opportunity IDs are valid mechanical premises */
  acceptedOpportunityIds?: Set<string>;
};

let issueCounter = 0;

function nextIssueId(): string {
  issueCounter += 1;
  return `val-${issueCounter}`;
}

function resetIssueCounter(): void {
  issueCounter = 0;
}

function issue(
  partial: Omit<StructuredValidationIssue, "issueId">,
): StructuredValidationIssue {
  return { issueId: nextIssueId(), ...partial };
}

function factIds(ctx: ValidatorContext): Set<string> {
  return new Set(ctx.mechanismFacts.map((f) => f.mechanismId));
}

function opportunityIds(ctx: ValidatorContext): Set<string> {
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

function checkMechanicalValidity(
  ctx: ValidatorContext,
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
        message:
          "Payoff reacts to CREATURE_DIES but package primarily sacrifices noncreature artifacts",
        missing: ["artifact-sacrifice payoff", "artifact-creature fodder constraint"],
        suggestedRepair:
          "Either constrain fodder to artifact creatures or choose payoff that responds to artifact sacrifice",
        fixable: true,
      }),
    );
  }

  if (pkg.semanticRequirements.length === 0) {
    issues.push(
      issue({
        category: "CAUSAL_COHERENCE",
        severity: "ERROR",
        hypothesisId,
        packageId: pkg.packageId,
        message: "Package has no semantic requirement slots",
        fixable: true,
        suggestedRepair: "Add semanticRequirements with enabler functions (e.g. UNTAP_CREATURE, SACRIFICE_OUTLET)",
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

  const hasEnabler = pkg.semanticRequirements.some((s) => s.requirement.trim().length > 0);
  const hasPayoff = pkg.payoffs.length > 0;
  if (hasEnabler && hasPayoff) {
    const enablerBlob = pkg.semanticRequirements.map((s) => s.requirement).join(" ").toLowerCase();
    const payoffBlob = pkg.payoffs.join(" ").toLowerCase();
    const enablerTokens = tokenizeMechanical(enablerBlob);
    const payoffTokens = tokenizeMechanical(payoffBlob);
    if (enablerTokens.length > 0 && payoffTokens.length > 0 && !hasMechanicalOverlap(enablerTokens, payoffBlob)) {
      issues.push(
        issue({
          category: "CAUSAL_COHERENCE",
          severity: "WARNING",
          hypothesisId,
          packageId: pkg.packageId,
          message: "Semantic enablers may not feed declared payoffs — no shared mechanical domain detected",
          fixable: true,
          suggestedRepair: "Align payoff event types with enabler outputs in causalChain",
        }),
      );
    }
  }

  return issues;
}

function tokenizeMechanical(text: string): string[] {
  const domains = [
    "token",
    "creature",
    "artifact",
    "graveyard",
    "exile",
    "mill",
    "draw",
    "mana",
    "sacrifice",
    "untap",
    "tap",
    "counter",
    "damage",
    "life",
  ];
  return domains.filter((d) => text.includes(d));
}

function hasMechanicalOverlap(enablerTokens: string[], payoffBlob: string): boolean {
  return enablerTokens.some((t) => payoffBlob.includes(t));
}

function checkColorIdentity(ctx: ValidatorContext, pkg: SemanticPackage, hypothesisId: string): StructuredValidationIssue[] {
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

function checkCommanderLegality(ctx: ValidatorContext, hypothesisId: string): StructuredValidationIssue[] {
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

function checkBracketCompatibility(ctx: ValidatorContext, hypothesisId: string): StructuredValidationIssue[] {
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
  ctx: ValidatorContext,
): StructuredValidationIssue[] {
  const issues: StructuredValidationIssue[] = [];
  const contrib = pkg.commanderContribution.toLowerCase();
  const claimsCommanderUse =
    pkg.commanderDependency === "HIGH" ||
    /commander|command zone|tap.*commander|when.*commander/i.test(contrib);

  if (pkg.commanderDependency === "HIGH" && contrib.length < 10 && !claimsCommanderUse) {
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
          suggestedRepair: "Link commanderContribution to mechanismFactId or oracle span",
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
        suggestedRepair: "Describe function that operates with commander removed or in command zone tapped",
      }),
    );
  }

  if (pkg.worksWithoutCommander === "LOW" && indep.length > 20 && !mentionsCommander) {
    issues.push(
      issue({
        category: "COMMANDER_INDEPENDENCE_CLAIM",
        severity: "WARNING",
        hypothesisId,
        packageId: pkg.packageId,
        message: "LOW works-without-commander but independent function does not mention commander role",
        fixable: true,
      }),
    );
  }

  return issues;
}

function checkPackageCompleteness(pkg: SemanticPackage, hypothesisId: string): StructuredValidationIssue[] {
  const issues: StructuredValidationIssue[] = [];
  const required = ["purpose", "commanderContribution", "commanderIndependentFunction"];
  for (const field of required) {
    const val = pkg[field as keyof SemanticPackage];
    if (typeof val === "string" && val.trim().length < 5) {
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

  if (pkg.causalChain.length < 2) {
    issues.push(
      issue({
        category: "PACKAGE_COMPLETENESS",
        severity: "WARNING",
        hypothesisId,
        packageId: pkg.packageId,
        message: "Causal chain should have at least two steps (enabler → effect)",
        fixable: true,
      }),
    );
  }

  return issues;
}

function checkBridgeValidity(
  pkg: SemanticPackage,
  hypothesisId: string,
  allPackages: SemanticPackage[],
): StructuredValidationIssue[] {
  if (pkg.overlapsWithPackageIds.length === 0) return [];

  const validIds = new Set(allPackages.map((p) => p.packageId));
  for (const oid of pkg.overlapsWithPackageIds) {
    if (!validIds.has(oid)) {
      return [
        issue({
          category: "BRIDGE_VALIDITY",
          severity: "ERROR",
          hypothesisId,
          packageId: pkg.packageId,
          message: `Bridge reference to unknown package '${oid}'`,
          fixable: true,
        }),
      ];
    }
  }

  if (pkg.overlapsWithPackageIds.length >= 2 && pkg.causalChain.length < 2) {
    return [
      issue({
        category: "BRIDGE_VALIDITY",
        severity: "WARNING",
        hypothesisId,
        packageId: pkg.packageId,
        message: "Multi-bridge package should document how it serves two causal systems in causalChain",
        fixable: true,
      }),
    ];
  }

  return [];
}

function checkEvidenceSufficiency(
  hypothesis: StrategyHypothesis,
  pkg?: SemanticPackage,
): StructuredValidationIssue[] {
  const issues: StructuredValidationIssue[] = [];

  if (hypothesis.evidence.length === 0 && !pkg) {
    issues.push(
      issue({
        category: "EVIDENCE_SUFFICIENCY",
        severity: "WARNING",
        hypothesisId: hypothesis.hypothesisId,
        message: "Strategy hypothesis has no provenance-tagged evidence",
        fixable: true,
        suggestedRepair: "Add evidence with tier CANONICAL_FACT or CURATED_KNOWLEDGE",
      }),
    );
  }

  if (pkg && pkg.evidence.length === 0) {
    issues.push(
      issue({
        category: "EVIDENCE_SUFFICIENCY",
        severity: "WARNING",
        hypothesisId: hypothesis.hypothesisId,
        packageId: pkg.packageId,
        message: "Package has no provenance-tagged evidence",
        fixable: true,
      }),
    );
  }

  return issues;
}

function deriveOutcome(issues: StructuredValidationIssue[]): ProposalValidationOutcome {
  const errors = issues.filter((i) => i.severity === "ERROR");
  if (errors.some((e) => e.category === "COMMANDER_LEGALITY")) return "REJECTED_LEGALITY";
  if (errors.some((e) => e.category === "MECHANICAL_VALIDITY" || e.category === "CAUSAL_COHERENCE")) {
    return "REJECTED_MECHANICALLY";
  }
  if (errors.length > 0) return "PARTIALLY_SUPPORTED";
  const warnings = issues.filter((i) => i.severity === "WARNING");
  if (warnings.some((w) => w.category === "EVIDENCE_SUFFICIENCY")) return "NEEDS_MORE_EVIDENCE";
  if (warnings.length > 0) return "VALID_WITH_CONSTRAINT";
  return "VALIDATED";
}

const ALL_CATEGORIES: ValidationCheckCategory[] = [
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
];

export function validateStrategyHypothesis(
  ctx: ValidatorContext,
  hypothesis: StrategyHypothesis,
): StrategyPackageValidationResult {
  resetIssueCounter();
  const issues: StructuredValidationIssue[] = [];

  issues.push(...checkMechanicalValidity(ctx, hypothesis));
  issues.push(...checkCommanderLegality(ctx, hypothesis.hypothesisId));
  issues.push(...checkBracketCompatibility(ctx, hypothesis.hypothesisId));
  issues.push(...checkEvidenceSufficiency(hypothesis));

  for (const pkg of hypothesis.packages) {
    issues.push(...checkCausalCoherence(pkg, hypothesis.hypothesisId));
    issues.push(...checkColorIdentity(ctx, pkg, hypothesis.hypothesisId));
    issues.push(...checkCommanderDependencyClaim(pkg, hypothesis.hypothesisId, ctx));
    issues.push(...checkCommanderIndependenceClaim(pkg, hypothesis.hypothesisId));
    issues.push(...checkPackageCompleteness(pkg, hypothesis.hypothesisId));
    issues.push(...checkBridgeValidity(pkg, hypothesis.hypothesisId, hypothesis.packages));
    issues.push(...checkEvidenceSufficiency(hypothesis, pkg));
  }

  const failed = new Set(issues.map((i) => i.category));
  const passedChecks = ALL_CATEGORIES.filter((c) => !failed.has(c));
  const failedChecks = [...failed];

  return {
    hypothesisId: hypothesis.hypothesisId,
    outcome: deriveOutcome(issues),
    issues,
    passedChecks,
    failedChecks,
  };
}

export function validateSemanticPackage(
  ctx: ValidatorContext,
  hypothesisId: string,
  pkg: SemanticPackage,
  allPackages: SemanticPackage[] = [pkg],
): StrategyPackageValidationResult {
  const wrapper: StrategyHypothesis = {
    hypothesisId,
    title: "single-package-validation",
    thesis: "",
    commanderMechanismFactIds: [],
    semanticOpportunityIds: [],
    packages: [pkg],
    strengths: [],
    vulnerabilities: [],
    evidence: [],
  };
  wrapper.packages = allPackages.filter((p) => p.packageId === pkg.packageId || allPackages.length > 1);
  return validateStrategyHypothesis(ctx, { ...wrapper, packages: allPackages.length > 1 ? allPackages : [pkg] });
}

export function buildValidatorContextFromPlanning(input: {
  caseId: string;
  colorIdentity: string[];
  bracket: number;
  commandZoneConfiguration: string;
  commanders: string[];
  mechanismFacts: IndependentMechanismFact[];
  semanticOpportunities: SemanticOpportunity[];
}): ValidatorContext {
  return { ...input };
}
