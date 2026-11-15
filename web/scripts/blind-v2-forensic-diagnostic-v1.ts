#!/usr/bin/env npx tsx
/**
 * Blind-v2 forensic diagnostic — Phase 5.4 design input. No repairs.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadProjectEnvLocal } from "./lib/script-env";
import { loadDeckResolutionCatalog } from "./lib/load-deck-resolution-catalog";
import { loadShadowSemanticIndex } from "../src/lib/commander-strategy/shadow-semantic-index";
import { ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V2 } from "../src/lib/deck-synthesis/archetype-discovery-blind-holdout-v2";
import { resolveBenchmarkCommanderOracleIds } from "../src/lib/deck-synthesis/benchmark-commander-resolver-v1";
import { buildCommanderMechanicalProfile } from "../src/lib/deck-synthesis/commander-mechanical-profile-v1";
import { buildGlobalCatalogSemanticIndex } from "../src/lib/deck-synthesis/catalog-feasibility-v1";
import { discoverArchetypes } from "../src/lib/deck-synthesis/discover-archetypes-v1";
import { discoverCommanderBuildDirections } from "../src/lib/deck-synthesis/commander-build-direction-v1";
import { extractMechanicalMotifs } from "../src/lib/deck-synthesis/mechanical-motifs-v1";
import type { CommanderBuildDirection } from "../src/lib/deck-synthesis/archetype-discovery-types-v1";

loadProjectEnvLocal();

const FAILURE_IDS = [
  "blindv2-10-combat-attack",
  "blindv2-19-graveyard",
  "blindv2-26-enchantments",
  "blindv2-33-lands",
  "blindv2-37-activated-engine",
  "blindv2-38-activated-engine",
  "blindv2-42-cost-driven-engine",
  "blindv2-47-partner-background",
];

type ForensicClassification =
  | "RC8_SEMANTIC_GAP"
  | "CAUSAL_INFERENCE_GAP"
  | "MOTIF_EXTRACTION_GAP"
  | "DIRECTION_ANCHOR_GAP"
  | "COMPOSITION_GAP"
  | "RANKING_GAP"
  | "FALLBACK_INFLATION"
  | "SUPPORT_REQUIREMENT_GAP"
  | "TAXONOMY_ONLY";

function classifyNoDirection(input: {
  motifs: ReturnType<typeof extractMechanicalMotifs>;
  profile: ReturnType<typeof buildCommanderMechanicalProfile>;
  rawDirections: CommanderBuildDirection[];
}): ForensicClassification {
  const { motifs, profile, rawDirections } = input;
  const c = profile.causalRoles;
  if (motifs.length === 0 && c.engineTriggers.length === 0 && c.engineActions.length <= 1) {
    return "CAUSAL_INFERENCE_GAP";
  }
  if (motifs.length > 0 && motifs.every((m) => m.causalPosition === "PAYOFF" || m.causalPosition === "OUTPUT")) {
    return "DIRECTION_ANCHOR_GAP";
  }
  if (rawDirections.length > 0 && rawDirections.every((d) => d.supportStrength < 0.38)) {
    return "RANKING_GAP";
  }
  if (/static|threshold|can't cast|unless|each opponent|clone|copy/.test(profile.evidenceRefs.map((e) => e.rule).join(" "))) {
    return "DIRECTION_ANCHOR_GAP";
  }
  return "MOTIF_EXTRACTION_GAP";
}

function classifyCombatBuffFallback(input: {
  primary: CommanderBuildDirection | undefined;
  motifs: ReturnType<typeof extractMechanicalMotifs>;
  allDirections: CommanderBuildDirection[];
}): ForensicClassification {
  if (!input.primary) return "FALLBACK_INFLATION";
  if (input.primary.drivers.length === 0 && input.primary.payoffs.includes("COMBAT_BUFF")) {
    const alt = input.allDirections.find((d) => d.drivers.length > 0 && !d.payoffs.includes("COMBAT_BUFF"));
    if (alt) return "RANKING_GAP";
    return "FALLBACK_INFLATION";
  }
  return "COMPOSITION_GAP";
}

function retrievalSpecScore(d: CommanderBuildDirection | undefined): {
  directionValidity: "VALID" | "VAGUE" | "ABSENT";
  retrievalSpecificationCompleteness: number;
  gaps: string[];
} {
  if (!d) return { directionValidity: "ABSENT", retrievalSpecificationCompleteness: 0, gaps: ["no primary direction"] };
  const gaps: string[] = [];
  if (d.drivers.length === 0) gaps.push("no drivers");
  if (d.mechanicalDescription.startsWith("engine →")) gaps.push("generic description shell");
  if (d.requiredSupportFunctions.length === 0) gaps.push("empty requiredSupportFunctions");
  if (d.payoffs.length === 0 && d.resourcesProduced.length === 0) gaps.push("no output/payoff");
  if (d.causalChainStatus === "NO_DRIVER_EVIDENCE" || d.causalChainStatus === "PARTIAL_UPSTREAM_MISSING") {
    gaps.push(`causalChainStatus=${d.causalChainStatus}`);
  }
  let score = 0;
  if (d.drivers.length > 0) score += 0.25;
  if (!d.mechanicalDescription.startsWith("engine →")) score += 0.2;
  if (d.requiredSupportFunctions.length > 0) score += 0.2;
  if (d.payoffs.length > 0 || d.resourcesProduced.length > 0) score += 0.15;
  if (d.engineActions.length > 0 || d.conditions.length > 0) score += 0.1;
  if (d.causalChainStatus === "COMPLETE") score += 0.1;
  const directionValidity =
    d.drivers.length > 0 && !d.mechanicalDescription.startsWith("engine →") ? "VALID" : d.drivers.length > 0 ? "VAGUE" : "VAGUE";
  return { directionValidity, retrievalSpecificationCompleteness: Math.min(1, score), gaps };
}

function categorizePrimary(d: CommanderBuildDirection | undefined): string {
  if (!d) return "invalid/absent";
  if (d.mappedArchetypeLabel) return "named";
  if (d.drivers.length === 0 && d.mechanicalDescription.startsWith("engine →")) return "fallback/vague";
  if (d.drivers.length >= 2) return "compositional unlabeled";
  if (d.status === "MECHANICAL_DIRECTION_ONLY" && d.drivers.length > 0) return "mechanical-description-only";
  if (d.drivers.length > 0) return "mechanical-description-only";
  return "fallback/vague";
}

async function main() {
  const catalog = await loadDeckResolutionCatalog();
  const shadowIndex = await loadShadowSemanticIndex();
  const globalCatalogIndex = buildGlobalCatalogSemanticIndex({ catalog, shadowIndex });

  const failureTraces: unknown[] = [];
  const combatBuffAudit: unknown[] = [];
  const primaryCategories: Record<string, number> = {};
  let withPrimary = 0;

  for (const c of ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V2) {
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
    const rawDirections = discoverCommanderBuildDirections({ profile, roleIndex: globalCatalogIndex });
    const primary = report.buildDirections.find((d) => d.rank === 1);
    const oracleText = resolution.oracleIds
      .map((id) => catalog.byOracleId.get(id)?.oracleText ?? "")
      .join("\n//\n");

    const rc8Abilities = resolution.oracleIds.flatMap((id) => {
      const card = catalog.byOracleId.get(id);
      const parse = shadowIndex.byOracleId.get(id);
      return (parse?.abilities ?? []).map((a) => ({
        oracleId: id,
        abilityType: a.abilityType,
        triggerType: a.triggerType,
        cost: a.cost,
        span: a.abilitySpan?.text?.slice(0, 120),
      }));
    });
    const rc8Actions = resolution.oracleIds.flatMap((id) => {
      const parse = shadowIndex.byOracleId.get(id);
      return (parse?.actions ?? []).map((a) => ({ actionType: a.actionType, zone: a.zone }));
    });

    const cat = categorizePrimary(primary);
    if (primary) {
      withPrimary += 1;
      primaryCategories[cat] = (primaryCategories[cat] ?? 0) + 1;
    } else {
      primaryCategories["invalid/absent"] = (primaryCategories["invalid/absent"] ?? 0) + 1;
    }

    const combatMotif = motifs.find((m) => m.motifId === "COMBAT_BUFF");
    if (combatMotif || primary?.payoffs.includes("COMBAT_BUFF") || primary?.subDirectionIds.includes("COMBAT_BUFF")) {
      const stronger = rawDirections
        .filter((d) => d.drivers.length > 0 && !d.payoffs.every((p) => p === "COMBAT_BUFF"))
        .sort((a, b) => b.supportStrength - a.supportStrength)[0];
      combatBuffAudit.push({
        caseId: c.id,
        commander: c.commanders.join(" + "),
        selectionStratum: c.category,
        combatBuffMotif: combatMotif
          ? { position: combatMotif.causalPosition, strength: combatMotif.strength, evidence: combatMotif.evidence }
          : null,
        primaryDescription: primary?.mechanicalDescription ?? null,
        primaryDrivers: primary?.drivers ?? [],
        primaryPayoffs: primary?.payoffs ?? [],
        primaryCentrality: primary?.centrality ?? null,
        supportStrength: primary?.supportStrength ?? null,
        commanderCombatRequired: /attacks|combat damage|deathtouch|trample|vigilance|must be blocked/.test(oracleText.toLowerCase()),
        strongerRejectedCandidate: stronger
          ? {
              rank: stronger.rank,
              description: stronger.mechanicalDescription,
              drivers: stronger.drivers,
              supportStrength: stronger.supportStrength,
              whyNotPrimary: primary ? stronger.supportStrength - primary.supportStrength : null,
            }
          : null,
        causalChainStatus: primary?.causalChainStatus ?? null,
      });
    }

    if (!FAILURE_IDS.includes(c.id)) continue;

    const inferenceEvidence = profile.evidenceRefs
      .filter((e) => e.rule.startsWith("causal_inference:"))
      .map((e) => ({ rule: e.rule, note: e.note }));

    const forensicClass = !primary
      ? classifyNoDirection({ motifs, profile, rawDirections })
      : primary.payoffs.includes("COMBAT_BUFF") && primary.drivers.length === 0
        ? classifyCombatBuffFallback({ primary, motifs, allDirections: rawDirections })
        : "SUPPORT_REQUIREMENT_GAP";

    const retrieval = retrievalSpecScore(primary);

    failureTraces.push({
      caseId: c.id,
      selectionStratum: c.category,
      commander: c.commanders.join(" + "),
      forensicClassification: forensicClass,
      pipeline: {
        oracleText: oracleText.replace(/\s+/g, " ").trim(),
        rc8AbilityStructure: rc8Abilities,
        rc8Actions: rc8Actions.slice(0, 20),
        causalProfile: profile.causalRoles,
        causalInferenceEvidence: inferenceEvidence,
        extractedMotifs: motifs.map((m) => ({
          id: m.motifId,
          position: m.causalPosition,
          strength: m.strength,
          evidence: m.evidence,
        })),
        directionAnchors: {
          driverMotifs: motifs.filter((m) => m.causalPosition === "DRIVER"),
          engineMotifs: motifs.filter((m) => m.causalPosition === "ENGINE"),
          seedsUsed: rawDirections.map((d) => ({ rank: d.rank, directionId: d.directionId, drivers: d.drivers, supportStrength: d.supportStrength })),
        },
        candidateBuildDirections: rawDirections.map((d) => ({
          rank: d.rank,
          directionId: d.directionId,
          mechanicalDescription: d.mechanicalDescription,
          drivers: d.drivers,
          payoffs: d.payoffs,
          supportStrength: d.supportStrength,
          centrality: d.centrality,
          causalChainStatus: d.causalChainStatus,
          driverPropagationFailure: d.driverPropagationFailure,
          requiredSupportFunctions: d.requiredSupportFunctions,
          status: d.status,
          mappedArchetypeId: d.mappedArchetypeId,
        })),
        surfacedPrimary: primary
          ? {
              ...formatDirection(primary),
              rejectedHypotheses: report.rejectedHypotheses.slice(0, 5).map((r) => ({
                id: r.archetypeId,
                reasons: r.reasons,
                detail: r.detail,
              })),
            }
          : null,
        hasValidBuildDirection: report.hasValidBuildDirection,
      },
      lostMechanicallyImportantConcepts: inferLostConcepts(c.id, oracleText, profile, motifs, primary),
      directionValidity: retrieval.directionValidity,
      retrievalSpecificationCompleteness: retrieval.retrievalSpecificationCompleteness,
      retrievalGaps: retrieval.gaps,
      zeroDirectionAnalysis: !primary ? analyzeZeroDirection({ motifs, profile, rawDirections, oracleText }) : null,
    });
  }

  const report = {
    version: "archetype-discovery-blind-v2-forensic-v1",
    generatedAt: new Date().toISOString(),
    blindV2Status: "DEVELOPMENT_DIAGNOSTIC_SPENT",
    failureCount: FAILURE_IDS.length,
    failureForensics: failureTraces,
    combatBuffAudit: {
      totalBlindCases: ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V2.length,
      casesWithCombatBuffSignal: combatBuffAudit.length,
      cases: combatBuffAudit,
    },
    noveltyReconciliation: {
      totalCases: ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V2.length,
      withPrimary,
      categories: primaryCategories,
      note: "Mutually exclusive categories; sum equals withPrimary + absent count",
      priorMetricBug:
        "unlabeledValidDirections=1 counted only status===MECHANICAL_DIRECTION_ONLY without checking fallback/vague",
    },
    partnerBackgroundCoverageNote: {
      stratumQuota: 3,
      actualPartnerPairs: 0,
      actualBackgroundPairs: 0,
      whatWasTested: "Single commanders whose oracle text matches partner/background keyword heuristics",
      blindV3Requirement: "Include actual partner+partner and commander+background command-zone configurations",
    },
    phase54ProposedRepairs: buildPhase54Plan(failureTraces, combatBuffAudit),
  };

  const outDir = resolve(process.cwd(), "data/milestones/deck-synthesis");
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, "archetype-discovery-blind-v2-forensic-v1.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ outPath, hash: createHash("sha256").update(JSON.stringify(report)).digest("hex") }, null, 2));
}

function formatDirection(d: CommanderBuildDirection) {
  return {
    mechanicalDescription: d.mechanicalDescription,
    drivers: d.drivers,
    payoffs: d.payoffs,
    supportStrength: d.supportStrength,
    requiredSupportFunctions: d.requiredSupportFunctions,
    causalChainStatus: d.causalChainStatus,
    driverProvenance: d.driverProvenance,
  };
}

function inferLostConcepts(
  caseId: string,
  oracleText: string,
  profile: ReturnType<typeof buildCommanderMechanicalProfile>,
  motifs: ReturnType<typeof extractMechanicalMotifs>,
  primary: CommanderBuildDirection | undefined,
): Array<{ concept: string; lastSeenLayer: string; detail: string }> {
  const text = oracleText.toLowerCase();
  const lost: Array<{ concept: string; lastSeenLayer: string; detail: string }> = [];

  const checks: Array<{ re: RegExp; concept: string; motif?: string }> = [
    { re: /whenever a player casts a spell, ruric thar deals 6 damage/, concept: "spell-tax punishment", motif: "STATIC_TAX" },
    { re: /whenever a player casts a spell/, concept: "opponent spell cast trigger", motif: "STATIC_TAX" },
    { re: /web-slinging|from your graveyard|from exile/, concept: "zone recursion / web-slinging", motif: "GRAVEYARD_RECURSION" },
    { re: /whenever an opponent casts a spell/, concept: "opponent spell tax / counter", motif: "STATIC_TAX" },
    { re: /whenever maraxus attacks/, concept: "attack-scaled output", motif: "ATTACK_TRIGGER" },
    { re: /\+1\/\+1 counter.*for each.*land/, concept: "land-count scaling", motif: "LANDFALL_ENGINE" },
    { re: /whenever a nontoken creature an opponent controls dies/, concept: "opponent creature death trigger", motif: "DEATH_PAYOFF" },
    { re: /deathtouch.*lifelink|lifelink.*deathtouch/, concept: "combat keyword package", motif: "COMBAT_BUFF" },
    { re: /prevent all damage that would be dealt to creatures you control/, concept: "damage prevention static", motif: "STATIC_TAX" },
    { re: /perfect clone|copy of a creature|becomes a copy/, concept: "clone/copy dependency", motif: "CREATURE_CHEAT" },
  ];

  for (const chk of checks) {
    if (!chk.re.test(text)) continue;
    const hasMotif = chk.motif ? motifs.some((m) => m.motifId === chk.motif) : false;
    const inPrimary = primary?.drivers.includes(chk.motif ?? "") || primary?.payoffs.includes(chk.motif ?? "");
    if (!inPrimary) {
      lost.push({
        concept: chk.concept,
        lastSeenLayer: hasMotif ? "motif-extracted-not-primary" : "never reached motifs",
        detail: hasMotif ? `${chk.motif} extracted but not ranked as primary driver` : "No matching motif rule fired",
      });
    }
  }

  if (caseId.includes("erayo") && !motifs.some((m) => m.motifId === "STATIC_TAX")) {
    lost.push({ concept: "cumulative upkeep / world enchantment lock", lastSeenLayer: "causal inference", detail: "Flip-card tax not mapped to STATIC_TAX driver" });
  }

  return lost;
}

function analyzeZeroDirection(input: {
  motifs: ReturnType<typeof extractMechanicalMotifs>;
  profile: ReturnType<typeof buildCommanderMechanicalProfile>;
  rawDirections: CommanderBuildDirection[];
  oracleText: string;
}): { classification: string; detail: string } {
  const { motifs, profile, rawDirections, oracleText } = input;
  const text = oracleText.toLowerCase();

  if (rawDirections.length === 0) {
    return { classification: "E", detail: "No direction candidates composed — static/state/threshold mechanics poorly anchored" };
  }
  if (rawDirections.every((d) => d.supportStrength < 0.38)) {
    return { classification: "D", detail: "Directions generated but all below MIN_DIRECTION_SUPPORT threshold" };
  }
  if (motifs.length > 0 && motifs.every((m) => m.causalPosition !== "DRIVER")) {
    return { classification: "C", detail: "Motifs exist but none qualify as DRIVER-position anchors" };
  }
  if (motifs.length === 0 && profile.causalRoles.engineTriggers.length === 0) {
    return { classification: "B", detail: "Central mechanics never reached causal inference / motif extraction" };
  }
  if (/clone|copy|threshold|cumulative upkeep|world enchantment|prevent all damage/.test(text)) {
    return { classification: "E", detail: "Static/state/threshold/clone mechanics — current DRIVER-event model insufficient" };
  }
  return { classification: "A", detail: "Mechanics extracted but composition cannot form valid upstream chain" };
}

function buildPhase54Plan(failureTraces: unknown[], combatBuffAudit: unknown[]): unknown {
  return {
    status: "PROPOSED_NOT_IMPLEMENTED",
    smallestGeneralFamilies: [
      {
        id: "direction-anchor-ontology",
        failuresAddressed: ["Spider-Man", "Erayo", "Maraxus", "Enolc", "Ruric Thar"],
        generalRule: "Introduce directionAnchor kinds beyond EVENT_DRIVER: STATIC_CONSTRAINT, STATIC_TAX, STATE_DEPENDENCY, ZONE_DEPENDENCY, PERMISSION, TARGET_DEPENDENCY",
        layerChanged: "commander-build-direction-v1 + archetype-discovery-types",
        whyGeneralizes: "Static/tax/state/clone commanders lack event→payoff chains but have real deckbuilding instructions",
        sideEffects: "More directions for stax/tax commanders; need guard against over-splitting",
        regressionRisk: "Medium — may inflate direction count on broad value commanders",
        qaInvariant: "DRIVER-event directions still required when event evidence exists; anchors are additive",
      },
      {
        id: "combat-buff-fallback-gate",
        failuresAddressed: ["Ruric Thar", "Kazarov", "Lady Caleria", "Wandering Rescuer"],
        generalRule: "COMBAT_BUFF cannot be primary unless combat_damage_trigger OR attack_trigger OR explicit combat scaling in causal profile; penalize when drivers[] empty",
        layerChanged: "mechanical-motifs-v1 + commander-build-direction-v1 ranking",
        whyGeneralizes: "COMBAT_BUFF currently fires from derived combat_manipulation role alone",
        sideEffects: "Voltron commanders with real combat buff still need combat trigger evidence path",
        regressionRisk: "Low-Medium — Purphoros pump already secondary",
        qaInvariant: "Voltron/combat commanders with attack triggers retain COMBAT_BUFF when evidenced",
      },
      {
        id: "static-tax-stax-inference",
        failuresAddressed: ["Ruric Thar", "Erayo"],
        generalRule: "Infer opponent_spell_casts + tax/static_modifier from 'whenever an opponent casts' and punishment damage",
        layerChanged: "commander-causal-inference-v1.2",
        whyGeneralizes: "Spell-tax is a major Commander family absent from v1.2 inference",
        sideEffects: "More STATIC_TAX motifs on counterspell commanders",
        regressionRisk: "Low",
        qaInvariant: "Triggered punishment ≠ activated; preserve mechanism typing",
      },
      {
        id: "retrieval-spec-completeness-fields",
        failuresAddressed: ["All 4 INSUFFICIENT_FOR_RETRIEVAL"],
        generalRule: "Add directionValidity + retrievalSpecificationCompleteness; gate Phase 6 on completeness not just driver presence",
        layerChanged: "archetype-discovery-types + QA/human review",
        whyGeneralizes: "Separates mechanically true from Phase-6-ready",
        sideEffects: "More human-review failures on vague-but-plausible directions",
        regressionRisk: "Low — diagnostic only until Phase 6",
        qaInvariant: "COMPLETE causalChainStatus correlates with retrieval completeness >= 0.7",
      },
      {
        id: "zero-direction-support-floor",
        failuresAddressed: ["Spider-Man", "Erayo", "Maraxus", "Enolc"],
        generalRule: "When motifs exist but no DRIVER, allow STATE/ZONE anchor as seed with lower threshold OR emit explicit NO_MECHANICAL_BUILD_DIRECTION with diagnostic",
        layerChanged: "commander-build-direction-v1",
        whyGeneralizes: "Prevents silent null primary on valid commanders",
        sideEffects: "May surface weak directions — retrieval completeness must gate",
        regressionRisk: "Medium",
        qaInvariant: "zeroUsableRate stays <= 10% on DEV+blind",
      },
    ],
    notRecommendedYet: ["Commander-specific exceptions", "COMBAT_BUFF threshold-only bump without anchor fix", "RC8 changes"],
    combatBuffAuditSummary: {
      casesWithSignal: (combatBuffAudit as unknown[]).length,
      primaryViaFallback: (combatBuffAudit as unknown[]).filter((c) => (c as { primaryDrivers: string[] }).primaryDrivers?.length === 0).length,
    },
  };
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
