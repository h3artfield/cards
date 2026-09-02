/**
 * CommanderBuildDirection — compositional mechanical discovery layer (Phase 5.3.2).
 * Exists BEFORE named archetype mapping; every meaningful commander should produce directions.
 */
import type { DerivedRoleName } from "@/lib/semantic-visualization/derived-features-v1";
import type {
  CatalogSupportCensus,
  CausalChainStatus,
  CommanderBuildDirection,
  CommanderMechanicalProfile,
  DirectionAnchor,
  DriverProvenanceEntry,
} from "./archetype-discovery-types-v1";
import type { CatalogRoleIndex } from "./catalog-feasibility-v1";
import type { CommanderCausalRoleProfile } from "./commander-causal-roles-v1";
import { MECHANICAL_ENGINE_PATTERNS_V1 } from "./mechanical-engine-patterns-v1";
import { mapMechanicalPatternToHumanLabel } from "./human-label-mapping-v1";
import { extractMechanicalMotifs, type ExtractedMotif, type MechanicalMotifId } from "./mechanical-motifs-v1";
import { computeCausalDepthScore } from "./commander-causal-inference-v1.1";
import {
  assessDirectionValidity,
  buildRetrievalSpecification,
  computeRetrievalSpecificationCompleteness,
  extractDirectionAnchors,
} from "./direction-anchor-v1";
import { compositeSupportStrength, tryComposeCompositeDirection } from "./composite-direction-v1";

/** Motif → catalog role buckets for Stage B feasibility without named archetype. */
const MOTIF_CATALOG_ROLES: Partial<Record<MechanicalMotifId, DerivedRoleName[]>> = {
  ATTACK_TRIGGER: ["combat_manipulation", "combat_payoff"],
  COMBAT_DAMAGE_TRIGGER: ["combat_payoff", "mana_generation"],
  CREATURE_CHEAT: ["combat_manipulation", "combat_payoff"],
  LIFE_GAIN: ["life_gain", "card_draw"],
  LIFE_GAIN_PAYOFF: ["counter_synergy", "life_gain"],
  DAMAGE_TO_OPPONENTS: ["combat_payoff", "life_loss"],
  ETB_PAYOFF: ["blink_flicker", "combat_payoff"],
  DEATH_PAYOFF: ["sacrifice_payoff", "recursion"],
  COUNTER_PLACEMENT: ["counter_synergy"],
  COUNTER_PAYOFF: ["counter_synergy", "combat_payoff"],
  ACTIVATED_MANA_ENGINE: ["ramp", "mana_generation"],
  TRIGGERED_MANA_ENGINE: ["ramp", "mana_generation", "life_loss"],
  OPPONENT_LIFE_LOSS: ["life_loss", "combat_payoff"],
  POSTCOMBAT_TRIGGER: ["ramp", "mana_generation"],
  MANA_GENERATION: ["ramp", "mana_generation"],
  POSTCOMBAT_MANA_CONVERSION: ["ramp", "life_loss"],
  UNTAP_ENGINE: ["ramp", "mana_generation"],
  CAST_FROM_EXILE: ["cast_from_exile"],
  CAST_FROM_LIBRARY_TOP: ["cast_from_exile", "card_draw"],
  GRAVEYARD_SETUP: ["graveyard_setup", "mill"],
  GRAVEYARD_RECURSION: ["recursion", "reanimation"],
  LEGENDARY_PRESENCE: ["tutor"],
  TOP_LIBRARY_MANIPULATION: ["combat_manipulation", "cast_from_exile"],
  BLINK_ETB: ["blink_flicker"],
  SPELL_CAST_TRIGGER: ["spell_copying", "card_draw"],
  TOKEN_GENERATION: ["token_generation"],
  TOKEN_CONVERSION: ["combat_payoff", "sacrifice_payoff"],
  SACRIFICE_ENGINE: ["sacrifice_outlet", "sacrifice_payoff"],
  ARTIFACT_ENGINE: ["ramp", "tutor"],
  AURA_EQUIPMENT: ["combat_payoff", "protection"],
  LANDFALL_ENGINE: ["ramp"],
  MILL_ENGINE: ["mill"],
  DRAW_ENGINE: ["card_draw"],
  TUTOR_ENGINE: ["tutor"],
  PROLIFERATE_ENGINE: ["counter_synergy"],
  STATIC_TAX: ["countermagic"],
  SPELL_PUNISHMENT: ["life_loss", "combat_payoff"],
  COUNTER_SPELL: ["countermagic"],
  CREATURE_REMOVAL: ["removal", "combat_payoff"],
  PROTECTION_PROVIDER: ["protection", "combat_manipulation"],
  STATIC_PROTECTION: ["protection"],
  STATE_SCALING: ["ramp", "combat_payoff"],
  CONVOKE_COST: ["token_generation", "combat_manipulation"],
  COMBAT_BUFF: ["combat_manipulation", "combat_payoff"],
};

