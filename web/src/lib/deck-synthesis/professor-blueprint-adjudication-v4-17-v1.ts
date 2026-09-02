/**
 * Professor v4.17 — blueprint adjudication (4-layer validation).
 */
import type {
  BrewBlueprintV417,
  PackageBlueprintV417,
  SemanticConceptStatusV417,
} from "./professor-brew-blueprint-v4-17-v1";
import type { SolBlueprintProposalV417 } from "./professor-sol-blueprint-proposal-v4-17-v1";
import {
  classifySemanticCoverage,
  normalizeSemanticConceptV417,
  normalizeSolConceptsV417,
  trueSemanticGapLabels,
  unsupportedConceptLabels,
} from "./professor-semantic-concept-normalizer-v4-17-v1";
import {
  assessBlueprintSlotFeasibilityV417,
  auditBlueprintConsistencyV417,
} from "./professor-blueprint-feasibility-v4-17-v1";
import { assessFunctionalBudgetSanityV417 } from "./professor-functional-budget-audit-v4-17-v1";
import { assessBracketBlueprintArchitectureV417 } from "./professor-bracket-blueprint-audit-v4-17-v1";
import { isWinResearchableV417 } from "./professor-win-architecture-v4-17-v1";

export const PROFESSOR_BLUEPRINT_ADJUDICATION_V4_17_V1_VERSION = "professor-blueprint-adjudication-v4-17-v1";

export type AdjudicationSupportV417 = SemanticConceptStatusV417;

export type PackageAdjudicationV417 = {
  packageId: string;
  name: string;
  materializedRequirementCount: number;
  hasRequirementGroups: boolean;
  executable: boolean;
  issues: string[];
};

export type WinHypothesisAdjudicationV417 = {
  planId: string;
  plan: string;
  researchable: boolean;
  vague: boolean;
  mechanicallyVerified: boolean;
  winType: string;
  issues: string[];
};

export type BlueprintQualityScoreV417 = "PASS" | "PARTIAL" | "FAIL";

export type BlueprintQualityScorecardV417 = {
  commanderExploit: BlueprintQualityScoreV417;
  strategyCoherence: BlueprintQualityScoreV417;
  independentEngine: BlueprintQualityScoreV417;
  packageExecutability: BlueprintQualityScoreV417;
  mechanicalSemanticCoverage: BlueprintQualityScoreV417;
  strategicConceptSupport: BlueprintQualityScoreV417;
  trueSemanticGaps: BlueprintQualityScoreV417;
  semanticSupport: BlueprintQualityScoreV417;
  winResearchability: BlueprintQualityScoreV417;
  bracketFeasibility: BlueprintQualityScoreV417;
  slotFeasibility: BlueprintQualityScoreV417;
  requirementMaterialization: BlueprintQualityScoreV417;
  researchExecutability: BlueprintQualityScoreV417;
  retrievalPrecision: BlueprintQualityScoreV417;
  researchConfirmationTruth: BlueprintQualityScoreV417;
};

export type BlueprintAdjudicationV417 = {
  version: typeof PROFESSOR_BLUEPRINT_ADJUDICATION_V4_17_V1_VERSION;
  schemaValid: boolean;
  layerA_schema: boolean;
  layerB_semanticNormalization: boolean;
  layerC_mechanicalSupport: boolean;
  layerD_physicalFeasibility: boolean;
  commanderExploitSupport: AdjudicationSupportV417;
  primaryStrategySupport: AdjudicationSupportV417;
  commanderExploitShallow: boolean;
  independentEngineOverlap: number;
  commanderRequiredForPrimary: boolean;
  commanderRequiredForIndependentEngine: boolean;
  packageResults: PackageAdjudicationV417[];
  winHypothesisResults: WinHypothesisAdjudicationV417[];
  requirementMaterializationValid: boolean;
  requirementCoverage: {
    solPackages: number;
    materializedRequirements: number;
    unmatchedPackages: string[];
    orphanRequirements: string[];
    conceptsTotal: number;
    conceptsVerified: number;
    conceptsSupported: number;
    conceptsNeedsResearch: number;
    conceptsUnsupported: number;
  };
  physicalSlotFeasible: boolean;
  bracketFeasible: boolean;
  bracketMismatch: boolean;
  functionalBudgetSanity: boolean;
  unsupportedConcepts: string[];
  contradictions: string[];
  semanticCoverageGaps: string[];
  semanticClassification: ReturnType<typeof classifySemanticCoverage>;
  physicalFeasibilityTrace: BrewBlueprintV417["slotFeasibility"]["feasibilityTrace"];
  physicalLowerBound: BrewBlueprintV417["slotFeasibility"]["physicalLowerBound"];
  decision: "ACCEPT" | "ACCEPT_WITH_RESEARCH" | "REVISE" | "REJECT";
  scorecard: BlueprintQualityScorecardV417;
};

