/**
 * BuildPath v3 derivation — frozen CommanderMechanismFacts + frozen correctedThreePathStrategy.
 * Does NOT create new semantic strategy or scan spec fields for path authority.
 */
import type { BuildPathClass, CausalRole } from "../../src/lib/deck-synthesis/build-path-types-v1";
import { BUILD_PATH_CLASS_META, pathIdFor } from "../../src/lib/deck-synthesis/build-path-types-v1";
import type {
  BuildPathProposalV3,
  CommandZoneBuildPathBundleV3,
  PathCandidateIntentV3,
  PathThesisV3,
  UnresolvedPathStatus,
} from "../../src/lib/deck-synthesis/build-path-types-v3";
import type { CommanderPathRole } from "../../src/lib/deck-synthesis/build-path-types-v2";
import type {
  CorrectedThreePathStrategy,
  IndependentMechanismFact,
  ThreePathStrategyLens,
} from "../../src/lib/deck-synthesis/independent-truth-types-v1";
import type { ImplementedMechanismCatalogEntry } from "./phase6a1-implemented-mechanism-catalog-v1";
import type { ImplementedStrategyCatalogEntry } from "./phase6a1-implemented-strategy-catalog-v1";
import { linkMechanismFacts } from "./phase6a1-mechanism-fact-linker-v3";
import { deriveRetrievalRepresentation } from "./phase6a1-strategy-retrieval-representation-v3";

export const BUILD_PATH_DERIVATION_V3_VERSION = "phase6a1-build-path-derivation-v3";

const PATH_ORDER: BuildPathClass[] = ["DEPENDENT_SYNERGY", "INDEPENDENT_SYNERGY", "HARMONY"];

function resolveUnresolvedStatus(lens: ThreePathStrategyLens, caseId: string): UnresolvedPathStatus {
  if (caseId === "blindv5-26-activated-engine" && lens.valid === "PARTIAL_PENDING_THE_ANIMUS_ORACLE") {
    return "PARTIAL_PENDING_THE_ANIMUS_ORACLE";
  }
  if (caseId === "blindv5-42-resource-conversion" && lens.valid === "TENTATIVE_NEEDS_FEASIBILITY_CHECK") {
    return "TENTATIVE_NEEDS_FEASIBILITY_CHECK";
  }
  if (lens.valid === "PARTIAL_PENDING_THE_ANIMUS_ORACLE") return "PARTIAL_PENDING_THE_ANIMUS_ORACLE";
  if (lens.valid === "TENTATIVE_NEEDS_FEASIBILITY_CHECK") return "TENTATIVE_NEEDS_FEASIBILITY_CHECK";
  return "RESOLVED";
}

function commanderRole(pathClass: BuildPathClass): CommanderPathRole {
  if (pathClass === "DEPENDENT_SYNERGY") return "REQUIRED_ENGINE";
  if (pathClass === "INDEPENDENT_SYNERGY") return "SYNERGY_AMPLIFIER";
  return "BRIDGE_ENGINE";
}

function causalRoleFor(pathClass: BuildPathClass, kind: "coreMechanic" | "bridgeMechanic", idx: number): CausalRole {
  if (pathClass === "HARMONY") return "CONVERSION_PIECE";
  if (pathClass === "INDEPENDENT_SYNERGY") return idx === 0 ? "ENGINE_ENABLER" : "PAYOFF_FOR_COMMANDER_OUTPUT";
  return idx === 0 ? "RESOURCE_PROVIDER" : "PAYOFF_FOR_COMMANDER_OUTPUT";
}

function commanderEngineRole(pathClass: BuildPathClass): PathCandidateIntentV3["commanderEngineRole"] {
  if (pathClass === "DEPENDENT_SYNERGY") return "INPUT_FEED";
  if (pathClass === "HARMONY") return "BRIDGE";
  return "NONE";
}

function independentEngineRole(pathClass: BuildPathClass): PathCandidateIntentV3["independentEngineRole"] {
  if (pathClass === "INDEPENDENT_SYNERGY") return "ENABLER";
  if (pathClass === "HARMONY") return "BRIDGE";
  return "NONE";
}