/** Motif sets that suggest existing named patterns (mapping only — does not lower pattern thresholds). */
const MOTIF_PATTERN_HINTS: Array<{ patternId: string; driverMotifs: MechanicalMotifId[]; supportMotifs?: MechanicalMotifId[] }> = [
  { patternId: "ninja_tempo_engine", driverMotifs: ["ATTACK_TRIGGER", "TOP_LIBRARY_MANIPULATION"], supportMotifs: ["COMBAT_DAMAGE_TRIGGER"] },
  { patternId: "token_swarm_engine", driverMotifs: ["TOKEN_GENERATION"], supportMotifs: ["TOKEN_CONVERSION"] },
  { patternId: "sacrifice_death_trigger_engine", driverMotifs: ["DEATH_PAYOFF", "SACRIFICE_ENGINE"] },
  { patternId: "spellslinger_chain_engine", driverMotifs: ["SPELL_CAST_TRIGGER"] },
  { patternId: "graveyard_recursion_engine", driverMotifs: ["GRAVEYARD_SETUP", "GRAVEYARD_RECURSION"] },
  { patternId: "counters_proliferate_engine", driverMotifs: ["COUNTER_PLACEMENT", "PROLIFERATE_ENGINE"] },
  { patternId: "landfall_ramp_engine", driverMotifs: ["LANDFALL_ENGINE"] },
  { patternId: "exile_impulse_engine", driverMotifs: ["CAST_FROM_EXILE", "CAST_FROM_LIBRARY_TOP"] },
  { patternId: "voltron_combat_engine", driverMotifs: ["AURA_EQUIPMENT", "COMBAT_BUFF"] },
  { patternId: "artifact_value_engine", driverMotifs: ["ARTIFACT_ENGINE", "SACRIFICE_ENGINE"] },
  { patternId: "mana_ability_combo_engine", driverMotifs: ["ACTIVATED_MANA_ENGINE", "TRIGGERED_MANA_ENGINE", "UNTAP_ENGINE"] },
  { patternId: "mill_library_engine", driverMotifs: ["MILL_ENGINE"] },
  { patternId: "group_slug_punisher_engine", driverMotifs: ["DAMAGE_TO_OPPONENTS"], supportMotifs: ["ETB_PAYOFF"] },
  { patternId: "voltron_combat_engine", driverMotifs: ["ATTACK_TRIGGER", "COMBAT_BUFF"], supportMotifs: ["CREATURE_CHEAT"] },
  { patternId: "etb_blink_value_engine", driverMotifs: ["ETB_PAYOFF", "BLINK_ETB"] },
  { patternId: "aura_voltron_engine", driverMotifs: ["AURA_EQUIPMENT"] },
  { patternId: "stax_resource_denial_engine", driverMotifs: ["STATIC_TAX", "SPELL_PUNISHMENT", "COUNTER_SPELL"] },
];

const MIN_DIRECTION_SUPPORT = 0.38;

function hasAny(causal: CommanderCausalRoleProfile, ...tags: string[]): boolean {
  const all = [
    ...causal.engineInputs,
    ...causal.engineTriggers,
    ...causal.engineActions,
    ...causal.engineOutputs,
    ...causal.enginePayoffs,
    ...causal.resourcesProduced,
    ...causal.engineConditions,
  ];
  return tags.some((t) => all.includes(t));
}

const MOTIF_EVIDENCE_TAGS: Partial<Record<MechanicalMotifId, string[]>> = {
  ETB_PAYOFF: ["etb_trigger", "permanents_etb", "another_object_etb"],
  COMBAT_DAMAGE_TRIGGER: ["combat_damage_trigger", "combat_damage", "combat_damage_conversion"],
  COMBAT_BUFF: ["combat_buff", "combat_manipulation"],
  DAMAGE_TO_OPPONENTS: ["damage"],
  ACTIVATED_MANA_ENGINE: ["activated_ability", "power_scaled", "mana"],
  TRIGGERED_MANA_ENGINE: ["postcombat_mana_engine", "postcombat_trigger", "opponent_life_loss"],
  OPPONENT_LIFE_LOSS: ["opponent_life_loss", "combat_life_loss"],
  SACRIFICE_ENGINE: ["sacrifice", "sacrifice_trigger", "activated_ability"],
  TOKEN_GENERATION: ["token_production", "tokens"],
  DRAW_ENGINE: ["card_draw", "cast_trigger", "activated_ability"],
  PROLIFERATE_ENGINE: ["proliferate"],
  SPELL_CAST_TRIGGER: ["cast_trigger", "spell_casts"],
  ATTACK_TRIGGER: ["attack_trigger", "combat_attacks"],
};

const SCALABLE_RESOURCE_MOTIFS = new Set<MechanicalMotifId>([
  "ACTIVATED_MANA_ENGINE",
  "TRIGGERED_MANA_ENGINE",
  "DRAW_ENGINE",
  "TOKEN_GENERATION",
]);

function motifIds(motifs: ExtractedMotif[]): Set<MechanicalMotifId> {
  return new Set(motifs.map((m) => m.motifId));
}

function motifEvidenceTags(motifId: MechanicalMotifId, causal: CommanderCausalRoleProfile): string[] {
  const mapped = MOTIF_EVIDENCE_TAGS[motifId] ?? [];
  const profileTags = [
    ...causal.engineInputs,
    ...causal.engineTriggers,
    ...causal.engineActions,
    ...causal.engineConditions,
    ...causal.engineOutputs,
    ...causal.enginePayoffs,
    ...causal.resourcesProduced,
    ...causal.activatedEngineCosts,
    ...causal.costRequires,
  ];
  return [...mapped.filter((t) => profileTags.includes(t)), ...mapped];
}

