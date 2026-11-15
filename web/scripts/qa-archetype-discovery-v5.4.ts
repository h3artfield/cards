#!/usr/bin/env npx tsx
/**
 * Archetype Discovery v1.4.0 — Phase 5.4 DEV regression (118 cases).
 * DEV-28 + blind-v1 (40) + spent blind-v2 (50) = 118 strategy cases.
 */
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadProjectEnvLocal } from "./lib/script-env";
import { loadDeckResolutionCatalog } from "./lib/load-deck-resolution-catalog";
import { loadShadowSemanticIndex } from "../src/lib/commander-strategy/shadow-semantic-index";
import {
  ARCHETYPE_DISCOVERY_BENCHMARK_V1,
  ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V1,
  ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V2,
  ARCHETYPE_DISCOVERY_BLIND_V2_STATUS,
  ARCHETYPE_DISCOVERY_V1_VERSION,
  COMMANDER_CAUSAL_INFERENCE_VERSION,
  benchmarkCaseAccounting,
  benchmarkCommanderResolutionPreflight,
  buildCommanderMechanicalProfile,
  buildGlobalCatalogSemanticIndex,
  computeCausalDepthScore,
  discoverArchetypes,
  extractMechanicalMotifs,
  resolveBenchmarkCommanderOracleIds,
  type CommanderBuildDirection,
} from "../src/lib/deck-synthesis";

loadProjectEnvLocal();

type MechanicalOutcome =
  | "ACCEPTED"
  | "WRONG_PRIMARY_DIRECTION"
  | "MISSING_CENTRAL_DIRECTION"
  | "INCIDENTAL_OUTPUT_INFLATION"
  | "CAUSAL_CHAIN_WRONG"
  | "INSUFFICIENT_FOR_RETRIEVAL"
  | "CONTEXT_REQUIRED"
  | "PENDING_HUMAN_REVIEW";

type CaseResult = {
  caseId: string;
  set: "dev_regression" | "blind_holdout_v1" | "blind_holdout_v2";
  category: string;
  commanderLabel: string;
  resolutionFailed: boolean;
  buildDirections: CommanderBuildDirection[];
  hasValidBuildDirection: boolean;
  evaluationContextStatus: string;
  profile: ReturnType<typeof buildCommanderMechanicalProfile> | null;
};

const ZERO_SURFACE_EXPECTED: Record<string, string[]> = {
  "blind-winota": ["ATTACK_TRIGGER", "CREATURE_CHEAT"],
  "blind-heliod": ["LIFE_GAIN", "COUNTER_PAYOFF"],
  "blind-purphoros": ["ETB_PAYOFF", "DAMAGE_TO_OPPONENTS"],
  "blind-selvala": ["DRAW_ENGINE", "ACTIVATED_MANA_ENGINE"],
  "blind-chatterfang": ["TOKEN_GENERATION", "SACRIFICE_ENGINE"],
  "blind-neheb": ["TRIGGERED_MANA_ENGINE", "OPPONENT_LIFE_LOSS"],
  "blind-kaalia": ["CREATURE_CHEAT", "ATTACK_TRIGGER"],
  "blind-rafiq": ["COMBAT_BUFF", "ATTACK_TRIGGER"],
  "blind-sefris": ["GRAVEYARD_RECURSION"],
  "blind-ishai": ["SPELL_CAST_TRIGGER", "STATIC_TAX"],
  "blind-elsha": ["CAST_FROM_LIBRARY_TOP", "CAST_FROM_EXILE"],
  "blind-yarok": ["ETB_PAYOFF", "BLINK_ETB"],
  "blind-zinnia": ["SPELL_CAST_TRIGGER", "TOKEN_GENERATION"],
};

function primaryDirection(r: CaseResult): CommanderBuildDirection | undefined {
  return r.buildDirections.find((d) => d.rank === 1) ?? r.buildDirections[0];
}

function directionMotifSet(d: CommanderBuildDirection | undefined): Set<string> {
  if (!d) return new Set();
  return new Set([...d.drivers, ...d.payoffs, ...d.subDirectionIds]);
}