function tokenOverlap(a: string, b: string): number {
  const ta = new Set(a.toLowerCase().split(/\W+/).filter((w) => w.length > 3));
  const tb = new Set(b.toLowerCase().split(/\W+/).filter((w) => w.length > 3));
  if (!ta.size || !tb.size) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared / Math.max(ta.size, tb.size);
}

function exploitSupportLevel(
  commander: BrewBlueprintV417["commander"],
  exploit: string,
): AdjudicationSupportV417 {
  const normalized = normalizeSemanticConceptV417(exploit);
  if (normalized.status === "UNSUPPORTED") return "UNSUPPORTED";
  const exploitLower = exploit.toLowerCase();
  const commanderHints = [
    ...commander.semanticFunctions,
    ...commander.mechanics,
    ...commander.exploitOpportunities,
    commander.oracleText,
  ]
    .join(" ")
    .toLowerCase();
  const matched = commander.semanticFunctions.some((fn) => exploitLower.includes(fn.toLowerCase().replace(/_/g, " ")))
    || normalized.mappedFunctions.some((fn) => commanderHints.includes(fn.toLowerCase()));
  if (matched && normalized.status === "VERIFIED") return "VERIFIED";
  if (matched) return "SUPPORTED";
  if (normalized.status === "NEEDS_RESEARCH") return "NEEDS_RESEARCH";
  return "NEEDS_RESEARCH";
}

function isWinResearchable(plan: string) {
  return isWinResearchableV417(plan);
}

function adjudicatePackage(pkg: PackageBlueprintV417, blueprint: BrewBlueprintV417): PackageAdjudicationV417 {
  const related = blueprint.openRequirements.filter((r) => r.packageIds.includes(pkg.packageId));
  const hasGroups = (pkg.requirementGroups?.length ?? 0) > 0;
  const issues: string[] = [];
  if (related.length === 0) issues.push("NO_MATERIALIZED_REQUIREMENTS");
  if (pkg.core && !hasGroups) issues.push("CORE_PACKAGE_MISSING_GROUPS");
  if (pkg.core && hasGroups) {
    const groupIds = new Set(pkg.requirementGroups.flatMap((g) => g.relatedRequirementIds));
    const covered = related.filter((r) => groupIds.has(r.requirementId) || r.packageGroupId);
    if (covered.length < Math.min(2, pkg.requirementGroups.length)) {
      issues.push("PACKAGE_GROUPS_NOT_EXECUTABLE");
    }
  }
  return {
    packageId: pkg.packageId,
    name: pkg.name,
    materializedRequirementCount: related.length,
    hasRequirementGroups: hasGroups,
    executable: related.length >= 1 && issues.length === 0,
    issues,
  };
}