function isCausallyLinkedPayoffOrOutput(
  seed: ExtractedMotif,
  candidate: ExtractedMotif,
  causal: CommanderCausalRoleProfile,
): boolean {
  if (candidate.causalPosition !== "PAYOFF" && candidate.causalPosition !== "OUTPUT") return false;
  if (seed.motifId === "ETB_PAYOFF" && candidate.motifId === "DAMAGE_TO_OPPONENTS") {
    return causal.enginePayoffs.includes("damage") && hasAny(causal, "etb_trigger", "another_object_etb", "permanents_etb");
  }
  if (seed.motifId === "SPELL_CAST_TRIGGER" && candidate.motifId === "TOKEN_GENERATION") {
    return causal.resourcesProduced.includes("tokens") || causal.engineActions.includes("token_production");
  }
  if (seed.motifId === "ETB_PAYOFF" && candidate.motifId === "TOKEN_GENERATION") {
    return causal.engineActions.includes("token_production") || causal.resourcesProduced.includes("tokens");
  }
  if (seed.motifId === "TRIGGERED_MANA_ENGINE" && candidate.motifId === "MANA_GENERATION") {
    return causal.resourcesProduced.includes("mana");
  }
  if (seed.motifId === "SACRIFICE_ENGINE" && (candidate.motifId === "TOKEN_GENERATION" || candidate.motifId === "DAMAGE_TO_OPPONENTS")) {
    return true;
  }
  if (seed.motifId === "PROLIFERATE_ENGINE" && (candidate.motifId === "COUNTER_PLACEMENT" || candidate.motifId === "COUNTER_PAYOFF")) {
    return causal.engineActions.includes("proliferate") || causal.engineOutputs.includes("counters");
  }
  if (seed.motifId === "TOKEN_GENERATION" && candidate.motifId === "TOKEN_GENERATION") {
    return true;
  }
  return false;
}

function sharesCausalEvidence(
  seed: ExtractedMotif,
  candidate: ExtractedMotif,
  causal: CommanderCausalRoleProfile,
): boolean {
  if (candidate.causalPosition === "DRIVER") return true;
  if (candidate.motifId === seed.motifId) return true;
  if (seed.motifId === "ETB_PAYOFF" && candidate.motifId === "COMBAT_BUFF") return false;
  if (seed.motifId === "ETB_PAYOFF" && candidate.motifId === "COMBAT_DAMAGE_TRIGGER") {
    return hasAny(causal, "combat_damage_trigger", "combat_damage", "combat_damage_conversion");
  }
  if (isCausallyLinkedPayoffOrOutput(seed, candidate, causal)) return true;
  const seedTags = new Set([...motifEvidenceTags(seed.motifId, causal), ...seed.evidence]);
  const candidateTags = [...motifEvidenceTags(candidate.motifId, causal), ...candidate.evidence];
  return candidateTags.some((t) => seedTags.has(t));
}

function detectFeedbackLoops(motifs: ExtractedMotif[]): string[] {
  const ids = motifIds(motifs);
  const loops: string[] = [];
  if (ids.has("TOKEN_GENERATION") && ids.has("TOKEN_CONVERSION")) loops.push("token_generation→token_payoff");
  if (ids.has("SPELL_CAST_TRIGGER") && ids.has("TOKEN_GENERATION")) loops.push("spell_cast→token_output");
  if (ids.has("GRAVEYARD_SETUP") && ids.has("GRAVEYARD_RECURSION")) loops.push("gy_setup→recursion");
  if (ids.has("LIFE_GAIN") && ids.has("COUNTER_PAYOFF")) loops.push("life_gain→counter_payoff");
  if (ids.has("ATTACK_TRIGGER") && ids.has("COMBAT_DAMAGE_TRIGGER")) loops.push("attack→combat_damage");
  if (ids.has("ETB_PAYOFF") && ids.has("BLINK_ETB")) loops.push("etb→blink_retrigger");
  if (ids.has("OPPONENT_LIFE_LOSS") && ids.has("TRIGGERED_MANA_ENGINE")) loops.push("life_loss→postcombat_mana");
  return loops;
}

function buildMechanicalDescription(motifs: ExtractedMotif[], anchors: DirectionAnchor[], compositeLabel?: string): string {
  if (compositeLabel) return compositeLabel;
  if (anchors.length > 0) {
    const primary = anchors[0]!;
    const payoffs = motifs.filter((m) => m.causalPosition === "PAYOFF" || m.causalPosition === "OUTPUT").map((m) => m.motifId);
    const anchorDesc = `${primary.anchorKind}:${primary.mechanism}`;
    const p = payoffs.slice(0, 2).join(" / ") || primary.requirement;
    return `${anchorDesc} → ${p}`;
  }
  const drivers = motifs.filter((m) => m.causalPosition === "DRIVER").map((m) => m.motifId);
  const payoffs = motifs.filter((m) => m.causalPosition === "PAYOFF" || m.causalPosition === "OUTPUT").map((m) => m.motifId);
  if (drivers.length === 0 && payoffs.length === 0) return "Mechanical value engine";
  const d = drivers.slice(0, 3).join(" / ") || "engine";
  const p = payoffs.slice(0, 2).join(" / ") || "payoff";
  return `${d} → ${p}`;
}

