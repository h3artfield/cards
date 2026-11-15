#!/usr/bin/env npx tsx
/**
 * Phase 5 historical denominator recalculation + blind-v4 eligibility-corrected scorecard (v1.1).
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadProjectEnvLocal } from "./lib/script-env";
import { ARCHETYPE_DISCOVERY_BENCHMARK_V1 } from "../src/lib/deck-synthesis/archetype-discovery-benchmark-v1";
import { ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V1 } from "../src/lib/deck-synthesis/archetype-discovery-blind-holdout-v1";
import { ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V2 } from "../src/lib/deck-synthesis/archetype-discovery-blind-holdout-v2";
import { ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V3 } from "../src/lib/deck-synthesis/archetype-discovery-blind-holdout-v3";
import { ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V4 } from "../src/lib/deck-synthesis/archetype-discovery-blind-holdout-v4";

loadProjectEnvLocal();

type ReviewCase = {
  caseId: string;
  commandZoneConfiguration?: string;
  mechanicalOutcome?: string;
  retrievalOutcome?: string;
  contextOutcome?: string;
  evaluationContextStatus?: string;
  abstentionClass?: string;
  primaryDirection?: unknown;
  rootCauseClass?: string;
};

type GateMetrics = {
  mechanicalPrecision: number;
  primaryCorrectness: number;
  causalCorrectness: number;
  anchorCorrectness: number;
  mechanismCorrectness: number;
  retrievalUsability: number;
  retrievalCoverage: number;
  retrievalDecisionCorrectness: number;
  missingCentralDirection: number;
  zeroUsableDirection: number;
  payoffOnlyPrimaries: number;
  contextClassification: number;
  multiCommandZoneUsability: number;
  abstentionQuality: Record<string, number>;
  eligibleCases: number;
  excludedCases: number;
  totalCases: number;
};

function isScorable(c: ReviewCase): boolean {
  return (
    c.contextOutcome !== "CONTEXT_REQUIRED_CORRECT" &&
    c.evaluationContextStatus !== "OPTIONAL_COMMAND_ZONE_CONTEXT"
  );
}

function computeGateMetrics(cases: ReviewCase[]): GateMetrics {
  const scorable = cases.filter(isScorable);
  const eligible = scorable.length;
  const mechAccepted = scorable.filter((r) => r.mechanicalOutcome === "ACCEPTED").length;
  const retrAccepted = scorable.filter((r) => r.retrievalOutcome === "ACCEPTED").length;
  const payoffOnly = scorable.filter(
    (r) =>
      r.primaryDirection &&
      typeof r.primaryDirection === "object" &&
      r.primaryDirection !== null &&
      "drivers" in (r.primaryDirection as object) &&
      ((r.primaryDirection as { drivers?: unknown[] }).drivers?.length ?? 0) === 0 &&
      ((r.primaryDirection as { payoffs?: unknown[] }).payoffs?.length ?? 0) > 0,
  ).length;

  const contextScorable = cases.filter((r) => /CONTEXT/.test(r.evaluationContextStatus ?? ""));
  const contextCorrect = cases.filter(
    (r) => r.contextOutcome === "CONTEXT_REQUIRED_CORRECT" || r.contextOutcome === "OPTIONAL_CONTEXT_CORRECT",
  ).length;

  const multi = scorable.filter((r) => r.commandZoneConfiguration !== "single_commander");
  const multiAccepted = multi.filter((r) => r.mechanicalOutcome === "ACCEPTED" && r.primaryDirection).length;

  const abstentionQuality = Object.fromEntries(
    (["RETRIEVAL_READY", "CORRECT_ABSTENTION", "INCORRECT_ABSTENTION", "FALSE_RETRIEVAL_READY"] as const).map((k) => [
      k,
      cases.filter((r) => r.abstentionClass === k).length,
    ]),
  );

  const retrievalReady = cases.filter((r) => r.abstentionClass === "RETRIEVAL_READY").length;
  const correctAbstention = cases.filter((r) => r.abstentionClass === "CORRECT_ABSTENTION").length;

  const denom = eligible || 1;
  return {
    totalCases: cases.length,
    eligibleCases: eligible,
    excludedCases: 0,
    mechanicalPrecision: mechAccepted / denom,
    primaryCorrectness:
      scorable.filter((r) => r.primaryDirection && r.mechanicalOutcome !== "MISSING_CENTRAL_DIRECTION").length / denom,
    causalCorrectness:
      scorable.filter((r) => !["CAUSAL_CHAIN_WRONG", "ANCHOR_KIND_WRONG"].includes(r.mechanicalOutcome ?? "")).length /
      denom,
    anchorCorrectness: scorable.filter((r) => r.mechanicalOutcome !== "ANCHOR_KIND_WRONG").length / denom,
    mechanismCorrectness: scorable.filter((r) => r.mechanicalOutcome !== "MECHANISM_TYPE_WRONG").length / denom,
    retrievalUsability: retrAccepted / denom,
    retrievalCoverage: retrievalReady / (cases.length || 1),
    retrievalDecisionCorrectness: (retrievalReady + correctAbstention) / (cases.length || 1),
    missingCentralDirection:
      scorable.filter((r) => r.mechanicalOutcome === "MISSING_CENTRAL_DIRECTION").length / denom,
    zeroUsableDirection: scorable.filter((r) => !r.primaryDirection).length / denom,
    payoffOnlyPrimaries: payoffOnly,
    contextClassification: contextScorable.length > 0 ? contextCorrect / contextScorable.length : 1,
    multiCommandZoneUsability: multi.length > 0 ? multiAccepted / multi.length : 1,
    abstentionQuality,
  };
}

function computeByConfiguration(cases: ReviewCase[]) {
  const configs = ["single_commander", "partner_pair", "commander_with_background"] as const;
  return Object.fromEntries(
    configs.map((cfg) => {
      const subset = cases.filter((c) => (c.commandZoneConfiguration ?? "single_commander") === cfg);
      return [cfg, computeGateMetrics(subset)];
    }),
  );
}

function loadReviewCases(path: string): ReviewCase[] {
  if (!existsSync(path)) return [];
  const review = JSON.parse(readFileSync(path, "utf8")) as { cases?: ReviewCase[] };
  return review.cases ?? [];
}

function countExclusionReasons(
  excluded: Array<{ caseId: string; rootCause: string; commandZoneIdentity: string }>,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of excluded) {
    counts[row.rootCause] = (counts[row.rootCause] ?? 0) + 1;
  }
  return counts;
}

async function main() {
  const outDir = resolve(process.cwd(), "data/milestones/deck-synthesis");
  mkdirSync(outDir, { recursive: true });

  const auditV11 = JSON.parse(
    readFileSync(resolve(outDir, "benchmark-commander-eligibility-audit-v1.1.json"), "utf8"),
  ) as {
    totals: Record<string, unknown>;
    setReports: Array<{
      setId: string;
      caseCount: number;
      v1Diagnostic: { validCases: number; invalidCases: number };
      v11LiveCommander: { validCases: number; invalidCases: number };
      cases: Array<{
        caseId: string;
        commandZoneIdentity: string;
        v1DiagnosticInvalid: boolean;
        v11LiveCommanderValid: boolean;
        rootCause: string;
      }>;
    }>;
  };

  const setSpecs = [
    { setId: "dev_benchmark_v1", cases: ARCHETYPE_DISCOVERY_BENCHMARK_V1, reviewPath: null },
    { setId: "blind_holdout_v1", cases: ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V1, reviewPath: null },
    {
      setId: "blind_holdout_v2",
      cases: ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V2,
      reviewPath: resolve(outDir, "archetype-discovery-blind-v2-human-mechanical-review.json"),
    },
    {
      setId: "blind_holdout_v3",
      cases: ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V3,
      reviewPath: resolve(outDir, "archetype-discovery-blind-v3-human-mechanical-review.json"),
    },
    {
      setId: "blind_holdout_v4",
      cases: ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V4,
      reviewPath: resolve(outDir, "archetype-discovery-blind-v4-human-mechanical-review.json"),
    },
  ];

  const blindV4Review = JSON.parse(
    readFileSync(resolve(outDir, "archetype-discovery-blind-v4-human-mechanical-review.json"), "utf8"),
  ) as {
    blindV4Gate: Record<string, number>;
    cases: ReviewCase[];
  };

  const setReports = auditV11.setReports.map((auditSet) => {
    const spec = setSpecs.find((s) => s.setId === auditSet.setId)!;
    const eligibleIds = new Set(auditSet.cases.filter((c) => c.v11LiveCommanderValid).map((c) => c.caseId));
    const excluded = auditSet.cases
      .filter((c) => !c.v11LiveCommanderValid)
      .map((c) => ({
        caseId: c.caseId,
        commandZoneIdentity: c.commandZoneIdentity,
        rootCause: c.rootCause,
      }));

    const reviewCases = spec.reviewPath ? loadReviewCases(spec.reviewPath) : [];
    const originalCases = reviewCases.length > 0 ? reviewCases : [];
    const correctedCases =
      reviewCases.length > 0 ? reviewCases.filter((c) => eligibleIds.has(c.caseId)) : [];

    const originalMetrics =
      reviewCases.length > 0
        ? computeGateMetrics(originalCases)
        : {
            totalCases: auditSet.caseCount,
            eligibleCases: auditSet.v1Diagnostic.validCases,
            excludedCases: auditSet.v1Diagnostic.invalidCases,
          };

    const eligibilityCorrectedMetrics =
      reviewCases.length > 0
        ? {
            ...computeGateMetrics(correctedCases),
            excludedCases: excluded.length,
          }
        : {
            totalCases: auditSet.caseCount,
            eligibleCases: auditSet.v11LiveCommander.validCases,
            excludedCases: auditSet.v11LiveCommander.invalidCases,
          };

    return {
      setId: auditSet.setId,
      totalCases: auditSet.caseCount,
      eligibleCases: auditSet.v11LiveCommander.validCases,
      excludedCases: auditSet.v11LiveCommander.invalidCases,
      exclusionReasons: countExclusionReasons(excluded),
      excludedCaseDetails: excluded,
      originalReportedMetrics: originalMetrics,
      eligibilityCorrectedMetrics,
      note:
        reviewCases.length > 0
          ? "Semantic metrics recomputed over eligibility-corrected case subset; original metrics preserved."
          : "Denominator correction only — no sealed human review artifact for per-case metric recomputation.",
    };
  });

  const blindV4Audit = auditV11.setReports.find((s) => s.setId === "blind_holdout_v4")!;
  const blindV4EligibleIds = new Set(
    blindV4Audit.cases.filter((c) => c.v11LiveCommanderValid).map((c) => c.caseId),
  );
  const blindV4Excluded = blindV4Audit.cases.filter((c) => !c.v11LiveCommanderValid);
  const blindV4CorrectedCases = blindV4Review.cases.filter((c) => blindV4EligibleIds.has(c.caseId));

  const blindV4OriginalGate = blindV4Review.blindV4Gate;
  const blindV4CorrectedGate = computeGateMetrics(blindV4CorrectedCases);
  const blindV4CorrectedByConfiguration = computeByConfiguration(blindV4CorrectedCases);

  const semanticFailures = [
    "blindv4-01-partner-pair",
    "blindv4-05-partner-pair",
    "blindv4-06-partner-pair",
    "blindv4-17-triggered-engine",
    "blindv4-18-triggered-engine",
    "blindv4-20-activated-engine",
    "blindv4-21-activated-engine",
    "blindv4-22-static-state-engine",
  ];

  const blindV4Scorecard = {
    version: "archetype-discovery-blind-v4-eligibility-corrected-scorecard-v1.1",
    generatedAt: new Date().toISOString(),
    eligibilityModel: "benchmark-commander-legality-v1.1",
    blindV4Status: "SPENT_FAIL",
    totalCases: 60,
    liveCommanderEligible: 52,
    excludedInvalidConfigurations: 8,
    excludedCaseIds: blindV4Excluded.map((c) => c.caseId),
    semanticFailureCaseIds: semanticFailures,
    note: "Corrected scorecard uses 52 LIVE_COMMANDER-valid cases. Blind-v4 remains FAIL due to 8 semantic failures.",
    originalReportedMetrics: {
      denominator: 60,
      gate: blindV4OriginalGate,
      macieOnlyCorrectedDenominator59: "SUPERSEDED — no longer authoritative",
    },
    eligibilityCorrectedMetrics: {
      denominator: 52,
      gate: blindV4CorrectedGate,
      byCommandZoneConfiguration: blindV4CorrectedByConfiguration,
    },
    retrievalMetricDefinitions: {
      retrievalCoverage: "RETRIEVAL_READY / eligibleCases — Phase-6 coverage numerator",
      retrievalDecisionCorrectness:
        "(RETRIEVAL_READY + CORRECT_ABSTENTION) / totalCases — calibration quality; correct abstention is not automatic Phase-6 coverage",
      retrievalUsability: "retrievalOutcome ACCEPTED / scorable eligible cases — legacy gate metric",
    },
    verdict: "FAIL",
  };

  const spentDevSets = setReports.filter((s) => s.setId !== "blind_holdout_v4");
  const combinedSpentDev = {
    totalCases: 168,
    originalReportedMetrics: {
      eligibleCases: 144,
      excludedCases: 24,
      source: "BENCHMARK_ELIGIBILITY_AUDIT_V1_DIAGNOSTIC",
    },
    eligibilityCorrectedMetrics: {
      eligibleCases: 145,
      excludedCases: 23,
      source: "benchmark-commander-legality-v1.1",
    },
    byConstituentSet: spentDevSets.map((s) => ({
      setId: s.setId,
      eligibleCases: s.eligibleCases,
      excludedCases: s.excludedCases,
    })),
  };

  const historicalReport = {
    version: "phase5-historical-denominators-v1.1",
    generatedAt: new Date().toISOString(),
    status: "ACCEPTED_FINAL",
    authoritativeTotals: {
      totalHistoricalCases: 228,
      liveCommanderValid: 197,
      invalidConfigurations: 31,
    },
    v1DiagnosticHistory: {
      valid: 194,
      invalid: 34,
      retainedAs: "diagnostic history only",
    },
    combinedSpentDev,
    setReports,
    authorization: {
      phase56SemanticImplementation: "WAIT",
      phase6: "WAIT",
      professor: "WAIT",
    },
  };

  const historicalPath = resolve(outDir, "phase5-historical-denominators-v1.1.json");
  const scorecardPath = resolve(outDir, "archetype-discovery-blind-v4-eligibility-corrected-scorecard-v1.1.json");
  writeFileSync(historicalPath, JSON.stringify(historicalReport, null, 2));
  writeFileSync(scorecardPath, JSON.stringify(blindV4Scorecard, null, 2));

  console.log(
    JSON.stringify(
      {
        historicalPath,
        historicalHash: createHash("sha256").update(JSON.stringify(historicalReport)).digest("hex"),
        scorecardPath,
        scorecardHash: createHash("sha256").update(JSON.stringify(blindV4Scorecard)).digest("hex"),
        blindV4CorrectedGate,
        combinedSpentDev,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
