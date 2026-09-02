/**
 * CommandZoneComposition — Phase 5.5 multi-command-zone synthesis layer.
 * Distinguishes independent member directions from pair-emergent cross-support plans.
 */
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import type { ShadowSemanticIndex } from "../commander-strategy/shadow-semantic-index";
import type {
  CommanderBuildDirection,
  CommanderMechanicalProfile,
  DirectionAnchor,
  RetrievalSpecification,
} from "./archetype-discovery-types-v1";
import type { CatalogRoleIndex } from "./catalog-feasibility-v1";
import { buildCommanderMechanicalProfile } from "./commander-mechanical-profile-v1";
import { discoverCommanderBuildDirections } from "./commander-build-direction-v1";
import { extractMechanicalMotifs } from "./mechanical-motifs-v1";
import { extractDirectionAnchors, buildRetrievalSpecification, computeRetrievalSpecificationCompleteness } from "./direction-anchor-v1";
import { mergeRetrievalSpecificationsSemantic } from "./composite-direction-v1";

function mergeRetrievalSpecs(specs: RetrievalSpecification[]): RetrievalSpecification {
  return mergeRetrievalSpecificationsSemantic({
    componentSpecs: specs,
    composition: {
      sharedRequirements: [...new Set(specs.flatMap((s) => s.requiredInputs))],
      complementaryRequirements: [],
      sharedOutputs: [...new Set(specs.flatMap((s) => s.outputsToExploit))],
      crossSupportEdges: [],
    },
  });
}

export type CommandZoneConfiguration = "single_commander" | "partner_pair" | "commander_with_background";

export type CrossCommanderRelationship =
  | "output_to_input"
  | "requiredState_to_producedState"
  | "payoff_to_enabler"
  | "resource_flow"
  | "feedback"
  | "cross_support";

export type CrossCommanderEdge = {
  edgeId: string;
  fromMemberIndex: number;
  toMemberIndex: number;
  relationship: CrossCommanderRelationship;
  sourceMechanism: string;
  targetMechanism: string;
  evidence: string[];
};

export type CommandZoneMember = {
  oracleId: string;
  name: string;
  typeLine: string;
  individualProfile: CommanderMechanicalProfile;
  individualMotifs: ReturnType<typeof extractMechanicalMotifs>;
  individualAnchors: DirectionAnchor[];
  independentDirections: CommanderBuildDirection[];
};

export type CompositionRelationshipType =
  | "INDEPENDENT_PARALLEL_PLANS"
  | "COMPLEMENTARY_PLAN"
  | "CROSS_SUPPORT_ENGINE"
  | "BIDIRECTIONAL_ENGINE"
  | "CONFLICTING_PLANS";

export type CrossSupportStrength = "NONE" | "LOW" | "MEDIUM" | "HIGH";

export type SuppressedMemberDirection = {
  directionId: string;
  memberOracleId: string;
  suppressionReason: string;
  conflictEvidence: string[];
};

export type FeedbackLoopTrace = {
  loopId: string;
  members: string[];
  edges: string[];
  resources: string[];
  loopStrength: number;
  evidenceRefs: string[];
};

export type CommandZoneCompositionProfessorFields = {
  independentPlans: CommanderBuildDirection[];
  complementaryPlans: CommanderBuildDirection[];
  competingDirections: CommanderBuildDirection[];
  crossSupportStrength: CrossSupportStrength;
  crossSupportEdges: CrossCommanderEdge[];
  feedbackLoops: FeedbackLoopTrace[];
  unresolvedDirectionAmbiguity: string[];
  correctAbstentionReason: string | null;
};