function anchorSeedMotifId(anchor: DirectionAnchor): MechanicalMotifId | null {
  const map: Record<string, MechanicalMotifId> = {
    SPELL_PUNISHMENT: "SPELL_PUNISHMENT",
    COUNTER_SPELL: "COUNTER_SPELL",
    CREATURE_REMOVAL: "CREATURE_REMOVAL",
    CREATURE_DAMAGE: "CREATURE_REMOVAL",
    COUNTER_PLACEMENT: "COUNTER_PLACEMENT",
    PROTECTION_PROVIDER: "PROTECTION_PROVIDER",
    TARGETED_PROTECTION: "PROTECTION_PROVIDER",
    STATIC_PROTECTION: "STATIC_PROTECTION",
    CONDITIONAL_PROTECTION: "STATIC_PROTECTION",
    STATE_SCALING: "STATE_SCALING",
    CONVOKE_COST: "CONVOKE_COST",
    ATTACK_TRIGGER: "ATTACK_TRIGGER",
    COMBAT_DAMAGE_TRIGGER: "COMBAT_DAMAGE_TRIGGER",
    ETB_TRIGGER: "ETB_PAYOFF",
    SPELL_CAST_TRIGGER: "SPELL_CAST_TRIGGER",
    MANA_GENERATION: "ACTIVATED_MANA_ENGINE",
    TOKEN_GENERATION: "TOKEN_GENERATION",
    DRAW_ENGINE: "DRAW_ENGINE",
    COPY: "TOKEN_GENERATION",
    RECURSION: "GRAVEYARD_RECURSION",
    CAST_FROM_EXILE: "CAST_FROM_EXILE",
    LAND_DEVELOPMENT: "LANDFALL_ENGINE",
    OUTPUT_MULTIPLIER: "TOKEN_GENERATION",
    STATE_ATTRITION: "STATE_SCALING",
    MARKED_DEATH_PAYOFF: "TOKEN_GENERATION",
    TUTOR_CHEAT: "CREATURE_CHEAT",
    TAP_STATE_TRIGGER: "COMBAT_BUFF",
    SCRY_TRIGGER: "COUNTER_PLACEMENT",
    TYPE_QUALIFIED_PLAY: "TOKEN_GENERATION",
    SCRY: "TOP_LIBRARY_MANIPULATION",
    COUNTER_STOCK: "COUNTER_PLACEMENT",
    STATIC_TYPAL_BUFF: "COMBAT_BUFF",
    END_STEP_TRIGGER: "TOKEN_GENERATION",
    PLANESWALKER_LOYALTY: "TUTOR_ENGINE",
    EXILE_REPLACEMENT: "GRAVEYARD_SETUP",
    ABILITY_INHERITANCE: "COMBAT_BUFF",
    TYPE_COUNT_SCALING: "DAMAGE_TO_OPPONENTS",
    STATIC_TIMING_RESTRICTION: "STATIC_TAX",
    TYPE_QUALIFIED_TUTOR: "TUTOR_ENGINE",
    GLOBAL_CHARACTERISTIC_TRANSFORMATION: "STATE_SCALING",
    CHARACTERISTIC_DERIVED_EFFECT: "DAMAGE_TO_OPPONENTS",
    EXPLORE_ENGINE: "DRAW_ENGINE",
    THRESHOLD_STATE: "STATE_SCALING",
    KEYWORD_DENSITY_SCALING: "COMBAT_BUFF",
  };
  return map[anchor.mechanism] ?? null;
}

function isPayoffOnlySeed(motif: ExtractedMotif): boolean {
  return motif.causalPosition === "PAYOFF" || motif.causalPosition === "OUTPUT";
}

function supportFunctionsForMotifs(motifs: ExtractedMotif[]): { required: DerivedRoleName[]; optional: DerivedRoleName[] } {
  const required = new Set<DerivedRoleName>();
  const optional = new Set<DerivedRoleName>();
  for (const m of motifs) {
    const roles = MOTIF_CATALOG_ROLES[m.motifId] ?? [];
    for (const r of roles.slice(0, 1)) required.add(r);
    for (const r of roles.slice(1)) optional.add(r);
  }
  return { required: [...required], optional: [...optional] };
}

export function assessBuildDirectionCatalogFeasibility(input: {
  motifs: ExtractedMotif[];
  roleIndex: CatalogRoleIndex;
}): CatalogSupportCensus {
  const { required, optional } = supportFunctionsForMotifs(input.motifs);
  const allRoles = [...required, ...optional];
  const roleDetail: Record<string, number> = {};
  let total = 0;
  for (const role of allRoles) {
    const count = input.roleIndex.roleToOracleIds.get(role)?.size ?? 0;
    roleDetail[role] = count;
    total += count;
  }
  const pool = Math.max(1, input.roleIndex.poolSize);
  const feasibilitySupport = Math.min(1, total / (allRoles.length * pool * 0.02));

  return {
    enablers: roleDetail[required[0] ?? ""] ?? 0,
    enginePieces: roleDetail[required[1] ?? required[0] ?? ""] ?? 0,
    payoffs: roleDetail[optional[0] ?? ""] ?? 0,
    redundancy: Math.min(...allRoles.map((r) => roleDetail[r] ?? 0), 999),
    resourceSupport: roleDetail["ramp"] ?? roleDetail["card_draw"] ?? 0,
    interactionProtection: roleDetail["removal"] ?? roleDetail["countermagic"] ?? 0,
    finishers: roleDetail["combat_payoff"] ?? 0,
    feasibilitySupport,
    roleDetail,
  };
}

