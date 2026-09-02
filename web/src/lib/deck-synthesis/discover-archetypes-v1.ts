/**
 * Phase 5 — discoverArchetypes() orchestrator.
 * Discovery/ranking only — no deck construction or optimization.
 */
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import type { ShadowSemanticIndex } from "../commander-strategy/shadow-semantic-index";
import { COMMANDER_BRACKET_POLICY_SNAPSHOT_VERSION } from "../bracket-policy/bracket-policy-v1";
import type { CommanderBracket } from "../bracket-policy/bracket-policy-v1";
import { buildCommanderMechanicalProfile } from "./commander-mechanical-profile-v1";
import {
  hasWeakEnginePayoffChain,
  isIncidentalOnlySupport,
  passesPatternPrerequisites,
  scoreCommanderHypotheses,
  type ScoredHypothesis,
} from "./commander-support-v1";
import {
  discoverCommanderBuildDirections,
  hasValidBuildDirection,
} from "./commander-build-direction-v1";
import { detectEvaluationContext } from "./direction-anchor-v1";
import { buildCommandZoneComposition } from "./command-zone-composition-v1";
import { subArchetypesForPrimary } from "./archetype-hierarchy-v1";
import {
  assessCatalogFeasibility,
  buildCatalogRoleIndex,
  commanderNamesFromCatalog,
  filterCatalogRoleIndex,
  isCatalogFeasible,
} from "./catalog-feasibility-v1";
import { assessBracketFeasibility } from "./bracket-feasibility-v1";
import { mapMechanicalPatternToHumanLabel } from "./human-label-mapping-v1";
import {
  archetypeDistance,
  detectHybridArchetype,
  mergeMechanicallyRedundantHypotheses,
  nearestCompetingArchetypes,
} from "./archetype-distinctness-v1";
import {
  ARCHETYPE_DISCOVERY_V1_VERSION,
  type ArchetypeDiscoveryReport,
  type ArchetypeSignature,
  type DiscoverArchetypesInput,
  type DiscoveredArchetype,
  type RejectedArchetypeHypothesis,
  type WhyNotSurfacedReason,
  type HypothesisLifecycleAccounting,
} from "./archetype-discovery-types-v1";

export type DiscoverArchetypesContext = {
  catalog: DeckResolutionCatalog;
  shadowIndex: ShadowSemanticIndex;
  /** Optional prebuilt global index — avoids rebuilding for each commander in benchmarks. */
  globalCatalogIndex?: import("./catalog-feasibility-v1").GlobalCatalogSemanticIndex;
};

function buildArchetypeSignature(input: {
  hypothesis: ScoredHypothesis;
  census: ReturnType<typeof assessCatalogFeasibility>;
  bracketFeasibility: ReturnType<typeof assessBracketFeasibility>;
  humanLabel: ReturnType<typeof mapMechanicalPatternToHumanLabel>;
  profile: ReturnType<typeof buildCommanderMechanicalProfile>;
}): ArchetypeSignature {
  const { hypothesis, census, bracketFeasibility, humanLabel, profile } = input;
  const pattern = hypothesis.pattern;
  const engineStage = pattern.chain.find((s) => s.stage === "ENGINE")?.mechanic ?? "engine";
  const payoffStage = pattern.chain.find((s) => s.stage === "PAYOFF")?.mechanic ?? "payoff";
  const resourceStage = pattern.chain.find((s) => s.stage === "INPUT")?.mechanic ?? "resources";
  const interactionStage = pattern.requiredFunctions.find((f) => f.includes("interaction")) ?? "interaction";

  return {
    archetypeId: pattern.patternId,
    primaryAxes: pattern.primaryAxes,
    secondaryAxes: pattern.secondaryAxes,
    commanderActions: profile?.topActions ?? [],
    commanderRoles: Object.keys(hypothesis.support.roleScores).filter((r) => (hypothesis.support.roleScores[r] ?? 0) > 0),
    commanderReliance: Object.keys(hypothesis.support.axisScores).filter((k) => (hypothesis.support.axisScores[k] ?? 0) >= 0.2),
    requiredFunctions: pattern.requiredFunctions,
    supportingFunctions: pattern.supportingFunctions,
    enginePattern: engineStage,
    payoffPattern: payoffStage,
    resourcePattern: resourceStage,
    interactionPattern: interactionStage,
    winPlanSignals: pattern.winPlanSignals,
    commanderEvidenceRefs: hypothesis.support.evidenceRefs,
    catalogFeasibility: census,
    bracketFeasibility,
    mechanicalVector: hypothesis.mechanicalVector,
    humanLabel: humanLabel.humanLabel,
    humanLabelConfidence: humanLabel.humanLabelConfidence,
    humanLabelSource: humanLabel.humanLabelSource,
  };
}