export type CommandZoneComposition = {
  members: CommandZoneMember[];
  combinedColorIdentity: string[];
  configuration: CommandZoneConfiguration;
  compositionTypes: CompositionRelationshipType[];
  preservedMemberDirections: CommanderBuildDirection[];
  independentDirections: CommanderBuildDirection[];
  sharedDirections: CommanderBuildDirection[];
  crossSupportDirections: CommanderBuildDirection[];
  complementaryAnchors: DirectionAnchor[];
  conflictingAnchors: DirectionAnchor[];
  suppressedDirections: SuppressedMemberDirection[];
  resourceFlows: CrossCommanderEdge[];
  feedbackLoops: CrossCommanderEdge[];
  feedbackLoopTraces: FeedbackLoopTrace[];
  combinedRetrievalSpecification: RetrievalSpecification | null;
  compositionEvidence: string[];
  buildDirections: CommanderBuildDirection[];
  professorFields: CommandZoneCompositionProfessorFields;
};

function detectConfiguration(catalog: DeckResolutionCatalog, oracleIds: string[]): CommandZoneConfiguration {
  if (oracleIds.length <= 1) return "single_commander";
  const types = oracleIds.map((id) => (catalog.byOracleId.get(id)?.typeLine ?? "").toLowerCase());
  if (types.some((t) => t.includes("background"))) return "commander_with_background";
  return "partner_pair";
}

function buildMember(input: {
  oracleId: string;
  catalog: DeckResolutionCatalog;
  shadowIndex: ShadowSemanticIndex;
  roleIndex?: CatalogRoleIndex;
}): CommandZoneMember | null {
  const card = input.catalog.byOracleId.get(input.oracleId);
  if (!card) return null;
  const profile = buildCommanderMechanicalProfile({
    commanderOracleIds: [input.oracleId],
    catalogByOracleId: input.catalog.byOracleId,
    shadowIndex: input.shadowIndex,
  });
  if (!profile) return null;
  const motifs = extractMechanicalMotifs(profile);
  const anchors = extractDirectionAnchors({ profile, motifs });
  const independentDirections = discoverCommanderBuildDirections({ profile, roleIndex: input.roleIndex });
  return {
    oracleId: input.oracleId,
    name: card.canonicalName ?? input.oracleId,
    typeLine: card.typeLine ?? "",
    individualProfile: profile,
    individualMotifs: motifs,
    individualAnchors: anchors,
    independentDirections,
  };
}

function memberProduces(causal: CommandZoneMember["individualProfile"]["causalRoles"], resource: string): boolean {
  return (
    causal.engineOutputs.includes(resource) ||
    causal.resourcesProduced.includes(resource) ||
    causal.engineActions.includes(resource)
  );
}

function memberConsumes(causal: CommandZoneMember["individualProfile"]["causalRoles"], resource: string): boolean {
  return (
    causal.engineInputs.includes(resource) ||
    causal.resourcesConsumed.includes(resource) ||
    causal.costConsumes.includes(resource)
  );
}