function mapDirectionToPattern(motifs: ExtractedMotif[]): {
  patternId: string | null;
  label: string | null;
  confidence: number;
} {
  const ids = motifIds(motifs);
  let best: { patternId: string; score: number } | null = null;

  for (const hint of MOTIF_PATTERN_HINTS) {
    let score = 0;
    for (const d of hint.driverMotifs) if (ids.has(d)) score += 0.45;
    for (const s of hint.supportMotifs ?? []) if (ids.has(s)) score += 0.2;
    if (score > (best?.score ?? 0)) best = { patternId: hint.patternId, score };
  }

  if (!best || best.score < 0.45) return { patternId: null, label: null, confidence: 0 };

  const pattern = MECHANICAL_ENGINE_PATTERNS_V1.find((p) => p.patternId === best!.patternId);
  if (!pattern) return { patternId: best.patternId, label: null, confidence: best.score * 0.6 };

  const label = mapMechanicalPatternToHumanLabel({ pattern, commanderRoles: {} });
  if (label.humanLabelConfidence < 0.5) {
    return { patternId: best.patternId, label: null, confidence: best.score * label.humanLabelConfidence };
  }
  return { patternId: best.patternId, label: label.humanLabel, confidence: Math.min(0.92, best.score * label.humanLabelConfidence) };
}

function buildDirectionChain(
  seed: ExtractedMotif,
  allMotifs: ExtractedMotif[],
  causal: CommanderCausalRoleProfile,
): ExtractedMotif[] {
  const chainIds = new Set<MechanicalMotifId>();
  const chain: ExtractedMotif[] = [];

  const driverMotifs = allMotifs
    .filter((m) => m.causalPosition === "DRIVER")
    .sort((a, b) => b.strength - a.strength);

  for (const d of driverMotifs) {
    if (chainIds.has(d.motifId)) continue;
    chain.push(d);
    chainIds.add(d.motifId);
  }

  if (!chainIds.has(seed.motifId)) {
    chain.push(seed);
    chainIds.add(seed.motifId);
  }

  const supporting = allMotifs
    .filter((m) => !chainIds.has(m.motifId))
    .filter((m) => {
      if (m.causalPosition === "PAYOFF" || m.causalPosition === "OUTPUT") {
        return isCausallyLinkedPayoffOrOutput(seed, m, causal) || sharesCausalEvidence(seed, m, causal);
      }
      if (m.causalPosition === "ENGINE") {
        return sharesCausalEvidence(seed, m, causal);
      }
      return sharesCausalEvidence(seed, m, causal);
    })
    .sort((a, b) => b.strength - a.strength);

  for (const s of supporting) {
    if (chain.length >= 8) break;
    chain.push(s);
    chainIds.add(s.motifId);
  }

  return chain;
}

function computeScalableResourceBoost(seed: ExtractedMotif, causal: CommanderCausalRoleProfile): number {
  if (!SCALABLE_RESOURCE_MOTIFS.has(seed.motifId)) return 0;
  let boost = 0;
  if (causal.engineConditions.includes("power_scaled")) boost += 0.18;
  if (causal.engineInputs.includes("creature_count") && seed.motifId === "ACTIVATED_MANA_ENGINE") boost += 0.12;
  if (causal.engineActions.includes("postcombat_mana_engine") && seed.motifId === "TRIGGERED_MANA_ENGINE") boost += 0.15;
  if (causal.engineActions.includes("activated_ability") && causal.resourcesProduced.includes("mana")) boost += 0.08;
  if (causal.repeatability >= 0.6) boost += 0.06;
  return boost;
}

function computeChainCoverage(input: {
  chain: ExtractedMotif[];
  allMotifs: ExtractedMotif[];
  profile: CommanderMechanicalProfile;
  driversList: string[];
  driverProvenance: DriverProvenanceEntry[];
}): {
  causalChainStatus: CausalChainStatus;
  driverCoverage: number;
  conditionCoverage: number;
  engineCoverage: number;
  outputCoverage: number;
  payoffCoverage: number;
  evidenceCoverage: number;
  driverPropagationFailure: boolean;
} {
  const { chain, allMotifs, profile, driversList, driverProvenance } = input;
  const causal = profile.causalRoles;
  const hasDriverEvidence = allMotifs.some((m) => m.causalPosition === "DRIVER");
  const hasPayoffOrOutput = chain.some((m) => m.causalPosition === "PAYOFF" || m.causalPosition === "OUTPUT");
  const driverPropagationFailure = hasDriverEvidence && driversList.length === 0 && hasPayoffOrOutput;

  let causalChainStatus: CausalChainStatus = "COMPLETE";
  if (!hasDriverEvidence && hasPayoffOrOutput) causalChainStatus = "NO_DRIVER_EVIDENCE";
  else if (driverPropagationFailure) causalChainStatus = "PARTIAL_UPSTREAM_MISSING";
  else if (driversList.length > 0 && !hasPayoffOrOutput) causalChainStatus = "PARTIAL_DOWNSTREAM_MISSING";

  const driverMotifs = allMotifs.filter((m) => m.causalPosition === "DRIVER");
  const driverCoverage =
    driverMotifs.length > 0 ? Math.min(1, driversList.length / Math.min(3, driverMotifs.length)) : driversList.length > 0 ? 1 : 0;

  const conditionMotifs = chain.filter((m) => m.causalPosition === "CONDITION");
  const conditionCoverage =
    causal.engineConditions.length > 0
      ? Math.min(1, (conditionMotifs.length + (chain.some((m) => m.causalPosition === "DRIVER") ? 1 : 0)) / 2)
      : conditionMotifs.length > 0
        ? 1
        : 0.5;

  const engineMotifs = chain.filter((m) => m.causalPosition === "ENGINE" || m.causalPosition === "DRIVER");
  const engineCoverage =
    causal.engineActions.length > 0 ? Math.min(1, engineMotifs.length / Math.max(1, causal.engineActions.length * 0.4)) : 0.5;

  const outputMotifs = chain.filter((m) => m.causalPosition === "OUTPUT");
  const outputCoverage =
    causal.engineOutputs.length + causal.resourcesProduced.length > 0
      ? Math.min(1, outputMotifs.length / Math.max(1, causal.engineOutputs.length + causal.resourcesProduced.length))
      : outputMotifs.length > 0
        ? 1
        : 0.5;

  const payoffMotifs = chain.filter((m) => m.causalPosition === "PAYOFF" || m.causalPosition === "OUTPUT");
  const payoffCoverage =
    causal.enginePayoffs.length > 0
      ? Math.min(1, payoffMotifs.length / Math.max(1, causal.enginePayoffs.length))
      : payoffMotifs.length > 0
        ? 1
        : 0.5;

  const evidenceCoverage =
    driverProvenance.length > 0
      ? Math.min(1, driverProvenance.filter((p) => p.evidence.length > 0).length / driverProvenance.length)
      : 0;

  return {
    causalChainStatus,
    driverCoverage,
    conditionCoverage,
    engineCoverage,
    outputCoverage,
    payoffCoverage,
    evidenceCoverage,
    driverPropagationFailure,
  };
}

