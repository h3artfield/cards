/**
 * Stage A — score commander support per mechanical engine pattern (Phase 5.2 causal roles).
 */
import type { DerivedRoleName } from "@/lib/semantic-visualization/derived-features-v1";
import type {
  ArchetypeMechanicEdge,
  CommanderMechanicalProfile,
  CommanderSupportBreakdown,
  EnginePatternDef,
} from "./archetype-discovery-types-v1";
import { MECHANICAL_ENGINE_PATTERNS_V1 } from "./mechanical-engine-patterns-v1";
import { computeCausalSupportForPattern } from "./commander-causal-roles-v1";
import { evaluatePatternPrerequisites } from "./pattern-prerequisites-v1";

export type ScoredHypothesis = {
  pattern: EnginePatternDef;
  support: CommanderSupportBreakdown;
  mechanicEdges: ArchetypeMechanicEdge[];
  mechanicalVector: number[];
  prerequisiteDetail: string;
};

function dotNormalized(weights: number[], values: number[]): number {
  let num = 0;
  let denW = 0;
  for (let i = 0; i < weights.length; i += 1) {
    num += weights[i] * values[i];
    denW += weights[i];
  }
  return denW > 0 ? num / denW : 0;
}

function roleScore(profile: CommanderMechanicalProfile, weights: Partial<Record<DerivedRoleName, number>>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [role, weight] of Object.entries(weights)) {
    out[role] = (profile.derivedRoles[role] ?? 0) * (weight as number);
  }
  return out;
}

function axisScore(profile: CommanderMechanicalProfile, pattern: EnginePatternDef): Record<string, number> {
  const out: Record<string, number> = {};
  for (let i = 0; i < pattern.commanderAxisKeys.length; i += 1) {
    const key = pattern.commanderAxisKeys[i];
    out[key] = profile.commandZoneIpv2_1[key] ?? 0;
  }
  return out;
}

function computeCentrality(profile: CommanderMechanicalProfile, pattern: EnginePatternDef): number {
  const weightedRoles = Object.entries(pattern.commanderRoleWeights);
  const strongRoles = weightedRoles.filter(([, w]) => (w ?? 0) >= 0.6);
  if (strongRoles.length === 0) return 0.5;
  let hit = 0;
  for (const [role, w] of strongRoles) {
    if ((profile.derivedRoles[role] ?? 0) > 0 && (w ?? 0) >= 0.6) hit += 1;
  }
  return hit / strongRoles.length;
}

function computeRepeatability(profile: CommanderMechanicalProfile, pattern: EnginePatternDef): number {
  return Math.min(1, profile.causalRoles.repeatability * 0.7 + computeCentrality(profile, pattern) * 0.3);
}

function computeIncidentalPenalty(profile: CommanderMechanicalProfile, pattern: EnginePatternDef): number {
  if (pattern.incidentalRoles.length === 0) return 0;
  let penalty = 0;
  for (const role of pattern.incidentalRoles) {
    const score = profile.derivedRoles[role] ?? 0;
    const weighted = (pattern.commanderRoleWeights[role] ?? 0) * score;
    if (weighted > 0 && weighted <= pattern.incidentalMaxScore) {
      penalty += 0.35;
    }
  }
  return Math.min(0.6, penalty);
}

function buildMechanicalVector(
  profile: CommanderMechanicalProfile,
  pattern: EnginePatternDef,
  support: CommanderSupportBreakdown,
): number[] {
  const roleVec = Object.keys(pattern.commanderRoleWeights).map(
    (r) => (profile.derivedRoles[r as DerivedRoleName] ?? 0) * (pattern.commanderRoleWeights[r as DerivedRoleName] ?? 0),
  );
  const axisVec = pattern.commanderAxisKeys.map((k) => profile.commandZoneIpv2_1[k] ?? 0);
  const patternHint = pattern.primaryAxes.map((axis) => profile.commandZoneIpv2_1[`ipv2_1_cmd_${axis}_reliance`] ?? 0);
  return [
    ...roleVec,
    ...axisVec,
    ...patternHint,
    support.discoverySupport,
    support.driverSupport,
    support.feedbackSupport,
  ];
}