function buildThesis(
  pathClass: BuildPathClass,
  lens: ThreePathStrategyLens,
  caseId: string,
  facts: IndependentMechanismFact[],
): PathThesisV3 {
  const unresolvedStatus = resolveUnresolvedStatus(lens, caseId);
  const bridgeMechs = lens.bridgeMechanics ?? [];
  return {
    pathClass,
    commanderRole: commanderRole(pathClass),
    primaryCausalChain: lens.chain.map((label, i) => ({
      stage:
        pathClass === "HARMONY"
          ? ("BRIDGE" as const)
          : i === 0
            ? ("DECK_INPUT" as const)
            : i === lens.chain.length - 1
              ? ("COMMANDER_OUTPUT" as const)
              : ("COMMANDER" as const),
      label,
    })),
    deckProvides: lens.coreMechanics ?? bridgeMechs,
    commanderProvides: facts.map((f) => f.evidenceSpan).slice(0, 2),
    independentEngine: {
      present: pathClass === "INDEPENDENT_SYNERGY" || (lens.worksWithoutCommander ?? false),
      enablers: pathClass === "INDEPENDENT_SYNERGY" ? lens.coreMechanics.slice(0, 1) : [],
      payoffs: pathClass === "INDEPENDENT_SYNERGY" ? lens.coreMechanics.slice(1) : [],
    },
    bridgeMechanisms: bridgeMechs.map((b, i) => ({
      id: `${caseId}--harmony-bridge-${i}`,
      label: b,
      commanderJob: lens.chain[1] ?? lens.chain[0] ?? b,
      independentJob: lens.chain[lens.chain.length - 1] ?? b,
    })),
    failureWithoutCommander:
      pathClass === "DEPENDENT_SYNERGY" ? "Commander-dependent chain stops without command zone." : "",
    functionWithoutCommander:
      pathClass === "INDEPENDENT_SYNERGY" && lens.worksWithoutCommander
        ? "Adjudicated independent chain continues without commander."
        : "",
    sourceStrategyChain: lens.chain,
    sourceCoreMechanics: lens.coreMechanics ?? [],
    sourceBridgeMechanics: bridgeMechs,
    unresolvedStatus,
    harmonyValid: lens.valid ?? true,
    strategyNote: lens.note ?? null,
  };
}

function mechanicLabels(pathClass: BuildPathClass, lens: ThreePathStrategyLens): string[] {
  if (pathClass === "HARMONY") return lens.bridgeMechanics ?? [];
  return lens.coreMechanics ?? [];
}

function buildIntent(
  mechCase: ImplementedMechanismCatalogEntry,
  stratCase: ImplementedStrategyCatalogEntry,
  pathClass: BuildPathClass,
  lens: ThreePathStrategyLens,
  mechanicLabel: string,
  kind: "coreMechanic" | "bridgeMechanic",
  idx: number,
): PathCandidateIntentV3 {
  const pathId = pathIdFor(mechCase.caseId, pathClass);
  const depLens = stratCase.correctedThreePathStrategy.DEPENDENT_SYNERGY;
  const routingCorrection =
    "routingCorrection" in depLens
      ? (depLens as ThreePathStrategyLens & { routingCorrection?: string }).routingCorrection
      : undefined;
  const rep = deriveRetrievalRepresentation(mechanicLabel, { routingCorrection });
  const { factIds, membersSupported } = linkMechanismFacts(
    mechanicLabel,
    mechCase.independentMechanismFacts,
    mechCase.commanders,
  );
  const unresolvedStatus = resolveUnresolvedStatus(lens, mechCase.caseId);
  const slug = mechanicLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);

  const supportingFacts = mechCase.independentMechanismFacts.filter((f) => factIds.includes(f.mechanismId));
  const oracleEvidence = supportingFacts.map((f) => f.evidenceSpan).join(" | ") || mechanicLabel;

  return {
    intentId: `${pathId}--${kind}-${idx}-${slug}`,
    pathId,
    pathClass,
    caseId: mechCase.caseId,
    pathPriority: "CORE",
    causalRole: causalRoleFor(pathClass, kind, idx),
    semanticSlot: `${pathClass}:${kind}:${slug}`,
    targetMechanic: rep.targetMechanic,
    commanderMechanismSupported: supportingFacts.map((f) => f.mechanismId).join(", ") || "strategy-derived",
    oracleEvidence,
    causalDefense: `Adjudicated ${kind}: "${mechanicLabel}" — ${lens.chain.join(" → ")}`,
    sourceSemanticFields: [rep.linkedSpecField],
    matchConstraints: [],
    retrievalBucket: rep.retrievalBucket,
    linkedSpecField: rep.linkedSpecField,
    retrievalToken: rep.retrievalToken,
    supportsCommanderDirectly: pathClass !== "INDEPENDENT_SYNERGY",
    worksWithoutCommander: pathClass === "INDEPENDENT_SYNERGY" || pathClass === "HARMONY",
    supportsIndependentEngine: pathClass === "INDEPENDENT_SYNERGY" || pathClass === "HARMONY",
    bridgeStrength: pathClass === "HARMONY" ? 0.85 : pathClass === "DEPENDENT_SYNERGY" ? 0.2 : 0.35,
    derivedFromFrozenTruth: true,
    provenance: {
      sourceTruth: "phase6a1-independent-strategy-adjudication-v1",
      sourceStrategyChain: lens.chain,
      sourceMechanicLabel: mechanicLabel,
      sourceMechanicKind: kind,
      supportingMechanismFactIds: factIds,
      commanderZoneMembersSupported: membersSupported,
      unresolvedStatus,
      routingCompatibility: rep.routingCompatibility,
      routingNote: rep.routingNote,
    },
    commanderEngineRole: commanderEngineRole(pathClass),
    independentEngineRole: independentEngineRole(pathClass),
    bridgeRole: pathClass === "HARMONY" ? mechanicLabel : null,
    causalChainPosition: lens.chain[Math.min(idx, lens.chain.length - 1)] ?? mechanicLabel,
    pathExclusiveReason: pathClass === "HARMONY" ? null : `${pathClass} adjudicated mechanic`,
  };
}

