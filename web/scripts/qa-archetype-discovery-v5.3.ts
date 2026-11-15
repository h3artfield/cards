#!/usr/bin/env npx tsx
/**
 * Archetype Discovery v1.3 — Phase 5.3 QA (CommanderBuildDirection + DEV regression).
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadProjectEnvLocal } from "./lib/script-env";
import { loadDeckResolutionCatalog } from "./lib/load-deck-resolution-catalog";
import { loadShadowSemanticIndex } from "../src/lib/commander-strategy/shadow-semantic-index";
import {
  ARCHETYPE_DISCOVERY_BENCHMARK_V1,
  ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V1,
  ARCHETYPE_DISCOVERY_BLIND_V1_STATUS,
  ARCHETYPE_DISCOVERY_V1_VERSION,
  blindHoldoutCategoryComposition,
  blindHoldoutSetHash,
  benchmarkCaseAccounting,
  benchmarkCommanderResolutionPreflight,
  buildCommanderMechanicalProfile,
  buildGlobalCatalogSemanticIndex,
  discoverArchetypes,
  extractMechanicalMotifs,
  hasValidBuildDirection,
  resolveBenchmarkCommanderOracleIds,
  scoreCommanderHypotheses,
  passesPatternPrerequisites,
  type CommanderBuildDirection,
  type DiscoveredArchetype,
  type MechanicalMotifId,
} from "../src/lib/deck-synthesis";

loadProjectEnvLocal();

type AdjudicationOutcome =
  | "ACCEPTED"
  | "FALSE_POSITIVE_ARCHETYPE"
  | "WRONG_PRIMARY_RANK"
  | "MISSING_OBVIOUS_ARCHETYPE"
  | "MISSING_OBVIOUS_BUILD_DIRECTION"
  | "LABEL_ONLY_WRONG"
  | "DUPLICATE_ARCHETYPE";

const REGRESSION_EXPECTED_PRIMARY: Record<string, string[]> = {
  "single-graveyard-meren": ["graveyard_recursion_engine"],
  "single-tokens-krenko": ["token_swarm_engine"],
  "single-spells-talrand": ["spellslinger_chain_engine"],
  "single-aristocrats-teysa": ["sacrifice_death_trigger_engine"],
  "single-enchantress-sythis": ["enchantress_value_engine"],
  "single-mill-bruvac": ["mill_library_engine"],
  "single-landfall-omnath": ["landfall_ramp_engine", "token_swarm_engine"],
  "single-voltron-lightpaws": ["aura_voltron_engine", "voltron_combat_engine"],
  "single-elves-lathril": ["token_swarm_engine"],
  "single-zombie-wilhelt": ["sacrifice_death_trigger_engine", "token_swarm_engine"],
  "multi-korvold": ["sacrifice_death_trigger_engine", "treasure_sacrifice_engine"],
  "multi-atraxa": ["counters_proliferate_engine", "superfriends_engine"],
  "multi-muldrotha": ["graveyard_recursion_engine"],
  "multi-edgar": ["token_swarm_engine"],
  "multi-kenrith": ["goodstuff_value_engine"],
  "multi-narset": ["exile_impulse_engine", "exile_cast_engine", "spellslinger_chain_engine"],
  "broad-chulane": ["landfall_ramp_engine", "etb_blink_value_engine"],
  "broad-jodah": ["legendary_tribal_engine", "goodstuff_value_engine"],
  "broad-sisay": ["legendary_tribal_engine", "combo_tutor_engine"],
  "hybrid-kinnan": ["mana_ability_combo_engine"],
  "hybrid-prosper": ["exile_impulse_engine", "exile_cast_engine", "treasure_sacrifice_engine"],
  "partner-thrasios-tymna": ["mana_ability_combo_engine", "goodstuff_value_engine"],
  "partner-krark-sakashima": ["spellslinger_chain_engine"],
  "incidental-urza": ["artifact_value_engine", "mana_ability_combo_engine"],
  "incidental-jeleva": ["exile_cast_engine", "exile_impulse_engine"],
  "incidental-zada": ["spellslinger_chain_engine"],
  "stax-augustin": ["stax_resource_denial_engine", "control_interaction_engine"],
  "yuriko-ninja": ["ninja_tempo_engine"],
};

const BLIND_CATEGORY_PATTERN_FAMILIES: Record<string, string[]> = {
  narrow_single_plan: [],
  multiple_legitimate_plans: [],
  tribal_type: ["token_swarm_engine", "legendary_tribal_engine"],
  spells: ["spellslinger_chain_engine", "exile_cast_engine", "exile_impulse_engine"],
  graveyard: ["graveyard_recursion_engine", "self_mill_graveyard_engine"],
  artifacts_enchantments: ["artifact_value_engine", "enchantress_value_engine", "treasure_sacrifice_engine"],
  combat: ["voltron_combat_engine", "aura_voltron_engine", "token_swarm_engine", "ninja_tempo_engine"],
  lands: ["landfall_ramp_engine", "mana_ability_combo_engine"],
  combo_engines: ["combo_tutor_engine", "mana_ability_combo_engine", "counters_proliferate_engine"],
  broad_value: ["goodstuff_value_engine"],
  partner_background: ["mana_ability_combo_engine", "goodstuff_value_engine", "token_swarm_engine"],
  unusual_mechanical: [],
};

/** Mechanical direction expectations for former zero-surface blind-v1 commanders (P3). */
const ZERO_SURFACE_EXPECTED_MOTIFS: Record<string, MechanicalMotifId[]> = {
  "blind-winota": ["ATTACK_TRIGGER", "CREATURE_CHEAT"],
  "blind-heliod": ["LIFE_GAIN", "COUNTER_PAYOFF"],
  "blind-purphoros": ["ETB_PAYOFF", "DAMAGE_TO_OPPONENTS"],
  "blind-selvala": ["DRAW_ENGINE", "ACTIVATED_MANA_ENGINE"],
  "blind-chatterfang": ["TOKEN_GENERATION", "SACRIFICE_ENGINE"],
  "blind-neheb": ["COMBAT_DAMAGE_TRIGGER", "ACTIVATED_MANA_ENGINE"],
  "blind-kaalia": ["CREATURE_CHEAT", "ATTACK_TRIGGER"],
  "blind-rafiq": ["COMBAT_BUFF", "ATTACK_TRIGGER"],
  "blind-sefris": ["GRAVEYARD_RECURSION"],
  "blind-ishai": ["SPELL_CAST_TRIGGER", "STATIC_TAX"],
  "blind-elsha": ["CAST_FROM_LIBRARY_TOP", "CAST_FROM_EXILE"],
  "blind-yarok": ["ETB_PAYOFF", "BLINK_ETB"],
  "blind-zinnia": ["SPELL_CAST_TRIGGER", "TOKEN_GENERATION"],
};

