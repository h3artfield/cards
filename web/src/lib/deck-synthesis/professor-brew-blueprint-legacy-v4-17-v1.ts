/**
 * Professor v4.17 — legacy projection: Blueprint → WorkingDeckTheory (one-way).
 */
import type { BrewBlueprintV417, PackageBlueprintStatusV417 } from "./professor-brew-blueprint-v4-17-v1";
import type { WorkingDeckPackageV4, WorkingDeckTheoryV4 } from "./professor-working-deck-theory-v4";
import { PROFESSOR_WORKING_DECK_THEORY_V4_VERSION } from "./professor-working-deck-theory-v4";
import { createEmptyIdeaBoardV4 } from "./professor-idea-board-v4";

export const PROFESSOR_BREW_BLUEPRINT_LEGACY_V4_17_V1_VERSION = "professor-brew-blueprint-legacy-v4-17-v1";

function mapPackageStatus(status: PackageBlueprintStatusV417): WorkingDeckPackageV4["status"] {
  switch (status) {
    case "SATISFIED":
      return "CORE";
    case "PARTIAL":
      return "EXPLORING";
    case "REVISE":
    case "ABANDONED":
      return "REJECTED";
    default:
      return "EXPLORING";
  }
}

export function deriveWorkingDeckTheoryFromBlueprintV417(blueprint: BrewBlueprintV417): WorkingDeckTheoryV4 {
  const packages: WorkingDeckPackageV4[] = blueprint.packages.map((pkg) => ({
    packageId: pkg.packageId,
    name: pkg.name,
    purpose: pkg.purpose,
    commanderDependence: blueprint.bracketContract.commanderDependenceTarget.includes("high")
      ? "HIGH"
      : blueprint.bracketContract.commanderDependenceTarget.includes("low")
        ? "LOW"
        : "MEDIUM",
    status: mapPackageStatus(pkg.status),
    inputs: pkg.requiredFunctions.map(String),
    outputs: pkg.preferredFunctions.map(String),
    roles: [...pkg.requiredFunctions, ...pkg.preferredFunctions].map(String),
    candidateCards: blueprint.selectedCards.filter((c) => c.packageIds.includes(pkg.packageId)).map((c) => c.name),
    evidenceRefs: [],
    notes: [`Derived from BrewBlueprintV417 package status=${pkg.status}`],
  }));

  return {
    version: PROFESSOR_WORKING_DECK_THEORY_V4_VERSION,
    commander: blueprint.commander.name,
    userIntent: [
      `Bracket B${blueprint.userIntent.bracket}`,
      blueprint.userIntent.playStyle,
      blueprint.userIntent.comboPolicy,
    ],
    thesis: {
      summary: blueprint.strategy.strategicThesis,
      deckIdentity: blueprint.strategy.primaryStrategy,
      mechanicChain: [
        blueprint.strategy.commanderExploit,
        blueprint.strategy.independentEngine,
        blueprint.strategy.expectedPlayPattern,
      ],
    },
    packages,
    winPaths: blueprint.winArchitecture.map((w) => ({
      id: w.planId,
      description: w.plan,
      commanderDependence: w.mechanicallyVerified ? "MEDIUM" : "HIGH",
      evidenceRefs: w.mechanicallyVerified
        ? [{ kind: "MECHANISM_FACT" as const, factIds: [w.planId], statement: w.plan }]
        : [],
    })),
    independentEngines: [
      {
        id: "independent-engine",
        description: blueprint.strategy.independentEngine,
        worksWithoutCommander: "MEDIUM",
        evidenceRefs: [],
      },
    ],
    resiliencePlan: blueprint.strategy.protectionNeeds,
    weaknesses: blueprint.strategy.weaknesses,
    openQuestions: blueprint.openRequirements
      .filter((r) => r.status === "OPEN" || r.status === "PARTIAL")
      .map((r) => ({
        questionId: r.requirementId,
        question: r.purpose,
        status: "OPEN" as const,
      })),
    verifiedDiscoveries: [],
    ideaBoard: createEmptyIdeaBoardV4(),
    conversationState: blueprint.validation.structurallyReadyForMana ? "COMPLETE" : "RESEARCHING",
    researchMessages: [],
    revisionHistory: [
      {
        revision: 0,
        author: "BLUEPRINT_PROJECTION",
        summary: "Projected from BrewBlueprintV417",
        patches: [],
        preservedReasoning: [blueprint.strategy.strategicThesis],
      },
    ],
    currentRevision: 0,
  };
}
