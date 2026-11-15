/**
 * Phase 6A.1 — BuildPathProposal generator (three lenses over semantic graph).
 * Transforms foundation CandidateIntent profiles into path-conditioned PathCandidateIntents.
 */
import type { RetrievalBucketId } from "../../src/lib/deck-synthesis/semantic-candidate-retrieval-v1";
import type {
  BuildPathClass,
  BuildPathProposal,
  CausalRole,
  CommandZoneBuildPathBundle,
  DependencyLevel,
  PathCandidateIntent,
} from "../../src/lib/deck-synthesis/build-path-types-v1";
import {
  BUILD_PATH_CLASS_META,
  pathIdFor,
} from "../../src/lib/deck-synthesis/build-path-types-v1";
import type { CandidateIntent } from "./phase6a1-candidate-intent-types-v1";
import {
  getAllCandidateIntentProfiles,
  getCandidateIntentProfile,
  type CaseCandidateIntentProfile,
} from "./phase6a1-candidate-intent-adjudication-v1";
import { ARCHETYPE_DISCOVERY_BENCHMARK_V1 } from "../../src/lib/deck-synthesis/archetype-discovery-benchmark-v1";
import { ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V5 } from "../../src/lib/deck-synthesis/archetype-discovery-blind-holdout-v5";
import type { CommandZoneConfiguration } from "../../src/lib/deck-synthesis/command-zone-composition-v1";
import type { CommanderBracket } from "../../src/lib/bracket-policy/bracket-policy-v1";

export const BUILD_PATH_GENERATOR_V1_VERSION = "phase6a1-build-path-generator-v1";

const PATH_CLASSES: BuildPathClass[] = ["DEPENDENT_SYNERGY", "INDEPENDENT_SYNERGY", "HARMONY"];

type CaseMeta = {
  commanders: string[];
  commandZoneConfiguration: CommandZoneConfiguration;
  bracket: CommanderBracket;
};