function detectCrossCommanderEdges(members: CommandZoneMember[]): CrossCommanderEdge[] {
  const edges: CrossCommanderEdge[] = [];
  for (let i = 0; i < members.length; i += 1) {
    for (let j = 0; j < members.length; j += 1) {
      if (i === j) continue;
      const a = members[i]!.individualProfile.causalRoles;
      const b = members[j]!.individualProfile.causalRoles;

      if (a.engineActions.includes("token_production") && b.engineCosts.includes("sacrifice")) {
        edges.push({
          edgeId: `edge:token_sacrifice:${i}:${j}`,
          fromMemberIndex: i,
          toMemberIndex: j,
          relationship: "output_to_input",
          sourceMechanism: "TOKEN_GENERATION",
          targetMechanism: "SACRIFICE_ENGINE",
          evidence: ["tokens_enable_sacrifice_outlets"],
        });
      }

      if (
        a.engineActions.includes("token_production") &&
        b.activatedActions?.some((act) => act.costType === "sacrifice")
      ) {
        edges.push({
          edgeId: `edge:token_sacrifice_activated:${i}:${j}`,
          fromMemberIndex: i,
          toMemberIndex: j,
          relationship: "resource_flow",
          sourceMechanism: "TOKEN_GENERATION",
          targetMechanism: "SACRIFICE_ENGINE",
          evidence: ["tokens_as_sacrifice_fodder"],
        });
      }

      const aSecondSpell = a.spellCastEvents?.some((e) => e.ordinal === 2);
      const bSecondSpell =
        b.spellCastEvents?.some((e) => e.ordinal === 2) ||
        b.stateScaling?.some((s) => s.scalingBasis.includes("second_spell") || s.scalingBasis.includes("nth_spell_2"));
      if (aSecondSpell && bSecondSpell) {
        edges.push({
          edgeId: `edge:second_spell:${i}:${j}`,
          fromMemberIndex: i,
          toMemberIndex: j,
          relationship: "feedback",
          sourceMechanism: "SPELL_CAST_TRIGGER",
          targetMechanism: "SPELL_COST_REDUCTION",
          evidence: ["second_spell_frequency_synergy"],
        });
        edges.push({
          edgeId: `edge:second_spell_rev:${j}:${i}`,
          fromMemberIndex: j,
          toMemberIndex: i,
          relationship: "feedback",
          sourceMechanism: "SPELL_COST_REDUCTION",
          targetMechanism: "SPELL_CAST_TRIGGER",
          evidence: ["spell_cost_reduction_enables_draw_engine"],
        });
      }

      for (const buffA of a.staticTypalBuffs ?? []) {
        for (const buffB of b.staticTypalBuffs ?? []) {
          if (buffA.creatureType !== buffB.creatureType && buffA.creatureType !== "keyword_density") {
            edges.push({
              edgeId: `edge:typal:${i}:${j}:${buffA.creatureType}:${buffB.creatureType}`,
              fromMemberIndex: i,
              toMemberIndex: j,
              relationship: "cross_support",
              sourceMechanism: "STATIC_TYPAL_BUFF",
              targetMechanism: "STATIC_TYPAL_BUFF",
              evidence: [`multi_typal:${buffA.creatureType}+${buffB.creatureType}`],
            });
          }
        }
      }

      if (memberProduces(a, "card_draw") && memberConsumes(b, "counters")) {
        edges.push({
          edgeId: `edge:draw_to_counter:${i}:${j}`,
          fromMemberIndex: i,
          toMemberIndex: j,
          relationship: "output_to_input",
          sourceMechanism: "DRAW_ENGINE",
          targetMechanism: "COUNTER_PLACEMENT",
          evidence: ["draw_feeds_counter_engine"],
        });
      }

      if (
        a.outputMultipliers?.some((m) => m.multiplierType === "counter_doubling") &&
        memberProduces(b, "counters")
      ) {
        edges.push({
          edgeId: `edge:counter_multiplier:${i}:${j}`,
          fromMemberIndex: i,
          toMemberIndex: j,
          relationship: "feedback",
          sourceMechanism: "COUNTER_MULTIPLIER",
          targetMechanism: "COUNTER_PLACEMENT",
          evidence: ["counter_multiplier_amplifies_placement"],
        });
      }

      if (a.engineTriggers.includes("leave_battlefield_trigger") && memberProduces(b, "counters")) {
        edges.push({
          edgeId: `edge:leave_to_draw:${i}:${j}`,
          fromMemberIndex: i,
          toMemberIndex: j,
          relationship: "feedback",
          sourceMechanism: "COUNTER_STOCK",
          targetMechanism: "DRAW_ENGINE",
          evidence: ["leave_battlefield_converts_counters_to_draw"],
        });
      }

      if (memberProduces(a, "counters") && memberConsumes(b, "card_draw_events")) {
        edges.push({
          edgeId: `edge:counter_to_draw:${i}:${j}`,
          fromMemberIndex: i,
          toMemberIndex: j,
          relationship: "feedback",
          sourceMechanism: "COUNTER_PLACEMENT",
          targetMechanism: "DRAW_ENGINE",
          evidence: ["counter_stock_draw_loop"],
        });
      }
    }
  }
  return edges;
}