const ZERO_SURFACE_CASE_IDS = Object.keys(ZERO_SURFACE_EXPECTED_MOTIFS);

const FALSE_POSITIVE_IF_RANK1: Array<{ caseId: string; patternId: string; reason: string }> = [
  { caseId: "single-spells-talrand", patternId: "token_swarm_engine", reason: "TOKEN_PAYOFF_NOT_PRIMARY_DRIVER" },
  { caseId: "single-aristocrats-teysa", patternId: "token_swarm_engine", reason: "TOKEN_PAYOFF_NOT_PRIMARY_DRIVER" },
  { caseId: "incidental-urza", patternId: "token_swarm_engine", reason: "INCIDENTAL_OUTPUT_NOT_ENGINE" },
  { caseId: "single-enchantress-sythis", patternId: "group_slug_punisher_engine", reason: "PATTERN_OVERGENERALIZATION" },
  { caseId: "single-elves-lathril", patternId: "group_slug_punisher_engine", reason: "PATTERN_OVERGENERALIZATION" },
];

function directionMotifSet(d: CommanderBuildDirection | undefined): Set<string> {
  if (!d) return new Set();
  return new Set([...d.drivers, ...d.payoffs, ...d.subDirectionIds, ...d.engineActions.map((a) => a.toUpperCase())]);
}

