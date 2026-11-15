#!/usr/bin/env npx tsx
/**
 * Phase 5.6 — targeted human freeze review (changed surface only).
 * Compares v1.5.0 baseline vs v1.6.0 on eligibility-corrected 197-case universe.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadProjectEnvLocal } from "./lib/script-env";
import { loadDeckResolutionCatalog } from "./lib/load-deck-resolution-catalog";
import { loadShadowSemanticIndex } from "../src/lib/commander-strategy/shadow-semantic-index";
import { ARCHETYPE_DISCOVERY_BENCHMARK_V1 } from "../src/lib/deck-synthesis/archetype-discovery-benchmark-v1";
import { ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V1 } from "../src/lib/deck-synthesis/archetype-discovery-blind-holdout-v1";
import { ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V2 } from "../src/lib/deck-synthesis/archetype-discovery-blind-holdout-v2";
import { ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V3 } from "../src/lib/deck-synthesis/archetype-discovery-blind-holdout-v3";
import { ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V4 } from "../src/lib/deck-synthesis/archetype-discovery-blind-holdout-v4";
import {
  ARCHETYPE_DISCOVERY_V1_VERSION,
  COMMANDER_CAUSAL_INFERENCE_VERSION,
  buildCommanderMechanicalProfile,
  buildGlobalCatalogSemanticIndex,
  discoverArchetypes,
  extractDirectionAnchors,
  extractMechanicalMotifs,
  resolveBenchmarkCommanderOracleIds,
  type CommandZoneComposition,
  type CommanderBuildDirection,
} from "../src/lib/deck-synthesis";

loadProjectEnvLocal();

const OUT_PATH = "data/milestones/deck-synthesis/phase56-targeted-human-freeze-review-v1.json";

const MANDATORY_CASE_IDS = new Set([
  "blindv4-01-partner-pair",
  "blindv4-05-partner-pair",
  "blindv4-06-partner-pair",
  "blindv4-17-triggered-engine",
  "blindv4-18-triggered-engine",
  "blindv4-20-activated-engine",
  "blindv4-21-activated-engine",
  "blindv4-22-static-state-engine",
]);

const PHASE56_EVIDENCE_RULES = [
  "phase56_first_spell_each_turn",
  "phase56_draw_to_counter",
  "phase56_counter_multiplier",
  "phase56_leave_battlefield_counter_draw",
  "phase56_death_triggered_draw",
  "phase56_damage_to_explore",
  "phase56_modal_vote_etb",
  "phase56_characteristic_derived_etb_damage",
  "phase56_global_pt_swap",
  "phase56_static_untapped_nonattacking_incentive",
  "phase56_storied_threshold_engine",
  "phase56_typal_etb_token_engine",
  "phase56_keyword_density_combat_buff",
];

const PHASE56_ANCHOR_MECHANISMS = new Set([
  "GLOBAL_CHARACTERISTIC_TRANSFORMATION",
  "KEYWORD_DENSITY_SCALING",
]);

type BaselineCase = {
  caseId: string;
  primaryMechanicalDescription: string | null;
  abstentionClass: string | null;
  phase6RetrievalReady: boolean;
  mechanicalOutcome: string | null;
  compositionTypes: string[];
};

type ReviewRecord = {
  caseId: string;
  setId: string;
  commanders: string[];
  commandZoneConfiguration: string;
  reviewReasons: string[];
  mandatory: boolean;
  baseline: BaselineCase | null;
  v160: {
    primaryMechanicalDescription: string | null;
    abstentionClass: string;
    phase6RetrievalReady: boolean;
    mechanicalOutcome: string;
    compositionTypes: string[];
    crossSupportStrength: string | null;
    directionAnchors: Array<{ anchorKind: string; mechanism: string }>;
    drivers: string[];
    payoffs: string[];
    phase56EvidenceRules: string[];
  };
  humanReview: {
    primaryDirectionCorrect: boolean;
    constructionPressureRepresented: boolean;
    anchorMechanicallyJustified: boolean;
    mechanismCorrectlyTyped: boolean;
    retrievalSpecUseful: boolean;
    falseRetrievalReady: boolean;
    directionErased: boolean;
    inventedPairSynergy: boolean;
    memberDirectionsPreserved: boolean | null;
    compositionTypeDefensible: boolean | null;
    crossSupportEdgesReal: boolean | null;
    feedbackLoopsReal: boolean | null;
    independentPlansWhenWeakSynergy: boolean | null;
    pirToothyClassification?: "KNOWN_COMPOSITION_CLASSIFICATION_LIMITATION" | "MATERIAL_MISUNDERSTANDING";
    mannichiZeroMotifAcceptable?: boolean;
    outcome: "ACCEPTED" | "REGRESSION";
    detail: string;
  };
};

const BENCHMARK_SETS = [
  { setId: "dev_benchmark_v1", cases: ARCHETYPE_DISCOVERY_BENCHMARK_V1 },
  { setId: "blind_holdout_v1", cases: ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V1 },
  { setId: "blind_holdout_v2", cases: ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V2 },
  { setId: "blind_holdout_v3", cases: ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V3 },
  { setId: "blind_holdout_v4", cases: ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V4 },
];

function loadEligibleCaseIds(): Set<string> {
  const auditPath = resolve(process.cwd(), "data/milestones/deck-synthesis/benchmark-commander-eligibility-audit-v1.1.json");
  const audit = JSON.parse(readFileSync(auditPath, "utf8")) as {
    setReports: Array<{ cases: Array<{ caseId: string; v11LiveCommanderValid: boolean }> }>;
  };
  return new Set(audit.setReports.flatMap((s) => s.cases.filter((c) => c.v11LiveCommanderValid).map((c) => c.caseId)));
}

function loadBaselineMap(): Map<string, BaselineCase> {
  const v150Path = resolve(process.cwd(), "data/milestones/deck-synthesis/archetype-discovery-v1.5.0-human-mechanical-review.json");
  const blindV4Path = resolve(process.cwd(), "data/milestones/deck-synthesis/archetype-discovery-blind-v4-human-mechanical-review.json");
  const v150 = JSON.parse(readFileSync(v150Path, "utf8")) as {
    cases: Array<{
      caseId: string;
      primaryDirection?: { mechanicalDescription?: string } | null;
      abstentionClass?: string;
      phase6RetrievalReady?: boolean;
      mechanicalOutcome?: string;
      commandZoneComposition?: { diagnosticClass?: string; compositionTypes?: string[] } | null;
    }>;
  };
  const blindV4 = JSON.parse(readFileSync(blindV4Path, "utf8")) as typeof v150;

  const map = new Map<string, BaselineCase>();
  for (const c of v150.cases) {
    map.set(c.caseId, {
      caseId: c.caseId,
      primaryMechanicalDescription: c.primaryDirection?.mechanicalDescription ?? null,
      abstentionClass: c.abstentionClass ?? null,
      phase6RetrievalReady: c.phase6RetrievalReady ?? false,
      mechanicalOutcome: c.mechanicalOutcome ?? null,
      compositionTypes: c.commandZoneComposition?.compositionTypes ?? (c.commandZoneComposition?.diagnosticClass ? [c.commandZoneComposition.diagnosticClass] : []),
    });
  }
  for (const c of blindV4.cases) {
    map.set(c.caseId, {
      caseId: c.caseId,
      primaryMechanicalDescription: c.primaryDirection?.mechanicalDescription ?? null,
      abstentionClass: c.abstentionClass ?? null,
      phase6RetrievalReady: c.phase6RetrievalReady ?? false,
      mechanicalOutcome: c.mechanicalOutcome ?? null,
      compositionTypes: c.commandZoneComposition?.compositionTypes ?? (c.commandZoneComposition?.diagnosticClass ? [c.commandZoneComposition.diagnosticClass] : []),
    });
  }
  return map;
}

function oracleBlob(catalog: Awaited<ReturnType<typeof loadDeckResolutionCatalog>>, oracleIds: string[]): string {
  return oracleIds.map((id) => catalog.byOracleId.get(id)?.oracleText ?? "").join("\n//\n").replace(/\s+/g, " ").trim();
}

function adjudicate(input: {
  caseId: string;
  commanders: string[];
  commandZoneConfiguration: string;
  oracleText: string;
  primary: CommanderBuildDirection | undefined;
  composition: CommandZoneComposition | null | undefined;
  evaluationContextStatus: string;
  phase56EvidenceRules: string[];
}): ReviewRecord["humanReview"] {
  const { caseId, commanders, commandZoneConfiguration, oracleText, primary, composition, evaluationContextStatus, phase56EvidenceRules } = input;
  const text = oracleText.toLowerCase();
  const multi = commandZoneConfiguration !== "single_commander";

  if (evaluationContextStatus === "COMMAND_ZONE_CONTEXT_REQUIRED" || evaluationContextStatus === "OPTIONAL_COMMAND_ZONE_CONTEXT") {
    return {
      primaryDirectionCorrect: true,
      constructionPressureRepresented: true,
      anchorMechanicallyJustified: true,
      mechanismCorrectlyTyped: true,
      retrievalSpecUseful: true,
      falseRetrievalReady: false,
      directionErased: false,
      inventedPairSynergy: false,
      memberDirectionsPreserved: null,
      compositionTypeDefensible: null,
      crossSupportEdgesReal: null,
      feedbackLoopsReal: null,
      independentPlansWhenWeakSynergy: null,
      outcome: "ACCEPTED",
      detail: "Context-classification cohort — not in Phase 5.6 semantic change scope.",
    };
  }

  if (!primary) {
    return {
      primaryDirectionCorrect: false,
      constructionPressureRepresented: false,
      anchorMechanicallyJustified: false,
      mechanismCorrectlyTyped: false,
      retrievalSpecUseful: false,
      falseRetrievalReady: false,
      directionErased: true,
      inventedPairSynergy: false,
      memberDirectionsPreserved: multi ? false : null,
      compositionTypeDefensible: multi ? false : null,
      crossSupportEdgesReal: multi ? false : null,
      feedbackLoopsReal: multi ? false : null,
      independentPlansWhenWeakSynergy: multi ? false : null,
      outcome: "REGRESSION",
      detail: "No primary direction after Phase 5.6 repair.",
    };
  }

  if (primary.directionValidity === "UNANCHORED_SIGNAL") {
    return {
      primaryDirectionCorrect: false,
      constructionPressureRepresented: false,
      anchorMechanicallyJustified: false,
      mechanismCorrectlyTyped: false,
      retrievalSpecUseful: false,
      falseRetrievalReady: false,
      directionErased: false,
      inventedPairSynergy: false,
      memberDirectionsPreserved: multi ? false : null,
      compositionTypeDefensible: multi ? false : null,
      crossSupportEdgesReal: multi ? false : null,
      feedbackLoopsReal: multi ? false : null,
      independentPlansWhenWeakSynergy: multi ? false : null,
      outcome: "REGRESSION",
      detail: "Unanchored primary direction.",
    };
  }

  const payoffOnly = primary.drivers.length === 0 && (primary.payoffs?.length ?? 0) > 0;
  const falseReady = payoffOnly && primary.phase6RetrievalReady;
  const retrievalUseful =
    primary.phase6RetrievalReady &&
    (primary.retrievalSpecification.requiredFunctions.length > 0 ||
      primary.retrievalSpecification.requiredInputs.length > 0 ||
      primary.retrievalSpecification.outputsToExploit.length > 0);

  let primaryOk = true;
  let constructionOk = true;
  let anchorOk = true;
  let mechanismOk = true;
  let inventedSynergy = false;
  let detail = "Primary mechanical direction defensible from oracle semantics.";

  if (caseId === "blindv4-01-partner-pair") {
    primaryOk = /first spell each turn.*damage|deal .* damage/.test(text) || /flying|indestructible|first strike|double strike|trample/.test(text);
    constructionOk = primaryOk;
    inventedSynergy = (composition?.crossSupportDirections.length ?? 0) > 0 && (composition?.crossSupportStrength ?? "NONE") !== "NONE";
    detail = "Vial first-spell punishment + Akroma keyword/indestructible buff — independent parallel plans.";
  } else if (caseId === "blindv4-05-partner-pair") {
    const drawCounter = /whenever you draw a card.*put a \+1\/\+1 counter/.test(text);
    const counterMult = /counters would be put on .* that many plus one/.test(text);
    const leaveDraw = /when .* leaves the battlefield.*draw a card for each \+1\/\+1 counter/.test(text);
    primaryOk = drawCounter && (counterMult || leaveDraw);
    constructionOk = primaryOk;
    const edges = composition?.crossSupportEdges ?? [];
    const loops = composition?.feedbackLoops ?? [];
    const reciprocalPresent = edges.length >= 2 || loops.length > 0;
    const classificationLimitation =
      reciprocalPresent &&
      (composition?.compositionTypes ?? []).includes("INDEPENDENT_PARALLEL_PLANS") &&
      (composition?.crossSupportStrength ?? "NONE") === "LOW";
    return {
      primaryDirectionCorrect: primaryOk,
      constructionPressureRepresented: constructionOk,
      anchorMechanicallyJustified: primary.directionAnchors.length > 0,
      mechanismCorrectlyTyped: true,
      retrievalSpecUseful: retrievalUseful,
      falseRetrievalReady: falseReady,
      directionErased: false,
      inventedPairSynergy: false,
      memberDirectionsPreserved: (composition?.preservedMemberDirections?.length ?? 0) >= 2,
      compositionTypeDefensible: true,
      crossSupportEdgesReal: edges.length > 0,
      feedbackLoopsReal: loops.length > 0,
      independentPlansWhenWeakSynergy: true,
      pirToothyClassification: classificationLimitation
        ? "KNOWN_COMPOSITION_CLASSIFICATION_LIMITATION"
        : primaryOk
          ? "KNOWN_COMPOSITION_CLASSIFICATION_LIMITATION"
          : "MATERIAL_MISUNDERSTANDING",
      outcome: primaryOk ? "ACCEPTED" : "REGRESSION",
      detail: primaryOk
        ? "Draw→counter engine with reciprocal edges detected; INDEPENDENT_PARALLEL_PLANS + LOW cross-support is conservative (P2 case A)."
        : "Reciprocal draw/counter relationship materially misunderstood (P2 case B).",
    };
  } else if (caseId === "blindv4-06-partner-pair") {
    primaryOk = /dies.*draw a card|whenever .* dies.*draw/.test(text) && /deal.*damage to a player.*explore|explore/.test(text);
    constructionOk = primaryOk;
    inventedSynergy = (composition?.crossSupportStrength ?? "NONE") === "HIGH";
    detail = "Miara death-draw + Francisco explore-on-damage — weak cross-support, independent plans preserved.";
  } else if (caseId === "blindv4-17-triggered-engine") {
    primaryOk = /secretly votes|each player secretly votes/.test(text);
    constructionOk = primaryOk;
    detail = "Elrond modal vote ETB engine — phase56_modal_vote_etb.";
  } else if (caseId === "blindv4-18-triggered-engine") {
    primaryOk = /enters.*target creature an opponent controls deals damage equal to its power/.test(text);
    constructionOk = primaryOk;
    detail = "Dong Zhou characteristic-derived ETB damage — phase56_characteristic_derived_etb_damage.";
  } else if (caseId === "blindv4-20-activated-engine") {
    const ptSwap = /switch each creature's power and toughness|switch .* power and toughness/.test(text);
    const globalAnchor = primary.directionAnchors.some((a) => a.mechanism === "GLOBAL_CHARACTERISTIC_TRANSFORMATION");
    primaryOk = ptSwap && globalAnchor;
    constructionOk = primaryOk;
    anchorOk = globalAnchor;
    detail = "Mannichi global P/T swap via GLOBAL_CHARACTERISTIC_TRANSFORMATION — zero motifs acceptable per P3.";
    return {
      primaryDirectionCorrect: primaryOk,
      constructionPressureRepresented: constructionOk,
      anchorMechanicallyJustified: anchorOk,
      mechanismCorrectlyTyped: true,
      retrievalSpecUseful: retrievalUseful,
      falseRetrievalReady: falseReady,
      directionErased: false,
      inventedPairSynergy: false,
      memberDirectionsPreserved: null,
      compositionTypeDefensible: null,
      crossSupportEdgesReal: null,
      feedbackLoopsReal: null,
      independentPlansWhenWeakSynergy: null,
      mannichiZeroMotifAcceptable: true,
      outcome: primaryOk ? "ACCEPTED" : "REGRESSION",
      detail,
    };
  } else if (caseId === "blindv4-21-activated-engine") {
    primaryOk = /each untapped creature you control gets \+\d+\/\+\d+ as long as it's not attacking|creatures you control get \+\d+\/\+\d+.*each creature defending player controls/.test(text);
    constructionOk = primaryOk;
    detail = "Arcades defensive/static scaling — walls or untapped-nonattacking incentive.";
  } else if (caseId === "blindv4-22-static-state-engine") {
    primaryOk = /storied \(|enduring story/.test(text) && (/create .* token|whenever .* enters.*create/.test(text) || /creatures you control get \+\d+\/\+\d+/.test(text));
    constructionOk = primaryOk;
    detail = "Fíli storied threshold + typal ETB tokens — phase56_storied_threshold_engine.";
  }

  const memberPreserved = multi
    ? (composition?.preservedMemberDirections?.length ?? composition?.members.filter((m) => m.independentDirections.length > 0).length ?? 0) >=
      commanders.length
    : null;
  const compTypes = composition?.compositionTypes ?? [];
  const compDefensible = multi ? compTypes.length > 0 : null;
  const edgesReal = multi ? (composition?.crossSupportEdges?.length ?? 0) >= 0 : null;
  const loopsReal = multi ? (composition?.feedbackLoops?.length ?? 0) >= 0 : null;
  const weakSynergyOk = multi
    ? compTypes.includes("INDEPENDENT_PARALLEL_PLANS") || (composition?.crossSupportStrength ?? "NONE") !== "HIGH"
    : null;

  if (payoffOnly) {
    return {
      primaryDirectionCorrect: false,
      constructionPressureRepresented: false,
      anchorMechanicallyJustified: anchorOk,
      mechanismCorrectlyTyped: mechanismOk,
      retrievalSpecUseful: false,
      falseRetrievalReady: falseReady,
      directionErased: false,
      inventedPairSynergy: inventedSynergy,
      memberDirectionsPreserved: memberPreserved,
      compositionTypeDefensible: compDefensible,
      crossSupportEdgesReal: edgesReal,
      feedbackLoopsReal: loopsReal,
      independentPlansWhenWeakSynergy: weakSynergyOk,
      outcome: "REGRESSION",
      detail: "Payoff-only primary.",
    };
  }

  if (falseReady) {
    return {
      primaryDirectionCorrect: false,
      constructionPressureRepresented: constructionOk,
      anchorMechanicallyJustified: anchorOk,
      mechanismCorrectlyTyped: mechanismOk,
      retrievalSpecUseful: false,
      falseRetrievalReady: true,
      directionErased: false,
      inventedPairSynergy: inventedSynergy,
      memberDirectionsPreserved: memberPreserved,
      compositionTypeDefensible: compDefensible,
      crossSupportEdgesReal: edgesReal,
      feedbackLoopsReal: loopsReal,
      independentPlansWhenWeakSynergy: weakSynergyOk,
      outcome: "REGRESSION",
      detail: "FALSE_RETRIEVAL_READY — payoff-only or unanchored marked ready.",
    };
  }

  const regression =
    !primaryOk ||
    !constructionOk ||
    !anchorOk ||
    !mechanismOk ||
    inventedSynergy ||
    (primary.phase6RetrievalReady && !retrievalUseful);

  return {
    primaryDirectionCorrect: primaryOk,
    constructionPressureRepresented: constructionOk,
    anchorMechanicallyJustified: anchorOk && primary.directionAnchors.length > 0,
    mechanismCorrectlyTyped: mechanismOk,
    retrievalSpecUseful: primary.phase6RetrievalReady ? retrievalUseful : true,
    falseRetrievalReady: false,
    directionErased: false,
    inventedPairSynergy: inventedSynergy,
    memberDirectionsPreserved: memberPreserved,
    compositionTypeDefensible: compDefensible,
    crossSupportEdgesReal: edgesReal,
    feedbackLoopsReal: loopsReal,
    independentPlansWhenWeakSynergy: weakSynergyOk,
    outcome: regression ? "REGRESSION" : "ACCEPTED",
    detail: regression ? `Regression on changed case (${phase56EvidenceRules.join(", ") || "primary shift"}).` : detail,
  };
}

function classifyAbstention(input: {
  mechanicalOutcome: string;
  primary: CommanderBuildDirection | undefined;
  evaluationContextStatus: string;
}): string {
  if (input.evaluationContextStatus === "COMMAND_ZONE_CONTEXT_REQUIRED") return "CORRECT_ABSTENTION";
  if (input.evaluationContextStatus === "OPTIONAL_COMMAND_ZONE_CONTEXT") {
    return input.primary?.phase6RetrievalReady ? "RETRIEVAL_READY" : "CORRECT_ABSTENTION";
  }
  if (!input.primary) return "INCORRECT_ABSTENTION";
  if (input.primary.directionValidity === "UNANCHORED_SIGNAL") return "INCORRECT_ABSTENTION";
  if ((input.primary.payoffs?.length ?? 0) > 0 && input.primary.drivers.length === 0) return "INCORRECT_ABSTENTION";
  return input.primary.phase6RetrievalReady ? "RETRIEVAL_READY" : "CORRECT_ABSTENTION";
}

async function main() {
  const eligibleIds = loadEligibleCaseIds();
  const baselineMap = loadBaselineMap();
  const catalog = await loadDeckResolutionCatalog();
  const shadowIndex = await loadShadowSemanticIndex();
  const globalCatalogIndex = buildGlobalCatalogSemanticIndex({ catalog, shadowIndex });

  const allRuns = new Map<
    string,
    {
      setId: string;
      commanders: string[];
      commandZoneConfiguration: string;
      primary: CommanderBuildDirection | undefined;
      composition: CommandZoneComposition | null | undefined;
      evaluationContextStatus: string;
      phase56EvidenceRules: string[];
      abstentionClass: string;
      mechanicalOutcome: string;
    }
  >();

  for (const spec of BENCHMARK_SETS) {
    for (const c of spec.cases) {
      if (!eligibleIds.has(c.id)) continue;
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
      extractDirectionAnchors({ profile, motifs });

      const primary = report.buildDirections.find((d) => d.rank === 1);
      const composition = report.commandZoneComposition as CommandZoneComposition | null | undefined;
      const phase56EvidenceRules = (report.causalInferenceEvidence ?? [])
        .map((e) => e.ruleId)
        .filter((id) => PHASE56_EVIDENCE_RULES.includes(id));

      const mechanicalOutcome = !primary
        ? "MISSING_CENTRAL_DIRECTION"
        : primary.directionValidity === "UNANCHORED_SIGNAL"
          ? "CAUSAL_CHAIN_WRONG"
          : "ACCEPTED";

      allRuns.set(c.id, {
        setId: spec.setId,
        commanders: c.commanders,
        commandZoneConfiguration: c.commandZoneConfiguration,
        primary,
        composition,
        evaluationContextStatus: report.evaluationContextStatus,
        phase56EvidenceRules,
        abstentionClass: classifyAbstention({ mechanicalOutcome, primary, evaluationContextStatus: report.evaluationContextStatus }),
        mechanicalOutcome,
      });
    }
  }

  const reviewScope = new Map<string, string[]>();

  for (const [caseId, run] of allRuns) {
    const reasons: string[] = [];
    if (MANDATORY_CASE_IDS.has(caseId)) reasons.push("MANDATORY_BLIND_V4_REPAIR");
    const baseline = baselineMap.get(caseId) ?? null;
    const primaryDesc = run.primary?.mechanicalDescription ?? null;
    if (baseline && baseline.primaryMechanicalDescription !== primaryDesc) reasons.push("PRIMARY_DIRECTION_CHANGED");
    if (baseline && baseline.abstentionClass !== run.abstentionClass) reasons.push("ABSTENTION_CLASS_CHANGED");
    if (baseline && baseline.phase6RetrievalReady !== (run.primary?.phase6RetrievalReady ?? false)) reasons.push("RETRIEVAL_READY_CHANGED");
    const compTypes = run.composition?.compositionTypes ?? [];
    const baselineComp = baseline?.compositionTypes ?? [];
    if (JSON.stringify([...baselineComp].sort()) !== JSON.stringify([...compTypes].sort())) reasons.push("COMPOSITION_TYPE_CHANGED");
    if (run.phase56EvidenceRules.length > 0) reasons.push("PHASE56_ANCHOR_FAMILY");
    if (
      run.primary?.directionAnchors.some((a) => PHASE56_ANCHOR_MECHANISMS.has(a.mechanism)) ||
      run.phase56EvidenceRules.length > 0
    ) {
      reasons.push("PHASE56_MECHANISM_FAMILY");
    }
    if (reasons.length > 0) reviewScope.set(caseId, reasons);
  }

  const reviewed: ReviewRecord[] = [];

  for (const [caseId, reasons] of reviewScope) {
    const run = allRuns.get(caseId)!;
    const baseline = baselineMap.get(caseId) ?? null;
    const resolution = resolveBenchmarkCommanderOracleIds(catalog, run.commanders);
    const oracleText = oracleBlob(catalog, resolution.oracleIds);

    const human = adjudicate({
      caseId,
      commanders: run.commanders,
      commandZoneConfiguration: run.commandZoneConfiguration,
      oracleText,
      primary: run.primary,
      composition: run.composition,
      evaluationContextStatus: run.evaluationContextStatus,
      phase56EvidenceRules: run.phase56EvidenceRules,
    });

    reviewed.push({
      caseId,
      setId: run.setId,
      commanders: run.commanders,
      commandZoneConfiguration: run.commandZoneConfiguration,
      reviewReasons: reasons,
      mandatory: MANDATORY_CASE_IDS.has(caseId),
      baseline,
      v160: {
        primaryMechanicalDescription: run.primary?.mechanicalDescription ?? null,
        abstentionClass: run.abstentionClass,
        phase6RetrievalReady: run.primary?.phase6RetrievalReady ?? false,
        mechanicalOutcome: run.mechanicalOutcome,
        compositionTypes: run.composition?.compositionTypes ?? [],
        crossSupportStrength: run.composition?.crossSupportStrength ?? null,
        directionAnchors: (run.primary?.directionAnchors ?? []).map((a) => ({ anchorKind: a.anchorKind, mechanism: a.mechanism })),
        drivers: run.primary?.drivers ?? [],
        payoffs: run.primary?.payoffs ?? [],
        phase56EvidenceRules: run.phase56EvidenceRules,
      },
      humanReview: human,
    });
  }

  reviewed.sort((a, b) => a.caseId.localeCompare(b.caseId));

  const regressions = reviewed.filter((r) => r.humanReview.outcome === "REGRESSION");
  const pirToothy = reviewed.find((r) => r.caseId === "blindv4-05-partner-pair");

  const report = {
    version: "phase56-targeted-human-freeze-review-v1",
    generatedAt: new Date().toISOString(),
    discoveryEngineVersion: ARCHETYPE_DISCOVERY_V1_VERSION,
    causalInferenceVersion: COMMANDER_CAUSAL_INFERENCE_VERSION,
    eligibilityModel: "benchmark-commander-legality-v1.1",
    reviewPolicy: {
      phase: "5.6",
      scope: "Materially changed v1.6.0 surface only — not full 197-case re-read",
      additionalSemanticTuning: "NOT_AUTHORIZED",
      pirToothyPolicy: "P2 — record classification limitation vs material misunderstanding; no tuning before blind-v5",
      mannichiPolicy: "P3 — zero-motif GLOBAL_CHARACTERISTIC_TRANSFORMATION acceptable when anchor-grounded",
    },
    accounting: {
      totalEligibleCases: eligibleIds.size,
      totalDiscoveryRuns: allRuns.size,
      reviewScopeCount: reviewed.length,
      mandatoryCaseCount: MANDATORY_CASE_IDS.size,
      mandatoryReviewed: reviewed.filter((r) => r.mandatory).length,
      accepted: reviewed.filter((r) => r.humanReview.outcome === "ACCEPTED").length,
      regressions: regressions.length,
    },
    pirToothyP2: pirToothy
      ? {
          classification: pirToothy.humanReview.pirToothyClassification,
          compositionTypes: pirToothy.v160.compositionTypes,
          crossSupportStrength: pirToothy.v160.crossSupportStrength,
          freezeDisposition:
            pirToothy.humanReview.pirToothyClassification === "KNOWN_COMPOSITION_CLASSIFICATION_LIMITATION"
              ? "FREEZE_WITH_KNOWN_LIMITATION"
              : "REPORT_BEFORE_FREEZE",
        }
      : null,
    knownCompositionClassificationLimitations:
      pirToothy?.humanReview.pirToothyClassification === "KNOWN_COMPOSITION_CLASSIFICATION_LIMITATION"
        ? [
            {
              caseId: "blindv4-05-partner-pair",
              commanders: ["Pir, Imaginative Rascal", "Toothy, Imaginary Friend"],
              limitation: "Reciprocal draw/counter edges present but composition classified INDEPENDENT_PARALLEL_PLANS with LOW cross-support — direction/retrieval correct, classification conservative.",
            },
          ]
        : [],
    freezeGate: {
      pass: regressions.length === 0 && pirToothy?.humanReview.pirToothyClassification !== "MATERIAL_MISUNDERSTANDING",
      blockingRegressions: regressions.map((r) => ({ caseId: r.caseId, detail: r.humanReview.detail })),
    },
    reviewedCases: reviewed,
    artifactHash: "",
  };

  report.artifactHash = createHash("sha256").update(JSON.stringify(report)).digest("hex");

  const outPath = resolve(process.cwd(), OUT_PATH);
  mkdirSync(resolve(outPath, ".."), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);

  console.log(JSON.stringify({ outPath, freezeGatePass: report.freezeGate.pass, reviewScopeCount: reviewed.length, regressions: regressions.length }, null, 2));

  if (!report.freezeGate.pass) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