function buildDriverProvenance(
  chain: ExtractedMotif[],
  seed: ExtractedMotif,
  allMotifs: ExtractedMotif[],
  directionAnchors: DirectionAnchor[] = [],
): { driversList: string[]; provenance: DriverProvenanceEntry[] } {
  const provenance: DriverProvenanceEntry[] = [];
  const driversList: string[] = [];

  for (const m of chain.filter((x) => x.causalPosition === "DRIVER")) {
    if (driversList.includes(m.motifId)) continue;
    driversList.push(m.motifId);
    provenance.push({
      motifId: m.motifId,
      source: "DRIVER_POSITION",
      evidence: m.evidence,
    });
  }

  if (
    driversList.length === 0 &&
    (seed.causalPosition === "ENGINE" || seed.causalPosition === "OUTPUT") &&
    !allMotifs.some((m) => m.causalPosition === "DRIVER")
  ) {
    driversList.push(seed.motifId);
    provenance.push({
      motifId: seed.motifId,
      source: "ENGINE_SEED",
      evidence: seed.evidence,
    });
  }

  const propagatedDrivers = allMotifs.filter(
    (m) => m.causalPosition === "DRIVER" && !driversList.includes(m.motifId),
  );
  for (const d of propagatedDrivers) {
    driversList.push(d.motifId);
    provenance.push({
      motifId: d.motifId,
      source: "PROPAGATED",
      evidence: d.evidence,
    });
  }

  for (const anchor of directionAnchors) {
    const motifId = anchorSeedMotifId(anchor);
    if (!motifId || driversList.includes(motifId)) continue;
    driversList.push(motifId);
    provenance.push({
      motifId,
      source: "ANCHOR_DERIVED",
      evidence: anchor.evidenceRefs,
    });
  }

  return { driversList, provenance };
}

