/**
 * BuildPath v2 derivation — CommanderMechanism → path thesis → PathCandidateIntents.
 * Does NOT clone foundation CandidateIntents.
 */
import type {
  BuildPathClass,
  BuildPathProposal,
  CausalRole,
} from "../../src/lib/deck-synthesis/build-path-types-v1";
import {
  BUILD_PATH_CLASS_META,
  pathIdFor,
} from "../../src/lib/deck-synthesis/build-path-types-v1";
import type {
  BuildPathProposalV2,
  CausalChainLink,
  CommanderPathRole,
  PathCandidateIntentV2,
  PathThesis,
} from "../../src/lib/deck-synthesis/build-path-types-v2";
import type {
  BridgeSlot,
  CommanderMechanismEntry,
  MechanismSlot,
} from "./phase6a1-commander-mechanism-catalog-v2";
import { ARCHETYPE_DISCOVERY_BENCHMARK_V1 } from "../../src/lib/deck-synthesis/archetype-discovery-benchmark-v1";
import { ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V5 } from "../../src/lib/deck-synthesis/archetype-discovery-blind-holdout-v5";
import type { CommandZoneConfiguration } from "../../src/lib/deck-synthesis/command-zone-composition-v1";
import type { CommanderBracket } from "../../src/lib/bracket-policy/bracket-policy-v1";

export const BUILD_PATH_DERIVATION_V2_VERSION = "phase6a1-build-path-derivation-v2";

function caseMeta(caseId: string): {
  commanders: string[];
  commandZoneConfiguration: CommandZoneConfiguration;
  bracket: CommanderBracket;
} {
  for (const c of ARCHETYPE_DISCOVERY_BENCHMARK_V1) {
    if (c.id === caseId) {
      return { commanders: c.commanders, commandZoneConfiguration: "single_commander", bracket: c.bracket };
    }
  }
  for (const c of ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V5) {
    if (c.id === caseId) {
      return {
        commanders: c.commanders,
        commandZoneConfiguration: c.commandZoneConfiguration,
        bracket: c.bracket,
      };
    }
  }
  return { commanders: [], commandZoneConfiguration: "single_commander", bracket: 3 };
}

function slotToIntent(
  entry: CommanderMechanismEntry,
  pathClass: BuildPathClass,
  slot: MechanismSlot | BridgeSlot,
  opts: {
    pathPriority: "CORE" | "SECONDARY";
    causalChainPosition: CausalChainLink["stage"];
    pathExclusiveReason: string | null;
    independentEngineRole: PathCandidateIntentV2["independentEngineRole"];
    commanderEngineRole: PathCandidateIntentV2["commanderEngineRole"];
    bridgeRole: string | null;
    semanticSlot: string;
  },
): PathCandidateIntentV2 {
  const pathId = pathIdFor(entry.caseId, pathClass);
  return {
    intentId: `${pathId}--${slot.id}`,
    pathId,
    pathClass,
    caseId: entry.caseId,
    pathPriority: opts.pathPriority,
    causalRole: slot.causalRole,
    semanticSlot: opts.semanticSlot,
    targetMechanic: slot.targetMechanic,
    commanderMechanismSupported: entry.oracleSummary,
    oracleEvidence: slot.oracleEvidence,
    causalDefense: `${slot.label} — required for ${BUILD_PATH_CLASS_META[pathClass].title} plan.`,
    sourceSemanticFields: [slot.linkedSpecField],
    matchConstraints: slot.matchConstraints,
    retrievalBucket: slot.retrievalBucket,
    linkedSpecField: slot.linkedSpecField,
    retrievalToken: slot.retrievalToken,
    supportsCommanderDirectly: opts.commanderEngineRole !== "NONE",
    worksWithoutCommander: opts.independentEngineRole !== "NONE",
    supportsIndependentEngine: opts.independentEngineRole !== "NONE",
    bridgeStrength: opts.bridgeRole ? 0.85 : pathClass === "HARMONY" ? 0.7 : 0.2,
    derivedFromPathThesis: true,
    causalChainPosition: opts.causalChainPosition,
    requiredForPath: true,
    pathExclusiveReason: opts.pathExclusiveReason,
    independentEngineRole: opts.independentEngineRole,
    commanderEngineRole: opts.commanderEngineRole,
    bridgeRole: opts.bridgeRole,
  };
}