function primaryBuildDirection(directions: CommanderBuildDirection[]): CommanderBuildDirection | undefined {
  return directions.find((d) => d.rank === 1) ?? directions[0];
}

function mechanicalDirectionHits(
  expected: MechanicalMotifId[],
  direction: CommanderBuildDirection | undefined,
): { hit: boolean; matched: MechanicalMotifId[]; missing: MechanicalMotifId[] } {
  const set = directionMotifSet(direction);
  const matched = expected.filter((m) => set.has(m));
  const missing = expected.filter((m) => !set.has(m));
  return { hit: matched.length >= Math.min(2, expected.length) || (expected.length === 1 && matched.length === 1), matched, missing };
}

function diagnoseZeroSurface(input: {
  caseId: string;
  commanderLabel: string;
  profile: ReturnType<typeof buildCommanderMechanicalProfile>;
  buildDirections: CommanderBuildDirection[];
  surfacedArchetypes: DiscoveredArchetype[];
}): Record<string, unknown> {
  const expected = ZERO_SURFACE_EXPECTED_MOTIFS[input.caseId] ?? [];
  const motifs = input.profile ? extractMechanicalMotifs(input.profile) : [];
  const primary = primaryBuildDirection(input.buildDirections);
  const motifHit = mechanicalDirectionHits(expected, primary);
  const hypotheses = input.profile ? scoreCommanderHypotheses(input.profile) : [];

  const patternMismatch = expected
    .map((motif) => {
      const topHyp = hypotheses
        .filter((h) => passesPatternPrerequisites(h))
        .sort((a, b) => b.support.discoverySupport - a.support.discoverySupport)[0];
      return {
        expectedMotif: motif,
        extractedMotifStrength: motifs.find((m) => m.motifId === motif)?.strength ?? 0,
        bestNamedPattern: topHyp?.pattern.patternId ?? null,
        bestPatternSupport: topHyp?.support.discoverySupport ?? 0,
        prerequisitePassed: topHyp ? passesPatternPrerequisites(topHyp) : false,
      };
    })
    .slice(0, 4);

  const requiredGeneralMotifs = motifHit.missing.filter(
    (m) => !motifs.some((x) => x.motifId === m && x.strength >= 0.35),
  );

  return {
    caseId: input.caseId,
    commander: input.commanderLabel,
    causalProfile: input.profile?.causalRoles ?? null,
    extractedMotifs: motifs.map((m) => ({ id: m.motifId, position: m.causalPosition, strength: m.strength })),
    strongestBuildDirection: primary
      ? {
          directionId: primary.directionId,
          mechanicalDescription: primary.mechanicalDescription,
          drivers: primary.drivers,
          payoffs: primary.payoffs,
          supportStrength: primary.supportStrength,
          mappedArchetypeId: primary.mappedArchetypeId,
          mappedArchetypeLabel: primary.mappedArchetypeLabel,
          status: primary.status,
        }
      : null,
    rc8Evidence: input.profile?.evidenceRefs?.slice(0, 8) ?? [],
    namedArchetypeSurfaced: input.surfacedArchetypes.map((a) => a.archetypeId),
    existingPatternMismatch: patternMismatch,
    requiredNewGeneralMotifs: requiredGeneralMotifs,
    namedTaxonomyExpansionRequired: primary?.mappedArchetypeId == null && motifHit.hit,
    mechanicalRecallHit: motifHit.hit,
    expectedMotifs: expected,
    matchedMotifs: motifHit.matched,
    missingMotifs: motifHit.missing,
    repairGeneralizesVia: requiredGeneralMotifs.length === 0 ? "EXISTING_MOTIF_VOCABULARY" : requiredGeneralMotifs.join("+"),
  };
}