function detectFeedbackLoopTraces(input: {
  members: CommandZoneMember[];
  edges: CrossCommanderEdge[];
}): FeedbackLoopTrace[] {
  const feedbackEdges = input.edges.filter((e) => e.relationship === "feedback");
  if (feedbackEdges.length < 2) return [];

  const traces: FeedbackLoopTrace[] = [];
  const byFrom = new Map<number, CrossCommanderEdge[]>();
  for (const edge of feedbackEdges) {
    const list = byFrom.get(edge.fromMemberIndex) ?? [];
    list.push(edge);
    byFrom.set(edge.fromMemberIndex, list);
  }

  for (const start of feedbackEdges) {
    const visited = new Set<string>([start.edgeId]);
    const chain = [start];
    let current = start;
    for (let step = 0; step < 6; step += 1) {
      const next = feedbackEdges.find(
        (e) =>
          e.fromMemberIndex === current.toMemberIndex &&
          !visited.has(e.edgeId) &&
          (e.toMemberIndex === start.fromMemberIndex || step < 4),
      );
      if (!next) break;
      chain.push(next);
      visited.add(next.edgeId);
      current = next;
      if (next.toMemberIndex === start.fromMemberIndex && chain.length >= 2) {
        traces.push({
          loopId: `loop:${start.edgeId}`,
          members: [...new Set(chain.flatMap((e) => [input.members[e.fromMemberIndex]?.name ?? "", input.members[e.toMemberIndex]?.name ?? ""]))].filter(Boolean),
          edges: chain.map((e) => e.edgeId),
          resources: [...new Set(chain.flatMap((e) => [e.sourceMechanism, e.targetMechanism]))],
          loopStrength: Math.min(1, 0.55 + chain.length * 0.12),
          evidenceRefs: chain.flatMap((e) => e.evidence),
        });
        break;
      }
    }
  }

  return traces.filter(
    (trace, idx, all) => all.findIndex((t) => t.edges.join("|") === trace.edges.join("|")) === idx,
  );
}

function classifyCompositionTypes(input: {
  members: CommandZoneMember[];
  edges: CrossCommanderEdge[];
  feedbackLoopTraces: FeedbackLoopTrace[];
  preservedMemberDirections: CommanderBuildDirection[];
}): CompositionRelationshipType[] {
  const types: CompositionRelationshipType[] = [];
  const hasFeedback = input.feedbackLoopTraces.length > 0;
  const hasCrossSupport = input.edges.some((e) => e.relationship === "cross_support" || e.relationship === "output_to_input");
  const memberDirectionCount = input.preservedMemberDirections.length;

  if (hasFeedback && hasCrossSupport) types.push("BIDIRECTIONAL_ENGINE");
  else if (hasFeedback) types.push("BIDIRECTIONAL_ENGINE");
  else if (hasCrossSupport && input.edges.filter((e) => e.relationship !== "feedback").length > 0) {
    types.push("CROSS_SUPPORT_ENGINE");
  }

  if (memberDirectionCount >= 2 && !hasCrossSupport && !hasFeedback) {
    types.push("INDEPENDENT_PARALLEL_PLANS");
  } else if (memberDirectionCount >= 2 && (hasCrossSupport || hasFeedback)) {
    types.push("COMPLEMENTARY_PLAN");
  } else if (memberDirectionCount >= 2) {
    types.push("INDEPENDENT_PARALLEL_PLANS");
  }

  if (types.length === 0 && memberDirectionCount >= 1) {
    types.push(input.members.length > 1 ? "INDEPENDENT_PARALLEL_PLANS" : "COMPLEMENTARY_PLAN");
  }

  return [...new Set(types)];
}