function attachCommanderEvidence(
  profile: CommanderMechanicalProfile,
  pattern: EnginePatternDef,
): CommanderSupportBreakdown["evidenceRefs"] {
  const refs = [...profile.evidenceRefs];
  for (const [role, weight] of Object.entries(pattern.commanderRoleWeights)) {
    if ((profile.derivedRoles[role] ?? 0) > 0 && (weight ?? 0) >= 0.5) {
      refs.push({
        oracleId: profile.commanderOracleIds[0] ?? "",
        rule: `pattern_role_match:${pattern.patternId}:${role}`,
        note: `weight=${weight}`,
      });
    }
  }
  return refs.slice(0, 40);
}

function computeEnchantmentCommanderSupport(profile: CommanderMechanicalProfile): number {
  const e = profile.enchantmentSignals;
  let score = e.enchantmentSpecificSupport;
  score += (profile.commandZoneIpv2_1["ipv2_1_cmd_enchantments_reliance"] ?? 0) * 0.2;
  if (score < 0.28) {
    const genericDraw = profile.derivedRoles.card_draw ?? 0;
    return Math.min(0.12, genericDraw * 0.08);
  }
  return Math.min(1, score);
}

export function scoreCommanderHypotheses(profile: CommanderMechanicalProfile): ScoredHypothesis[] {
  const results: ScoredHypothesis[] = [];

  for (const pattern of MECHANICAL_ENGINE_PATTERNS_V1) {
    const causal = profile.causalRoles;
    const causalSignals = computeCausalSupportForPattern({
      patternId: pattern.patternId,
      causal,
      profile,
    });
    const prereq = evaluatePatternPrerequisites({
      patternId: pattern.patternId,
      causal,
      profile,
      driverSupport: causalSignals.driverSupport,
      payoffSupport: causalSignals.payoffSupport,
    });

    const roleScores = roleScore(profile, pattern.commanderRoleWeights);
    const axisScores = axisScore(profile, pattern);
    const roleAggregate = dotNormalized(
      Object.values(pattern.commanderRoleWeights),
      Object.keys(pattern.commanderRoleWeights).map((r) => profile.derivedRoles[r as DerivedRoleName] ?? 0),
    );
    const axisAggregate = dotNormalized(
      pattern.commanderAxisWeights,
      pattern.commanderAxisKeys.map((k) => profile.commandZoneIpv2_1[k] ?? 0),
    );
    const centralityScore = computeCentrality(profile, pattern);
    const repeatabilityScore = computeRepeatability(profile, pattern);
    let incidentalPenalty = computeIncidentalPenalty(profile, pattern);

    const driverComponent =
      causalSignals.driverSupport * 0.5 + causalSignals.feedbackSupport * 0.25 + causalSignals.payoffSupport * 0.05;
    let discoverySupport =
      roleAggregate * 0.2 +
      axisAggregate * 0.1 +
      driverComponent * 0.55 +
      centralityScore * 0.05 +
      repeatabilityScore * 0.1 -
      incidentalPenalty -
      causalSignals.incidentalSupport * 0.45;

    if (pattern.patternId === "enchantress_value_engine") {
      const enchantScore = computeEnchantmentCommanderSupport(profile);
      discoverySupport = enchantScore * 0.92 + discoverySupport * 0.08;
      if (enchantScore < 0.32) discoverySupport = Math.min(discoverySupport, enchantScore);
    }

    if (pattern.patternId === "mill_library_engine" && (profile.derivedRoles.mill ?? 0) >= 0.9) {
      discoverySupport = Math.max(discoverySupport, 0.58);
    }

    if (
      pattern.patternId === "sacrifice_death_trigger_engine" &&
      (profile.causalRoles.engineConditions.includes("death_trigger_amplify") ||
        (profile.derivedRoles.sacrifice_payoff ?? 0) >= 0.8)
    ) {
      discoverySupport = Math.max(discoverySupport, 0.42);
    }

    if (pattern.patternId === "landfall_ramp_engine" && profile.causalRoles.engineInputs.includes("land_drops")) {
      discoverySupport = Math.max(discoverySupport, 0.45);
    }

    if (pattern.archetypeKind === "GENERIC_VALUE_FALLBACK") {
      if (causal.broadFlexibilityScore < 0.55) {
        discoverySupport = 0;
      } else {
        discoverySupport = Math.max(discoverySupport, causal.broadFlexibilityScore * 0.95);
      }
    }

    if (
      profile.commanderOracleIds.length > 1 &&
      pattern.patternId === "mana_ability_combo_engine" &&
      profile.causalRoles.engineActions.includes("activated_ability")
    ) {
      discoverySupport = Math.max(discoverySupport, 0.36);
    }

    if (!prereq.passes) {
      discoverySupport = Math.min(discoverySupport, pattern.archetypeKind === "GENERIC_VALUE_FALLBACK" ? 0 : 0.18);
      incidentalPenalty += 0.25;
    }

    discoverySupport = Math.max(0, Math.min(1, discoverySupport));

    const definingMechanicScore =
      pattern.patternId === "enchantress_value_engine"
        ? computeEnchantmentCommanderSupport(profile)
        : pattern.patternId === "mill_library_engine" && (profile.derivedRoles.mill ?? 0) >= 0.9
          ? 0.85
          : pattern.patternId === "sacrifice_death_trigger_engine" &&
              (profile.causalRoles.engineConditions.includes("death_trigger_amplify") ||
                (profile.derivedRoles.sacrifice_payoff ?? 0) >= 0.8)
            ? 0.78
            : Math.max(causalSignals.driverSupport, causalSignals.feedbackSupport) * 0.85 + roleAggregate * 0.15;

    const support: CommanderSupportBreakdown = {
      roleScores,
      axisScores,
      centralityScore,
      repeatabilityScore,
      commandZoneAccessibility: 1,
      definingMechanicScore,
      incidentalPenalty,
      driverSupport: causalSignals.driverSupport,
      payoffSupport: causalSignals.payoffSupport,
      feedbackSupport: causalSignals.feedbackSupport,
      incidentalSupport: causalSignals.incidentalSupport,
      discoverySupport,
      evidenceRefs: attachCommanderEvidence(profile, pattern),
    };

    const mechanicEdges: ArchetypeMechanicEdge[] = pattern.mechanicEdges.map((edge, idx) => ({
      ...edge,
      edgeId: `${pattern.patternId}:edge:${idx}`,
      evidenceRefs: support.evidenceRefs.slice(0, 3),
    }));

    results.push({
      pattern,
      support,
      mechanicEdges,
      mechanicalVector: buildMechanicalVector(profile, pattern, support),
      prerequisiteDetail: prereq.detail,
    });
  }

  return results.sort((a, b) => b.support.discoverySupport - a.support.discoverySupport);
}