function buildRouteOverlayPreview(input: {
  commanderOracleId: string;
  patternId: string;
  routeColorId: string;
  engineMechanic: string;
  structuralDemands: string[];
}): DiscoveredArchetype["routeOverlayPreview"] {
  return {
    commanderNodeId: input.commanderOracleId,
    routeColorId: input.routeColorId,
    engineStageIds: [`hub:engine:${input.engineMechanic}`],
    packageHubIds: [`hub:package:${input.patternId}`],
    reasonGroupHints: input.structuralDemands,
  };
}

const ARCHETYPE_KIND_RANK: Record<string, number> = {
  MECHANICAL_ENGINE: 0,
  HYBRID_ENGINE: 1,
  GENERIC_VALUE_FALLBACK: 2,
};

function rankScore(archetype: DiscoveredArchetype): number {
  const s = archetype.commanderArchetypeSupport;
  return (
    s.driverSupport * 0.45 +
    s.feedbackSupport * 0.15 +
    s.discoverySupport * 0.25 +
    archetype.catalogFeasibilityEvidence.feasibilitySupport * 0.15
  );
}

function pushSurfacedArchetype(input: {
  surfaced: DiscoveredArchetype[];
  hypothesis: ScoredHypothesis;
  subArchetypes: string[];
  signature: ArchetypeSignature;
  census: ReturnType<typeof assessCatalogFeasibility>;
  bracketFeasibility: ReturnType<typeof assessBracketFeasibility>;
  humanLabel: ReturnType<typeof mapMechanicalPatternToHumanLabel>;
  commanderOracleId: string;
  subArchetypeIds: string[];
  labelConfidenceCap?: number;
}): void {
  const pattern = input.hypothesis.pattern;
  input.surfaced.push({
    rank: 0,
    archetypeId: pattern.patternId,
    archetypeKind: pattern.archetypeKind,
    mechanicalName: pattern.mechanicalName,
    humanLabel: input.humanLabel.humanLabel,
    humanLabelConfidence: input.labelConfidenceCap
      ? Math.min(input.humanLabel.humanLabelConfidence, input.labelConfidenceCap)
      : input.humanLabel.humanLabelConfidence,
    humanLabelSource: input.humanLabel.humanLabelSource,
    archetypeSignature: input.signature,
    commanderArchetypeSupport: input.hypothesis.support,
    catalogFeasibilityEvidence: input.census,
    primaryEngineChain: input.hypothesis.mechanicEdges,
    secondaryMechanics: input.subArchetypes,
    hybridWith: null,
    hybridReason: null,
    primaryArchetypeId: pattern.patternId,
    subArchetypeIds: input.subArchetypeIds,
    likelyStructuralDemands: pattern.structuralDemands,
    bracket: input.bracketFeasibility,
    nearestCompetingArchetypes: [],
    routeOverlayPreview: buildRouteOverlayPreview({
      commanderOracleId: input.commanderOracleId,
      patternId: pattern.patternId,
      routeColorId: `route:${pattern.patternId}`,
      engineMechanic: input.signature.enginePattern,
      structuralDemands: pattern.structuralDemands,
    }),
  });
}

