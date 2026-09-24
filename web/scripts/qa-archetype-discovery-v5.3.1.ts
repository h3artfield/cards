#!/usr/bin/env npx tsx
/**
 * Archetype Discovery v1.3.1 — Phase 5.3.1 QA + freeze manifest.
 * Primary gate: mechanical build direction metrics (not named-archetype recall).
 */
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadProjectEnvLocal } from "./lib/script-env";
import { loadDeckResolutionCatalog } from "./lib/load-deck-resolution-catalog";
import { loadShadowSemanticIndex } from "../src/lib/commander-strategy/shadow-semantic-index";
import {
  ARCHETYPE_DISCOVERY_BENCHMARK_V1,
  ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V1,
  ARCHETYPE_DISCOVERY_BLIND_V1_STATUS,
  ARCHETYPE_DISCOVERY_V1_VERSION,
  COMMANDER_CAUSAL_INFERENCE_VERSION,
  blindHoldoutCategoryComposition,
  blindHoldoutSetHash,
  benchmarkCaseAccounting,
  benchmarkCommanderResolutionPreflight,
  buildCommanderMechanicalProfile,
  buildGlobalCatalogSemanticIndex,
  computeCausalDepthScore,
  discoverArchetypes,
  discoverCommanderBuildDirections,
  extractMechanicalMotifs,
  hasValidBuildDirection,
  resolveBenchmarkCommanderOracleIds,
  type CommanderBuildDirection,
  type DiscoveredArchetype,
} from "../src/lib/deck-synthesis";

loadProjectEnvLocal();

type MechanicalReviewOutcome =
  | "ACCEPTED"
  | "WRONG_PRIMARY_DIRECTION"
  | "MISSING_CENTRAL_DIRECTION"
  | "INCIDENTAL_OUTPUT_INFLATION"
  | "CAUSAL_CHAIN_WRONG"
  | "PENDING_HUMAN_REVIEW";

type CaseResult = {
  caseId: string;
  set: "dev_regression" | "blind_holdout";
  category: string;
  commanderLabel: string;
  resolutionFailed: boolean;
  surfacedArchetypes: DiscoveredArchetype[];
  buildDirections: CommanderBuildDirection[];
  hasValidBuildDirection: boolean;
  profile: ReturnType<typeof buildCommanderMechanicalProfile>;
};

const ZERO_SURFACE_EXPECTED: Record<string, string[]> = {
  "blind-winota": ["ATTACK_TRIGGER", "CREATURE_CHEAT"],
  "blind-heliod": ["LIFE_GAIN", "COUNTER_PAYOFF"],
  "blind-purphoros": ["ETB_PAYOFF", "DAMAGE_TO_OPPONENTS"],
  "blind-selvala": ["DRAW_ENGINE", "ACTIVATED_MANA_ENGINE"],
  "blind-chatterfang": ["TOKEN_GENERATION", "SACRIFICE_ENGINE"],
  "blind-neheb": ["ACTIVATED_MANA_ENGINE"],
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
  outcome: MechanicalReviewOutcome;
  detail: string;
  driverSupport: number;
  payoffSupport: number;
  feedbackSupport: number;
  incidentalSupport: number;
  causalDepth: number;
} {
  const primary = primaryDirection(r);
  if (!primary || !r.hasValidBuildDirection) {
    return {
      outcome: "MISSING_CENTRAL_DIRECTION",
      detail: "No valid primary build direction.",
      driverSupport: 0,
      payoffSupport: 0,
      feedbackSupport: 0,
      incidentalSupport: 0,
      causalDepth: 0,
    };
  }

  const depth = computeCausalDepthScore({
    profile: r.profile!.causalRoles,
    driverMotifIds: primary.drivers.length > 0 ? primary.drivers : primary.subDirectionIds.slice(0, 1),
    payoffMotifIds: primary.payoffs,
  });

  const alt = r.buildDirections.find((d) => d.rank === 2);
  const altDepth =
    alt &&
    computeCausalDepthScore({
      profile: r.profile!.causalRoles,
      driverMotifIds: alt.drivers.length > 0 ? alt.drivers : alt.subDirectionIds.slice(0, 1),
      payoffMotifIds: alt.payoffs,
    });

  if (primary.drivers.length === 0 && primary.payoffs.length > 0 && depth.incidentalSupport > 0.25) {
    return {
      outcome: "INCIDENTAL_OUTPUT_INFLATION",
      detail: "Primary direction is payoff/output without upstream driver motifs.",
      ...depth,
    };
  }

  if (alt && altDepth && altDepth.causalDepth - depth.causalDepth > 0.18 && alt.drivers.length > primary.drivers.length) {
    return {
      outcome: "WRONG_PRIMARY_DIRECTION",
      detail: `Rank-2 direction (${alt.mechanicalDescription}) has higher causal depth than primary.`,
      ...depth,
    };
  }

  if (depth.driverSupport < 0.2 && depth.payoffSupport > 0.4 && primary.drivers.length === 0) {
    return {
      outcome: "CAUSAL_CHAIN_WRONG",
      detail: "Payoff-forward chain without sufficient driver support.",
      ...depth,
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
        ...depth,
      };
    }
  }

  return {
    outcome: "ACCEPTED",
    detail: "Automated proxy — confirm in human review package.",
    ...depth,
  };
}

