#!/usr/bin/env npx tsx
/**
 * Phase 5.2 Blind Resolution + Recall Diagnostic — REPORT ONLY (no Phase 5.3 repairs).
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadProjectEnvLocal } from "./lib/script-env";
import { loadDeckResolutionCatalog } from "./lib/load-deck-resolution-catalog";
import { lookupGoldenByName } from "./lib/load-golden-catalog-index";
import { loadShadowSemanticIndex } from "../src/lib/commander-strategy/shadow-semantic-index";
import {
  ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V1,
  ARCHETYPE_DISCOVERY_BLIND_V1_STATUS,
  ARCHETYPE_DISCOVERY_V1_VERSION,
  blindHoldoutCategoryComposition,
  blindHoldoutSetHash,
  buildGlobalCatalogSemanticIndex,
  discoverArchetypes,
  benchmarkCommanderResolutionPreflight,
  resolveBenchmarkCommanderName,
  resolveBenchmarkCommanderOracleIds,
  buildCommanderMechanicalProfile,
  scoreCommanderHypotheses,
  passesPatternPrerequisites,
  isIncidentalOnlySupport,
  hasWeakEnginePayoffChain,
  mergeMechanicallyRedundantHypotheses,
  assessCatalogFeasibility,
  isCatalogFeasible,
  assessBracketFeasibility,
  filterCatalogRoleIndex,
  buildCatalogRoleIndex,
} from "../src/lib/deck-synthesis";

loadProjectEnvLocal();

type ZeroSurfaceRootCause =
  | "MISSING_PATTERN_FAMILY"
  | "PREREQUISITE_TOO_STRICT"
  | "CAUSAL_ROLE_NOT_DERIVED"
  | "RC8_TO_PROFILE_MAPPING_GAP"
  | "SUPPORT_THRESHOLD_TOO_HIGH"
  | "MERGE_LOGIC_REMOVED_ONLY_VALID_PLAN"
  | "CATALOG_FEASIBILITY_FALSE_NEGATIVE"
  | "BRACKET_FALSE_NEGATIVE"
  | "UNKNOWN";

type HypothesisTrace = {
  patternId: string;
  mechanicalName: string;
  driverSupport: number;
  payoffSupport: number;
  feedbackSupport: number;
  incidentalSupport: number;
  discoverySupport: number;
  minCommanderDiscoverySupport: number;
  discoverySupportMargin: number;
  prerequisiteDetail: string;
  prerequisitePassed: boolean;
  definingMechanicScore: number;
  mergedInto: string | null;
  catalogFeasible: boolean | null;
  catalogFeasibilityDetail: string | null;
  bracketFeasible: boolean | null;
  bracketDetail: string | null;
  finalRejectionReason: string;
  zeroSurfaceRootCause: ZeroSurfaceRootCause;
};

function classifyZeroSurfaceCause(input: {
  finalRejectionReason: string;
  prerequisiteDetail: string;
  discoverySupportMargin: number;
  mergedInto: string | null;
  catalogFeasible: boolean | null;
  bracketFeasible: boolean | null;
  driverSupport: number;
}): ZeroSurfaceRootCause {
  if (input.finalRejectionReason === "DUPLICATE_MECHANICAL_SIGNATURE" && input.mergedInto) {
    return "MERGE_LOGIC_REMOVED_ONLY_VALID_PLAN";
  }
  if (input.finalRejectionReason === "INSUFFICIENT_LEGAL_CATALOG_SUPPORT") {
    return "CATALOG_FEASIBILITY_FALSE_NEGATIVE";
  }
  if (input.finalRejectionReason === "BRACKET_HARD_INCOMPATIBLE") {
    return "BRACKET_FALSE_NEGATIVE";
  }
  if (input.finalRejectionReason === "WEAK_ENGINE_PAYOFF_CHAIN") {
    if (input.prerequisiteDetail.includes("required_evidence_missing")) return "MISSING_PATTERN_FAMILY";
    if (input.prerequisiteDetail.includes("insufficient_driver")) return "CAUSAL_ROLE_NOT_DERIVED";
    return "PREREQUISITE_TOO_STRICT";
  }
  if (input.finalRejectionReason === "INCIDENTAL_COMMANDER_SUPPORT") {
    if (input.discoverySupportMargin < -0.05) return "SUPPORT_THRESHOLD_TOO_HIGH";
    if (input.driverSupport < 0.2) return "CAUSAL_ROLE_NOT_DERIVED";
    return "SUPPORT_THRESHOLD_TOO_HIGH";
  }
  if (input.driverSupport < 0.15) return "RC8_TO_PROFILE_MAPPING_GAP";
  return "UNKNOWN";
}

function traceHypothesis(input: {
  hypothesis: ReturnType<typeof scoreCommanderHypotheses>[number];
  mergedInto: string | null;
  roleIndex: ReturnType<typeof buildCatalogRoleIndex>;
  bracket: number;
}): HypothesisTrace {
  const { hypothesis, mergedInto, roleIndex, bracket } = input;
  const pattern = hypothesis.pattern;
  const support = hypothesis.support;

  let finalRejectionReason = "SURFACED";
  let catalogFeasible: boolean | null = null;
  let catalogFeasibilityDetail: string | null = null;
  let bracketFeasible: boolean | null = null;
  let bracketDetail: string | null = null;

  if (mergedInto) {
    finalRejectionReason = "DUPLICATE_MECHANICAL_SIGNATURE";
  } else if (!passesPatternPrerequisites(hypothesis)) {
    finalRejectionReason = "WEAK_ENGINE_PAYOFF_CHAIN";
  } else if (isIncidentalOnlySupport(hypothesis)) {
    finalRejectionReason = "INCIDENTAL_COMMANDER_SUPPORT";
  } else if (support.definingMechanicScore < 0.15) {
    finalRejectionReason = "INCIDENTAL_COMMANDER_SUPPORT";
  } else if (support.discoverySupport < pattern.minCommanderDiscoverySupport) {
    finalRejectionReason = "INCIDENTAL_COMMANDER_SUPPORT";
  } else if (hasWeakEnginePayoffChain(hypothesis)) {
    finalRejectionReason = "WEAK_ENGINE_PAYOFF_CHAIN";
  } else {
    const census = assessCatalogFeasibility({ pattern, roleIndex });
    const catalogCheck = isCatalogFeasible({ pattern, census });
    catalogFeasible = catalogCheck.feasible;
    catalogFeasibilityDetail = catalogCheck.detail;
    if (!catalogCheck.feasible) {
      finalRejectionReason = "INSUFFICIENT_LEGAL_CATALOG_SUPPORT";
    } else {
      const bracketFeas = assessBracketFeasibility({ pattern, bracket: bracket as 1 | 2 | 3 | 4 | 5 });
      bracketFeasible = bracketFeas.hardFeasibility;
      bracketDetail = bracketFeas.hardIncompatibilityReasons.join("; ") || null;
      if (!bracketFeas.hardFeasibility) {
        finalRejectionReason = "BRACKET_HARD_INCOMPATIBLE";
      }
    }
  }

  const discoverySupportMargin = support.discoverySupport - pattern.minCommanderDiscoverySupport;

  return {
    patternId: pattern.patternId,
    mechanicalName: pattern.mechanicalName,
    driverSupport: support.driverSupport,
    payoffSupport: support.payoffSupport,
    feedbackSupport: support.feedbackSupport,
    incidentalSupport: support.incidentalSupport,
    discoverySupport: support.discoverySupport,
    minCommanderDiscoverySupport: pattern.minCommanderDiscoverySupport,
    discoverySupportMargin,
    prerequisiteDetail: hypothesis.prerequisiteDetail,
    prerequisitePassed: passesPatternPrerequisites(hypothesis),
    definingMechanicScore: support.definingMechanicScore,
    mergedInto,
    catalogFeasible,
    catalogFeasibilityDetail,
    bracketFeasible,
    bracketDetail,
    finalRejectionReason,
    zeroSurfaceRootCause: classifyZeroSurfaceCause({
      finalRejectionReason,
      prerequisiteDetail: hypothesis.prerequisiteDetail,
      discoverySupportMargin,
      mergedInto,
      catalogFeasible,
      bracketFeasible,
      driverSupport: support.driverSupport,
    }),
  };
}

const BLIND_V1_HASH_BEFORE_GHAVE_TYPO = "286a1d954f37c105d96d75dec5913be9db381376b5ca10e56ce29f8cb88189fd";

const CATEGORY_EXPECTED_PATTERNS: Record<string, string[]> = {
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
  partner_background: ["mana_ability_combo_engine", "goodstuff_value_engine"],
  unusual_mechanical: [],
};

async function main() {
  const catalog = await loadDeckResolutionCatalog();
  const shadowIndex = await loadShadowSemanticIndex();
  const globalCatalogIndex = buildGlobalCatalogSemanticIndex({ catalog, shadowIndex });

  const allBenchmarkNames = ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V1.flatMap((c) => c.commanders);
  const legacyUnresolved: Array<{ caseId: string; name: string }> = [];
  const resolutionAudits: ReturnType<typeof resolveBenchmarkCommanderName>[] = [];

  for (const benchCase of ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V1) {
    for (const name of benchCase.commanders) {
      const audit = resolveBenchmarkCommanderName(catalog, name);
      resolutionAudits.push(audit);
      if (!lookupGoldenByName(catalog, name)?.oracleId) {
        legacyUnresolved.push({ caseId: benchCase.id, name });
      }
    }
  }

  const preflight = benchmarkCommanderResolutionPreflight({ catalog, commanderNames: allBenchmarkNames });

  const blindResults: Array<{
    caseId: string;
    category: string;
    commanders: string[];
    bracket: number;
    resolutionAudits: ReturnType<typeof resolveBenchmarkCommanderName>[];
    surfacedCount: number;
    surfacedArchetypeIds: string[];
    zeroSurface: boolean;
    causalProfile: unknown;
    hypothesesGenerated: number;
    hypothesisTraces: HypothesisTrace[];
    dominantZeroSurfaceCause: ZeroSurfaceRootCause | null;
    missingObviousDirection: boolean;
    expectedPatternFamilies: string[];
  }> = [];

  for (const benchCase of ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V1) {
    const { oracleIds, audits } = resolveBenchmarkCommanderOracleIds(catalog, benchCase.commanders);
    if (oracleIds.length !== benchCase.commanders.length) {
      blindResults.push({
        caseId: benchCase.id,
        category: benchCase.category,
        commanders: benchCase.commanders,
        bracket: benchCase.bracket,
        resolutionAudits: audits,
        surfacedCount: 0,
        surfacedArchetypeIds: [],
        zeroSurface: true,
        causalProfile: null,
        hypothesesGenerated: 0,
        hypothesisTraces: [],
        dominantZeroSurfaceCause: "UNKNOWN",
        missingObviousDirection: true,
        expectedPatternFamilies: CATEGORY_EXPECTED_PATTERNS[benchCase.category] ?? [],
      });
      continue;
    }

    const report = discoverArchetypes(
      { commanderOracleIds: oracleIds, bracket: benchCase.bracket },
      { catalog, shadowIndex, globalCatalogIndex },
    );

    const profile = buildCommanderMechanicalProfile({
      commanderOracleIds: oracleIds,
      catalogByOracleId: catalog.byOracleId,
      shadowIndex,
    })!;

    const roleIndex = filterCatalogRoleIndex(globalCatalogIndex, profile.colorIdentity);
    const stageA = scoreCommanderHypotheses(profile);
    const { merged, duplicateRejections } = mergeMechanicallyRedundantHypotheses(stageA);
    const mergeMap = new Map(duplicateRejections.map((d) => [d.patternId, d.mergedInto]));

    const plausible = stageA
      .filter((h) => h.support.discoverySupport >= 0.12 || h.support.driverSupport >= 0.25)
      .sort((a, b) => b.support.discoverySupport - a.support.discoverySupport)
      .slice(0, 12);

    const hypothesisTraces = plausible.map((h) =>
      traceHypothesis({
        hypothesis: h,
        mergedInto: mergeMap.get(h.pattern.patternId) ?? null,
        roleIndex,
        bracket: benchCase.bracket,
      }),
    );

    const surfacedIds = report.surfacedArchetypes.map((a) => a.archetypeId);
    const expected = CATEGORY_EXPECTED_PATTERNS[benchCase.category] ?? [];
    const missingObvious =
      expected.length > 0 && !expected.some((id) => surfacedIds.includes(id));

    let dominantZeroSurfaceCause: ZeroSurfaceRootCause | null = null;
    if (report.surfacedArchetypes.length === 0 && hypothesisTraces.length > 0) {
      const causeCounts = new Map<ZeroSurfaceRootCause, number>();
      for (const t of hypothesisTraces) {
        causeCounts.set(t.zeroSurfaceRootCause, (causeCounts.get(t.zeroSurfaceRootCause) ?? 0) + 1);
      }
      dominantZeroSurfaceCause = [...causeCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "UNKNOWN";
    }

    blindResults.push({
      caseId: benchCase.id,
      category: benchCase.category,
      commanders: benchCase.commanders,
      bracket: benchCase.bracket,
      resolutionAudits: audits,
      surfacedCount: report.surfacedArchetypes.length,
      surfacedArchetypeIds: surfacedIds,
      zeroSurface: report.surfacedArchetypes.length === 0,
      causalProfile: profile.causalRoles,
      hypothesesGenerated: stageA.length,
      hypothesisTraces,
      dominantZeroSurfaceCause,
      missingObviousDirection: missingObvious,
      expectedPatternFamilies: expected,
    });
  }

  const zeroSurfaceCases = blindResults.filter((r) => r.zeroSurface);
  const missingObviousCases = blindResults.filter((r) => r.missingObviousDirection);

  const zeroSurfaceCauseTable: Record<string, number> = {};
  for (const c of zeroSurfaceCases) {
    const cause = c.dominantZeroSurfaceCause ?? "UNKNOWN";
    zeroSurfaceCauseTable[cause] = (zeroSurfaceCauseTable[cause] ?? 0) + 1;
  }

  const proposedPhase53Repairs = [
    {
      id: "P53-RESOLVER-PREFLIGHT",
      priority: "P0",
      action: "Require benchmarkCommanderResolutionPreflight() before any blind evaluation; wire resolver into all QA scripts.",
      status: "PARTIAL — resolver + preflight added; QA scripts to adopt.",
    },
    {
      id: "P53-COMMANDER-BUILD-DIRECTION",
      priority: "P2",
      action:
        "Implement CommanderBuildDirection extraction when named patterns fail but causal drivers+payoffs exist; distinguish NO_NAMED_ARCHETYPE vs NO_MECHANICAL_DIRECTION.",
      status: "WAIT — type spec only.",
    },
    {
      id: "P53-PATTERN-FAMILIES",
      priority: "P3",
      action: "Add mechanically grounded patterns for zero-surface commanders dominated by MISSING_PATTERN_FAMILY (audit per-commander traces).",
      status: "WAIT — use zero-surface table.",
    },
    {
      id: "P53-CAUSAL-EXTRACTION",
      priority: "P3",
      action: "Improve RC8→causal-role mapping for commanders dominated by CAUSAL_ROLE_NOT_DERIVED / RC8_TO_PROFILE_MAPPING_GAP.",
      status: "WAIT — no threshold lowering.",
    },
    {
      id: "P53-MERGE-LOGIC",
      priority: "P3",
      action: "Review merge deduplication when MERGE_LOGIC_REMOVED_ONLY_VALID_PLAN is dominant — preserve distinct build directions.",
      status: "WAIT.",
    },
    {
      id: "P53-BLIND-V2",
      priority: "P5",
      action: "After Phase 5.3 freeze, seal 50-commander BLIND v2 with 100% resolution preflight before evaluation.",
      status: "NOT_STARTED",
    },
  ];

  const diagnostic = {
    version: "archetype-discovery-v1.2-blind-resolution-recall-diagnostic",
    generatedAt: new Date().toISOString(),
    discoveryEngineVersion: ARCHETYPE_DISCOVERY_V1_VERSION,
    discoveryThresholdsModified: false,
    authorization: {
      phase52: "DEVELOPMENT_PROGRESS_ACCEPTED",
      phase53Implementation: "WAIT",
      phase6: "WAIT",
      blindV1Status: ARCHETYPE_DISCOVERY_BLIND_V1_STATUS,
      blindV2: "SEALED_UNTIL_PHASE_5.3_FREEZE",
      semanticOnlyRetrieval: "FROZEN",
    },
    blindV1: {
      status: ARCHETYPE_DISCOVERY_BLIND_V1_STATUS,
      caseCount: 40,
      hashBeforeGhaveTypoFix: BLIND_V1_HASH_BEFORE_GHAVE_TYPO,
      hashAfterGhaveTypoFix: blindHoldoutSetHash(),
      ghaveTypoCorrection: "Ghave, Guru of Spore → Ghave, Guru of Spores (membership preserved)",
      categoryComposition: blindHoldoutCategoryComposition(),
    },
    resolutionAudit: {
      legacyLookupGoldenByNameUnresolved: legacyUnresolved,
      legacyUnresolvedCount: legacyUnresolved.length,
      benchmarkResolverPreflight: preflight,
      resolutionRate: `${preflight.resolvedCount}/${preflight.totalCommanderNames}`,
      allAudits: resolutionAudits,
    },
    unchangedPhase52Rerun: {
      note: "Phase 5.2 discovery algorithm unchanged — thresholds not loosened.",
      caseCount: blindResults.length,
      surfacedPairs: blindResults.reduce((a, r) => a + r.surfacedCount, 0),
      zeroSurfaceCount: zeroSurfaceCases.length,
      missingObviousDirectionCount: missingObviousCases.length,
      missingObviousRate: missingObviousCases.length / blindResults.length,
      results: blindResults,
    },
    zeroSurfaceDiagnostics: {
      commanders: zeroSurfaceCases.map((c) => ({
        caseId: c.caseId,
        commanders: c.commanders,
        category: c.category,
        dominantCause: c.dominantZeroSurfaceCause,
        topHypothesisTraces: c.hypothesisTraces.slice(0, 5),
      })),
      rootCauseTable: zeroSurfaceCauseTable,
    },
    missingObviousDirectionCases: missingObviousCases.map((c) => ({
      caseId: c.caseId,
      commanders: c.commanders,
      category: c.category,
      expectedPatternFamilies: c.expectedPatternFamilies,
      surfacedInstead: c.surfacedArchetypeIds,
      topRejected: c.hypothesisTraces.filter((t) => t.finalRejectionReason !== "SURFACED").slice(0, 3),
    })),
    proposedPhase53Repairs,
    phase6Gate: {
      status: "WAIT",
      note: "Blind v1 is diagnostic/spent. Final gate runs on sealed blind v2 after Phase 5.3 freeze.",
    },
  };

  const outDir = resolve(process.cwd(), "data/milestones/deck-synthesis");
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, "archetype-discovery-v1.2-blind-resolution-recall-diagnostic.json");
  writeFileSync(outPath, JSON.stringify(diagnostic, null, 2));

  const hash = createHash("sha256").update(JSON.stringify(diagnostic)).digest("hex");
  console.log(
    JSON.stringify(
      {
        diagnosticPath: outPath,
        hash,
        resolutionRate: diagnostic.resolutionAudit.resolutionRate,
        legacyUnresolved: diagnostic.resolutionAudit.legacyUnresolvedCount,
        zeroSurface: zeroSurfaceCases.length,
        missingObviousRate: diagnostic.unchangedPhase52Rerun.missingObviousRate,
        zeroSurfaceCauseTable,
        blindV1Hash: diagnostic.blindV1.hashAfterGhaveTypoFix,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
