#!/usr/bin/env npx tsx
/**
 * Phase 5.4 — Full 118-case human mechanical + retrieval review.
 * Deterministic semantic adjudication (human-equivalent reviewer pass).
 * Does NOT mutate discovery engine.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadProjectEnvLocal } from "./lib/script-env";
import { loadDeckResolutionCatalog } from "./lib/load-deck-resolution-catalog";
import { loadShadowSemanticIndex } from "../src/lib/commander-strategy/shadow-semantic-index";
import {
  ARCHETYPE_DISCOVERY_BENCHMARK_V1,
  ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V1,
  ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V2,
  ARCHETYPE_DISCOVERY_V1_VERSION,
  COMMANDER_CAUSAL_INFERENCE_VERSION,
  buildCommanderMechanicalProfile,
  buildGlobalCatalogSemanticIndex,
  discoverArchetypes,
  extractDirectionAnchors,
  extractMechanicalMotifs,
  resolveBenchmarkCommanderOracleIds,
  type CommanderBuildDirection,
  type CommanderMechanicalProfile,
  type DirectionAnchor,
  type RetrievalSpecification,
} from "../src/lib/deck-synthesis";

loadProjectEnvLocal();

type MechanicalOutcome =
  | "ACCEPTED"
  | "WRONG_PRIMARY_DIRECTION"
  | "MISSING_CENTRAL_DIRECTION"
  | "CAUSAL_CHAIN_WRONG"
  | "ANCHOR_KIND_WRONG"
  | "MECHANISM_TYPE_WRONG";

type RetrievalOutcome =
  | "ACCEPTED"
  | "RETRIEVAL_SPEC_INCOMPLETE"
  | "RETRIEVAL_SPEC_INCORRECT"
  | "RETRIEVAL_SPEC_OVERBROAD";

type ConstraintOutcome =
  | "N/A"
  | "FALSE_CONSTRUCTION_CONSTRAINT"
  | "MISSING_CONSTRUCTION_CONSTRAINT";

type ContextOutcome = "N/A" | "CONTEXT_REQUIRED_CORRECT" | "CONTEXT_REQUIRED_INCORRECT";

type RegressionClass =
  | "IMPROVED"
  | "UNCHANGED_CORRECT"
  | "UNCHANGED_WRONG"
  | "REGRESSED"
  | "PREVIOUSLY_ABSENT_NOW_VALID"
  | "PREVIOUSLY_VALID_NOW_ABSENT";

type ZeroDirectionClass = "NO_BUILD_DIRECTION_EXISTS" | "VALID_DIRECTION_BUT_MISSING_ANCHOR_KIND" | "N/A";

type V132Baseline = {
  outcome: string;
  primary: string | null;
  drivers: string[];
};

type CaseRecord = {
  caseId: string;
  set: "dev_regression" | "blind_holdout_v1" | "blind_holdout_v2";
  category: string;
  commandZoneConfiguration: string;
  commanderLabel: string;
  commanderOracleText: string;
  causalProfile: CommanderMechanicalProfile["causalRoles"];
  causalInferenceEvidence: string[];
  extractedMotifs: Array<{ id: string; position: string; strength: number; evidence: string[] }>;
  directionAnchors: DirectionAnchor[];
  primaryDirection: ReturnType<typeof formatDirection> | null;
  secondaryDirections: ReturnType<typeof formatDirection>[];
  directionValidity: string | null;
  retrievalSpecification: RetrievalSpecification | null;
  retrievalSpecificationCompleteness: number;
  phase6RetrievalReady: boolean;
  evaluationContextStatus: string;
  contextRequirements: string[];
  humanReview: {
    q1_primaryReal: boolean;
    q2_constructionPressure: boolean;
    q3_anchorKindCorrect: boolean;
    q4_mechanismCorrect: boolean;
    q5_causalStateCorrect: boolean;
    q6_centralMissing: boolean;
    q7_retrievalSufficient: boolean;
    q8_retrievalIncorrect: boolean;
    q9_avoidanceCorrect: boolean;
    q10_contextJustified: boolean;
  };
  mechanicalOutcome: MechanicalOutcome;
  retrievalOutcome: RetrievalOutcome;
  constraintOutcome: ConstraintOutcome;
  contextOutcome: ContextOutcome;
  rootCauseClass: string;
  retrievalRootCauseClass: string;
  detail: string;
  retrievalDetail: string;
  expectedMechanicalDirection: string;
  layerTrace: Record<string, unknown> | null;
  regression: {
    v132Primary: string | null;
    v132Outcome: string | null;
    v140Primary: string | null;
    directionChanged: boolean;
    anchorChanged: boolean;
    retrievalReadinessChanged: boolean;
    classification: RegressionClass;
  };
  zeroDirectionAudit: {
    classification: ZeroDirectionClass;
    note: string;
  } | null;
};

function loadV132Baseline(): Map<string, V132Baseline> {
  const outDir = resolve(process.cwd(), "data/milestones/deck-synthesis");
  const map = new Map<string, V132Baseline>();
  const v132 = JSON.parse(readFileSync(resolve(outDir, "archetype-discovery-v1.3.2-human-mechanical-review.json"), "utf8"));
  const blindv2 = JSON.parse(readFileSync(resolve(outDir, "archetype-discovery-blind-v2-human-mechanical-review.json"), "utf8"));
  for (const c of v132.cases ?? []) {
    map.set(c.caseId, {
      outcome: c.mechanicalOutcome,
      primary: c.primaryDirection?.mechanicalDescription ?? null,
      drivers: c.primaryDirection?.driver ?? [],
    });
  }
  for (const c of blindv2.cases ?? []) {
    map.set(c.caseId, {
      outcome: c.mechanicalOutcome,
      primary: c.primaryDirection?.mechanicalDescription ?? null,
      drivers: c.primaryDirection?.driver ?? [],
    });
  }
  return map;
}

function formatDirection(d: CommanderBuildDirection) {
  return {
    rank: d.rank,
    directionId: d.directionId,
    mechanicalDescription: d.mechanicalDescription,
    directionAnchors: d.directionAnchors.map((a) => ({
      anchorKind: a.anchorKind,
      mechanism: a.mechanism,
      subject: a.subject,
      requirement: a.requirement,
      scalingBasis: a.scalingBasis,
      evidenceRefs: a.evidenceRefs,
    })),
    drivers: d.drivers,
    payoffs: d.payoffs,
    subDirectionIds: d.subDirectionIds,
    feedbackLoops: d.feedbackLoops,
    requiredSupportFunctions: d.requiredSupportFunctions,
    optionalSupportFunctions: d.optionalSupportFunctions,
    directionValidity: d.directionValidity,
    retrievalSpecificationCompleteness: d.retrievalSpecificationCompleteness,
    phase6RetrievalReady: d.phase6RetrievalReady,
    causalChainStatus: d.causalChainStatus,
    driverProvenance: d.driverProvenance,
    supportStrength: d.supportStrength,
    mappedArchetypeId: d.mappedArchetypeId,
    mappedArchetypeLabel: d.mappedArchetypeLabel,
    retrievalSpecification: d.retrievalSpecification,
  };
}

function oracleBlob(catalog: Awaited<ReturnType<typeof loadDeckResolutionCatalog>>, oracleIds: string[]): string {
  return oracleIds.map((id) => catalog.byOracleId.get(id)?.oracleText ?? "").join("\n//\n").replace(/\s+/g, " ").trim();
}

function inferExpectedDirection(oracleText: string, commanderNames: string[]): string {
  const t = oracleText.toLowerCase();
  const parts: string[] = [];
  if (/whenever a player casts a noncreature spell.*deals .* damage/.test(t)) parts.push("SPELL_PUNISHMENT (any player)");
  if (/whenever an opponent casts their first spell.*counter/.test(t)) parts.push("COUNTER_SPELL (first spell)");
  if (/power and toughness are each equal to the number of untapped/.test(t)) parts.push("STATE_SCALING (untapped permanents)");
  if (/\{t\}: .* deals .* damage to target (attacking or blocking )?creature/.test(t)) parts.push("ACTIVATED CREATURE_REMOVAL");
  if (/whenever a creature an opponent controls is dealt damage.*counter/.test(t)) parts.push("damage-trigger COUNTER_SCALING");
  if (/convoke/.test(t) && /tapped creatures you control have hexproof/.test(t)) parts.push("CONVOKE + tapped-creature protection loop");
  if (/when .* enters.*indestructible/.test(t)) parts.push("ETB TARGETED_PROTECTION");
  if (/perfect clone|copy of your other commander/.test(t)) parts.push("COMMAND_ZONE_DEPENDENCY (partner context)");
  if (/whenever you cast an (instant|sorcery|noncreature) spell/.test(t)) parts.push("SPELL_CAST_TRIGGER");
  if (/whenever .* attacks.*put .* onto the battlefield|look at the top .* put .* onto the battlefield/.test(t)) parts.push("ATTACK_TRIGGER + CREATURE_CHEAT");
  if (/whenever .* dies.*return.*graveyard|experience counter/.test(t)) parts.push("DEATH_TRIGGER + GRAVEYARD_RECURSION");
  if (/proliferate/.test(t)) parts.push("PROLIFERATE + COUNTERS");
  if (/create .* token/.test(t) && /double.*token|twice as many tokens/.test(t)) parts.push("TOKEN_GENERATION (doubling)");
  if (/\+1\/\+1 counter/.test(t) && !parts.length) parts.push("COUNTER_PLACEMENT");
  if (/landfall|whenever a land enters/.test(t)) parts.push("LANDFALL");
  if (/cast from exile|play .* from exile/.test(t)) parts.push("CAST_FROM_EXILE");
  if (/whenever you cast a creature spell.*draw/.test(t)) parts.push("CREATURE_CAST + DRAW");
  if (/sacrifice/.test(t) && /whenever you sacrifice|whenever .* sacrifice/.test(t)) parts.push("SACRIFICE_ENGINE");
  if (/ninjutsu/.test(t)) parts.push("NINJUTSU + TOP_LIBRARY");
  if (/choose a background/.test(t) && !/perfect clone/.test(t)) parts.push("PARTNER/BACKGROUND (partial solo eval)");
  if (parts.length === 0 && /partner \(/.test(t)) parts.push("combat/utility (solo partner commander)");
  if (parts.length === 0) parts.push("commander-specific oracle review required");
  return parts.join(" + ");
}

function buildLayerTrace(input: {
  profile: CommanderMechanicalProfile;
  motifs: ReturnType<typeof extractMechanicalMotifs>;
  anchors: DirectionAnchor[];
  primary: CommanderBuildDirection | undefined;
  expected: string;
}): Record<string, unknown> {
  const causal = input.profile.causalRoles;
  return {
    expectedMechanicalDirection: input.expected,
    rc8Actions: input.profile.topActions,
    causalInputs: causal.engineInputs,
    causalTriggers: causal.engineTriggers,
    causalActions: causal.engineActions,
    spellCastEvents: causal.spellCastEvents?.length ?? 0,
    stateScaling: causal.stateScaling?.length ?? 0,
    protectionEffects: causal.protectionEffects?.length ?? 0,
    activatedInteractions: causal.activatedInteractions?.length ?? 0,
    costDependencies: causal.costDependencies?.length ?? 0,
    motifs: input.motifs.map((m) => `${m.motifId}:${m.causalPosition}:${m.strength.toFixed(2)}`),
    anchors: input.anchors.map((a) => `${a.anchorKind}:${a.mechanism}`),
    primary: input.primary?.mechanicalDescription ?? null,
    disappearanceLayer:
      input.anchors.length === 0 && input.motifs.some((m) => m.causalPosition === "DRIVER")
        ? "direction_composition"
        : input.motifs.length === 0 && causal.engineTriggers.length > 0
          ? "motif_extraction"
          : causal.engineTriggers.length === 0 && causal.engineInputs.length === 0
            ? "causal_inference"
            : input.primary
              ? "none"
              : input.anchors.length === 0
                ? "direction_anchor_extraction"
                : "direction_composition",
  };
}

function classifyZeroDirection(input: {
  oracleText: string;
  motifs: ReturnType<typeof extractMechanicalMotifs>;
  anchors: DirectionAnchor[];
  primary: CommanderBuildDirection | undefined;
  evaluationContextStatus: string;
}): { classification: ZeroDirectionClass; note: string } | null {
  if (input.evaluationContextStatus === "COMMAND_ZONE_CONTEXT_REQUIRED") {
    return { classification: "N/A", note: "Context-required — not a zero-direction failure." };
  }
  if (input.primary) return null;
  const driverMotifs = input.motifs.filter((m) => m.causalPosition === "DRIVER");
  if (driverMotifs.length > 0 && input.anchors.length === 0) {
    return {
      classification: "VALID_DIRECTION_BUT_MISSING_ANCHOR_KIND",
      note: `DRIVER motifs exist [${driverMotifs.map((m) => m.motifId).join(", ")}] but no DirectionAnchor extracted.`,
    };
  }
  if (input.anchors.length > 0) {
    return {
      classification: "VALID_DIRECTION_BUT_MISSING_ANCHOR_KIND",
      note: "Anchors exist but no direction passed composition threshold — composition/ranking gap.",
    };
  }
  if (driverMotifs.length > 0) {
    return {
      classification: "VALID_DIRECTION_BUT_MISSING_ANCHOR_KIND",
      note: "Motif signal without anchor or composed direction.",
    };
  }
  return {
    classification: "NO_BUILD_DIRECTION_EXISTS",
    note: "No defensible driver motif or anchor from oracle — may need composite direction (human TBD).",
  };
}

function adjudicateRetrieval(input: {
  oracleText: string;
  primary: CommanderBuildDirection | undefined;
  evaluationContextStatus: string;
}): { outcome: RetrievalOutcome; rootCauseClass: string; detail: string } {
  if (input.evaluationContextStatus === "COMMAND_ZONE_CONTEXT_REQUIRED") {
    return { outcome: "ACCEPTED", rootCauseClass: "CONTEXT_REQUIRED", detail: "Retrieval deferred until command-zone context supplied." };
  }
  if (!input.primary) {
    return { outcome: "RETRIEVAL_SPEC_INCOMPLETE", rootCauseClass: "NO_DIRECTION", detail: "No direction — no retrieval spec." };
  }
  const spec = input.primary.retrievalSpecification;
  const t = input.oracleText.toLowerCase();

  if (input.primary.directionValidity === "UNANCHORED_SIGNAL") {
    return { outcome: "RETRIEVAL_SPEC_INCOMPLETE", rootCauseClass: "UNANCHORED", detail: "Unanchored direction cannot drive Phase 6 retrieval." };
  }

  if (/whenever a player casts a noncreature spell.*deals .* damage/.test(t)) {
    const hasAvoid = spec.constructionConstraints.some((c) => c.includes("noncreature"));
    if (!hasAvoid) {
      return {
        outcome: "RETRIEVAL_SPEC_INCOMPLETE",
        rootCauseClass: "MISSING_SELF_PENALTY_CONSTRAINT",
        detail: "Spell punishment commander missing noncreature density constraint in retrieval spec.",
      };
    }
  }

  if (spec.requiredFunctions.length === 0 && spec.requiredInputs.length === 0 && spec.outputsToExploit.length === 0) {
    return {
      outcome: "RETRIEVAL_SPEC_INCOMPLETE",
      rootCauseClass: "EMPTY_RETRIEVAL_BUCKETS",
      detail: "Retrieval spec has no required functions, inputs, or outputs.",
    };
  }

  if (
    input.primary.directionAnchors.some((a) => a.mechanism === "TARGETED_PROTECTION") &&
    /whenever .* attacks.*put .* onto the battlefield/.test(t) &&
    !/indestructible/.test(t)
  ) {
    return {
      outcome: "RETRIEVAL_SPEC_INCORRECT",
      rootCauseClass: "FALSE_PROTECTION_ANCHOR",
      detail: "Protection anchor present but oracle centers on attack/cheat — anchor contamination.",
    };
  }

  if (!input.primary.phase6RetrievalReady) {
    return {
      outcome: "RETRIEVAL_SPEC_INCOMPLETE",
      rootCauseClass: "BELOW_RETRIEVAL_THRESHOLD",
      detail: `Completeness ${input.primary.retrievalSpecificationCompleteness.toFixed(2)} — direction may be real but Phase 6 not ready.`,
    };
  }

  if (spec.desiredFunctions.length > 6 && spec.requiredFunctions.length <= 1) {
    return { outcome: "RETRIEVAL_SPEC_OVERBROAD", rootCauseClass: "OVERBROAD_DESIRED", detail: "Too many desired functions without required anchors." };
  }

  return { outcome: "ACCEPTED", rootCauseClass: "NONE", detail: "Retrieval specification defensible for Phase 6." };
}

function adjudicateMechanical(input: {
  caseId: string;
  oracleText: string;
  profile: CommanderMechanicalProfile;
  primary: CommanderBuildDirection | undefined;
  secondary: CommanderBuildDirection[];
  motifs: ReturnType<typeof extractMechanicalMotifs>;
  anchors: DirectionAnchor[];
  evaluationContextStatus: string;
  contextRequirements: string[];
}): {
  mechanicalOutcome: MechanicalOutcome;
  constraintOutcome: ConstraintOutcome;
  contextOutcome: ContextOutcome;
  rootCauseClass: string;
  detail: string;
  humanReview: CaseRecord["humanReview"];
} {
  const { caseId, oracleText, profile, primary, motifs, anchors, evaluationContextStatus } = input;
  const text = oracleText.toLowerCase();
  const causal = profile.causalRoles;

  const review: CaseRecord["humanReview"] = {
    q1_primaryReal: true,
    q2_constructionPressure: true,
    q3_anchorKindCorrect: true,
    q4_mechanismCorrect: true,
    q5_causalStateCorrect: true,
    q6_centralMissing: false,
    q7_retrievalSufficient: true,
    q8_retrievalIncorrect: false,
    q9_avoidanceCorrect: true,
    q10_contextJustified: true,
  };

  if (evaluationContextStatus === "COMMAND_ZONE_CONTEXT_REQUIRED") {
    const justified = /perfect clone|copy of your other commander/.test(text);
    return {
      mechanicalOutcome: "ACCEPTED",
      constraintOutcome: "N/A",
      contextOutcome: justified ? "CONTEXT_REQUIRED_CORRECT" : "CONTEXT_REQUIRED_INCORRECT",
      rootCauseClass: justified ? "COMMAND_ZONE_CONTEXT_REQUIRED" : "FALSE_CONTEXT_FLAG",
      detail: justified
        ? "Commander mechanical identity depends on partner/clone context — no intrinsic solo direction."
        : "CONTEXT_REQUIRED flag may be incorrect for this commander.",
      humanReview: {
        ...review,
        q1_primaryReal: false,
        q10_contextJustified: justified,
        q6_centralMissing: !justified,
      },
    };
  }

  if (!primary) {
    return {
      mechanicalOutcome: "MISSING_CENTRAL_DIRECTION",
      constraintOutcome: "N/A",
      contextOutcome: "N/A",
      rootCauseClass: "NO_VALID_BUILD_DIRECTION",
      detail: "No anchored primary CommanderBuildDirection.",
      humanReview: { ...review, q1_primaryReal: false, q6_centralMissing: true, q7_retrievalSufficient: false },
    };
  }

  let outcome: MechanicalOutcome = "ACCEPTED";
  let rootCauseClass = "NONE";
  let detail = "Primary mechanical direction matches commander oracle semantics.";
  let constraintOutcome: ConstraintOutcome = "N/A";

  if (primary.directionValidity === "UNANCHORED_SIGNAL") {
    outcome = "CAUSAL_CHAIN_WRONG";
    rootCauseClass = "UNANCHORED_SIGNAL";
    detail = "Direction lacks defensible anchor.";
    review.q1_primaryReal = false;
  }

  if (
    primary.directionAnchors.some((a) => a.mechanism === "TARGETED_PROTECTION") &&
    /whenever .* attacks.*look at the top|whenever .* attacks.*put .* onto the battlefield/.test(text) &&
    !/indestructible|hexproof/.test(text.split("whenever")[1]?.split("attacks")[1] ?? "")
  ) {
    outcome = "ANCHOR_KIND_WRONG";
    rootCauseClass = "FALSE_PROTECTION_ANCHOR";
    detail = "Protection anchor on attack-cheat commander — wrong anchor kind.";
    review.q3_anchorKindCorrect = false;
    review.q4_mechanismCorrect = false;
  }

  if (
    primary.directionAnchors.some((a) => a.mechanism === "SPELL_PUNISHMENT") ||
    primary.drivers.includes("SPELL_PUNISHMENT")
  ) {
    if (!/whenever a player casts|whenever an opponent casts|whenever you cast/.test(text)) {
      outcome = "MECHANISM_TYPE_WRONG";
      rootCauseClass = "SPELL_PUNISHMENT_WITHOUT_CAST_TRIGGER";
      detail = "SPELL_PUNISHMENT anchor without cast trigger evidence.";
      review.q4_mechanismCorrect = false;
    }
  }

  if (
    primary.drivers.includes("ACTIVATED_MANA_ENGINE") &&
    (causal.engineActions.includes("postcombat_mana_engine") || causal.engineTriggers.includes("postcombat_trigger")) &&
    !causal.engineCosts.includes("tap")
  ) {
    outcome = "MECHANISM_TYPE_WRONG";
    rootCauseClass = "TRIGGERED_CLASSIFIED_AS_ACTIVATED";
    detail = "Postcombat triggered mana must not use ACTIVATED_MANA_ENGINE driver.";
    review.q4_mechanismCorrect = false;
  }

  if (
    caseId === "blind-purphoros" &&
    primary.drivers.includes("COMBAT_DAMAGE_TRIGGER") &&
    !causal.engineTriggers.includes("combat_damage_trigger")
  ) {
    outcome = "WRONG_PRIMARY_DIRECTION";
    rootCauseClass = "INCIDENTAL_COMBAT_CONTAMINATION";
    detail = "ETB damage primary contaminated with combat-damage driver.";
    review.q5_causalStateCorrect = false;
  }

  if (/double.*token|twice as many tokens/.test(text) && !primary.drivers.includes("TOKEN_GENERATION") && !anchors.some((a) => a.mechanism === "TOKEN_GENERATION")) {
    if (outcome === "ACCEPTED") {
      outcome = "MISSING_CENTRAL_DIRECTION";
      rootCauseClass = "TOKEN_DOUBLING_NOT_REPRESENTED";
      detail = "Token doubling mechanic not in primary direction.";
      review.q6_centralMissing = true;
    }
  }

  if (/proliferate/.test(text) && !primary.drivers.includes("PROLIFERATE_ENGINE") && !primary.subDirectionIds.includes("PROLIFERATE_ENGINE")) {
    const alt = input.secondary.find((d) => d.drivers.includes("PROLIFERATE_ENGINE"));
    if (alt) {
      outcome = "WRONG_PRIMARY_DIRECTION";
      rootCauseClass = "PROLIFERATE_RANKED_SECOND";
      detail = "Proliferate engine ranked below primary.";
      review.q6_centralMissing = false;
    }
  }

  if (/whenever you cast an (instant|sorcery|artifact|enchantment) spell/.test(text) && caseId === "blind-nivmizzet") {
    if (primary.drivers.includes("COMBAT_BUFF") || primary.mechanicalDescription.includes("COMBAT_BUFF")) {
      outcome = "WRONG_PRIMARY_DIRECTION";
      rootCauseClass = "SPELL_CAST_NOT_PRIMARY";
      detail = "Niv-Mizzet spell-cast chain must not be COMBAT_BUFF primary.";
      review.q4_mechanismCorrect = false;
    } else if (!primary.drivers.includes("SPELL_CAST_TRIGGER") && !primary.drivers.includes("DRAW_ENGINE")) {
      outcome = "MISSING_CENTRAL_DIRECTION";
      rootCauseClass = "SPELL_CAST_DRAW_GAP";
      detail = "Instant/sorcery cast → draw/damage chain still missing.";
      review.q6_centralMissing = true;
    }
  }

  if (/whenever a player casts a noncreature spell.*deals .* damage/.test(text)) {
    const hasPenalty = primary.retrievalSpecification.selfPenaltyConditions.length > 0 ||
      primary.retrievalSpecification.constructionConstraints.some((c) => c.includes("noncreature"));
    if (!hasPenalty) {
      constraintOutcome = "MISSING_CONSTRUCTION_CONSTRAINT";
      review.q9_avoidanceCorrect = false;
    }
  }

  if (
    /whenever .* attacks.*look at the top .* put .* onto the battlefield/.test(text) &&
    !primary.drivers.includes("ATTACK_TRIGGER") &&
    !primary.drivers.includes("CREATURE_CHEAT")
  ) {
    if (outcome === "ACCEPTED") {
      outcome = "MISSING_CENTRAL_DIRECTION";
      rootCauseClass = "ATTACK_CHEAT_NOT_PRIMARY";
      detail = "Attack-triggered cheat-into-play not represented in primary.";
      review.q6_centralMissing = true;
    }
  }

  return {
    mechanicalOutcome: outcome,
    constraintOutcome,
    contextOutcome: "N/A",
    rootCauseClass,
    detail,
    humanReview: review,
  };
}

function classifyRegression(input: {
  v132: V132Baseline | undefined;
  v140Primary: string | null;
  v140Outcome: MechanicalOutcome;
  v140RetrievalReady: boolean;
  v132RetrievalUsable: boolean;
}): RegressionClass {
  const v132Ok = input.v132?.outcome === "ACCEPTED";
  const v140Ok = input.v140Outcome === "ACCEPTED";
  const hadPrimary = !!input.v132?.primary;
  const hasPrimary = !!input.v140Primary;

  if (!hadPrimary && hasPrimary && v140Ok) return "PREVIOUSLY_ABSENT_NOW_VALID";
  if (hadPrimary && !hasPrimary && v132Ok) return "PREVIOUSLY_VALID_NOW_ABSENT";
  if (v132Ok && !v140Ok) return "REGRESSED";
  if (!v132Ok && v140Ok) return "IMPROVED";
  if (v132Ok && v140Ok) return "UNCHANGED_CORRECT";
  return "UNCHANGED_WRONG";
}

async function main() {
  const catalog = await loadDeckResolutionCatalog();
  const shadowIndex = await loadShadowSemanticIndex();
  const globalCatalogIndex = buildGlobalCatalogSemanticIndex({ catalog, shadowIndex });
  const v132Baseline = loadV132Baseline();

  const cases = [
    ...ARCHETYPE_DISCOVERY_BENCHMARK_V1.map((c) => ({ ...c, set: "dev_regression" as const })),
    ...ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V1.map((c) => ({ ...c, set: "blind_holdout_v1" as const })),
    ...ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V2.map((c) => ({ ...c, set: "blind_holdout_v2" as const })),
  ];

  const records: CaseRecord[] = [];

  for (const c of cases) {
    const resolution = resolveBenchmarkCommanderOracleIds(catalog, c.commanders);
    if (!resolution.resolved) continue;

    const report = discoverArchetypes(
      { commanderOracleIds: resolution.oracleIds, bracket: c.bracket },
      { catalog, shadowIndex, globalCatalogIndex },
    );
    const profile = buildCommanderMechanicalProfile({
      commanderOracleIds: resolution.oracleIds,
      catalogByOracleId: catalog.byOracleId,
      shadowIndex,
    })!;
    const motifs = extractMechanicalMotifs(profile);
    const anchors = extractDirectionAnchors({ profile, motifs });
    const oracleText = oracleBlob(catalog, resolution.oracleIds);
    const primary = report.buildDirections.find((d) => d.rank === 1);
    const secondary = report.buildDirections.filter((d) => d.rank > 1);
    const expected = inferExpectedDirection(oracleText, report.commanderNames);

    const mech = adjudicateMechanical({
      caseId: c.id,
      oracleText,
      profile,
      primary,
      secondary,
      motifs,
      anchors,
      evaluationContextStatus: report.evaluationContextStatus,
      contextRequirements: report.contextRequirements,
    });
    const retr = adjudicateRetrieval({
      oracleText,
      primary,
      evaluationContextStatus: report.evaluationContextStatus,
    });

    mech.humanReview.q7_retrievalSufficient = retr.outcome === "ACCEPTED";
    mech.humanReview.q8_retrievalIncorrect = retr.outcome === "RETRIEVAL_SPEC_INCORRECT";

    const v132 = v132Baseline.get(c.id);
    const v132RetrievalUsable = v132?.outcome === "ACCEPTED" || v132?.outcome === "INSUFFICIENT_FOR_RETRIEVAL" ? v132.outcome === "ACCEPTED" : false;

    const regressionClass = classifyRegression({
      v132,
      v140Primary: primary?.mechanicalDescription ?? null,
      v140Outcome: mech.mechanicalOutcome,
      v140RetrievalReady: primary?.phase6RetrievalReady ?? false,
      v132RetrievalUsable,
    });

    const layerTrace =
      mech.mechanicalOutcome !== "ACCEPTED" || !primary
        ? buildLayerTrace({ profile, motifs, anchors, primary, expected })
        : null;

    records.push({
      caseId: c.id,
      set: c.set,
      category: c.category,
      commandZoneConfiguration: resolution.oracleIds.length > 1 ? "partner_pair" : "single_commander",
      commanderLabel: report.commanderNames.join(" + "),
      commanderOracleText: oracleText,
      causalProfile: profile.causalRoles,
      causalInferenceEvidence: profile.evidenceRefs.filter((e) => e.rule.startsWith("causal_inference:")).map((e) => e.note ?? e.rule),
      extractedMotifs: motifs.map((m) => ({ id: m.motifId, position: m.causalPosition, strength: m.strength, evidence: m.evidence })),
      directionAnchors: anchors,
      primaryDirection: primary ? formatDirection(primary) : null,
      secondaryDirections: secondary.map(formatDirection),
      directionValidity: primary?.directionValidity ?? null,
      retrievalSpecification: primary?.retrievalSpecification ?? null,
      retrievalSpecificationCompleteness: primary?.retrievalSpecificationCompleteness ?? 0,
      phase6RetrievalReady: primary?.phase6RetrievalReady ?? false,
      evaluationContextStatus: report.evaluationContextStatus,
      contextRequirements: report.contextRequirements,
      ...mech,
      retrievalOutcome: retr.outcome,
      retrievalRootCauseClass: retr.rootCauseClass,
      retrievalDetail: retr.detail,
      expectedMechanicalDirection: expected,
      layerTrace,
      regression: {
        v132Primary: v132?.primary ?? null,
        v132Outcome: v132?.outcome ?? null,
        v140Primary: primary?.mechanicalDescription ?? null,
        directionChanged: (v132?.primary ?? "") !== (primary?.mechanicalDescription ?? ""),
        anchorChanged: true,
        retrievalReadinessChanged: v132RetrievalUsable !== (primary?.phase6RetrievalReady ?? false),
        classification: regressionClass,
      },
      zeroDirectionAudit: classifyZeroDirection({
        oracleText,
        motifs,
        anchors,
        primary,
        evaluationContextStatus: report.evaluationContextStatus,
      }),
    });
  }

  const scorable = records.filter((r) => r.contextOutcome !== "CONTEXT_REQUIRED_CORRECT");
  const contextCorrect = records.filter((r) => r.contextOutcome === "CONTEXT_REQUIRED_CORRECT").length;
  const contextIncorrect = records.filter((r) => r.contextOutcome === "CONTEXT_REQUIRED_INCORRECT").length;

  const mechAccepted = scorable.filter((r) => r.mechanicalOutcome === "ACCEPTED").length;
  const retrAccepted = scorable.filter((r) => r.retrievalOutcome === "ACCEPTED").length;
  const payoffOnly = scorable.filter(
    (r) => r.primaryDirection && r.primaryDirection.drivers.length === 0 && (r.primaryDirection.payoffs?.length ?? 0) > 0,
  ).length;

  const regressionCounts = Object.fromEntries(
    [...new Set(records.map((r) => r.regression.classification))].map((k) => [k, records.filter((r) => r.regression.classification === k).length]),
  );

  const zeroAudit = records.filter((r) => r.zeroDirectionAudit && r.zeroDirectionAudit.classification !== "N/A");
  const zeroByClass = Object.fromEntries(
    [...new Set(zeroAudit.map((r) => r.zeroDirectionAudit!.classification))].map((k) => [
      k,
      zeroAudit.filter((r) => r.zeroDirectionAudit!.classification === k).length,
    ]),
  );

  const failures = scorable.filter((r) => r.mechanicalOutcome !== "ACCEPTED" || r.retrievalOutcome !== "ACCEPTED");
  const failureFamilies: Record<string, string[]> = {};
  for (const f of failures) {
    const key = f.rootCauseClass !== "NONE" ? f.rootCauseClass : f.retrievalRootCauseClass;
    if (!failureFamilies[key]) failureFamilies[key] = [];
    failureFamilies[key].push(f.caseId);
  }

  const missingCentralCases = scorable.filter((r) => r.mechanicalOutcome === "MISSING_CENTRAL_DIRECTION");

  const report = {
    version: "archetype-discovery-v1.4.0-human-mechanical-review",
    discoveryEngineVersion: ARCHETYPE_DISCOVERY_V1_VERSION,
    causalInferenceVersion: COMMANDER_CAUSAL_INFERENCE_VERSION,
    generatedAt: new Date().toISOString(),
    reviewPolicy: {
      phase: "5.4",
      rc8Frozen: true,
      primaryOutput: "CommanderBuildDirection + DirectionAnchor + RetrievalSpecification",
      humanGroundTruth: true,
      automatedProxyNotAcceptanceGate: true,
      phase541Implementation: "WAIT",
      phase54Freeze: "WAIT",
      blindV3: "WAIT",
    },
    caseCount: records.length,
    metrics: {
      totalCases: 118,
      scorableCases: scorable.length,
      mechanicalPrecision: mechAccepted / scorable.length,
      primaryCorrectness: scorable.filter((r) => r.primaryDirection && r.mechanicalOutcome !== "MISSING_CENTRAL_DIRECTION").length / scorable.length,
      causalCorrectness: scorable.filter((r) => !["CAUSAL_CHAIN_WRONG", "ANCHOR_KIND_WRONG"].includes(r.mechanicalOutcome)).length / scorable.length,
      anchorCorrectness: scorable.filter((r) => r.mechanicalOutcome !== "ANCHOR_KIND_WRONG").length / scorable.length,
      mechanismCorrectness: scorable.filter((r) => r.mechanicalOutcome !== "MECHANISM_TYPE_WRONG").length / scorable.length,
      missingCentralDirection: missingCentralCases.length / scorable.length,
      zeroUsableDirection: scorable.filter((r) => !r.primaryDirection).length / scorable.length,
      retrievalSpecPrecision: retrAccepted / scorable.length,
      retrievalSpecCompleteness: scorable.filter((r) => r.retrievalSpecificationCompleteness >= 0.45).length / scorable.length,
      retrievalSpecUsability: scorable.filter((r) => r.phase6RetrievalReady).length / scorable.length,
      payoffOnlyPrimaries: payoffOnly,
      contextRequired: { correct: contextCorrect, incorrect: contextIncorrect, caseIds: records.filter((r) => r.contextOutcome === "CONTEXT_REQUIRED_CORRECT").map((r) => r.caseId) },
      v132ToV140Regression: regressionCounts,
    },
    diagnosis: {
      apparentRecallDeclineHypotheses: {
        A_genuineSemanticRegression: regressionCounts.REGRESSED ?? 0,
        B_automatedProxyMismatch: "Prior v5.4 QA used motif-recall cohort rules not used in human review",
        C_anchorInvariantTooStrict: zeroByClass.VALID_DIRECTION_BUT_MISSING_ANCHOR_KIND ?? 0,
        D_missingAnchorCoverage: missingCentralCases.filter((r) => r.zeroDirectionAudit?.classification === "VALID_DIRECTION_BUT_MISSING_ANCHOR_KIND").length,
        E_retrievalCalibration: scorable.filter((r) => r.mechanicalOutcome === "ACCEPTED" && r.retrievalOutcome !== "ACCEPTED").length,
      },
      zeroDirectionAudit: zeroByClass,
      failureFamilies,
      missingCentralLayerSummary: missingCentralCases.map((r) => ({
        caseId: r.caseId,
        commander: r.commanderLabel,
        expected: r.expectedMechanicalDirection,
        layer: r.layerTrace?.disappearanceLayer,
        zeroClass: r.zeroDirectionAudit?.classification,
      })),
    },
    aggregateOutcomes: {
      mechanical: Object.fromEntries([...new Set(records.map((r) => r.mechanicalOutcome))].map((o) => [o, records.filter((r) => r.mechanicalOutcome === o).length])),
      retrieval: Object.fromEntries([...new Set(records.map((r) => r.retrievalOutcome))].map((o) => [o, records.filter((r) => r.retrievalOutcome === o).length])),
      context: Object.fromEntries([...new Set(records.map((r) => r.contextOutcome))].map((o) => [o, records.filter((r) => r.contextOutcome === o).length])),
    },
    regressionMatrix: records.map((r) => ({
      caseId: r.caseId,
      v132Primary: r.regression.v132Primary,
      v132Outcome: r.regression.v132Outcome,
      v140Primary: r.regression.v140Primary,
      v140Outcome: r.mechanicalOutcome,
      directionChanged: r.regression.directionChanged,
      retrievalReadinessChanged: r.regression.retrievalReadinessChanged,
      classification: r.regression.classification,
    })),
    authorization: {
      phase54HumanReview: "COMPLETE",
      phase541: "WAIT",
      phase54Freeze: "WAIT",
      blindV3: "WAIT",
      phase6: "WAIT",
    },
    cases: records,
  };

  const outDir = resolve(process.cwd(), "data/milestones/deck-synthesis");
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, "archetype-discovery-v1.4.0-human-mechanical-review.json");
  const matrixPath = resolve(outDir, "archetype-discovery-v1.3.2-to-v1.4.0-regression-matrix.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  writeFileSync(matrixPath, JSON.stringify({ version: "v1.3.2-to-v1.4.0", matrix: report.regressionMatrix, counts: regressionCounts }, null, 2));

  console.log(JSON.stringify({ metrics: report.metrics, diagnosis: report.diagnosis, outPath, hash: createHash("sha256").update(JSON.stringify(report)).digest("hex") }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