export function discoverArchetypes(
  input: DiscoverArchetypesInput,
  ctx: DiscoverArchetypesContext,
): ArchetypeDiscoveryReport {
  const profile = buildCommanderMechanicalProfile({
    commanderOracleIds: input.commanderOracleIds,
    catalogByOracleId: ctx.catalog.byOracleId,
    shadowIndex: ctx.shadowIndex,
  });

  if (!profile) {
    throw new Error("Unable to build commander mechanical profile — missing commander semantics.");
  }

  const roleIndex = ctx.globalCatalogIndex
    ? filterCatalogRoleIndex(ctx.globalCatalogIndex, profile.colorIdentity)
    : buildCatalogRoleIndex({
        catalog: ctx.catalog,
        shadowIndex: ctx.shadowIndex,
        colorIdentity: profile.colorIdentity,
      });

  const commandZoneComposition =
    input.commanderOracleIds.length > 1
      ? buildCommandZoneComposition({
          commanderOracleIds: input.commanderOracleIds,
          catalog: ctx.catalog,
          shadowIndex: ctx.shadowIndex,
          combinedProfile: profile,
          roleIndex,
        })
      : null;

  const buildDirections =
    commandZoneComposition?.buildDirections ??
    discoverCommanderBuildDirections({ profile, roleIndex });
  const evalContext = detectEvaluationContext({
    profile,
    commanderOracleIds: input.commanderOracleIds,
    oracleTexts: input.commanderOracleIds.map((id) => ctx.catalog.byOracleId.get(id)?.oracleText ?? ""),
  });

  const stageAHypotheses = scoreCommanderHypotheses(profile);
  const { merged, duplicateRejections } = mergeMechanicallyRedundantHypotheses(stageAHypotheses);

  const rejectedHypotheses: RejectedArchetypeHypothesis[] = [];
  const whyNotSurfacedDistribution: Record<WhyNotSurfacedReason, number> = {
    INCIDENTAL_COMMANDER_SUPPORT: 0,
    INSUFFICIENT_LEGAL_CATALOG_SUPPORT: 0,
    DUPLICATE_MECHANICAL_SIGNATURE: 0,
    BRACKET_HARD_INCOMPATIBLE: 0,
    WEAK_ENGINE_PAYOFF_CHAIN: 0,
  };

  for (const dup of duplicateRejections) {
    whyNotSurfacedDistribution.DUPLICATE_MECHANICAL_SIGNATURE += 1;
    rejectedHypotheses.push({
      archetypeId: dup.patternId,
      mechanicalName: dup.patternId,
      reasons: ["DUPLICATE_MECHANICAL_SIGNATURE"],
      detail: `Merged into ${dup.mergedInto} (similarity=${dup.similarity.toFixed(3)})`,
      discoverySupport: stageAHypotheses.find((h) => h.pattern.patternId === dup.patternId)?.support.discoverySupport ?? 0,
      feasibilitySupport: null,
    });
  }

  const surfaced: DiscoveredArchetype[] = [];
  const candidateVectors: Array<{ archetypeId: string; mechanicalName: string; vector: number[] }> = [];

  const commanderOracleId = input.commanderOracleIds[0] ?? "";
  const qualifyingPatternIds = stageAHypotheses.filter((h) => passesPatternPrerequisites(h)).map((h) => h.pattern.patternId);

  for (const { primary, subArchetypes } of merged) {
    const hypothesis = primary;
    const pattern = hypothesis.pattern;

    if (!passesPatternPrerequisites(hypothesis)) {
      whyNotSurfacedDistribution.WEAK_ENGINE_PAYOFF_CHAIN += 1;
      rejectedHypotheses.push({
        archetypeId: pattern.patternId,
        mechanicalName: pattern.mechanicalName,
        reasons: ["WEAK_ENGINE_PAYOFF_CHAIN"],
        detail: `Pattern prerequisite failed: ${hypothesis.prerequisiteDetail}`,
        discoverySupport: hypothesis.support.discoverySupport,
        feasibilitySupport: null,
      });
      continue;
    }

    if (isIncidentalOnlySupport(hypothesis)) {
      whyNotSurfacedDistribution.INCIDENTAL_COMMANDER_SUPPORT += 1;
      rejectedHypotheses.push({
        archetypeId: pattern.patternId,
        mechanicalName: pattern.mechanicalName,
        reasons: ["INCIDENTAL_COMMANDER_SUPPORT"],
        detail: `discoverySupport=${hypothesis.support.discoverySupport.toFixed(3)} below threshold=${pattern.minCommanderDiscoverySupport}`,
        discoverySupport: hypothesis.support.discoverySupport,
        feasibilitySupport: null,
      });
      continue;
    }

    if (!Number.isFinite(hypothesis.support.discoverySupport)) {
      whyNotSurfacedDistribution.INCIDENTAL_COMMANDER_SUPPORT += 1;
      rejectedHypotheses.push({
        archetypeId: pattern.patternId,
        mechanicalName: pattern.mechanicalName,
        reasons: ["INCIDENTAL_COMMANDER_SUPPORT"],
        detail: "Non-finite commander support score.",
        discoverySupport: 0,
        feasibilitySupport: null,
      });
      continue;
    }

    if (hypothesis.support.definingMechanicScore < 0.15) {
      whyNotSurfacedDistribution.INCIDENTAL_COMMANDER_SUPPORT += 1;
      rejectedHypotheses.push({
        archetypeId: pattern.patternId,
        mechanicalName: pattern.mechanicalName,
        reasons: ["INCIDENTAL_COMMANDER_SUPPORT"],
        detail: `Weak defining mechanic score (${hypothesis.support.definingMechanicScore.toFixed(3)})`,
        discoverySupport: hypothesis.support.discoverySupport,
        feasibilitySupport: null,
      });
      continue;
    }

    if (hypothesis.support.discoverySupport < pattern.minCommanderDiscoverySupport) {
      whyNotSurfacedDistribution.INCIDENTAL_COMMANDER_SUPPORT += 1;
      rejectedHypotheses.push({
        archetypeId: pattern.patternId,
        mechanicalName: pattern.mechanicalName,
        reasons: ["INCIDENTAL_COMMANDER_SUPPORT"],
        detail: `Insufficient commander support (${hypothesis.support.discoverySupport.toFixed(3)})`,
        discoverySupport: hypothesis.support.discoverySupport,
        feasibilitySupport: null,
      });
      continue;
    }

    if (hasWeakEnginePayoffChain(hypothesis)) {
      whyNotSurfacedDistribution.WEAK_ENGINE_PAYOFF_CHAIN += 1;
      rejectedHypotheses.push({
        archetypeId: pattern.patternId,
        mechanicalName: pattern.mechanicalName,
        reasons: ["WEAK_ENGINE_PAYOFF_CHAIN"],
        detail: "Engine/payoff chain not materially supported by commander mechanics.",
        discoverySupport: hypothesis.support.discoverySupport,
        feasibilitySupport: null,
      });
      continue;
    }

    const census = assessCatalogFeasibility({ pattern, roleIndex });
    const catalogCheck = isCatalogFeasible({ pattern, census });
    if (!catalogCheck.feasible) {
      whyNotSurfacedDistribution.INSUFFICIENT_LEGAL_CATALOG_SUPPORT += 1;
      rejectedHypotheses.push({
        archetypeId: pattern.patternId,
        mechanicalName: pattern.mechanicalName,
        reasons: ["INSUFFICIENT_LEGAL_CATALOG_SUPPORT"],
        detail: catalogCheck.detail,
        discoverySupport: hypothesis.support.discoverySupport,
        feasibilitySupport: census.feasibilitySupport,
      });
      continue;
    }

    const bracketFeasibility = assessBracketFeasibility({ pattern, bracket: input.bracket });
    if (!bracketFeasibility.hardFeasibility) {
      whyNotSurfacedDistribution.BRACKET_HARD_INCOMPATIBLE += 1;
      rejectedHypotheses.push({
        archetypeId: pattern.patternId,
        mechanicalName: pattern.mechanicalName,
        reasons: ["BRACKET_HARD_INCOMPATIBLE"],
        detail: bracketFeasibility.hardIncompatibilityReasons.join("; "),
        discoverySupport: hypothesis.support.discoverySupport,
        feasibilitySupport: census.feasibilitySupport,
      });
      continue;
    }

    const humanLabel = mapMechanicalPatternToHumanLabel({
      pattern,
      commanderRoles: profile.derivedRoles,
    });

    const signature = buildArchetypeSignature({
      hypothesis,
      census,
      bracketFeasibility,
      humanLabel,
      profile,
    });

    candidateVectors.push({
      archetypeId: pattern.patternId,
      mechanicalName: pattern.mechanicalName,
      vector: hypothesis.mechanicalVector,
    });

    pushSurfacedArchetype({
      surfaced,
      hypothesis,
      subArchetypes,
      signature,
      census,
      bracketFeasibility,
      humanLabel,
      commanderOracleId,
      subArchetypeIds: subArchetypesForPrimary(pattern.patternId, qualifyingPatternIds),
      labelConfidenceCap: pattern.archetypeKind === "GENERIC_VALUE_FALLBACK" ? 0.4 : undefined,
    });
  }

  surfaced.sort((a, b) => {
    const kindDelta = (ARCHETYPE_KIND_RANK[a.archetypeKind] ?? 0) - (ARCHETYPE_KIND_RANK[b.archetypeKind] ?? 0);
    if (kindDelta !== 0) return kindDelta;
    return rankScore(b) - rankScore(a);
  });
  surfaced.forEach((s, i) => {
    s.rank = i + 1;
  });

  const hybrids = detectHybridArchetype({
    surfacedPatternIds: surfaced.map((s) => s.archetypeId),
    commanderProfile: profile,
  });
  for (const hybrid of hybrids) {
    const primary = surfaced.find((s) => s.archetypeId === hybrid.primaryPatternId);
    if (primary) {
      primary.hybridWith = hybrid.secondaryPatternId;
      primary.hybridReason = hybrid.reason;
    }
  }

  const surfacedIds = new Set(surfaced.map((s) => s.archetypeId));
  const reconciledRejectedHypotheses = rejectedHypotheses.filter((r) => !surfacedIds.has(r.archetypeId));

  for (const s of surfaced) {
    s.nearestCompetingArchetypes = nearestCompetingArchetypes({
      targetVector: s.archetypeSignature.mechanicalVector,
      candidates: candidateVectors.filter((c) => c.archetypeId !== s.archetypeId),
      limit: 3,
    });
  }

  const diversityMatrix: ArchetypeDiscoveryReport["diversityMatrix"] = [];
  for (let i = 0; i < surfaced.length; i += 1) {
    for (let j = i + 1; j < surfaced.length; j += 1) {
      diversityMatrix.push({
        a: surfaced[i].archetypeId,
        b: surfaced[j].archetypeId,
        archetypeDistance: archetypeDistance(
          surfaced[i].archetypeSignature.mechanicalVector,
          surfaced[j].archetypeSignature.mechanicalVector,
        ),
      });
    }
  }

  const generated = stageAHypotheses.length;
  const mergedAbsorbed = duplicateRejections.length;
  const evaluatedUnique = merged.length;
  const mergedDuplicate = duplicateRejections.length;
  const rejectedPrimary = reconciledRejectedHypotheses.filter(
    (r) => !r.reasons.includes("DUPLICATE_MECHANICAL_SIGNATURE"),
  ).length;
  const hybridDerived = hybrids.length;
  const hypothesisLifecycle: HypothesisLifecycleAccounting = {
    generated,
    mergedAbsorbed,
    evaluatedUnique,
    surfaced: surfaced.length,
    rejectedPrimary,
    mergedDuplicate,
    hybridDerived,
    invariant: {
      generatedEqualsMergedPlusAbsorbed: generated === evaluatedUnique + mergedAbsorbed,
      evaluatedEqualsSurfacedPlusRejectedPrimary: evaluatedUnique === surfaced.length + rejectedPrimary,
      formula: "generated = evaluatedUnique + mergedAbsorbed; evaluatedUnique = surfaced + rejectedPrimary",
    },
  };

  return {
    version: ARCHETYPE_DISCOVERY_V1_VERSION,
    generatedAt: new Date().toISOString(),
    input,
    commanderOracleIds: input.commanderOracleIds,
    commanderNames: commanderNamesFromCatalog(ctx.catalog, input.commanderOracleIds),
    colorIdentity: profile.colorIdentity,
    bracket: input.bracket,
    stageA: {
      hypothesesGenerated: stageAHypotheses.length,
      hypothesisIds: stageAHypotheses.map((h) => h.pattern.patternId),
    },
    stageB: {
      catalogPoolSize: roleIndex.poolSize,
      feasibilityScanned: merged.length,
    },
    hypothesisLifecycle,
    buildDirections,
    hasValidBuildDirection: hasValidBuildDirection(buildDirections),
    evaluationContextStatus: evalContext.evaluationContextStatus,
    contextRequirements: evalContext.contextRequirements,
    commandZoneComposition,
    surfacedArchetypes: surfaced,
    rejectedHypotheses: reconciledRejectedHypotheses,
    whyNotSurfacedDistribution,
    diversityMatrix,
    provenance: {
      shadowParserVersion: ctx.shadowIndex.parserVersion,
      shadowSemanticVersion: ctx.shadowIndex.semanticVersion,
      bracketPolicyVersion: COMMANDER_BRACKET_POLICY_SNAPSHOT_VERSION,
      catalogLoadedCount: ctx.catalog.cardCount,
      discoveryEngineVersion: ARCHETYPE_DISCOVERY_V1_VERSION,
    },
  };
}

export type { DiscoverArchetypesInput, ArchetypeDiscoveryReport };