export function adjudicateBlueprintV417(args: {
  proposal: SolBlueprintProposalV417;
  blueprint: BrewBlueprintV417;
  schemaValid?: boolean;
  researchExecutability?: BlueprintQualityScoreV417;
  retrievalPrecision?: BlueprintQualityScoreV417;
  researchConfirmationTruth?: BlueprintQualityScoreV417;
}): BlueprintAdjudicationV417 {
  const schemaValid = args.schemaValid ?? true;
  const normalized = args.blueprint.normalizedConcepts.length
    ? args.blueprint.normalizedConcepts
    : normalizeSolConceptsV417(args.proposal.strategicConcepts);
  const unsupported = unsupportedConceptLabels(normalized);
  const trueGaps = trueSemanticGapLabels(normalized);
  const semanticClassification = classifySemanticCoverage(normalized);
  const feasibility = assessBlueprintSlotFeasibilityV417(args.blueprint);
  const consistency = auditBlueprintConsistencyV417({ blueprint: args.blueprint, proposal: args.proposal });
  const budgetAudit = assessFunctionalBudgetSanityV417(args.blueprint);
  const bracketAudit = assessBracketBlueprintArchitectureV417(args.blueprint, args.proposal);

  const exploitSupport = exploitSupportLevel(args.blueprint.commander, args.proposal.commanderExploit);
  const primarySupport = normalizeSemanticConceptV417(args.proposal.primaryStrategy).status;
  const commanderHints = args.blueprint.commander.semanticFunctions.join(" ").toLowerCase();
  const exploitLower = args.proposal.commanderExploit.toLowerCase();
  const commanderExploitShallow =
    exploitSupport === "UNSUPPORTED" ||
    (exploitSupport === "NEEDS_RESEARCH" && !args.blueprint.commander.semanticFunctions.some((f) => exploitLower.includes(f.toLowerCase().replace(/_/g, " "))));

  const overlap = tokenOverlap(args.proposal.commanderExploit, args.proposal.independentEngine);
  const commanderRequiredForPrimary = /commander|when .* enters|attack trigger|transform/.test(
    args.proposal.primaryStrategy.toLowerCase(),
  );
  const commanderRequiredForIndependentEngine = /commander|ultimecia|kess|sigarda|korvold|chatterfang/.test(
    args.proposal.independentEngine.toLowerCase(),
  );

  const packageResults = args.blueprint.packages.map((p) => adjudicatePackage(p, args.blueprint));
  const winHypothesisResults = args.proposal.winArchitecture.map((w) => {
    const win = isWinResearchable(w.plan);
    return {
      planId: w.planId,
      plan: w.plan,
      researchable: win.researchable,
      vague: win.vague,
      mechanicallyVerified: w.mechanicallyVerified,
      winType: win.type,
      issues: win.issues,
    };
  });

  const packageIds = new Set(args.proposal.packages.map((p) => p.packageId));
  const unmatchedPackages = args.proposal.packages
    .filter((p) => !args.blueprint.openRequirements.some((r) => r.packageIds.includes(p.packageId)))
    .map((p) => p.packageId);
  const orphanRequirements = args.blueprint.openRequirements
    .filter((r) => r.packageIds.length === 0 && r.priority < 80)
    .map((r) => r.requirementId);

  const conceptsTotal = normalized.length;
  const conceptsVerified = normalized.filter((c) => c.status === "VERIFIED").length;
  const conceptsSupported = normalized.filter((c) => c.status === "SUPPORTED").length;
  const conceptsNeedsResearch = normalized.filter((c) => c.status === "NEEDS_RESEARCH").length;
  const conceptsUnsupported = normalized.filter((c) => c.status === "UNSUPPORTED").length;

  const requirementMaterializationValid =
    args.blueprint.openRequirements.length >= args.proposal.packages.length &&
    packageResults.every((p) => p.executable || !args.proposal.packages.find((x) => x.packageId === p.packageId)?.core);

  const contradictions: string[] = [...consistency.violations];
  if (commanderExploitShallow) contradictions.push("COMMANDER_EXPLOIT_SHALLOW");
  if (overlap > 0.65) contradictions.push("INDEPENDENT_ENGINE_OVERLAP");
  if (bracketAudit.bracketMismatch) contradictions.push("BLUEPRINT_BRACKET_MISMATCH");
  if (!budgetAudit.sane) contradictions.push(...budgetAudit.violations);
  if (!feasibility.feasible) contradictions.push(...feasibility.violations);

  let decision: BlueprintAdjudicationV417["decision"] = "ACCEPT";
  if (!schemaValid) decision = "REJECT";
  else if (!feasibility.feasible) decision = "REJECT";
  else if (commanderExploitShallow || trueGaps.length > 2) decision = "REVISE";
  else if (unsupported.length > 0 || conceptsNeedsResearch > 0 || contradictions.length > 0) decision = "ACCEPT_WITH_RESEARCH";

  const score = (pass: boolean, partial?: boolean): BlueprintQualityScoreV417 =>
    pass ? "PASS" : partial ? "PARTIAL" : "FAIL";

  const scorecard: BlueprintQualityScorecardV417 = {
    commanderExploit: score(!commanderExploitShallow, exploitSupport !== "UNSUPPORTED"),
    strategyCoherence: score(primarySupport !== "UNSUPPORTED"),
    independentEngine: score(overlap < 0.65 && !commanderRequiredForIndependentEngine, overlap < 0.8),
    packageExecutability: score(packageResults.every((p) => p.executable)),
    mechanicalSemanticCoverage: semanticClassification.mechanicalSemanticCoverage,
    strategicConceptSupport: semanticClassification.strategicConceptSupport,
    trueSemanticGaps: score(trueGaps.length === 0, trueGaps.length <= 1),
    semanticSupport: score(
      semanticClassification.mechanicalSemanticCoverage !== "FAIL" &&
        semanticClassification.strategicConceptSupport !== "FAIL",
      trueGaps.length === 0,
    ),
    winResearchability: score(winHypothesisResults.some((w) => w.researchable)),
    bracketFeasibility: score(!bracketAudit.bracketMismatch, bracketAudit.requestedBracket <= 3),
    slotFeasibility: score(feasibility.feasible),
    requirementMaterialization: score(requirementMaterializationValid),
    researchExecutability: args.researchExecutability ?? "PARTIAL",
    retrievalPrecision: args.retrievalPrecision ?? "PARTIAL",
    researchConfirmationTruth: args.researchConfirmationTruth ?? "PARTIAL",
  };

  return {
    version: PROFESSOR_BLUEPRINT_ADJUDICATION_V4_17_V1_VERSION,
    schemaValid,
    layerA_schema: schemaValid,
    layerB_semanticNormalization: conceptsUnsupported < conceptsTotal,
    layerC_mechanicalSupport: !commanderExploitShallow && exploitSupport !== "UNSUPPORTED",
    layerD_physicalFeasibility: feasibility.feasible && budgetAudit.sane,
    commanderExploitSupport: exploitSupport,
    primaryStrategySupport: primarySupport,
    commanderExploitShallow,
    independentEngineOverlap: overlap,
    commanderRequiredForPrimary,
    commanderRequiredForIndependentEngine,
    packageResults,
    winHypothesisResults,
    requirementMaterializationValid,
    requirementCoverage: {
      solPackages: args.proposal.packages.length,
      materializedRequirements: args.blueprint.openRequirements.length,
      unmatchedPackages,
      orphanRequirements,
      conceptsTotal,
      conceptsVerified,
      conceptsSupported,
      conceptsNeedsResearch,
      conceptsUnsupported,
    },
    physicalSlotFeasible: feasibility.feasible,
    bracketFeasible: !bracketAudit.bracketMismatch,
    bracketMismatch: bracketAudit.bracketMismatch,
    functionalBudgetSanity: budgetAudit.sane,
    unsupportedConcepts: unsupported,
    contradictions,
    semanticCoverageGaps: trueGaps.map((c) => `TRUE_SEMANTIC_GAP:${c}`),
    semanticClassification,
    physicalFeasibilityTrace: feasibility.feasibilityTrace,
    physicalLowerBound: feasibility.physicalLowerBound,
    decision,
    scorecard,
  };
}