function buildPathThesis(entry: CommanderMechanismEntry, pathClass: BuildPathClass): PathThesis {
  const inputs = entry.commanderInputs.map((s) => s.label);
  const outputs = entry.commanderOutputExploits.map((s) => s.label);
  const bridgeLabels = entry.bridges.map((b) => b.label);

  if (pathClass === "DEPENDENT_SYNERGY") {
    return {
      pathClass,
      commanderRole: "REQUIRED_ENGINE",
      primaryCausalChain: [
        ...entry.commanderInputs.map((s) => ({ stage: "DECK_INPUT" as const, label: s.label })),
        { stage: "COMMANDER", label: entry.oracleSummary.slice(0, 120) },
        ...entry.commanderOutputExploits.map((s) => ({ stage: "COMMANDER_OUTPUT" as const, label: s.label })),
      ],
      deckProvides: inputs,
      commanderProvides: outputs,
      independentEngine: { present: false, enablers: [], payoffs: [] },
      bridgeMechanisms: [],
      failureWithoutCommander: entry.failureWithoutCommander,
      functionWithoutCommander: entry.functionWithoutCommander,
    };
  }

  if (pathClass === "INDEPENDENT_SYNERGY") {
    return {
      pathClass,
      commanderRole: "SYNERGY_AMPLIFIER",
      primaryCausalChain: [
        { stage: "INDEPENDENT_ENABLER", label: entry.independentEngine.enabler.label },
        { stage: "INDEPENDENT_PAYOFF", label: entry.independentEngine.payoff.label },
        { stage: "COMMANDER", label: `${entry.commanders?.[0] ?? "Commander"} amplifies but is not required` },
      ],
      deckProvides: [entry.independentEngine.enabler.label, entry.independentEngine.payoff.label],
      commanderProvides: outputs,
      independentEngine: {
        present: true,
        enablers: [entry.independentEngine.enabler.label],
        payoffs: [entry.independentEngine.payoff.label],
      },
      bridgeMechanisms: [],
      failureWithoutCommander: entry.failureWithoutCommander,
      functionWithoutCommander: entry.functionWithoutCommander,
    };
  }

  return {
    pathClass,
    commanderRole: "BRIDGE_ENGINE",
    primaryCausalChain: [
      { stage: "BRIDGE", label: bridgeLabels[0] ?? "Cross-support mechanism" },
      ...entry.commanderInputs.slice(0, 1).map((s) => ({ stage: "DECK_INPUT" as const, label: s.label })),
      { stage: "INDEPENDENT_ENABLER", label: entry.independentEngine.enabler.label },
    ],
    deckProvides: bridgeLabels,
    commanderProvides: outputs,
    independentEngine: {
      present: true,
      enablers: [entry.independentEngine.enabler.label],
      payoffs: [entry.independentEngine.payoff.label],
    },
    bridgeMechanisms: entry.bridges.map((b) => ({
      id: b.id,
      label: b.label,
      commanderJob: b.commanderJob,
      independentJob: b.independentJob,
    })),
    failureWithoutCommander: entry.failureWithoutCommander,
    functionWithoutCommander: entry.functionWithoutCommander,
  };
}

function derivePathIntents(entry: CommanderMechanismEntry, pathClass: BuildPathClass): PathCandidateIntentV2[] {
  if (pathClass === "DEPENDENT_SYNERGY") {
    const core: PathCandidateIntentV2[] = [
      ...entry.commanderInputs.map((s) =>
        slotToIntent(entry, pathClass, s, {
          pathPriority: "CORE",
          causalChainPosition: "DECK_INPUT",
          pathExclusiveReason: "Feeds commander input — not part of independent engine CORE",
          independentEngineRole: "NONE",
          commanderEngineRole: "INPUT_FEED",
          bridgeRole: null,
          semanticSlot: `Commander input: ${s.label}`,
        }),
      ),
      ...entry.commanderOutputExploits.map((s) =>
        slotToIntent(entry, pathClass, s, {
          pathPriority: entry.commanderInputs.length === 0 ? "CORE" : "SECONDARY",
          causalChainPosition: "COMMANDER_OUTPUT",
          pathExclusiveReason: "Exploits commander-exclusive output",
          independentEngineRole: "NONE",
          commanderEngineRole: "OUTPUT_EXPLOIT",
          bridgeRole: null,
          semanticSlot: `Exploit commander output: ${s.label}`,
        }),
      ),
    ];
    return core.filter((i) => i.pathPriority === "CORE").length > 0
      ? core.map((i) => (i.pathPriority === "SECONDARY" && core.filter((c) => c.pathPriority === "CORE").length >= 2 ? i : i))
      : core;
  }

  if (pathClass === "INDEPENDENT_SYNERGY") {
    return [
      slotToIntent(entry, pathClass, entry.independentEngine.enabler, {
        pathPriority: "CORE",
        causalChainPosition: "INDEPENDENT_ENABLER",
        pathExclusiveReason: "Self-contained engine enabler — functions without commander",
        independentEngineRole: "ENABLER",
        commanderEngineRole: "NONE",
        bridgeRole: null,
        semanticSlot: `Independent enabler: ${entry.independentEngine.enabler.label}`,
      }),
      slotToIntent(entry, pathClass, entry.independentEngine.payoff, {
        pathPriority: "CORE",
        causalChainPosition: "INDEPENDENT_PAYOFF",
        pathExclusiveReason: "Self-contained engine payoff — not commander output exploit",
        independentEngineRole: "PAYOFF",
        commanderEngineRole: "NONE",
        bridgeRole: null,
        semanticSlot: `Independent payoff: ${entry.independentEngine.payoff.label}`,
      }),
    ];
  }

  return entry.bridges.map((b) =>
    slotToIntent(entry, pathClass, b, {
      pathPriority: "CORE",
      causalChainPosition: "BRIDGE",
      pathExclusiveReason: null,
      independentEngineRole: "BRIDGE",
      commanderEngineRole: "BRIDGE",
      bridgeRole: `${b.commanderJob} + ${b.independentJob}`,
      semanticSlot: `Bridge: ${b.label}`,
    }),
  );
}

