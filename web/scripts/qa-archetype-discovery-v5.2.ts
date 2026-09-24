#!/usr/bin/env npx tsx
/**
 * Archetype Discovery v1.2 — Phase 5.2 QA (causal-role repair + blind holdout gate).
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadProjectEnvLocal } from "./lib/script-env";
import { lookupGoldenByName } from "./lib/load-golden-catalog-index";
import { loadDeckResolutionCatalog } from "./lib/load-deck-resolution-catalog";
import { loadShadowSemanticIndex } from "../src/lib/commander-strategy/shadow-semantic-index";
import {
  ARCHETYPE_DISCOVERY_BENCHMARK_V1,
  ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V1,
  ARCHETYPE_DISCOVERY_V1_VERSION,
  blindHoldoutCategoryComposition,
  blindHoldoutSetHash,
  buildGlobalCatalogSemanticIndex,
  discoverArchetypes,
  type DiscoveredArchetype,
} from "../src/lib/deck-synthesis";

loadProjectEnvLocal();

type AdjudicationOutcome =
  | "ACCEPTED"
  | "FALSE_POSITIVE_ARCHETYPE"
  | "WRONG_PRIMARY_RANK"
  | "MISSING_OBVIOUS_ARCHETYPE"
  | "LABEL_ONLY_WRONG"
  | "DUPLICATE_ARCHETYPE";

type AdjudicatedPair = {
  commander: string;
  caseId: string;
  set: "dev_regression" | "blind_holdout";
  category: string;
  rank: number;
  archetypeId: string;
  mechanicalName: string;
  archetypeKind: string;
  discoverySupport: number;
  driverSupport: number;
  payoffSupport: number;
  feedbackSupport: number;
  outcome: AdjudicationOutcome;
  rootCauseClass: string;
  detail: string;
};

/** Dev regression — expected primary pattern (rank #1). */
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

const FALSE_POSITIVE_IF_RANK1: Array<{ caseId: string; patternId: string; reason: string }> = [
  { caseId: "single-spells-talrand", patternId: "token_swarm_engine", reason: "TOKEN_PAYOFF_NOT_PRIMARY_DRIVER" },
  { caseId: "single-aristocrats-teysa", patternId: "token_swarm_engine", reason: "TOKEN_PAYOFF_NOT_PRIMARY_DRIVER" },
  { caseId: "incidental-urza", patternId: "token_swarm_engine", reason: "INCIDENTAL_OUTPUT_NOT_ENGINE" },
  { caseId: "single-enchantress-sythis", patternId: "group_slug_punisher_engine", reason: "PATTERN_OVERGENERALIZATION" },
  { caseId: "single-elves-lathril", patternId: "group_slug_punisher_engine", reason: "PATTERN_OVERGENERALIZATION" },
];