function autoAdjudicateMechanical(r: CaseResult): {
  outcome: MechanicalOutcome;
  detail: string;
  retrievalUsable: boolean;
  mechanismCorrect: boolean;
  payoffOnlyPrimary: boolean;
} {
  if (r.evaluationContextStatus === "COMMAND_ZONE_CONTEXT_REQUIRED") {
    return {
      outcome: "CONTEXT_REQUIRED",
      detail: "Command-zone context required — not counted as zero-direction failure.",
      retrievalUsable: false,
      mechanismCorrect: true,
      payoffOnlyPrimary: false,
    };
  }

  const primary = primaryDirection(r);
  if (!primary) {
    if (r.evaluationContextStatus === "COMMAND_ZONE_CONTEXT_REQUIRED") {
      return {
        outcome: "CONTEXT_REQUIRED",
        detail: "Command-zone context required — not counted as zero-direction failure.",
        retrievalUsable: false,
        mechanismCorrect: true,
        payoffOnlyPrimary: false,
      };
    }
    return {
      outcome: "MISSING_CENTRAL_DIRECTION",
      detail: "No primary CommanderBuildDirection surfaced.",
      retrievalUsable: false,
      mechanismCorrect: false,
      payoffOnlyPrimary: false,
    };
  }

  if (!r.hasValidBuildDirection) {
    return {
      outcome: "MISSING_CENTRAL_DIRECTION",
      detail: "No anchored primary build direction.",
      retrievalUsable: false,
      mechanismCorrect: false,
      payoffOnlyPrimary: false,
    };
  }

  const payoffOnlyPrimary =
    primary.directionAnchors.length === 0 ||
    primary.directionValidity === "UNANCHORED_SIGNAL" ||
    (primary.drivers.length === 0 && primary.payoffs.length > 0);

  if (payoffOnlyPrimary || primary.directionValidity === "UNANCHORED_SIGNAL") {
    return {
      outcome: "INCIDENTAL_OUTPUT_INFLATION",
      detail: "Payoff-only or unanchored primary direction.",
      retrievalUsable: false,
      mechanismCorrect: false,
      payoffOnlyPrimary: true,
    };
  }

  if (!primary.phase6RetrievalReady) {
    return {
      outcome: "INSUFFICIENT_FOR_RETRIEVAL",
      detail: `Retrieval spec incomplete (${primary.retrievalSpecificationCompleteness.toFixed(2)}).`,
      retrievalUsable: false,
      mechanismCorrect: true,
      payoffOnlyPrimary: false,
    };
  }

  const depth = computeCausalDepthScore({
    profile: r.profile!.causalRoles,
    driverMotifIds: primary.drivers.length > 0 ? primary.drivers : primary.directionAnchors.map((a) => a.mechanism),
    payoffMotifIds: primary.payoffs,
  });

  if (primary.driverPropagationFailure || (primary.drivers.length === 0 && depth.incidentalSupport > 0.25)) {
    return {
      outcome: "INCIDENTAL_OUTPUT_INFLATION",
      detail: "Driver propagation failure or incidental payoff inflation.",
      retrievalUsable: false,
      mechanismCorrect: false,
      payoffOnlyPrimary: true,
    };
  }

  const expected = ZERO_SURFACE_EXPECTED[r.caseId];
  if (expected) {
    const set = directionMotifSet(primary);
    const matched = expected.filter((m) => set.has(m));
    if (matched.length < Math.min(2, expected.length)) {
      return {
        outcome: "MISSING_CENTRAL_DIRECTION",
        detail: `Expected motifs [${expected.join(", ")}]; matched [${matched.join(", ")}].`,
        retrievalUsable: primary.phase6RetrievalReady,
        mechanismCorrect: true,
        payoffOnlyPrimary: false,
      };
    }
  }

  return {
    outcome: "ACCEPTED",
    detail: "Automated proxy — confirm in human review.",
    retrievalUsable: primary.phase6RetrievalReady,
    mechanismCorrect: true,
    payoffOnlyPrimary: false,
  };
}