function caseMeta(caseId: string): CaseMeta {
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

function commanderZoneMembers(commanders: string[], mechanismSummary: string): BuildPathProposal["commanderZoneMembers"] {
  if (commanders.length <= 1) {
    return [{ name: commanders[0] ?? "Commander", mechanismsUsed: [mechanismSummary] }];
  }
  return commanders.map((name, i) => ({
    name,
    mechanismsUsed: [
      i === 0
        ? `Primary member mechanism (${name})`
        : `Partner/background mechanism (${name}) — cross-support with ${commanders[0]}`,
    ],
  }));
}

function roleWeight(pathClass: BuildPathClass, role: CausalRole): number {
  const table: Record<BuildPathClass, Partial<Record<CausalRole, number>>> = {
    DEPENDENT_SYNERGY: {
      ENGINE_ENABLER: 1,
      TRIGGER_PROVIDER: 1,
      PAYOFF_FOR_COMMANDER_OUTPUT: 1,
      PROTECTION: 0.9,
      RESOURCE_PROVIDER: 0.7,
      CONVERSION_PIECE: 0.6,
      REDUNDANCY: 0.2,
    },
    INDEPENDENT_SYNERGY: {
      REDUNDANCY: 1,
      RESOURCE_PROVIDER: 0.9,
      CONVERSION_PIECE: 0.9,
      ENGINE_ENABLER: 0.5,
      TRIGGER_PROVIDER: 0.4,
      PAYOFF_FOR_COMMANDER_OUTPUT: 0.3,
      PROTECTION: 0.5,
    },
    HARMONY: {
      ENGINE_ENABLER: 0.85,
      RESOURCE_PROVIDER: 0.85,
      TRIGGER_PROVIDER: 0.85,
      PAYOFF_FOR_COMMANDER_OUTPUT: 0.75,
      REDUNDANCY: 0.7,
      CONVERSION_PIECE: 0.8,
      PROTECTION: 0.75,
    },
  };
  return table[pathClass][role] ?? 0.3;
}

function pathFlags(pathClass: BuildPathClass, role: CausalRole, basePriority: "CORE" | "SECONDARY") {
  const w = roleWeight(pathClass, role);
  const supportsCommanderDirectly =
    pathClass === "DEPENDENT_SYNERGY" ||
    (pathClass === "HARMONY" && w >= 0.7 && role !== "REDUNDANCY");
  const worksWithoutCommander =
    pathClass === "INDEPENDENT_SYNERGY" ||
    (pathClass === "HARMONY" && (role === "REDUNDANCY" || role === "RESOURCE_PROVIDER"));
  const supportsIndependentEngine =
    pathClass === "INDEPENDENT_SYNERGY" || pathClass === "HARMONY";
  const bridgeStrength =
    pathClass === "HARMONY"
      ? Math.min(1, 0.45 + w * 0.4 + (basePriority === "CORE" ? 0.1 : 0))
      : pathClass === "DEPENDENT_SYNERGY"
        ? 0.15 + w * 0.2
        : 0.2 + w * 0.15;
  return { supportsCommanderDirectly, worksWithoutCommander, supportsIndependentEngine, bridgeStrength, weight: w };
}

function toPathIntent(
  base: CandidateIntent,
  pathClass: BuildPathClass,
  meta: CaseMeta,
): PathCandidateIntent | null {
  const flags = pathFlags(pathClass, base.causalRole, base.priority);
  if (flags.weight < 0.35) return null;

  const pathPriority =
    flags.weight >= 0.75 && base.priority === "CORE"
      ? ("CORE" as const)
      : flags.weight >= 0.55
        ? base.priority
        : ("SECONDARY" as const);

  const semanticSlot =
    pathClass === "DEPENDENT_SYNERGY"
      ? `Commander-fed: ${base.targetMechanic}`
      : pathClass === "INDEPENDENT_SYNERGY"
        ? `Standalone shell: ${base.targetMechanic}`
        : `Bridge role: ${base.targetMechanic}`;

  return {
    intentId: `${pathIdFor(base.caseId, pathClass)}--${base.intentId}`,
    pathId: pathIdFor(base.caseId, pathClass),
    pathClass,
    caseId: base.caseId,
    pathPriority,
    causalRole: base.causalRole,
    semanticSlot,
    targetMechanic: base.targetMechanic,
    commanderMechanismSupported: base.commanderMechanismSupported,
    oracleEvidence: base.oracleEvidence,
    causalDefense: `${base.causalDefense} [${BUILD_PATH_CLASS_META[pathClass].title} lens]`,
    sourceSemanticFields: base.sourceSemanticFields,
    matchConstraints: base.matchConstraints,
    retrievalBucket: base.retrievalBucket,
    linkedSpecField: base.linkedSpecField,
    retrievalToken: base.retrievalToken,
    supportsCommanderDirectly: flags.supportsCommanderDirectly,
    worksWithoutCommander: flags.worksWithoutCommander,
    supportsIndependentEngine: flags.supportsIndependentEngine,
    bridgeStrength: Number(flags.bridgeStrength.toFixed(2)),
    derivedFromFoundationIntentId: base.intentId,
  };
}

type SyntheticIntentDraft = Omit<
  PathCandidateIntent,
  "intentId" | "pathId" | "pathClass" | "caseId" | "pathPriority" | "semanticSlot" | "derivedFromFoundationIntentId"
> & { id: string; pathPriority: "CORE" | "SECONDARY" };

const NO_CORE_PATH_SYNTHETICS: Record<
  string,
  Record<BuildPathClass, SyntheticIntentDraft[]>
> = {
  "multi-kenrith": {
    DEPENDENT_SYNERGY: [
      {
        id: "mana-for-activations",
        pathPriority: "CORE",
        causalRole: "ENGINE_ENABLER",
        targetMechanic: "Mana production to repeatedly activate Kenrith branches",
        commanderMechanismSupported: "Five activated abilities require mana each turn",
        oracleEvidence: "Pay {W}, {U}, {R}, {1}{G}, or {4}{B} activated abilities",
        causalDefense: "Deck feeds mana so Kenrith activations run the engine.",
        sourceSemanticFields: ["requiredFunctions:ramp"],
        matchConstraints: [],
        retrievalBucket: "MANA_SUPPORT",
        linkedSpecField: "requiredFunctions:ramp",
        retrievalToken: "ramp",
        supportsCommanderDirectly: true,
        worksWithoutCommander: false,
        supportsIndependentEngine: false,
        bridgeStrength: 0.25,
      },
      {
        id: "graveyard-fodder-reanimation",
        pathPriority: "CORE",
        causalRole: "RESOURCE_PROVIDER",
        targetMechanic: "Creature cards in graveyard for Kenrith reanimation branch",
        commanderMechanismSupported: "{4}{B} return creature from graveyard",
        oracleEvidence: "Return target creature card from your graveyard to the battlefield",
        causalDefense: "Deck populates graveyard for Kenrith reanimation activation.",
        sourceSemanticFields: ["requiredInputs:creature_card_in_graveyard"],
        matchConstraints: ["requiredInputs:creature_card_in_graveyard"],
        retrievalBucket: "RECURSION",
        linkedSpecField: "requiredInputs:creature_card_in_graveyard",
        retrievalToken: "creature_card_in_graveyard",
        supportsCommanderDirectly: true,
        worksWithoutCommander: false,
        supportsIndependentEngine: false,
        bridgeStrength: 0.3,
      },
    ],
    INDEPENDENT_SYNERGY: [
      {
        id: "counter-value-shell",
        pathPriority: "CORE",
        causalRole: "REDUNDANCY",
        targetMechanic: "+1/+1 counter value engine independent of Kenrith",
        commanderMechanismSupported: "Kenrith can add counters but deck functions alone",
        oracleEvidence: "Put a +1/+1 counter on target creature",
        causalDefense: "Standalone counter synergies remain viable when Kenrith is removed.",
        sourceSemanticFields: ["outputsToExploit:counter_placement"],
        matchConstraints: [],
        retrievalBucket: "ENGINE_PIECES",
        linkedSpecField: "requiredFunctions:counter_placement",
        retrievalToken: "counter_placement",
        supportsCommanderDirectly: false,
        worksWithoutCommander: true,
        supportsIndependentEngine: true,
        bridgeStrength: 0.2,
      },
      {
        id: "standalone-graveyard-value",
        pathPriority: "CORE",
        causalRole: "CONVERSION_PIECE",
        targetMechanic: "Graveyard value that does not require Kenrith online",
        commanderMechanismSupported: "Parallel to Kenrith reanimation branch",
        oracleEvidence: "Return target creature card from your graveyard",
        causalDefense: "Independent recursion/reanimation lines when commander is absent.",
        sourceSemanticFields: ["requiredFunctions:reanimation"],
        matchConstraints: [],
        retrievalBucket: "RECURSION",
        linkedSpecField: "requiredFunctions:reanimation",
        retrievalToken: "reanimation",
        supportsCommanderDirectly: false,
        worksWithoutCommander: true,
        supportsIndependentEngine: true,
        bridgeStrength: 0.25,
      },
    ],
    HARMONY: [
      {
        id: "mana-creature-value-hub",
        pathPriority: "CORE",
        causalRole: "CONVERSION_PIECE",
        targetMechanic: "Mana + creature-value infrastructure supporting multiple Kenrith branches",
        commanderMechanismSupported: "Ramp, counters, reanimation, and combat branches",
        oracleEvidence: "Kenrith activated toolbox",
        causalDefense: "Cards that ramp, grow creatures, and fill graveyard serve both Kenrith and standalone plans.",
        sourceSemanticFields: ["requiredFunctions:ramp", "requiredInputs:creature_card_in_graveyard"],
        matchConstraints: [],
        retrievalBucket: "MANA_SUPPORT",
        linkedSpecField: "requiredFunctions:ramp",
        retrievalToken: "ramp",
        supportsCommanderDirectly: true,
        worksWithoutCommander: true,
        supportsIndependentEngine: true,
        bridgeStrength: 0.85,
      },
    ],
  },
  "stax-augustin": {
    DEPENDENT_SYNERGY: [
      {
        id: "cheap-wu-spells",
        pathPriority: "CORE",
        causalRole: "ENGINE_ENABLER",
        targetMechanic: "Low-cost white/blue spells exploiting Augustin cost reduction",
        commanderMechanismSupported: "White/blue spells cost {1} less",
        oracleEvidence: "White spells you cast cost {1} less to cast. Blue spells you cast cost {1} less to cast.",
        causalDefense: "Deck maximizes cost-reduction advantage on cheap spells.",
        sourceSemanticFields: ["outputsToExploit:controller_spell_cost_reduction"],
        matchConstraints: [],
        retrievalBucket: "MANA_SUPPORT",
        linkedSpecField: "requiredFunctions:spell_cost_reduction",
        retrievalToken: "spell_cost_reduction",
        supportsCommanderDirectly: true,
        worksWithoutCommander: false,
        supportsIndependentEngine: false,
        bridgeStrength: 0.3,
      },
    ],
    INDEPENDENT_SYNERGY: [
      {
        id: "standalone-stax-shell",
        pathPriority: "CORE",
        causalRole: "REDUNDANCY",
        targetMechanic: "Independent stax/tax pieces functioning without Augustin",
        commanderMechanismSupported: "Parallel tax effects",
        oracleEvidence: "Spells your opponents cast cost {1} more to cast",
        causalDefense: "Deck stax elements operate when commander is removed.",
        sourceSemanticFields: ["outputsToExploit:opponent_spell_tax"],
        matchConstraints: [],
        retrievalBucket: "STRUCTURAL_SUPPORT",
        linkedSpecField: "requiredFunctions:opponent_spell_tax",
        retrievalToken: "opponent_spell_tax",
        supportsCommanderDirectly: false,
        worksWithoutCommander: true,
        supportsIndependentEngine: true,
        bridgeStrength: 0.25,
      },
    ],
    HARMONY: [
      {
        id: "tax-plus-reduction-bridge",
        pathPriority: "CORE",
        causalRole: "CONVERSION_PIECE",
        targetMechanic: "Spells benefiting from both cost reduction and opponent tax asymmetry",
        commanderMechanismSupported: "Augustin tax + reduction asymmetry",
        oracleEvidence: "cost {1} less / cost {1} more",
        causalDefense: "Multi-role control spells bridge Augustin and independent stax.",
        sourceSemanticFields: ["outputsToExploit:controller_spell_cost_reduction", "outputsToExploit:opponent_spell_tax"],
        matchConstraints: [],
        retrievalBucket: "STRUCTURAL_SUPPORT",
        linkedSpecField: "requiredFunctions:opponent_spell_tax",
        retrievalToken: "opponent_spell_tax",
        supportsCommanderDirectly: true,
        worksWithoutCommander: true,
        supportsIndependentEngine: true,
        bridgeStrength: 0.8,
      },
    ],
  },
  "blindv5-26-activated-engine": {
    DEPENDENT_SYNERGY: [
      {
        id: "artifact-clue-fodder",
        pathPriority: "CORE",
        causalRole: "RESOURCE_PROVIDER",
        targetMechanic: "Artifacts and Clues to sacrifice for Shaun & Rebecca",
        commanderMechanismSupported: "Sacrifice an artifact or a Clue",
        oracleEvidence: "Sacrifice an artifact or a Clue",
        causalDefense: "Deck supplies sacrifice fodder for activated engine.",
        sourceSemanticFields: ["requiredInputs:artifact_or_clue_sacrifice"],
        matchConstraints: ["requiredInputs:artifact_or_clue_sacrifice"],
        retrievalBucket: "RESOURCE_CONSUMERS",
        linkedSpecField: "requiredInputs:artifact_or_clue_sacrifice",
        retrievalToken: "artifact_or_clue_sacrifice",
        supportsCommanderDirectly: true,
        worksWithoutCommander: false,
        supportsIndependentEngine: false,
        bridgeStrength: 0.3,
      },
    ],
    INDEPENDENT_SYNERGY: [
      {
        id: "standalone-artifact-value",
        pathPriority: "CORE",
        causalRole: "REDUNDANCY",
        targetMechanic: "Artifact value engine independent of commander sacrifice loop",
        commanderMechanismSupported: "Parallel artifact synergies",
        oracleEvidence: "Sacrifice an artifact",
        causalDefense: "Artifact synergies function without commander online.",
        sourceSemanticFields: ["resourcesToConsume:artifacts"],
        matchConstraints: [],
        retrievalBucket: "RESOURCE_CONSUMERS",
        linkedSpecField: "resourcesToConsume:artifacts",
        retrievalToken: "artifacts",
        supportsCommanderDirectly: false,
        worksWithoutCommander: true,
        supportsIndependentEngine: true,
        bridgeStrength: 0.25,
      },
    ],
    HARMONY: [
      {
        id: "multi-role-artifacts",
        pathPriority: "CORE",
        causalRole: "CONVERSION_PIECE",
        targetMechanic: "Artifacts that sacrifice for value AND support independent engines",
        commanderMechanismSupported: "Shaun & Rebecca sacrifice loop",
        oracleEvidence: "Sacrifice an artifact or a Clue",
        causalDefense: "Flexible artifacts bridge commander loop and standalone artifact synergies.",
        sourceSemanticFields: ["requiredInputs:artifact_or_clue_sacrifice", "resourcesToConsume:artifacts"],
        matchConstraints: ["requiredInputs:artifact_or_clue_sacrifice"],
        retrievalBucket: "RESOURCE_CONSUMERS",
        linkedSpecField: "requiredInputs:artifact_or_clue_sacrifice",
        retrievalToken: "artifact_or_clue_sacrifice",
        supportsCommanderDirectly: true,
        worksWithoutCommander: true,
        supportsIndependentEngine: true,
        bridgeStrength: 0.78,
      },
    ],
  },
  "blindv5-42-resource-conversion": {
    DEPENDENT_SYNERGY: [
      {
        id: "combat-damage-enablers",
        pathPriority: "CORE",
        causalRole: "TRIGGER_PROVIDER",
        targetMechanic: "Combat damage enablers triggering Cyclonus connive/conversion",
        commanderMechanismSupported: "Combat damage triggers connive",
        oracleEvidence: "Connive",
        causalDefense: "Deck enables combat damage that triggers commander conversion.",
        sourceSemanticFields: ["requiredInputs:combat_damage_to_player"],
        matchConstraints: ["requiredInputs:combat_damage_to_player"],
        retrievalBucket: "PAYOFFS",
        linkedSpecField: "requiredInputs:combat_damage_to_player",
        retrievalToken: "combat_damage_to_player",
        supportsCommanderDirectly: true,
        worksWithoutCommander: false,
        supportsIndependentEngine: false,
        bridgeStrength: 0.35,
      },
    ],
    INDEPENDENT_SYNERGY: [
      {
        id: "standalone-connive-shell",
        pathPriority: "CORE",
        causalRole: "CONVERSION_PIECE",
        targetMechanic: "Connive and discard/value synergies without Cyclonus",
        commanderMechanismSupported: "Parallel connive engines",
        oracleEvidence: "Connive",
        causalDefense: "Independent connive/value when commander absent.",
        sourceSemanticFields: ["desiredFunctions:connive"],
        matchConstraints: [],
        retrievalBucket: "CARD_ADVANTAGE",
        linkedSpecField: "desiredFunctions:connive",
        retrievalToken: "connive",
        supportsCommanderDirectly: false,
        worksWithoutCommander: true,
        supportsIndependentEngine: true,
        bridgeStrength: 0.25,
      },
    ],
    HARMONY: [
      {
        id: "connive-combat-bridge",
        pathPriority: "CORE",
        causalRole: "CONVERSION_PIECE",
        targetMechanic: "Creatures that connive from combat and support standalone value",
        commanderMechanismSupported: "Cyclonus combat → connive chain",
        oracleEvidence: "Connive",
        causalDefense: "Multi-role creatures bridge Cyclonus triggers and independent connive engines.",
        sourceSemanticFields: ["requiredInputs:combat_damage_to_player", "desiredFunctions:connive"],
        matchConstraints: [],
        retrievalBucket: "PAYOFFS",
        linkedSpecField: "requiredInputs:combat_damage_to_player",
        retrievalToken: "combat_damage_to_player",
        supportsCommanderDirectly: true,
        worksWithoutCommander: true,
        supportsIndependentEngine: true,
        bridgeStrength: 0.82,
      },
    ],
  },
};

function synthesizePathIntents(
  caseId: string,
  pathClass: BuildPathClass,
  meta: CaseMeta,
): PathCandidateIntent[] {
  const drafts = NO_CORE_PATH_SYNTHETICS[caseId]?.[pathClass] ?? [];
  return drafts.map((d) => ({
    ...d,
    intentId: `${pathIdFor(caseId, pathClass)}--${d.id}`,
    pathId: pathIdFor(caseId, pathClass),
    pathClass,
    caseId,
    semanticSlot:
      pathClass === "DEPENDENT_SYNERGY"
        ? `Commander-fed: ${d.targetMechanic}`
        : pathClass === "INDEPENDENT_SYNERGY"
          ? `Standalone shell: ${d.targetMechanic}`
          : `Bridge role: ${d.targetMechanic}`,
  }));
}

function pathObjectives(pathClass: BuildPathClass, profile: CaseCandidateIntentProfile): string[] {
  const base = profile.commanderMechanismSummary;
  switch (pathClass) {
    case "DEPENDENT_SYNERGY":
      return [
        "Maximize commander inputs and triggered lines",
        "Protect and repeat commander outputs",
        `Lean into: ${base.slice(0, 80)}…`,
      ];
    case "INDEPENDENT_SYNERGY":
      return [
        "Build self-contained engines using shared semantic themes",
        "Maintain function when command zone is empty",
        "Treat commander as enhancement, not requirement",
      ];
    case "HARMONY":
      return [
        "Maximize cross-support between commander and deck engines",
        "Prefer multi-role cards bridging both worlds",
        "Minimize dead-without-commander and commander-only dead cards",
      ];
  }
}

function pathAvoidPatterns(pathClass: BuildPathClass): string[] {
  switch (pathClass) {
    case "DEPENDENT_SYNERGY":
      return ["generic_goodstuff_without_commander_link", "low_synergy_when_commander_removed"];
    case "INDEPENDENT_SYNERGY":
      return ["commander_only_payoff_without_backup", "high_commander_tax_without_redundancy"];
    case "HARMONY":
      return ["single_role_commander_only_cards", "isolated_engine_without_bridge"];
  }
}

function intentKeySet(intents: PathCandidateIntent[]): Set<string> {
  return new Set(intents.map((i) => i.linkedSpecField + "|" + i.causalRole));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 1 : inter / union;
}

function computePathSeparationWarnings(paths: BuildPathProposal[]): string[] {
  const warnings: string[] = [];
  const pairs: [BuildPathClass, BuildPathClass][] = [
    ["DEPENDENT_SYNERGY", "INDEPENDENT_SYNERGY"],
    ["DEPENDENT_SYNERGY", "HARMONY"],
    ["INDEPENDENT_SYNERGY", "HARMONY"],
  ];
  for (const [a, b] of pairs) {
    const pa = paths.find((p) => p.pathClass === a)!;
    const pb = paths.find((p) => p.pathClass === b)!;
    const sa = intentKeySet([...pa.requiredCandidateIntents, ...pa.secondaryCandidateIntents]);
    const sb = intentKeySet([...pb.requiredCandidateIntents, ...pb.secondaryCandidateIntents]);
    const sim = jaccard(sa, sb);
    if (sim >= 0.85) {
      warnings.push(`LOW_PATH_SEPARATION:${a}<->${b}:${sim.toFixed(2)}`);
    }
  }
  return warnings;
}

function buildPathProposal(
  profile: CaseCandidateIntentProfile,
  pathClass: BuildPathClass,
  meta: CaseMeta,
): BuildPathProposal {
  const metaInfo = BUILD_PATH_CLASS_META[pathClass];
  const allBase = [...profile.coreIntents, ...profile.secondaryIntents];
  const pathIntents = allBase
    .map((i) => toPathIntent(i, pathClass, meta))
    .filter((i): i is PathCandidateIntent => i !== null);

  const synthetic = profile.noCoreDeclaration ? synthesizePathIntents(profile.caseId, pathClass, meta) : [];
  const combined = [...pathIntents, ...synthetic];

  const required = combined.filter((i) => i.pathPriority === "CORE");
  const secondary = combined.filter((i) => i.pathPriority === "SECONDARY");

  if (required.length === 0 && combined.length > 0) {
    required.push(combined[0]!);
  }

  const commanderOutputs = profile.coreIntents
    .filter((i) => i.causalRole === "PAYOFF_FOR_COMMANDER_OUTPUT")
    .map((i) => i.targetMechanic);

  return {
    pathId: pathIdFor(profile.caseId, pathClass),
    pathClass,
    caseId: profile.caseId,
    commandZoneConfiguration: meta.commandZoneConfiguration,
    commanders: meta.commanders,
    bracket: meta.bracket,
    title: metaInfo.title,
    summary: `${metaInfo.tagline} — ${profile.commanderMechanismSummary}`,
    pathTagline: metaInfo.tagline,
    commanderMechanismsUsed: [profile.commanderMechanismSummary],
    commanderZoneMembers: commanderZoneMembers(meta.commanders, profile.commanderMechanismSummary),
    dependencyProfile: {
      commanderDependency: metaInfo.dependency,
      commanderRemovalSensitivity: metaInfo.removalSensitivity,
    },
    deckSideObjectives: pathObjectives(pathClass, profile),
    commanderProvidedOutputs: commanderOutputs.length ? commanderOutputs : ["See commander Oracle outputs"],
    requiredCandidateIntents: required,
    secondaryCandidateIntents: secondary,
    avoidPatterns: pathAvoidPatterns(pathClass),
    semanticEvidence: [profile.commanderMechanismSummary],
    pathSeparationWarnings: [],
  };
}

export function generateBuildPathBundle(caseId: string): CommandZoneBuildPathBundle | null {
  const profile = getCandidateIntentProfile(caseId);
  if (!profile) return null;
  const meta = caseMeta(caseId);
  const buildPaths = PATH_CLASSES.map((pc) => buildPathProposal(profile, pc, meta)) as [
    BuildPathProposal,
    BuildPathProposal,
    BuildPathProposal,
  ];
  const warnings = computePathSeparationWarnings(buildPaths);
  for (const p of buildPaths) {
    p.pathSeparationWarnings = warnings;
  }
  return {
    caseId,
    commandZoneConfiguration: meta.commandZoneConfiguration,
    commanders: meta.commanders,
    bracket: meta.bracket,
    commanderMechanismSummary: profile.commanderMechanismSummary,
    buildPaths,
  };
}

export function generateAllBuildPathBundles(caseIds?: string[]): CommandZoneBuildPathBundle[] {
  const ids = caseIds ?? getAllCandidateIntentProfiles().map((p) => p.caseId);
  return ids.map((id) => generateBuildPathBundle(id)).filter((b): b is CommandZoneBuildPathBundle => b !== null);
}

export function countPathCandidateIntents(bundle: CommandZoneBuildPathBundle): number {
  return bundle.buildPaths.reduce(
    (n, p) => n + p.requiredCandidateIntents.length + p.secondaryCandidateIntents.length,
    0,
  );
}