function composeDirectionFromDriver(
  driver: ExtractedMotif,
  allMotifs: ExtractedMotif[],
  profile: CommanderMechanicalProfile,
  rank: number,
  directionAnchors: DirectionAnchor[],
): CommanderBuildDirection | null {
  if (directionAnchors.length === 0) return null;
  if (isPayoffOnlySeed(driver) && !allMotifs.some((m) => m.causalPosition === "DRIVER")) return null;

  const chain = buildDirectionChain(driver, allMotifs, profile.causalRoles);
  const feedbackLoops = detectFeedbackLoops(chain);

  const { driversList, provenance: driverProvenance } = buildDriverProvenance(chain, driver, allMotifs, directionAnchors);

  const driverStrength = Math.max(driver.strength, ...chain.filter((m) => m.causalPosition === "DRIVER").map((m) => m.strength));
  const payoffMotifs = chain.filter((m) => m.causalPosition === "PAYOFF" || m.causalPosition === "OUTPUT");
  const payoffStrength = payoffMotifs.length > 0 ? Math.max(...payoffMotifs.map((m) => m.strength)) : 0;
  const feedbackBoost = feedbackLoops.length > 0 ? 0.12 : 0;

  const payoffs = chain.filter((m) => m.causalPosition === "PAYOFF" || m.causalPosition === "OUTPUT").map((m) => m.motifId);
  const depth = computeCausalDepthScore({
    profile: profile.causalRoles,
    driverMotifIds: driversList.length > 0 ? driversList : [driver.motifId],
    payoffMotifIds: payoffs,
  });

  const coverage = computeChainCoverage({
    chain,
    allMotifs,
    profile,
    driversList,
    driverProvenance,
  });

  const incidentalPenalty =
    coverage.driverPropagationFailure || (driversList.length === 0 && payoffStrength > 0.4)
      ? 0.18 + depth.incidentalSupport * 0.2
      : driver.causalPosition === "OUTPUT" || driver.causalPosition === "PAYOFF"
        ? 0.1 + depth.incidentalSupport * 0.15
        : 0;
  const driverBoost = driversList.length > 0 ? 0.12 : driver.causalPosition === "DRIVER" ? 0.1 : 0;
  const scalableBoost = computeScalableResourceBoost(driver, profile.causalRoles);

  const supportStrength = Math.min(
    1,
    driverStrength * 0.55 +
      payoffStrength * 0.25 +
      profile.causalRoles.repeatability * 0.1 +
      feedbackBoost +
      depth.causalDepth * 0.12 +
      driverBoost +
      scalableBoost -
      incidentalPenalty,
  );

  if (supportStrength < MIN_DIRECTION_SUPPORT) return null;

  const centrality = driverStrength + scalableBoost * 0.5;
  const repeatability = profile.causalRoles.repeatability;
  const { required, optional } = supportFunctionsForMotifs(chain);
  const mapping = mapDirectionToPattern(chain);

  const directionValidity = assessDirectionValidity({
    directionAnchors,
    drivers: driversList,
    payoffs,
    causalChainStatus: coverage.causalChainStatus,
  });

  const retrievalSpecification = buildRetrievalSpecification({
    profile,
    anchors: directionAnchors,
    motifs: chain,
    requiredSupportFunctions: required,
    optionalSupportFunctions: optional,
  });
  const retrievalSpecificationCompleteness = computeRetrievalSpecificationCompleteness(retrievalSpecification);
  const phase6RetrievalReady =
    directionValidity === "ANCHORED" &&
    directionAnchors.length > 0 &&
    retrievalSpecificationCompleteness >= 0.45 &&
    driversList.length > 0;

  const conditions = profile.causalRoles.engineConditions;
  const resourcesConsumed = [...profile.causalRoles.resourcesConsumed, ...profile.causalRoles.costConsumes];
  const resourcesProduced = profile.causalRoles.resourcesProduced;
  const engineActions = [
    ...new Set([
      ...profile.causalRoles.engineActions,
      ...profile.causalRoles.activatedEngineCosts,
      ...chain.filter((m) => m.causalPosition === "ENGINE").map((m) => m.motifId.toLowerCase()),
    ]),
  ];
  const payoffsList = payoffs;

  const mechanicalVector = chain.map((m) => m.strength);

  return {
    rank,
    directionId: `direction:${driver.motifId.toLowerCase()}:${rank}`,
    directionKind: "SINGLE",
    directionAnchors,
    compositeComposition: null,
    drivers: driversList,
    conditions,
    resourcesConsumed,
    resourcesProduced,
    engineActions,
    payoffs: payoffsList,
    feedbackLoops,
    requiredSupportFunctions: required,
    optionalSupportFunctions: optional,
    commandZoneEvidence: profile.evidenceRefs.slice(0, 12).map((e) => e.rule),
    mechanicalVector,
    supportStrength,
    repeatability,
    centrality,
    mappedArchetypeId: mapping.patternId,
    mappedArchetypeLabel: mapping.label,
    labelConfidence: mapping.confidence > 0 ? mapping.confidence : null,
    mechanicalDescription: buildMechanicalDescription(chain, directionAnchors),
    subDirectionIds: chain.filter((m) => !driversList.includes(m.motifId)).map((m) => m.motifId),
    status: mapping.patternId ? "NAMED_ARCHETYPE_MATCHED" : "MECHANICAL_DIRECTION_ONLY",
    catalogFeasibility: null,
    causalChainStatus: coverage.causalChainStatus,
    driverCoverage: coverage.driverCoverage,
    conditionCoverage: coverage.conditionCoverage,
    engineCoverage: coverage.engineCoverage,
    outputCoverage: coverage.outputCoverage,
    payoffCoverage: coverage.payoffCoverage,
    evidenceCoverage: coverage.evidenceCoverage,
    driverProvenance,
    driverPropagationFailure: coverage.driverPropagationFailure,
    directionValidity,
    retrievalSpecification,
    retrievalSpecificationCompleteness,
    phase6RetrievalReady,
  };
}

function composeDirectionFromAnchor(
  anchor: DirectionAnchor,
  allMotifs: ExtractedMotif[],
  allAnchors: DirectionAnchor[],
  profile: CommanderMechanicalProfile,
  rank: number,
): CommanderBuildDirection | null {
  const motifId = anchorSeedMotifId(anchor);
  let seedMotif =
    (motifId ? allMotifs.find((m) => m.motifId === motifId) : null) ??
    allMotifs.find((m) => m.causalPosition === "DRIVER");
  if (!seedMotif && motifId) {
    seedMotif = {
      motifId,
      causalPosition: "DRIVER",
      strength: 0.88,
      evidence: anchor.evidenceRefs,
    };
  }
  if (!seedMotif && anchor.mechanism) {
    const fallbackMotifId = anchorSeedMotifId(anchor) ?? ("STATE_SCALING" as MechanicalMotifId);
    seedMotif = {
      motifId: fallbackMotifId,
      causalPosition: "DRIVER",
      strength: 0.88,
      evidence: anchor.evidenceRefs,
    };
  }
  if (!seedMotif) seedMotif = allMotifs[0];
  if (!seedMotif) return null;
  return composeDirectionFromDriver(
    seedMotif,
    allMotifs,
    profile,
    rank,
    [anchor, ...allAnchors.filter((a) => a.anchorId !== anchor.anchorId)].slice(0, 4),
  );
}