export function isIncidentalOnlySupport(hypothesis: ScoredHypothesis): boolean {
  const { pattern, support } = hypothesis;
  if (support.incidentalSupport >= 0.35 && support.driverSupport < 0.28) return true;
  if (support.discoverySupport >= pattern.minCommanderDiscoverySupport && support.driverSupport >= 0.28) return false;
  if (support.incidentalPenalty >= 0.3 && support.definingMechanicScore < pattern.minCommanderDiscoverySupport) {
    return true;
  }
  const topRole = Math.max(0, ...Object.values(support.roleScores));
  return topRole > 0 && topRole <= pattern.incidentalMaxScore && support.definingMechanicScore < 0.25;
}

export function hasWeakEnginePayoffChain(hypothesis: ScoredHypothesis): boolean {
  if (hypothesis.pattern.patternId === "enchantress_value_engine") {
    return hypothesis.support.definingMechanicScore < 0.32;
  }
  if (hypothesis.prerequisiteDetail === "payoff_only_primary_rejected") return true;
  if (hypothesis.prerequisiteDetail === "disqualifying_incidental_only") return true;
  if (hypothesis.support.driverSupport < 0.22 && hypothesis.support.feedbackSupport < 0.2) return true;
  return hypothesis.support.definingMechanicScore < 0.2 && hypothesis.support.centralityScore < 0.25;
}

export function passesPatternPrerequisites(hypothesis: ScoredHypothesis): boolean {
  return (
    hypothesis.prerequisiteDetail === "ok" ||
    hypothesis.prerequisiteDetail === "default_driver_threshold"
  );
}