function crossSupportStrengthFromEdges(edges: CrossCommanderEdge[], feedbackTraces: FeedbackLoopTrace[]): CrossSupportStrength {
  if (feedbackTraces.length > 0) return feedbackTraces.some((t) => t.loopStrength >= 0.75) ? "HIGH" : "MEDIUM";
  if (edges.length >= 3) return "MEDIUM";
  if (edges.length >= 1) return "LOW";
  return "NONE";
}

function preserveMemberDirections(input: {
  members: CommandZoneMember[];
  crossSupportDirections: CommanderBuildDirection[];
  conflictingAnchors: DirectionAnchor[];
}): {
  preserved: CommanderBuildDirection[];
  suppressed: SuppressedMemberDirection[];
} {
  const preserved: CommanderBuildDirection[] = [];
  const suppressed: SuppressedMemberDirection[] = [];

  for (const member of input.members) {
    for (const direction of member.independentDirections) {
      const conflict = input.conflictingAnchors.find((a) =>
        direction.directionAnchors.some((da) => da.subject === a.subject && da.mechanism === a.mechanism),
      );
      if (conflict) {
        suppressed.push({
          directionId: direction.directionId,
          memberOracleId: member.oracleId,
          suppressionReason: "deterministic_conflict_in_combined_command_zone",
          conflictEvidence: conflict.evidenceRefs,
        });
        continue;
      }
      preserved.push({
        ...direction,
        directionKind: "SINGLE",
        mechanicalDescription: `${member.name}: ${direction.mechanicalDescription}`,
      });
    }
  }

  return { preserved, suppressed };
}