function adjudicatePair(input: {
  caseId: string;
  category: string;
  set: "dev_regression" | "blind_holdout";
  commander: string;
  archetype: DiscoveredArchetype;
  allSurfaced: DiscoveredArchetype[];
}): AdjudicatedPair {
  const { archetype, allSurfaced } = input;
  const support = archetype.commanderArchetypeSupport;
  let outcome: AdjudicationOutcome = "ACCEPTED";
  let rootCauseClass = "N/A";
  let detail = "Mechanically supported surfaced archetype.";

  const fpRule = FALSE_POSITIVE_IF_RANK1.find(
    (r) => r.caseId === input.caseId && r.patternId === archetype.archetypeId && archetype.rank === 1,
  );
  if (fpRule) {
    outcome = "FALSE_POSITIVE_ARCHETYPE";
    rootCauseClass = fpRule.reason;
    detail = fpRule.reason;
  } else if (
    archetype.archetypeKind === "GENERIC_VALUE_FALLBACK" &&
    input.category !== "broad_value" &&
    input.set === "dev_regression" &&
    !["multi-kenrith", "broad-jodah", "broad-sisay", "partner-thrasios-tymna"].includes(input.caseId)
  ) {
    outcome = "FALSE_POSITIVE_ARCHETYPE";
    rootCauseClass = "GENERIC_FALLBACK_NOT_COMMANDER_GROUNDED";
    detail = "Good-Stuff fallback on narrow mechanical commander.";
  } else if (support.driverSupport < 0.22 && support.feedbackSupport < 0.2 && support.payoffSupport > 0.35) {
    outcome = "FALSE_POSITIVE_ARCHETYPE";
    rootCauseClass = "PAYOFF_ONLY_OUTPUT_CLASSIFICATION";
    detail = "Payoff/output without upstream driver support.";
  } else if (support.incidentalSupport >= 0.35 && support.driverSupport < 0.28) {
    outcome = "FALSE_POSITIVE_ARCHETYPE";
    rootCauseClass = "INCIDENTAL_COMMANDER_SUPPORT";
    detail = "Incidental support surfaced as primary engine.";
  }

  const expected = REGRESSION_EXPECTED_PRIMARY[input.caseId];
  if (expected && archetype.rank === 1 && !expected.includes(archetype.archetypeId)) {
    const expectedSurfaced = allSurfaced.find((a) => expected.includes(a.archetypeId));
    if (expectedSurfaced && expectedSurfaced.rank < archetype.rank) {
      // already ranked correctly elsewhere
    } else if (expectedSurfaced) {
      outcome = "WRONG_PRIMARY_RANK";
      rootCauseClass = "CAUSAL_DRIVER_RANKING";
      detail = `Expected primary ${expected.join("|")}, got ${archetype.archetypeId}.`;
    }
  }

  return {
    commander: input.commander,
    caseId: input.caseId,
    set: input.set,
    category: input.category,
    rank: archetype.rank,
    archetypeId: archetype.archetypeId,
    mechanicalName: archetype.mechanicalName,
    archetypeKind: archetype.archetypeKind,
    discoverySupport: support.discoverySupport,
    driverSupport: support.driverSupport,
    payoffSupport: support.payoffSupport,
    feedbackSupport: support.feedbackSupport,
    outcome,
    rootCauseClass,
    detail,
  };
}

function missingObvious(input: {
  caseId: string;
  category: string;
  set: "dev_regression" | "blind_holdout";
  commander: string;
  surfaced: DiscoveredArchetype[];
}): AdjudicatedPair | null {
  const surfacedIds = input.surfaced.map((s) => s.archetypeId);
  const expected =
    input.set === "dev_regression"
      ? REGRESSION_EXPECTED_PRIMARY[input.caseId]
      : BLIND_CATEGORY_PATTERN_FAMILIES[input.category];

  if (!expected || expected.length === 0) return null;
  const hit = expected.some((id) => surfacedIds.includes(id));
  if (hit) return null;

  return {
    commander: input.commander,
    caseId: input.caseId,
    set: input.set,
    category: input.category,
    rank: 0,
    archetypeId: expected[0]!,
    mechanicalName: `(missing: ${expected.join("|")})`,
    archetypeKind: "MISSING",
    discoverySupport: 0,
    driverSupport: 0,
    payoffSupport: 0,
    feedbackSupport: 0,
    outcome: "MISSING_OBVIOUS_ARCHETYPE",
    rootCauseClass: "PATTERN_COVERAGE_OR_THRESHOLD",
    detail: `Expected one of [${expected.join(", ")}] for ${input.commander}.`,
  };
}