function composeCompositeDirection(
  composition: NonNullable<ReturnType<typeof tryComposeCompositeDirection>>,
  allMotifs: ExtractedMotif[],
  profile: CommanderMechanicalProfile,
  rank: number,
): CommanderBuildDirection | null {
  const anchors = composition.componentAnchors;
  const driversList = [
    ...new Set(
      anchors.flatMap((a) => {
        const motif = anchorSeedMotifId(a);
        const labels = [motif, a.mechanism].filter(Boolean) as string[];
        return labels;
      }),
    ),
  ];
  if (driversList.length === 0) return null;

  const chain = buildDirectionChain(
    allMotifs.find((m) => driversList.includes(m.motifId)) ?? allMotifs[0]!,
    allMotifs,
    profile.causalRoles,
  );
  const { required, optional } = supportFunctionsForMotifs(chain);
  const supportStrength = compositeSupportStrength(composition);
  if (supportStrength < MIN_DIRECTION_SUPPORT) return null;

  const componentDesc = anchors.map((a) => `${a.anchorKind}:${a.mechanism}`).join(" + ");
  const retrievalSpecification = composition.combinedRetrievalSpecification;
  const retrievalSpecificationCompleteness = computeRetrievalSpecificationCompleteness(retrievalSpecification);

  return {
    rank,
    directionId: `direction:composite:${rank}`,
    directionKind: "COMPOSITE",
    directionAnchors: anchors,
    compositeComposition: composition,
    drivers: driversList,
    conditions: profile.causalRoles.engineConditions,
    resourcesConsumed: [...profile.causalRoles.resourcesConsumed, ...profile.causalRoles.costConsumes],
    resourcesProduced: profile.causalRoles.resourcesProduced,
    engineActions: profile.causalRoles.engineActions,
    payoffs: chain.filter((m) => m.causalPosition === "PAYOFF" || m.causalPosition === "OUTPUT").map((m) => m.motifId),
    feedbackLoops: detectFeedbackLoops(chain),
    requiredSupportFunctions: required,
    optionalSupportFunctions: optional,
    commandZoneEvidence: profile.evidenceRefs.slice(0, 12).map((e) => e.rule),
    mechanicalVector: chain.map((m) => m.strength),
    supportStrength,
    repeatability: profile.causalRoles.repeatability,
    centrality: supportStrength,
    mappedArchetypeId: null,
    mappedArchetypeLabel: null,
    labelConfidence: null,
    mechanicalDescription: `COMPOSITE: ${componentDesc}`,
    subDirectionIds: chain.map((m) => m.motifId).filter((id) => !driversList.includes(id)),
    status: "MECHANICAL_DIRECTION_ONLY",
    catalogFeasibility: null,
    causalChainStatus: "COMPLETE",
    driverCoverage: Math.min(1, driversList.length / anchors.length),
    conditionCoverage: 0.5,
    engineCoverage: 0.5,
    outputCoverage: 0.5,
    payoffCoverage: 0.5,
    evidenceCoverage: 1,
    driverProvenance: driversList.map((motifId) => ({
      motifId,
      source: "ANCHOR_DERIVED" as const,
      evidence: anchors.flatMap((a) => a.evidenceRefs),
    })),
    driverPropagationFailure: false,
    directionValidity: "ANCHORED",
    retrievalSpecification,
    retrievalSpecificationCompleteness,
    phase6RetrievalReady:
      retrievalSpecificationCompleteness >= 0.45 &&
      anchors.length >= 2 &&
      retrievalSpecification.requiredFunctions.length +
        retrievalSpecification.requiredInputs.length +
        retrievalSpecification.outputsToExploit.length >
        0,
  };
}

export function discoverCommanderBuildDirections(input: {
  profile: CommanderMechanicalProfile;
  roleIndex?: CatalogRoleIndex;
}): CommanderBuildDirection[] {
  const motifs = extractMechanicalMotifs(input.profile);
  const allAnchors = extractDirectionAnchors({ profile: input.profile, motifs });
  if (allAnchors.length === 0) return [];

  const composite = tryComposeCompositeDirection({
    anchors: allAnchors,
    profile: input.profile,
    motifs,
    causal: input.profile.causalRoles,
  });

  const driverMotifs = motifs.filter((m) => m.causalPosition === "DRIVER");
  const seeds = driverMotifs.length > 0 ? driverMotifs : [];

  const directions: CommanderBuildDirection[] = [];
  const usedSeeds = new Set<string>();

  if (composite) {
    const compositeDir = composeCompositeDirection(composite, motifs, input.profile, 1);
    if (compositeDir) directions.push(compositeDir);
  }

  for (const anchor of allAnchors.slice(0, 4)) {
    const seedKey = anchor.anchorId;
    if (usedSeeds.has(seedKey)) continue;
    usedSeeds.add(seedKey);
    const dir = composeDirectionFromAnchor(anchor, motifs, allAnchors, input.profile, directions.length + 1);
    if (dir && dir.directionValidity === "ANCHORED") directions.push(dir);
    if (directions.length >= 4) break;
  }

  if (directions.length === 0) {
    for (const driver of seeds) {
      if (isPayoffOnlySeed(driver)) continue;
      const dir = composeDirectionFromDriver(driver, motifs, input.profile, 1, allAnchors);
      if (dir && dir.directionValidity === "ANCHORED") {
        directions.push(dir);
        break;
      }
    }
  }

  if (input.roleIndex) {
    for (const d of directions) {
      const chainMotifs = motifs.filter((m) => d.drivers.includes(m.motifId) || d.subDirectionIds.includes(m.motifId));
      d.catalogFeasibility = assessBuildDirectionCatalogFeasibility({ motifs: chainMotifs, roleIndex: input.roleIndex });
    }
  }

  directions.sort((a, b) => b.supportStrength - a.supportStrength);
  directions.forEach((d, i) => {
    d.rank = i + 1;
  });

  return directions;
}

export function hasValidBuildDirection(directions: CommanderBuildDirection[]): boolean {
  return directions.some(
    (d) => d.supportStrength >= MIN_DIRECTION_SUPPORT && d.directionValidity === "ANCHORED" && d.directionAnchors.length > 0,
  );
}