function composeCrossSupportDirection(input: {
  members: CommandZoneMember[];
  edges: CrossCommanderEdge[];
  combinedProfile: CommanderMechanicalProfile;
  configuration: CommandZoneConfiguration;
  roleIndex?: CatalogRoleIndex;
}): CommanderBuildDirection | null {
  if (input.edges.length === 0) return null;

  const anchorCandidates = input.members.flatMap((m) => m.individualAnchors);
  const edgeAnchors: DirectionAnchor[] = input.edges.slice(0, 4).map((edge, idx) => ({
    anchorId: `anchor:composition:${idx + 1}`,
    anchorKind: "STATE_DEPENDENCY" as const,
    mechanism: edge.sourceMechanism as DirectionAnchor["mechanism"],
    subject: `${input.members[edge.fromMemberIndex]?.name ?? "A"}→${input.members[edge.toMemberIndex]?.name ?? "B"}`,
    requirement: edge.targetMechanism,
    sourceAbilityRef: edge.relationship,
    evidenceRefs: edge.evidence,
  }));

  const allAnchors = [...anchorCandidates, ...edgeAnchors];
  if (allAnchors.length < 2) return null;

  const motifs = extractMechanicalMotifs(input.combinedProfile);
  const drivers = new Set<string>();
  for (const edge of input.edges) {
    drivers.add(edge.sourceMechanism);
    drivers.add(edge.targetMechanism);
  }
  for (const m of motifs.filter((x) => x.causalPosition === "DRIVER")) {
    drivers.add(m.motifId);
  }

  const driverList = [...drivers].slice(0, 4);
  const payoffs = motifs.filter((m) => m.causalPosition === "PAYOFF").map((m) => m.motifId).slice(0, 3);
  const mechanicalDescription = `COMPOSITE: ${driverList.join(" + ")} (${input.configuration})`;

  const retrievalSpecification = (() => {
    const memberSpecs = input.members
      .flatMap((m) => m.independentDirections.slice(0, 1))
      .map((d) => d.retrievalSpecification)
      .filter(Boolean);
    const base =
      memberSpecs.length > 0
        ? mergeRetrievalSpecs(memberSpecs)
        : buildRetrievalSpecification({
            profile: input.combinedProfile,
            anchors: allAnchors,
            motifs,
            requiredSupportFunctions: [],
            optionalSupportFunctions: [],
          });
    return base;
  })();
  for (const edge of input.edges) {
    if (edge.relationship === "output_to_input" && edge.targetMechanism === "SACRIFICE_ENGINE") {
      if (!retrievalSpecification.requiredInputs.includes("sacrifice_fodder")) {
        retrievalSpecification.requiredInputs.push("sacrifice_fodder");
      }
    }
    if (edge.relationship === "feedback" && edge.sourceMechanism.includes("SPELL")) {
      if (!retrievalSpecification.requiredInputs.includes("spell_density")) {
        retrievalSpecification.requiredInputs.push("spell_density");
      }
      retrievalSpecification.structuralNeeds.push("second_spell_engine");
    }
    if (edge.relationship === "cross_support") {
      retrievalSpecification.structuralNeeds.push("multi_typal_board");
    }
  }

  const completeness = computeRetrievalSpecificationCompleteness(retrievalSpecification);

  return {
    rank: 1,
    directionId: "direction:command_zone_composite:1",
    directionKind: "COMPOSITE",
    directionAnchors: allAnchors.slice(0, 6),
    compositeComposition: {
      componentAnchors: allAnchors.slice(0, 4),
      sharedRequirements: [...new Set(input.edges.flatMap((e) => e.evidence))],
      complementaryRequirements: input.edges.map((e) => `${e.sourceMechanism}→${e.targetMechanism}`),
      sharedOutputs: driverList,
      crossSupportEdges: input.edges.map((e) => ({
        fromAnchorId: allAnchors[0]?.anchorId ?? e.edgeId,
        toAnchorId: allAnchors[1]?.anchorId ?? e.edgeId,
        relationship: "enables" as const,
        note: e.evidence.join("; "),
      })),
      combinedRetrievalSpecification: retrievalSpecification,
    },
    drivers: driverList,
    conditions: [],
    resourcesConsumed: input.combinedProfile.causalRoles.resourcesConsumed,
    resourcesProduced: input.combinedProfile.causalRoles.resourcesProduced,
    engineActions: input.combinedProfile.causalRoles.engineActions,
    payoffs,
    feedbackLoops: input.edges.filter((e) => e.relationship === "feedback").map((e) => e.edgeId),
    requiredSupportFunctions: [],
    optionalSupportFunctions: [],
    commandZoneEvidence: input.edges.flatMap((e) => e.evidence),
    mechanicalVector: [],
    supportStrength: 0.72,
    repeatability: input.combinedProfile.causalRoles.repeatability,
    centrality: 0.85,
    mappedArchetypeId: null,
    mappedArchetypeLabel: null,
    labelConfidence: null,
    mechanicalDescription,
    subDirectionIds: driverList,
    status: "MECHANICAL_DIRECTION_ONLY",
    catalogFeasibility: null,
    causalChainStatus: "COMPLETE",
    driverCoverage: 0.85,
    conditionCoverage: 0.7,
    engineCoverage: 0.8,
    outputCoverage: 0.75,
    payoffCoverage: 0.7,
    evidenceCoverage: 0.85,
    driverProvenance: driverList.map((d) => ({
      motifId: d,
      source: "ANCHOR_DERIVED" as const,
      evidence: input.edges.flatMap((e) => e.evidence),
    })),
    directionValidity: "ANCHORED",
    retrievalSpecification,
    retrievalSpecificationCompleteness: completeness,
    phase6RetrievalReady: completeness >= 0.45,
  };
}