export function deriveBuildPathProposalV2(
  entry: CommanderMechanismEntry,
  pathClass: BuildPathClass,
): BuildPathProposalV2 {
  const meta = caseMeta(entry.caseId);
  const metaInfo = BUILD_PATH_CLASS_META[pathClass];
  const pathThesis = buildPathThesis(entry, pathClass);
  const allIntents = derivePathIntents(entry, pathClass);
  const required = allIntents.filter((i) => i.pathPriority === "CORE");
  const secondary = allIntents.filter((i) => i.pathPriority === "SECONDARY");

  const members =
    meta.commanders.length <= 1
      ? [{ name: meta.commanders[0] ?? "Commander", mechanismsUsed: [entry.oracleSummary] }]
      : meta.commanders.map((name, i) => ({
          name,
          mechanismsUsed: [
            i === 0
              ? `Primary: ${entry.oracleSummary.slice(0, 80)}`
              : `Partner/background member — cross-support with ${meta.commanders[0]}`,
          ],
        }));

  return {
    pathId: pathIdFor(entry.caseId, pathClass),
    pathClass,
    caseId: entry.caseId,
    commandZoneConfiguration: meta.commandZoneConfiguration,
    commanders: meta.commanders,
    bracket: meta.bracket,
    title: metaInfo.title,
    summary: pathThesis.primaryCausalChain.map((c) => c.label).join(" → "),
    pathTagline: metaInfo.tagline,
    pathThesis,
    commanderMechanismsUsed: [entry.oracleSummary],
    commanderZoneMembers: members,
    dependencyProfile: {
      commanderDependency: metaInfo.dependency,
      commanderRemovalSensitivity: metaInfo.removalSensitivity,
    },
    deckSideObjectives: pathThesis.deckProvides,
    commanderProvidedOutputs: pathThesis.commanderProvides,
    requiredCandidateIntents: required,
    secondaryCandidateIntents: secondary,
    avoidPatterns:
      pathClass === "DEPENDENT_SYNERGY"
        ? ["standalone_engine_without_commander_link"]
        : pathClass === "INDEPENDENT_SYNERGY"
          ? ["commander_only_dead_cards"]
          : ["single_role_no_bridge"],
    semanticEvidence: [entry.oracleSummary],
    pathSeparationWarnings: [],
    lowPathSeparationReasons: [],
  };
}

export function deriveBuildPathBundleV2(entry: CommanderMechanismEntry): {
  caseId: string;
  commandZoneConfiguration: CommandZoneConfiguration;
  commanders: string[];
  bracket: CommanderBracket;
  commanderMechanismSummary: string;
  buildPaths: [BuildPathProposalV2, BuildPathProposalV2, BuildPathProposalV2];
} {
  const paths: BuildPathClass[] = ["DEPENDENT_SYNERGY", "INDEPENDENT_SYNERGY", "HARMONY"];
  const meta = caseMeta(entry.caseId);
  const buildPaths = paths.map((pc) => deriveBuildPathProposalV2(entry, pc)) as [
    BuildPathProposalV2,
    BuildPathProposalV2,
    BuildPathProposalV2,
  ];
  return {
    caseId: entry.caseId,
    commandZoneConfiguration: meta.commandZoneConfiguration,
    commanders: meta.commanders,
    bracket: meta.bracket,
    commanderMechanismSummary: entry.oracleSummary,
    buildPaths,
  };
}