function buildPathProposal(
  mechCase: ImplementedMechanismCatalogEntry,
  stratCase: ImplementedStrategyCatalogEntry,
  pathClass: BuildPathClass,
  strategy: CorrectedThreePathStrategy,
): BuildPathProposalV3 {
  const lens = strategy[pathClass];
  const meta = BUILD_PATH_CLASS_META[pathClass];
  const pathId = pathIdFor(mechCase.caseId, pathClass);
  const thesis = buildThesis(pathClass, lens, mechCase.caseId, mechCase.independentMechanismFacts);
  const labels = mechanicLabels(pathClass, lens);
  const kind: "coreMechanic" | "bridgeMechanic" = pathClass === "HARMONY" ? "bridgeMechanic" : "coreMechanic";

  const requiredCandidateIntents = labels.map((label, idx) =>
    buildIntent(mechCase, stratCase, pathClass, lens, label, kind, idx),
  );

  const memberMechanisms = mechCase.commanders.map((name) => ({
    name,
    mechanismsUsed: mechCase.independentMechanismFacts
      .filter((f) => f.commander === name)
      .map((f) => f.mechanismId),
  }));

  return {
    pathId,
    pathClass,
    caseId: mechCase.caseId,
    commandZoneConfiguration: mechCase.commandZoneConfiguration,
    commanders: mechCase.commanders,
    bracket: mechCase.bracket,
    title: meta.title,
    summary: lens.chain.join(" → "),
    pathTagline: meta.tagline,
    commanderMechanismsUsed: mechCase.independentMechanismFacts.map((f) => f.mechanismId),
    commanderZoneMembers: memberMechanisms,
    dependencyProfile: {
      commanderDependency: meta.dependency,
      commanderRemovalSensitivity: meta.removalSensitivity,
    },
    deckSideObjectives: lens.coreMechanics ?? lens.bridgeMechanics ?? [],
    commanderProvidedOutputs: mechCase.independentMechanismFacts
      .filter((f) => /CREATE_|DRAW_|MILL|RETURN|TOKEN/i.test(JSON.stringify(f.actions ?? {})))
      .map((f) => f.mechanismId),
    requiredCandidateIntents,
    secondaryCandidateIntents: [],
    avoidPatterns: [],
    semanticEvidence: mechCase.independentMechanismFacts.map((f) => f.evidenceSpan),
    pathSeparationWarnings:
      thesis.unresolvedStatus !== "RESOLVED" ? [`UNRESOLVED:${thesis.unresolvedStatus}`] : [],
    pathThesis: thesis,
    derivationSource: {
      mechanismFactsVersion: "phase6a1-commander-mechanism-facts-v4-implemented",
      strategyAdjudicationVersion: "phase6a1-strategy-adjudication-v1-implemented",
    },
  };
}

export function deriveBuildPathBundleV3(
  mechCase: ImplementedMechanismCatalogEntry,
  stratCase: ImplementedStrategyCatalogEntry,
): CommandZoneBuildPathBundleV3 {
  const strategy = stratCase.correctedThreePathStrategy;
  const buildPaths = PATH_ORDER.map((pathClass) =>
    buildPathProposal(mechCase, stratCase, pathClass, strategy),
  ) as [BuildPathProposalV3, BuildPathProposalV3, BuildPathProposalV3];

  const mechanismSummary = mechCase.independentMechanismFacts
    .map((f) => f.evidenceSpan)
    .slice(0, 2)
    .join("; ");

  return {
    caseId: mechCase.caseId,
    commandZoneConfiguration: mechCase.commandZoneConfiguration,
    commanders: mechCase.commanders,
    bracket: mechCase.bracket,
    commanderMechanismSummary: mechanismSummary,
    buildPaths,
    commanderMechanismFactIds: mechCase.independentMechanismFacts.map((f) => f.mechanismId),
    derivationSource: {
      mechanismFactsVersion: "phase6a1-commander-mechanism-facts-v4-implemented",
      strategyAdjudicationVersion: "phase6a1-strategy-adjudication-v1-implemented",
    },
  };
}

export function deriveAllBuildPathBundlesV3(
  mechanismEntries: ImplementedMechanismCatalogEntry[],
  strategyEntries: ImplementedStrategyCatalogEntry[],
): CommandZoneBuildPathBundleV3[] {
  const stratByCase = new Map(strategyEntries.map((s) => [s.caseId, s]));
  return mechanismEntries
    .map((m) => {
      const s = stratByCase.get(m.caseId);
      if (!s) return null;
      return deriveBuildPathBundleV3(m, s);
    })
    .filter((b): b is CommandZoneBuildPathBundleV3 => b !== null);
}