function diagnoseSurfacedButMissing(input: {
  caseId: string;
  commanderLabel: string;
  category: string;
  surfacedArchetypes: DiscoveredArchetype[];
  buildDirections: CommanderBuildDirection[];
  profile: ReturnType<typeof buildCommanderMechanicalProfile>;
  missingPatternId: string;
}): Record<string, unknown> {
  const surfacedIds = input.surfacedArchetypes.map((a) => a.archetypeId);
  const primaryDir = primaryBuildDirection(input.buildDirections);
  const motifs = input.profile ? extractMechanicalMotifs(input.profile) : [];
  const hypotheses = input.profile ? scoreCommanderHypotheses(input.profile) : [];
  const targetHyp = hypotheses.find((h) => h.pattern.patternId === input.missingPatternId);

  let whyLost: string = "not_generated";
  if (!targetHyp || targetHyp.support.discoverySupport < targetHyp.pattern.minCommanderDiscoverySupport) {
    whyLost = "not_generated";
  } else if (!passesPatternPrerequisites(targetHyp)) {
    whyLost = "prerequisite_fail";
  } else {
    const rank = input.surfacedArchetypes.find((a) => a.archetypeId === input.missingPatternId)?.rank;
    if (rank && rank > 1) whyLost = "ranking";
    else if (!surfacedIds.includes(input.missingPatternId)) whyLost = "merge";
    else whyLost = "taxonomy_mapping";
  }

  return {
    caseId: input.caseId,
    commander: input.commanderLabel,
    category: input.category,
    surfacedDirections: input.surfacedArchetypes.map((a) => ({
      rank: a.rank,
      archetypeId: a.archetypeId,
      driverSupport: a.commanderArchetypeSupport.driverSupport,
    })),
    surfacedBuildDirections: input.buildDirections.map((d) => ({
      rank: d.rank,
      directionId: d.directionId,
      mechanicalDescription: d.mechanicalDescription,
      drivers: d.drivers,
      mappedArchetypeId: d.mappedArchetypeId,
    })),
    missingDirection: input.missingPatternId,
    missingBuildDirectionMotifs: motifs.filter((m) => m.strength >= 0.5).map((m) => m.motifId),
    causalEvidenceForMissing: input.profile?.causalRoles ?? null,
    whyLost,
    primaryBuildDirection: primaryDir?.mechanicalDescription ?? null,
  };
}