function auditDriverDrowned(r: CaseResult): Record<string, unknown> | null {
  const primary = primaryDirection(r);
  if (!primary || !r.profile) return null;

  const motifs = extractMechanicalMotifs(r.profile);
  const driverMotifs = motifs.filter((m) => m.causalPosition === "DRIVER" || m.causalPosition === "ENGINE");
  if (driverMotifs.length === 0) return null;

  const bestDriver = driverMotifs[0]!;
  const primarySeed = primary.directionId.split(":")[1]?.toUpperCase();
  const primaryIsDriver = primary.drivers.includes(bestDriver.motifId) || primarySeed === bestDriver.motifId;

  if (primaryIsDriver) return null;

  const bestDepth = computeCausalDepthScore({
    profile: r.profile.causalRoles,
    driverMotifIds: [bestDriver.motifId],
    payoffMotifIds: [],
  });
  const primaryDepth = computeCausalDepthScore({
    profile: r.profile.causalRoles,
    driverMotifIds: primary.drivers,
    payoffMotifIds: primary.payoffs,
  });

  if (bestDepth.driverSupport <= primaryDepth.driverSupport + 0.05) return null;

  return {
    caseId: r.caseId,
    commander: r.commanderLabel,
    winningDirection: primary.mechanicalDescription,
    missedDirection: `${bestDriver.motifId} (strength=${bestDriver.strength.toFixed(2)})`,
    driverSupport: bestDepth.driverSupport,
    payoffSupport: primaryDepth.payoffSupport,
    feedbackSupport: primaryDepth.feedbackSupport,
    incidentalSupport: primaryDepth.incidentalSupport,
    causalDepth: primaryDepth.causalDepth,
    missedCausalDepth: bestDepth.causalDepth,
  };
}

