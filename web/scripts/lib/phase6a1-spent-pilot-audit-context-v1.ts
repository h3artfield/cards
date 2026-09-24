/**
 * Deterministic spent-pilot audit context — no RAG, no OpenAI.
 */
import type { ProfessorPlanningContext } from "../../src/lib/deck-synthesis/professor-planning-contracts-v2";
import { formatBracketDevelopmentConstraint } from "./phase6a1-bracket-constraint-v1";
import {
  getPilotMechanismCatalogEntry,
  getPilotOpportunityCase,
} from "./phase6a1-spent-pilot-truth-loader-v1";
import { PILOT_COMMANDER_SLOTS } from "./phase6a1-serialization-pilot-v8-config-v1";

export function buildSpentPilotAuditPlanningContext(mechanismTruthCaseId: string): ProfessorPlanningContext | null {
  const entry = getPilotMechanismCatalogEntry(mechanismTruthCaseId);
  const oppCase = getPilotOpportunityCase(mechanismTruthCaseId);
  if (!entry || !oppCase) return null;

  const slot = PILOT_COMMANDER_SLOTS.find((s) => s.mechanismTruthCaseId === mechanismTruthCaseId);

  return {
    caseId: slot?.pilotCaseId ?? entry.caseId,
    commandZone: {
      configuration: entry.commandZoneConfiguration,
      commanders: entry.commanders,
      combinedColorIdentity: entry.combinedColorIdentity,
      bracket: entry.bracket,
    },
    canonicalOracle: [],
    commanderMechanismFacts: entry.independentMechanismFacts,
    semanticOpportunities: oppCase.opportunities,
    noActionableFactIds: oppCase.noActionableOpportunities.map((r) => r.factId),
    colorIdentity: entry.combinedColorIdentity,
    bracket: entry.bracket,
    userConstraints: [
      "SEMANTIC_ONLY audit context — no model invocation",
      formatBracketDevelopmentConstraint(entry.bracket),
    ],
    initialRagEvidence: [],
    initialResearchEvidence: [],
  };
}

export function buildMinimalSyntheticProfessorHypothesis(args: {
  caseId: string;
  factId: string;
  opportunityId: string;
}): Record<string, unknown> {
  return {
    hypotheses: [
      {
        hypothesisId: `${args.caseId}-satisfiability-minimal`,
        title: "Minimal satisfiability probe",
        thesis: "Frozen opportunity universe supports at least one normalizable positive hypothesis.",
        commanderMechanismFactIds: [args.factId],
        semanticOpportunityIds: [args.opportunityId],
        packages: [
          {
            packageId: `${args.caseId}-satisfiability-pkg-1`,
            title: "Minimal package",
            purpose: "Prove normalizer satisfiability for frozen opportunity IDs.",
            causalChain: ["Frozen fact", "Frozen opportunity", "Minimal package"],
            semanticRequirements: [
              {
                slotId: "slot-1",
                requirement: "Respect frozen mechanism and opportunity scope.",
                satisfiesOpportunityIds: [args.opportunityId],
              },
            ],
            requiredResources: [],
            producedResources: [],
            payoffs: ["Satisfiability probe only"],
            commanderContribution: "Uses frozen commander mechanism fact scope only.",
            commanderIndependentFunction: "None — probe only.",
            commanderDependency: "HIGH",
            worksWithoutCommander: "LOW",
            dependsOnPackageIds: [],
            overlapsWithPackageIds: [],
            vulnerabilities: [],
            evidence: [
              {
                kind: "CANONICAL_FACT",
                factIds: [args.factId],
                statement: "Cites frozen mechanism fact.",
              },
              {
                kind: "SEMANTIC_OPPORTUNITY",
                opportunityIds: [args.opportunityId],
                statement: "Cites frozen semantic opportunity.",
              },
            ],
          },
        ],
        strengths: [],
        vulnerabilities: [],
        evidence: [
          {
            kind: "CANONICAL_FACT",
            factIds: [args.factId],
            statement: "Hypothesis cites frozen mechanism fact.",
          },
          {
            kind: "SEMANTIC_OPPORTUNITY",
            opportunityIds: [args.opportunityId],
            statement: "Hypothesis cites frozen semantic opportunity.",
          },
        ],
      },
    ],
  };
}