async function main() {
  const catalog = await loadDeckResolutionCatalog();
  const shadowIndex = await loadShadowSemanticIndex();
  const globalCatalogIndex = buildGlobalCatalogSemanticIndex({ catalog, shadowIndex });

  function runCase(
    caseId: string,
    category: string,
    commanders: string[],
    bracket: number,
    set: "dev_regression" | "blind_holdout",
  ) {
    const commanderOracleIds: string[] = [];
    const resolvedNames: string[] = [];
    for (const name of commanders) {
      const row = lookupGoldenByName(catalog, name);
      if (!row?.oracleId) {
        return {
          caseId,
          category,
          set,
          commanderNames: commanders,
          bracket,
          catalogMissing: true,
          surfacedCount: 0,
          surfacedArchetypes: [],
          hypothesisLifecycle: null,
          rejectionReasons: {},
          adjudicatedPairs: [] as AdjudicatedPair[],
        };
      }
      commanderOracleIds.push(row.oracleId);
      resolvedNames.push(name);
    }
    const report = discoverArchetypes(
      { commanderOracleIds: oracleIds, bracket: bracket as 1 | 2 | 3 | 4 | 5 },
      { catalog, shadowIndex, globalCatalogIndex },
    );
    const commanderLabel = report.commanderNames.join(" + ");
    const pairs: AdjudicatedPair[] = report.surfacedArchetypes.map((archetype) =>
      adjudicatePair({
        caseId,
        category,
        set,
        commander: commanderLabel,
        archetype,
        allSurfaced: report.surfacedArchetypes,
      }),
    );
    const missing = missingObvious({
      caseId,
      category,
      set,
      commander: commanderLabel,
      surfaced: report.surfacedArchetypes,
    });
    if (missing) pairs.push(missing);

    return {
      caseId,
      category,
      set,
      commanderNames: commanders,
      bracket,
      surfacedCount: report.surfacedArchetypes.length,
      surfacedArchetypes: report.surfacedArchetypes.map((a) => ({
        rank: a.rank,
        archetypeId: a.archetypeId,
        mechanicalName: a.mechanicalName,
        driverSupport: a.commanderArchetypeSupport.driverSupport,
        discoverySupport: a.commanderArchetypeSupport.discoverySupport,
        primaryArchetypeId: a.primaryArchetypeId,
        subArchetypeIds: a.subArchetypeIds,
      })),
      hypothesisLifecycle: report.hypothesisLifecycle,
      rejectionReasons: report.whyNotSurfacedDistribution,
      adjudicatedPairs: pairs,
    };
  }

  const regressionResults = ARCHETYPE_DISCOVERY_BENCHMARK_V1.map((c) =>
    runCase(c.id, c.category, c.commanders, c.bracket, "dev_regression"),
  );
  const blindResults = ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V1.map((c) =>
    runCase(c.id, c.category, c.commanders, c.bracket, "blind_holdout"),
  );
  const blindCatalogMissing = blindResults.filter((r) => r.catalogMissing).map((r) => r.caseId);
  const blindEvaluated = blindResults.filter((r) => !r.catalogMissing);

  const allPairs = [...regressionResults, ...blindEvaluated].flatMap((r) => r.adjudicatedPairs);
  const surfacedPairs = allPairs.filter((p) => p.rank > 0);
  const accepted = surfacedPairs.filter((p) => p.outcome === "ACCEPTED").length;
  const precision = surfacedPairs.length > 0 ? accepted / surfacedPairs.length : 0;

  const primaryCases = regressionResults.filter((r) => REGRESSION_EXPECTED_PRIMARY[r.caseId]);
  let primaryCorrect = 0;
  for (const r of primaryCases) {
    const expected = REGRESSION_EXPECTED_PRIMARY[r.caseId]!;
    const rank1 = r.surfacedArchetypes.find((a) => a.rank === 1);
    if (rank1 && expected.includes(rank1.archetypeId)) primaryCorrect += 1;
  }
  const primaryRankAccuracy = primaryCases.length > 0 ? primaryCorrect / primaryCases.length : 0;

  const missingRecords = allPairs.filter((p) => p.outcome === "MISSING_OBVIOUS_ARCHETYPE");
  const missingRate = missingRecords.length / (regressionResults.length + blindEvaluated.length);

  const errorClasses: Record<string, number> = {};
  for (const p of allPairs) {
    if (p.outcome === "ACCEPTED") continue;
    errorClasses[p.rootCauseClass] = (errorClasses[p.rootCauseClass] ?? 0) + 1;
  }

  const phase6Gate = {
    precisionTarget: 0.85,
    primaryRankTarget: 0.85,
    missingObviousMax: 0.15,
    precision,
    primaryRankAccuracy,
    missingObviousRate: missingRate,
    pass: precision >= 0.85 && primaryRankAccuracy >= 0.85 && missingRate <= 0.15,
  };

  const qaReport = {
    version: "archetype-discovery-v1.2-phase5.2-qa",
    discoveryEngineVersion: ARCHETYPE_DISCOVERY_V1_VERSION,
    generatedAt: new Date().toISOString(),
    qaVerdict: phase6Gate.pass ? "PASS" : "FAIL",
    phase6Gate,
    causalRoleProfile: {
      fields: [
        "engineInputs",
        "engineConditions",
        "engineCosts",
        "engineTriggers",
        "engineActions",
        "engineOutputs",
        "enginePayoffs",
        "resourcesProduced",
        "resourcesConsumed",
        "permissions",
        "repeatability",
        "broadFlexibilityScore",
      ],
      supportSignals: ["driverSupport", "payoffSupport", "feedbackSupport", "incidentalSupport"],
    },
    patternPrerequisitePolicy: "REQUIRED / SUPPORTING / DISQUALIFYING gates per pattern (pattern-prerequisites-v1.ts)",
    newPatternFamilies: [
      "aura_voltron_engine",
      "treasure_sacrifice_engine",
      "superfriends_engine",
      "self_mill_graveyard_engine",
      "legendary_tribal_engine",
      "mana_ability_combo_engine",
      "exile_impulse_engine",
      "ninja_tempo_engine",
    ],
    devRegression: {
      caseCount: regressionResults.length,
      surfacedPairs: regressionResults.reduce((a, r) => a + r.surfacedCount, 0),
      zeroSurfaceCases: regressionResults.filter((r) => r.surfacedCount === 0).map((r) => r.caseId),
      results: regressionResults,
    },
    blindHoldout: {
      version: "archetype-discovery-blind-holdout-v1",
      setHash: blindHoldoutSetHash(),
      caseCount: blindResults.length,
      evaluatedCaseCount: blindEvaluated.length,
      catalogMissingCaseIds: blindCatalogMissing,
      categoryComposition: blindHoldoutCategoryComposition(),
      surfacedPairs: blindEvaluated.reduce((a, r) => a + r.surfacedCount, 0),
      rejectedZeroSurface: blindEvaluated.filter((r) => r.surfacedCount === 0).length,
      results: blindResults,
    },
    adjudicationSummary: {
      totalSurfacedPairs: surfacedPairs.length,
      accepted,
      precision,
      primaryRankAccuracy,
      missingObviousCount: missingRecords.length,
      missingObviousRate: missingRate,
      errorClasses,
      automatedNote:
        "Automated adjudication proxy — blind human review package generated separately for reviewer sign-off.",
    },
    authorization: {
      phase52CausalRepair: "QA_COMPLETE",
      phase6CandidatePool: "WAIT",
      semanticOnlyRetrieval: "FROZEN",
      optimizer: "WAIT",
    },
  };

  const blindReviewPackage = {
    version: "archetype-discovery-blind-review-v1.2",
    generatedAt: new Date().toISOString(),
    holdoutSetHash: blindHoldoutSetHash(),
    reviewInstructions: [
      "Blind holdout — do not tune discovery against these commanders.",
      "Is the surfaced archetype mechanically real for this commander?",
      "Is primary ranking correct?",
      "Is any obvious archetype missing?",
      "Do NOT use EDHREC popularity.",
    ],
    samples: blindEvaluated.flatMap((r) =>
      r.surfacedArchetypes.map((a) => ({
        caseId: r.caseId,
        category: r.category,
        commander: r.commanderNames.join(" + "),
        rank: a.rank,
        archetypeId: a.archetypeId,
        mechanicalName: a.mechanicalName,
        driverSupport: a.driverSupport,
        discoverySupport: a.discoverySupport,
        adjudicationOutcome: null,
      })),
    ),
  };

  const outDir = resolve(process.cwd(), "data/milestones/deck-synthesis");
  mkdirSync(outDir, { recursive: true });
  const qaPath = resolve(outDir, "archetype-discovery-v1.2-phase5.2-qa.json");
  const blindReviewPath = resolve(outDir, "archetype-discovery-blind-review-v1.2.json");
  writeFileSync(qaPath, JSON.stringify(qaReport, null, 2));
  writeFileSync(blindReviewPath, JSON.stringify(blindReviewPackage, null, 2));

  const hash = createHash("sha256").update(JSON.stringify(qaReport)).digest("hex");
  console.log(
    JSON.stringify(
      {
        qaVerdict: qaReport.qaVerdict,
        phase6Gate,
        devRegression: {
          cases: regressionResults.length,
          zeroSurface: qaReport.devRegression.zeroSurfaceCases,
          surfacedPairs: qaReport.devRegression.surfacedPairs,
        },
        blindHoldout: {
          hash: qaReport.blindHoldout.setHash,
          composition: qaReport.blindHoldout.categoryComposition,
          surfacedPairs: qaReport.blindHoldout.surfacedPairs,
          zeroSurface: qaReport.blindHoldout.rejectedZeroSurface,
        },
        adjudicationSummary: qaReport.adjudicationSummary,
        qaPath,
        blindReviewPath,
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