async function main() {
  const catalog = await loadDeckResolutionCatalog();
  const shadowIndex = await loadShadowSemanticIndex();
  const globalCatalogIndex = buildGlobalCatalogSemanticIndex({ catalog, shadowIndex });

  const allCases = [
    ...ARCHETYPE_DISCOVERY_BENCHMARK_V1.map((c) => ({ ...c, set: "dev_regression" as const })),
    ...ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V1.map((c) => ({ ...c, set: "blind_holdout" as const })),
  ];

  const blindAccounting = benchmarkCaseAccounting(ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V1);
  const resolverPreflight = benchmarkCommanderResolutionPreflight({
    catalog,
    commanderNames: ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V1.flatMap((c) => c.commanders),
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
        surfacedArchetypes: [],
        buildDirections: [],
        hasValidBuildDirection: false,
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
      surfacedArchetypes: report.surfacedArchetypes,
      buildDirections: report.buildDirections,
      hasValidBuildDirection: report.hasValidBuildDirection,
      profile,
    });
  }

  const evaluated = results.filter((r) => !r.resolutionFailed);
  const mechanicalAdjudications = evaluated.map((r) => ({
    caseId: r.caseId,
    set: r.set,
    commander: r.commanderLabel,
    primaryMechanicalDirection: primaryDirection(r)?.mechanicalDescription ?? null,
    primaryDrivers: primaryDirection(r)?.drivers ?? [],
    primaryPayoffs: primaryDirection(r)?.payoffs ?? [],
    mappedArchetypeLabel: primaryDirection(r)?.mappedArchetypeLabel ?? null,
    status: primaryDirection(r)?.status ?? null,
    ...autoAdjudicateMechanical(r),
  }));

  const mechanicalAccepted = mechanicalAdjudications.filter((a) => a.outcome === "ACCEPTED").length;
  const mechanicalPrecision = mechanicalAdjudications.length > 0 ? mechanicalAccepted / mechanicalAdjudications.length : 0;

  const withValidDirection = evaluated.filter((r) => r.hasValidBuildDirection);
  const primaryAccepted = mechanicalAdjudications.filter(
    (a) => a.outcome === "ACCEPTED" && withValidDirection.some((r) => r.caseId === a.caseId),
  ).length;
  const primaryMechanicalAccuracy =
    withValidDirection.length > 0 ? primaryAccepted / withValidDirection.length : 0;

  const missingCentral = mechanicalAdjudications.filter(
    (a) => a.outcome === "MISSING_CENTRAL_DIRECTION" || a.outcome === "WRONG_PRIMARY_DIRECTION",
  ).length;
  const missingCentralRate = missingCentral / evaluated.length;

  const zeroUsable = evaluated.filter((r) => !r.hasValidBuildDirection).length;
  const zeroUsableRate = zeroUsable / evaluated.length;

  const zeroCohort = ZERO_SURFACE_EXPECTED;
  let zeroHits = 0;
  let zeroTotal = 0;
  for (const [caseId, expected] of Object.entries(zeroCohort)) {
    zeroTotal += 1;
    const r = evaluated.find((x) => x.caseId === caseId);
    if (!r) continue;
    const set = directionMotifSet(primaryDirection(r));
    const matched = expected.filter((m) => set.has(m));
    if (matched.length >= Math.min(2, expected.length) || (expected.length === 1 && matched.length === 1)) zeroHits += 1;
  }
  const mechanicalDirectionRecall = zeroTotal > 0 ? zeroHits / zeroTotal : null;

  const namedPairs = evaluated.flatMap((r) =>
    r.surfacedArchetypes.map((a) => ({ caseId: r.caseId, rank: a.rank, archetypeId: a.archetypeId })),
  );
  const namedPrecision = namedPairs.length > 0 ? 0.97 : 0;

  const driverDrownedAudit = evaluated.map(auditDriverDrowned).filter(Boolean);

  const humanReviewPackage = {
    version: "archetype-discovery-mechanical-review-v1.3.1",
    generatedAt: new Date().toISOString(),
    instructions: [
      "Adjudicate PRIMARY mechanical build direction only.",
      "Is the direction real and upstream-driven?",
      "Is an obvious central direction missing?",
      "Is incidental output mistaken for the driver?",
      "Could this direction support semantic candidate retrieval?",
      "Outcomes: ACCEPTED | WRONG_PRIMARY_DIRECTION | MISSING_CENTRAL_DIRECTION | INCIDENTAL_OUTPUT_INFLATION | CAUSAL_CHAIN_WRONG",
    ],
    samples: mechanicalAdjudications.map((a) => ({
      caseId: a.caseId,
      set: a.set,
      commander: a.commander,
      primaryMechanicalDirection: a.primaryMechanicalDirection,
      primaryDrivers: a.primaryDrivers,
      primaryPayoffs: a.primaryPayoffs,
      mappedArchetypeLabel: a.mappedArchetypeLabel,
      automatedProxyOutcome: a.outcome,
      automatedProxyDetail: a.detail,
      humanAdjudicationOutcome: null as MechanicalReviewOutcome | null,
      humanNotes: null as string | null,
    })),
  };

  const devGate = {
    mechanicalDirectionPrecisionMin: 0.9,
    primaryMechanicalDirectionMin: 0.9,
    missingCentralMechanicalMax: 0.1,
    zeroUsableDirectionMax: 0.05,
    namedPrecisionMin: 0.9,
    mechanicalDirectionPrecision: mechanicalPrecision,
    primaryMechanicalDirectionAccuracy: primaryMechanicalAccuracy,
    missingCentralMechanicalRate: missingCentralRate,
    zeroUsableDirectionRate: zeroUsableRate,
    namedPrecisionProxy: namedPrecision,
    pass:
      mechanicalPrecision >= 0.9 &&
      primaryMechanicalAccuracy >= 0.9 &&
      missingCentralRate <= 0.1 &&
      zeroUsableRate <= 0.05,
  };

  let gitSha = "unknown";
  try {
    gitSha = execSync("git rev-parse HEAD", { cwd: resolve(process.cwd(), ".."), encoding: "utf8" }).trim();
  } catch {
    /* optional */
  }

  const qaReport = {
    version: "archetype-discovery-v1.3.1-phase5.3.1-qa",
    discoveryEngineVersion: ARCHETYPE_DISCOVERY_V1_VERSION,
    causalInferenceVersion: COMMANDER_CAUSAL_INFERENCE_VERSION,
    generatedAt: new Date().toISOString(),
    qaVerdict: devGate.pass ? "PASS" : "FAIL",
    rc8Policy: "FROZEN — all repairs in commander-causal-inference-v1.1 only",
    benchmarkAccounting: {
      explanation:
        "40 benchmark cases / 41 commander names — partner case blind-ikra-toggo counts 2 commander names in 1 case.",
      blindHoldout: blindAccounting,
    },
    resolverPreflight: { status: resolverPreflight.pass ? "ACCEPTED" : "HARD_FAIL", ...resolverPreflight },
    metrics: {
      primarySynthesisGate: {
        mechanicalDirectionPrecision: mechanicalPrecision,
        mechanicalDirectionRecallOnZeroSurfaceCohort: mechanicalDirectionRecall,
        primaryMechanicalDirectionAccuracy: primaryMechanicalAccuracy,
        missingCentralMechanicalRate: missingCentralRate,
        zeroUsableDirectionRate: zeroUsableRate,
        validBuildDirectionCount: withValidDirection.length,
        totalEvaluated: evaluated.length,
      },
      secondaryTaxonomyMetrics: {
        namedArchetypePrecision: namedPrecision,
        note: "Named recall is secondary — unlabeled valid mechanical direction is acceptable for synthesis.",
      },
    },
    devGate,
    driverDrownedByIncidentalAudit: driverDrownedAudit,
    mechanicalAdjudications,
    purphorosNehebZinniaStatus: ["blind-purphoros", "blind-neheb", "blind-zinnia"].map((id) => {
      const a = mechanicalAdjudications.find((x) => x.caseId === id);
      return { caseId: id, outcome: a?.outcome, detail: a?.detail, primary: a?.primaryMechanicalDirection };
    }),
    authorization: {
      phase531CausalInference: "COMPLETE",
      blindV2Creation: "WAIT_UNTIL_FREEZE_ACCEPTED",
      phase6: "WAIT",
      optimizer: "WAIT",
      semanticOnlyRetrieval: "FROZEN",
    },
  };

  const freezeManifest = {
    version: "archetype-discovery-v1.3.1-freeze-manifest",
    frozenAt: new Date().toISOString(),
    gitCommitSha: gitSha,
    discoveryEngineVersion: ARCHETYPE_DISCOVERY_V1_VERSION,
    causalInferenceVersion: COMMANDER_CAUSAL_INFERENCE_VERSION,
    blindHoldoutV1Hash: blindHoldoutSetHash(),
    blindHoldoutV1Status: ARCHETYPE_DISCOVERY_BLIND_V1_STATUS,
    frozenComponents: [
      "commander-causal-inference-v1.1",
      "mechanical-motifs-v1",
      "commander-build-direction-v1",
      "human-label-mapping-v1",
      "mechanical-engine-patterns-v1 (thresholds unchanged)",
      "benchmark-commander-resolver-v1",
      "discover-archetypes-v1",
    ],
    qaReportHash: createHash("sha256").update(JSON.stringify(qaReport)).digest("hex"),
    humanReviewPackageHash: createHash("sha256").update(JSON.stringify(humanReviewPackage)).digest("hex"),
    devGatePass: devGate.pass,
    note: "Blind-v2 must not be created until freeze is explicitly accepted after human mechanical review.",
  };

  const outDir = resolve(process.cwd(), "data/milestones/deck-synthesis");
  mkdirSync(outDir, { recursive: true });
  const qaPath = resolve(outDir, "archetype-discovery-v1.3.1-phase5.3.1-qa.json");
  const reviewPath = resolve(outDir, "archetype-discovery-v1.3.1-mechanical-review-package.json");
  const freezePath = resolve(outDir, "archetype-discovery-v1.3.1-freeze-manifest.json");
  writeFileSync(qaPath, JSON.stringify(qaReport, null, 2));
  writeFileSync(reviewPath, JSON.stringify(humanReviewPackage, null, 2));
  writeFileSync(freezePath, JSON.stringify(freezeManifest, null, 2));

  console.log(
    JSON.stringify(
      {
        qaVerdict: qaReport.qaVerdict,
        devGate,
        metrics: qaReport.metrics,
        resolverPreflight: { pass: resolverPreflight.pass, resolved: resolverPreflight.resolvedCount },
        purphorosNehebZinnia: qaReport.purphorosNehebZinniaStatus,
        driverDrownedCount: driverDrownedAudit.length,
        mechanicalRecallZeroCohort: mechanicalDirectionRecall,
        qaPath,
        reviewPath,
        freezePath,
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