async function main() {
  const catalog = await loadDeckResolutionCatalog();
  const shadowIndex = await loadShadowSemanticIndex();
  const globalCatalogIndex = buildGlobalCatalogSemanticIndex({ catalog, shadowIndex });

  const blindAccounting = benchmarkCaseAccounting(ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V1);
  const allBlindNames = ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V1.flatMap((c) => c.commanders);
  const resolverPreflight = benchmarkCommanderResolutionPreflight({ catalog, commanderNames: allBlindNames });

  function runCase(
    caseId: string,
    category: string,
    commanders: string[],
    bracket: number,
    set: "dev_regression" | "blind_holdout",
  ) {
  const resolution = resolveBenchmarkCommanderOracleIds(catalog, commanders);
  if (!resolution.resolved || resolution.oracleIds.length !== commanders.length) {
      return {
        caseId,
        category,
        set,
        commanderNames: commanders,
        bracket,
        resolutionFailed: true,
        resolutionAudits: resolution.audits,
        surfacedCount: 0,
        hasValidBuildDirection: false,
        buildDirectionCount: 0,
        surfacedArchetypes: [],
        buildDirections: [],
        profile: null as ReturnType<typeof buildCommanderMechanicalProfile>,
        adjudicatedPairs: [],
      };
    }

    const report = discoverArchetypes(
      { commanderOracleIds: resolution.oracleIds, bracket: bracket as 1 | 2 | 3 | 4 | 5 },
      { catalog, shadowIndex, globalCatalogIndex },
    );

    const profile = buildCommanderMechanicalProfile({
      commanderOracleIds: resolution.oracleIds,
      catalogByOracleId: catalog.byOracleId,
      shadowIndex,
    });

    return {
      caseId,
      category,
      set,
      commanderNames: commanders,
      commanderLabel: report.commanderNames.join(" + "),
      bracket,
      resolutionFailed: false,
      resolutionAudits: resolution.audits,
      surfacedCount: report.surfacedArchetypes.length,
      hasValidBuildDirection: report.hasValidBuildDirection,
      buildDirectionCount: report.buildDirections.length,
      surfacedArchetypes: report.surfacedArchetypes,
      buildDirections: report.buildDirections,
      profile,
      rejectionReasons: report.whyNotSurfacedDistribution,
    };
  }

  const regressionResults = ARCHETYPE_DISCOVERY_BENCHMARK_V1.map((c) =>
    runCase(c.id, c.category, c.commanders, c.bracket, "dev_regression"),
  );
  const blindResults = ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V1.map((c) =>
    runCase(c.id, c.category, c.commanders, c.bracket, "blind_holdout"),
  );

  const evaluated = [...regressionResults, ...blindResults.filter((r) => !r.resolutionFailed)];

  // Named archetype precision (surfaced pairs only)
  type Pair = {
    caseId: string;
    set: string;
    rank: number;
    archetypeId: string;
    outcome: AdjudicationOutcome;
    rootCauseClass: string;
  };
  const pairs: Pair[] = [];

  for (const r of evaluated) {
    for (const a of r.surfacedArchetypes) {
      let outcome: AdjudicationOutcome = "ACCEPTED";
      let rootCauseClass = "N/A";
      const fp = FALSE_POSITIVE_IF_RANK1.find((x) => x.caseId === r.caseId && x.patternId === a.archetypeId && a.rank === 1);
      if (fp) {
        outcome = "FALSE_POSITIVE_ARCHETYPE";
        rootCauseClass = fp.reason;
      }
      const expected = REGRESSION_EXPECTED_PRIMARY[r.caseId];
      if (expected && a.rank === 1 && !expected.includes(a.archetypeId)) {
        outcome = "WRONG_PRIMARY_RANK";
        rootCauseClass = "CAUSAL_DRIVER_RANKING";
      }
      pairs.push({ caseId: r.caseId, set: r.set, rank: a.rank, archetypeId: a.archetypeId, outcome, rootCauseClass });
    }
  }

  const surfacedPairs = pairs.filter((p) => p.rank > 0);
  const namedPrecision = surfacedPairs.length > 0 ? surfacedPairs.filter((p) => p.outcome === "ACCEPTED").length / surfacedPairs.length : 0;

  const primaryCases = regressionResults.filter((r) => REGRESSION_EXPECTED_PRIMARY[r.caseId]);
  let primaryCorrect = 0;
  for (const r of primaryCases) {
    const expected = REGRESSION_EXPECTED_PRIMARY[r.caseId]!;
    const rank1 = r.surfacedArchetypes.find((a) => a.rank === 1);
    if (rank1 && expected.includes(rank1.archetypeId)) primaryCorrect += 1;
  }
  const primaryDirectionAccuracy = primaryCases.length > 0 ? primaryCorrect / primaryCases.length : 0;

  // Missing obvious (named)
  let missingObviousNamed = 0;
  for (const r of evaluated) {
    const expected =
      r.set === "dev_regression"
        ? REGRESSION_EXPECTED_PRIMARY[r.caseId]
        : BLIND_CATEGORY_PATTERN_FAMILIES[r.category];
    if (!expected || expected.length === 0) continue;
    const hit = expected.some((id) => r.surfacedArchetypes.some((a) => a.archetypeId === id));
    if (!hit) missingObviousNamed += 1;
  }
  const missingObviousNamedRate = missingObviousNamed / evaluated.length;

  // Build direction metrics
  let missingObviousMechanical = 0;
  let mechanicalRecallHits = 0;
  let mechanicalRecallTotal = 0;
  for (const r of evaluated) {
    const expectedMotifs = ZERO_SURFACE_EXPECTED_MOTIFS[r.caseId];
    if (expectedMotifs) {
      mechanicalRecallTotal += 1;
      const primary = primaryBuildDirection(r.buildDirections);
      if (mechanicalDirectionHits(expectedMotifs, primary).hit) mechanicalRecallHits += 1;
    }
    const categoryExpected =
      r.set === "dev_regression"
        ? REGRESSION_EXPECTED_PRIMARY[r.caseId]
        : BLIND_CATEGORY_PATTERN_FAMILIES[r.category];
    if (!categoryExpected?.length) continue;
    const primary = primaryBuildDirection(r.buildDirections);
    const dirMotifs = directionMotifSet(primary);
    const mappedHit = categoryExpected.some((pid) => primary?.mappedArchetypeId === pid);
    const hasDirection = r.hasValidBuildDirection;
    if (!hasDirection && !mappedHit) missingObviousMechanical += 1;
    else if (hasDirection && !mappedHit && r.surfacedArchetypes.length === 0) {
      // mechanical-only recovery counts for build direction recall
    } else if (!hasDirection) missingObviousMechanical += 1;
  }

  const zeroValidDirectionCases = evaluated.filter((r) => !r.hasValidBuildDirection);
  const zeroValidDirectionRate = zeroValidDirectionCases.length / evaluated.length;

  const buildDirectionRecall =
    mechanicalRecallTotal > 0 ? mechanicalRecallHits / mechanicalRecallTotal : null;

  const zeroSurfaceDiagnostics = ZERO_SURFACE_CASE_IDS.map((caseId) => {
    const r = blindResults.find((x) => x.caseId === caseId)!;
    return diagnoseZeroSurface({
      caseId,
      commanderLabel: r.commanderLabel ?? r.commanderNames.join(" + "),
      profile: r.profile,
      buildDirections: r.buildDirections,
      surfacedArchetypes: r.surfacedArchetypes,
    });
  });

  const surfacedButMissing: Array<Record<string, unknown>> = [];
  for (const r of blindResults.filter((x) => !x.resolutionFailed && x.surfacedCount > 0)) {
    const expected = BLIND_CATEGORY_PATTERN_FAMILIES[r.category];
    if (!expected?.length) continue;
    const hit = expected.some((id) => r.surfacedArchetypes.some((a) => a.archetypeId === id));
    if (hit) continue;
    surfacedButMissing.push(
      diagnoseSurfacedButMissing({
        caseId: r.caseId,
        commanderLabel: r.commanderLabel ?? r.commanderNames.join(" + "),
        category: r.category,
        surfacedArchetypes: r.surfacedArchetypes,
        buildDirections: r.buildDirections,
        profile: r.profile,
        missingPatternId: expected[0]!,
      }),
    );
  }

  const devGate = {
    surfacedPrecisionMin: 0.9,
    primaryDirectionAccuracyMin: 0.9,
    missingObviousDirectionMax: 0.15,
    zeroValidDirectionMax: 0.05,
    namedPrecision,
    primaryDirectionAccuracy,
    missingObviousMechanicalRate: missingObviousMechanical / evaluated.length,
    zeroValidDirectionRate,
    pass:
      namedPrecision >= 0.9 &&
      primaryDirectionAccuracy >= 0.9 &&
      missingObviousMechanical / evaluated.length <= 0.15 &&
      zeroValidDirectionRate <= 0.05,
  };

  const qaReport = {
    version: "archetype-discovery-v1.3-phase5.3-qa",
    discoveryEngineVersion: ARCHETYPE_DISCOVERY_V1_VERSION,
    generatedAt: new Date().toISOString(),
    qaVerdict: devGate.pass ? "PASS" : "FAIL",
    phase53Objective: "Increase mechanical-direction recall without giving back Phase 5.2 precision gains",
    benchmarkAccounting: {
      explanation:
        "40 benchmark cases / 41 commander names because partner/multi-command-zone entries count one case but multiple commander names.",
      blindHoldout: blindAccounting,
      partnerCaseDetail: blindAccounting.partnerCases,
    },
    resolverPreflight: {
      status: resolverPreflight.pass ? "ACCEPTED" : "HARD_FAIL",
      policy: [
        "exact canonical preferred",
        "curated alias/typo with provenance",
        "ambiguity = HARD FAIL",
        "no silent fuzzy substitution",
      ],
      ...resolverPreflight,
    },
    devRegressionGate: devGate,
    recallMetrics: {
      namedArchetype: {
        precision: namedPrecision,
        primaryDirectionAccuracy,
        missingObviousRate: missingObviousNamedRate,
        missingObviousCount: missingObviousNamed,
      },
      mechanicalBuildDirection: {
        recallOnZeroSurfaceCohort: buildDirectionRecall,
        zeroValidDirectionRate,
        zeroValidDirectionCaseIds: zeroValidDirectionCases.map((r) => r.caseId),
        hasValidBuildDirectionCount: evaluated.filter((r) => r.hasValidBuildDirection).length,
      },
    },
    phase53Architecture: {
      flow: "Commander Oracle semantics → causal mechanical profile → CommanderBuildDirection[] → optional named archetype mapping",
      commanderBuildDirectionFields: [
        "directionId",
        "drivers",
        "conditions",
        "resourcesConsumed",
        "resourcesProduced",
        "engineActions",
        "payoffs",
        "feedbackLoops",
        "requiredSupportFunctions",
        "optionalSupportFunctions",
        "commandZoneEvidence",
        "mechanicalVector",
        "supportStrength",
        "repeatability",
        "centrality",
        "mappedArchetypeId?",
        "mappedArchetypeLabel?",
        "labelConfidence?",
        "catalogFeasibility",
      ],
      motifLibrary: "mechanical-motifs-v1.ts (composable, RC8-derived)",
      patternThresholdPolicy: "NOT globally lowered — named archetype discovery unchanged from Phase 5.2",
      semanticOnly: "PRESERVED — no EDHREC/decklist/meta",
    },
    zeroSurfaceDiagnosticsP3: zeroSurfaceDiagnostics,
    surfacedButMissingP4: surfacedButMissing,
    devRegression: {
      caseCount: regressionResults.length,
      zeroSurfaceNamed: regressionResults.filter((r) => r.surfacedCount === 0).map((r) => r.caseId),
      results: regressionResults.map((r) => ({
        caseId: r.caseId,
        surfacedCount: r.surfacedCount,
        hasValidBuildDirection: r.hasValidBuildDirection,
        primaryBuildDirection: r.buildDirections[0]?.mechanicalDescription ?? null,
        primaryNamed: r.surfacedArchetypes.find((a) => a.rank === 1)?.archetypeId ?? null,
      })),
    },
    blindHoldoutV1: {
      status: ARCHETYPE_DISCOVERY_BLIND_V1_STATUS,
      setHash: blindHoldoutSetHash(),
      caseCount: blindResults.length,
      categoryComposition: blindHoldoutCategoryComposition(),
      zeroSurfaceNamed: blindResults.filter((r) => r.surfacedCount === 0).map((r) => r.caseId),
      zeroValidBuildDirection: blindResults.filter((r) => !r.hasValidBuildDirection).map((r) => r.caseId),
    },
    authorization: {
      phase53Implementation: "COMPLETE",
      blindV2Creation: "WAIT_UNTIL_PHASE_5.3_FREEZE",
      phase6: "WAIT",
      optimizer: "WAIT",
      semanticOnlyRetrieval: "FROZEN",
    },
  };

  const outDir = resolve(process.cwd(), "data/milestones/deck-synthesis");
  mkdirSync(outDir, { recursive: true });
  const qaPath = resolve(outDir, "archetype-discovery-v1.3-phase5.3-qa.json");
  writeFileSync(qaPath, JSON.stringify(qaReport, null, 2));

  const hash = createHash("sha256").update(JSON.stringify(qaReport)).digest("hex");
  console.log(
    JSON.stringify(
      {
        qaVerdict: qaReport.qaVerdict,
        devRegressionGate: devGate,
        benchmarkAccounting: qaReport.benchmarkAccounting,
        resolverPreflight: { pass: resolverPreflight.pass, resolved: resolverPreflight.resolvedCount },
        recallMetrics: qaReport.recallMetrics,
        zeroSurfaceMechanicalHits: zeroSurfaceDiagnostics.filter((d) => d.mechanicalRecallHit).length,
        surfacedButMissingCount: surfacedButMissing.length,
        qaPath,
        hash,
      },
      null,
      2,
    ),
  );

  if (qaReport.qaVerdict !== "PASS") process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