export function buildCommandZoneComposition(input: {
  commanderOracleIds: string[];
  catalog: DeckResolutionCatalog;
  shadowIndex: ShadowSemanticIndex;
  combinedProfile: CommanderMechanicalProfile;
  roleIndex?: CatalogRoleIndex;
}): CommandZoneComposition {
  const configuration = detectConfiguration(input.catalog, input.commanderOracleIds);
  const members = input.commanderOracleIds
    .map((oracleId) => buildMember({ oracleId, catalog: input.catalog, shadowIndex: input.shadowIndex, roleIndex: input.roleIndex }))
    .filter((m): m is CommandZoneMember => Boolean(m));

  const independentDirections = members.flatMap((m) => m.independentDirections);
  const edges = detectCrossCommanderEdges(members);
  const feedbackLoops = edges.filter((e) => e.relationship === "feedback");
  const feedbackLoopTraces = detectFeedbackLoopTraces({ members, edges });
  const resourceFlows = edges.filter((e) => e.relationship === "output_to_input" || e.relationship === "resource_flow");

  const crossSupportDirection = composeCrossSupportDirection({
    members,
    edges,
    combinedProfile: input.combinedProfile,
    configuration,
    roleIndex: input.roleIndex,
  });

  const crossSupportDirections = crossSupportDirection ? [crossSupportDirection] : [];
  const sharedDirections: CommanderBuildDirection[] = [];
  const conflictingAnchors: DirectionAnchor[] = [];

  const { preserved: preservedMemberDirections, suppressed: suppressedDirections } = preserveMemberDirections({
    members,
    crossSupportDirections,
    conflictingAnchors,
  });

  const compositionTypes = classifyCompositionTypes({
    members,
    edges,
    feedbackLoopTraces,
    preservedMemberDirections,
  });

  const crossSupportStrength = crossSupportStrengthFromEdges(edges, feedbackLoopTraces);

  const combinedFallback =
    preservedMemberDirections.length === 0
      ? discoverCommanderBuildDirections({
          profile: input.combinedProfile,
          roleIndex: input.roleIndex,
        })
      : [];

  const buildDirections = [
    ...crossSupportDirections,
    ...preservedMemberDirections,
    ...combinedFallback,
  ]
    .filter((d, idx, all) => all.findIndex((x) => x.mechanicalDescription === d.mechanicalDescription) === idx)
    .sort((a, b) => b.supportStrength - a.supportStrength)
    .slice(0, 6)
    .map((d, i) => ({ ...d, rank: i + 1 }));

  const combinedRetrievalSpecification =
    buildDirections[0]?.retrievalSpecification ??
    (crossSupportDirection?.retrievalSpecification ?? null);

  const professorFields: CommandZoneCompositionProfessorFields = {
    independentPlans: preservedMemberDirections,
    complementaryPlans: crossSupportDirections,
    competingDirections: sharedDirections,
    crossSupportStrength,
    crossSupportEdges: edges,
    feedbackLoops: feedbackLoopTraces,
    unresolvedDirectionAmbiguity:
      compositionTypes.includes("INDEPENDENT_PARALLEL_PLANS") && crossSupportStrength === "NONE"
        ? ["weak_mechanical_coupling_between_member_plans"]
        : compositionTypes.includes("INDEPENDENT_PARALLEL_PLANS") && crossSupportStrength === "LOW"
          ? ["member_plans_are_defensible_but_weakly_coupled"]
          : [],
    correctAbstentionReason:
      preservedMemberDirections.length >= 2 && crossSupportDirections.length === 0
        ? "INDEPENDENT_PARALLEL_PLANS — no unified synergy required"
        : null,
  };

  return {
    members,
    combinedColorIdentity: input.combinedProfile.colorIdentity,
    configuration,
    compositionTypes,
    preservedMemberDirections,
    independentDirections,
    sharedDirections,
    crossSupportDirections,
    complementaryAnchors: members.flatMap((m) => m.individualAnchors),
    conflictingAnchors,
    suppressedDirections,
    resourceFlows,
    feedbackLoops,
    feedbackLoopTraces,
    combinedRetrievalSpecification,
    compositionEvidence: edges.flatMap((e) => e.evidence),
    buildDirections,
    professorFields,
  };
}