async function main() {
  const catalog = await loadDeckResolutionCatalog();
  const shadowIndex = await loadShadowSemanticIndex();
  const globalCatalogIndex = buildGlobalCatalogSemanticIndex({ catalog, shadowIndex });

  const allCases = [
    ...ARCHETYPE_DISCOVERY_BENCHMARK_V1.map((c) => ({ ...c, set: "dev_regression" as const })),
    ...ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V1.map((c) => ({ ...c, set: "blind_holdout_v1" as const })),
    ...ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V2.map((c) => ({ ...c, set: "blind_holdout_v2" as const })),
  ];

  const resolverPreflight = benchmarkCommanderResolutionPreflight({
    catalog,
    commanderNames: allCases.flatMap((c) => c.commanders),
  });

  const results: CaseResult[] = [];

  for (const c of allCases) {
    const resolution = resolveBenchmarkCommanderOracleIds(catalog, c.commanders);
    if (!resolution.resolved) {
      results.push({
        caseId: c.id,
        set: c.set,
        category: c.category,
        commanderLabel: c.commanders.join(" + "),
        resolutionFailed: true,
        buildDirections: [],
        hasValidBuildDirection: false,
        evaluationContextStatus: "INSUFFICIENT_CONTEXT",
        profile: null,
      });
      continue;
    }

    const report = discoverArchetypes(
      { commanderOracleIds: resolution.oracleIds, bracket: c.bracket },
      { catalog, shadowIndex, globalCatalogIndex },
    );
    const profile = buildCommanderMechanicalProfile({
      commanderOracleIds: resolution.oracleIds,
      catalogByOracleId: catalog.byOracleId,
      shadowIndex,
    });

    results.push({
      caseId: c.id,
      set: c.set,
      category: c.category,
      commanderLabel: report.commanderNames.join(" + "),
      resolutionFailed: false,
      buildDirections: report.buildDirections,
      hasValidBuildDirection: report.hasValidBuildDirection,
      evaluationContextStatus: report.evaluationContextStatus,
      profile,
    });
  }

  const evaluated = results.filter((r) => !r.resolutionFailed);
  const contextRequired = evaluated.filter((r) => r.evaluationContextStatus === "COMMAND_ZONE_CONTEXT_REQUIRED");
  const scorable = evaluated.filter((r) => r.evaluationContextStatus !== "COMMAND_ZONE_CONTEXT_REQUIRED");

  const mechanicalAdjudications = evaluated.map((r) => {
    const adj = autoAdjudicateMechanical(r);
    const primary = primaryDirection(r);
    return {
      caseId: r.caseId,
      set: r.set,
      commander: r.commanderLabel,
      evaluationContextStatus: r.evaluationContextStatus,
      primaryMechanicalDirection: primary?.mechanicalDescription ?? null,
      directionAnchors: primary?.directionAnchors?.map((a) => `${a.anchorKind}:${a.mechanism}`) ?? [],
      directionValidity: primary?.directionValidity ?? null,
      retrievalCompleteness: primary?.retrievalSpecificationCompleteness ?? 0,
      phase6RetrievalReady: primary?.phase6RetrievalReady ?? false,
      ...adj,
    };
  });

  const scorableAdj = mechanicalAdjudications.filter((a) => a.outcome !== "CONTEXT_REQUIRED");

  const accepted = scorableAdj.filter((a) => a.outcome === "ACCEPTED").length;
  const mechanicalPrecision = scorableAdj.length > 0 ? accepted / scorableAdj.length : 0;

  const withValid = scorable.filter((r) => r.hasValidBuildDirection);
  const primaryAccepted = scorableAdj.filter(
    (a) => a.outcome === "ACCEPTED" && withValid.some((r) => r.caseId === a.caseId),
  ).length;
  const primaryCorrectness = withValid.length > 0 ? primaryAccepted / withValid.length : 0;

  const missingCentral = scorableAdj.filter(
    (a) => a.outcome === "MISSING_CENTRAL_DIRECTION" || a.outcome === "WRONG_PRIMARY_DIRECTION",
  ).length;
  const missingCentralRate = scorable.length > 0 ? missingCentral / scorable.length : 0;

  const causalWrong = scorableAdj.filter((a) => a.outcome === "CAUSAL_CHAIN_WRONG" || a.outcome === "INCIDENTAL_OUTPUT_INFLATION").length;
  const causalCorrectness = scorableAdj.length > 0 ? 1 - causalWrong / scorableAdj.length : 0;

  const retrievalUsable = scorableAdj.filter((a) => a.retrievalUsable).length;
  const retrievalUsability = scorableAdj.length > 0 ? retrievalUsable / scorableAdj.length : 0;

  const zeroUsable = scorable.filter((r) => !r.hasValidBuildDirection).length;
  const zeroUsableRate = scorable.length > 0 ? zeroUsable / scorable.length : 0;

  const mechanismCorrect = scorableAdj.filter((a) => a.mechanismCorrect).length;
  const mechanismCorrectness = scorableAdj.length > 0 ? mechanismCorrect / scorableAdj.length : 0;

  const payoffOnlyPrimaries = scorableAdj.filter((a) => a.payoffOnlyPrimary).length;

  const devGate = {
    mechanicalPrecisionMin: 0.95,
    primaryCorrectnessMin: 0.95,
    causalCorrectnessMin: 0.95,
    retrievalUsabilityMin: 0.95,
    mechanismCorrectnessMin: 0.95,
    zeroUsableMax: 0.05,
    missingCentralMax: 0.05,
    payoffOnlyPrimariesMax: 0,
    mechanicalPrecision,
    primaryCorrectness,
    causalCorrectness,
    retrievalUsability,
    mechanismCorrectness,
    zeroUsableRate,
    missingCentralRate,
    payoffOnlyPrimaries,
    contextRequiredCount: contextRequired.length,
    pass:
      mechanicalPrecision >= 0.95 &&
      primaryCorrectness >= 0.95 &&
      causalCorrectness >= 0.95 &&
      retrievalUsability >= 0.95 &&
      mechanismCorrectness >= 0.95 &&
      zeroUsableRate <= 0.05 &&
      missingCentralRate <= 0.05 &&
      payoffOnlyPrimaries === 0,
  };

  let gitSha = "unknown";
  try {
    gitSha = execSync("git rev-parse HEAD", { cwd: resolve(process.cwd(), ".."), encoding: "utf8" }).trim();
  } catch {
    /* optional */
  }

  const qaReport = {
    version: "archetype-discovery-v1.4.0-phase5.4-qa",
    discoveryEngineVersion: ARCHETYPE_DISCOVERY_V1_VERSION,
    causalInferenceVersion: COMMANDER_CAUSAL_INFERENCE_VERSION,
    generatedAt: new Date().toISOString(),
    gitCommitSha: gitSha,
    strategyCaseCount: allCases.length,
    devUniverse: {
      dev28: ARCHETYPE_DISCOVERY_BENCHMARK_V1.length,
      blindV1: ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V1.length,
      blindV2Spent: ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V2.length,
      total: allCases.length,
      blindV2Status: ARCHETYPE_DISCOVERY_BLIND_V2_STATUS,
    },
    resolverPreflight: { status: resolverPreflight.pass ? "ACCEPTED" : "HARD_FAIL", ...resolverPreflight },
    metrics: {
      mechanicalPrecision,
      primaryCorrectness,
      missingCentralRate,
      causalCorrectness,
      retrievalUsability,
      zeroUsableRate,
      mechanismCorrectness,
      payoffOnlyPrimaries,
      contextRequiredCorrectness: {
        count: contextRequired.length,
        caseIds: contextRequired.map((r) => r.caseId),
        note: "Not counted as zero-direction failures.",
      },
    },
    devGate,
    qaVerdict: devGate.pass ? "PASS" : "FAIL",
    mechanicalAdjudications,
    authorization: {
      phase54Implementation: "COMPLETE",
      phase54Freeze: devGate.pass ? "READY" : "WAIT",
      blindV3: "WAIT",
      phase6: "WAIT",
      optimizer: "WAIT",
    },
  };

  const outDir = resolve(process.cwd(), "data/milestones/deck-synthesis");
  mkdirSync(outDir, { recursive: true });
  const qaPath = resolve(outDir, "archetype-discovery-v1.4.0-phase5.4-qa.json");
  const reviewPath = resolve(outDir, "archetype-discovery-v1.4.0-mechanical-review-package.json");

  const humanReviewPackage = {
    version: "archetype-discovery-mechanical-review-v1.4.0",
    generatedAt: new Date().toISOString(),
    caseCount: evaluated.length,
    instructions: [
      "Adjudicate all 118 development cases — Phase 5.4 alters direction anchoring globally.",
      "Review directions changed by Phase 5.4 plus sample of unchanged cases.",
      "CONTEXT_REQUIRED cases are not failures when partner/background context absent.",
    ],
    samples: mechanicalAdjudications,
  };

  writeFileSync(qaPath, JSON.stringify(qaReport, null, 2));
  writeFileSync(reviewPath, JSON.stringify(humanReviewPackage, null, 2));

  console.log(
    JSON.stringify(
      {
        qaVerdict: qaReport.qaVerdict,
        devGate,
        strategyCaseCount: allCases.length,
        qaPath,
        reviewPath,
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
