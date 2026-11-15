#!/usr/bin/env npx tsx
/**
 * Phase 5 benchmark command-zone eligibility audit.
 * Data-quality audit only — no semantic discovery changes.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadProjectEnvLocal } from "./lib/script-env";
import { loadDeckResolutionCatalog } from "./lib/load-deck-resolution-catalog";
import { ARCHETYPE_DISCOVERY_BENCHMARK_V1 } from "../src/lib/deck-synthesis/archetype-discovery-benchmark-v1";
import { ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V1 } from "../src/lib/deck-synthesis/archetype-discovery-blind-holdout-v1";
import { ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V2 } from "../src/lib/deck-synthesis/archetype-discovery-blind-holdout-v2";
import { ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V3 } from "../src/lib/deck-synthesis/archetype-discovery-blind-holdout-v3";
import { ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V4 } from "../src/lib/deck-synthesis/archetype-discovery-blind-holdout-v4";
import {
  auditBenchmarkCaseEligibility,
  benchmarkCommanderEligibilityPreflight,
} from "../src/lib/deck-synthesis/benchmark-commander-eligibility-v1";

loadProjectEnvLocal();

type BenchmarkSetSpec = {
  setId: string;
  status: string;
  cases: Array<{ id: string; commanders: string[]; commandZoneConfiguration?: string }>;
};

const BENCHMARK_SETS: BenchmarkSetSpec[] = [
  { setId: "dev_benchmark_v1", status: "DEVELOPMENT_SPENT", cases: ARCHETYPE_DISCOVERY_BENCHMARK_V1 },
  { setId: "blind_holdout_v1", status: "DEVELOPMENT_DIAGNOSTIC_SPENT", cases: ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V1 },
  { setId: "blind_holdout_v2", status: "DEVELOPMENT_DIAGNOSTIC_SPENT", cases: ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V2 },
  {
    setId: "blind_holdout_v3",
    status: "DEVELOPMENT_DIAGNOSTIC_SPENT",
    cases: ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V3,
  },
  { setId: "blind_holdout_v4", status: "SPENT_FAIL", cases: ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V4 },
];

const HUMAN_BLIND_V4_ADJUDICATION: Record<
  string,
  "INCORRECT_ABSTENTION" | "INVALID_BENCHMARK_CONFIGURATION" | "ACCEPTED"
> = {
  "blindv4-01-partner-pair": "INCORRECT_ABSTENTION",
  "blindv4-05-partner-pair": "INCORRECT_ABSTENTION",
  "blindv4-06-partner-pair": "INCORRECT_ABSTENTION",
  "blindv4-17-triggered-engine": "INCORRECT_ABSTENTION",
  "blindv4-18-triggered-engine": "INCORRECT_ABSTENTION",
  "blindv4-19-activated-engine": "INVALID_BENCHMARK_CONFIGURATION",
  "blindv4-20-activated-engine": "INCORRECT_ABSTENTION",
  "blindv4-21-activated-engine": "INCORRECT_ABSTENTION",
  "blindv4-22-static-state-engine": "INCORRECT_ABSTENTION",
};

function summarizeCase(audit: ReturnType<typeof auditBenchmarkCaseEligibility>) {
  const primary = audit.members[0];
  return {
    caseId: audit.caseId,
    set: audit.set,
    commandZoneIdentity: audit.commandZoneIdentity,
    commandZoneConfiguration: audit.commandZoneConfiguration,
    benchmarkIntegrityLabel: audit.benchmarkIntegrityLabel,
    commanderLegal: audit.members.every((m) => m.commanderFormatLegal),
    canOccupyCommandZone: audit.members.every(
      (m) => m.canOccupyCommandZone || m.canBeSoleCommander || m.canBePartOfCommandZone,
    ),
    paperEligible: audit.members.every((m) => m.paperEligible),
    configurationLegal: audit.configurationLegal,
    discoveryDenominatorEligible: audit.discoveryDenominatorEligible,
    invalidReason: audit.invalidReason,
    reasonIfInvalid: audit.benchmarkValid ? null : audit.detail,
    members: audit.members.map((m) => ({
      name: m.benchmarkInputName,
      role: m.role,
      oracleId: m.oracleId,
      paperEligible: m.paperEligible,
      commanderFormatLegal: m.commanderFormatLegal,
      commanderFormatStatus: m.commanderFormatStatus,
      canOccupyCommandZone: m.canOccupyCommandZone,
      canBeSoleCommander: m.canBeSoleCommander,
      canBePartOfCommandZone: m.canBePartOfCommandZone,
      eligible: m.eligible,
      invalidReason: m.invalidReason,
      detail: m.detail,
    })),
  };
}

function recalculateBlindV4Metrics(input: {
  reviewPath: string;
  invalidCaseIds: Set<string>;
}) {
  const review = JSON.parse(readFileSync(input.reviewPath, "utf8")) as {
    cases: Array<{
      caseId: string;
      mechanicalOutcome: string;
      retrievalOutcome: string;
      primaryDirection: unknown;
      commandZoneConfiguration: string;
      contextOutcome?: string;
      evaluationContextStatus?: string;
      abstentionClass: string;
    }>;
    blindV4Gate: Record<string, number>;
  };

  const scorable = review.cases.filter(
    (r) =>
      input.invalidCaseIds.has(r.caseId) === false &&
      r.evaluationContextStatus !== "OPTIONAL_COMMAND_ZONE_CONTEXT" &&
      r.contextOutcome !== "CONTEXT_REQUIRED_CORRECT",
  );

  const mechAccepted = scorable.filter((r) => r.mechanicalOutcome === "ACCEPTED").length;
  const retrAccepted = scorable.filter((r) => r.retrievalOutcome === "ACCEPTED").length;
  const multi = scorable.filter((r) => r.commandZoneConfiguration !== "single_commander");
  const multiAccepted = multi.filter((r) => r.mechanicalOutcome === "ACCEPTED" && r.primaryDirection).length;

  return {
    originalCaseCount: review.cases.length,
    excludedInvalidBenchmarkCases: [...input.invalidCaseIds],
    scorableAfterExclusion: scorable.length,
    mechanicalPrecision: mechAccepted / scorable.length,
    primaryCorrectness:
      scorable.filter((r) => r.primaryDirection && r.mechanicalOutcome !== "MISSING_CENTRAL_DIRECTION").length /
      scorable.length,
    retrievalUsability: retrAccepted / scorable.length,
    missingCentralDirection:
      scorable.filter((r) => r.mechanicalOutcome === "MISSING_CENTRAL_DIRECTION").length / scorable.length,
    zeroUsableDirection: scorable.filter((r) => !r.primaryDirection).length / scorable.length,
    multiCommandZoneUsability: multi.length > 0 ? multiAccepted / multi.length : 1,
    abstentionQuality: Object.fromEntries(
      (["RETRIEVAL_READY", "CORRECT_ABSTENTION", "INCORRECT_ABSTENTION", "FALSE_RETRIEVAL_READY"] as const).map((k) => [
        k,
        review.cases
          .filter((r) => !input.invalidCaseIds.has(r.caseId))
          .filter((r) => r.abstentionClass === k).length,
      ]),
    ),
    originalGate: review.blindV4Gate,
    note: "Metrics recalculated after excluding INVALID_BENCHMARK_CONFIGURATION cases only. Semantic failures unchanged.",
  };
}

async function main() {
  const catalog = await loadDeckResolutionCatalog();
  const outDir = resolve(process.cwd(), "data/milestones/deck-synthesis");
  mkdirSync(outDir, { recursive: true });

  const setReports = BENCHMARK_SETS.map((spec) => {
    const preflight = benchmarkCommanderEligibilityPreflight({
      catalog,
      set: spec.setId,
      cases: spec.cases,
    });
    return {
      setId: spec.setId,
      status: spec.status,
      caseCount: spec.cases.length,
      validCases: preflight.validCases,
      invalidCases: preflight.invalidCases,
      pass: preflight.pass,
      invalidCaseIds: preflight.invalidCaseIds,
      cases: preflight.caseAudits.map(summarizeCase),
    };
  });

  const allInvalid = setReports.flatMap((s) =>
    s.cases.filter((c) => c.benchmarkIntegrityLabel === "INVALID_BENCHMARK_CONFIGURATION"),
  );

  const blindV4InvalidIds = new Set(
    setReports.find((s) => s.setId === "blind_holdout_v4")?.invalidCaseIds ?? [],
  );

  const blindV4ReviewPath = resolve(outDir, "archetype-discovery-blind-v4-human-mechanical-review.json");
  const blindV4MetricsCorrected = recalculateBlindV4Metrics({
    reviewPath: blindV4ReviewPath,
    invalidCaseIds: blindV4InvalidIds,
  });

  const blindV4MetricsHumanInvalidOnly = recalculateBlindV4Metrics({
    reviewPath: blindV4ReviewPath,
    invalidCaseIds: new Set(["blindv4-19-activated-engine"]),
  });

  const historicalDenominatorSummary = {
    originalStrategyCases: 228,
    validBenchmarkConfigurations: setReports.reduce((n, s) => n + s.validCases, 0),
    invalidBenchmarkConfigurations: allInvalid.length,
    spentDev168: {
      original: 168,
      validAfterEligibilityAudit: setReports
        .filter((s) => s.setId !== "blind_holdout_v4")
        .reduce((n, s) => n + s.validCases, 0),
      excludedInvalid: setReports
        .filter((s) => s.setId !== "blind_holdout_v4")
        .reduce((n, s) => n + s.invalidCases, 0),
    },
    blindV4: {
      original: 60,
      automatedInvalid: blindV4InvalidIds.size,
      humanAdjudicatedInvalidOnly: ["blindv4-19-activated-engine"],
      semanticFailuresHumanAdjudicated: Object.entries(HUMAN_BLIND_V4_ADJUDICATION)
        .filter(([, v]) => v === "INCORRECT_ABSTENTION")
        .map(([caseId]) => caseId),
    },
    note: "Historical discovery accuracy denominators should exclude INVALID_BENCHMARK_CONFIGURATION only. Semantic failures remain in denominator until repaired.",
  };

  const report = {
    version: "BENCHMARK_ELIGIBILITY_AUDIT_V1_DIAGNOSTIC",
    generatedAt: new Date().toISOString(),
    purpose: "Phase 5 benchmark data-quality audit — not semantic tuning",
    eligibilityLogic: {
      module: "benchmark-commander-eligibility-v1",
      checks: [
        "resolved Oracle identity",
        "paper eligibility",
        "Commander format legality",
        "canOccupyCommandZone / role-appropriate command-zone occupancy",
        "partner/background relationship validity",
        "combined configuration legality",
      ],
      invalidLabel: "INVALID_BENCHMARK_CONFIGURATION",
      denominatorPolicy:
        "INVALID_BENCHMARK_CONFIGURATION cases excluded from Commander-discovery accuracy denominators; preserved for parser QA if useful.",
    },
    totals: {
      setsAudited: setReports.length,
      totalCases: setReports.reduce((n, s) => n + s.caseCount, 0),
      validCases: setReports.reduce((n, s) => n + s.validCases, 0),
      invalidCases: allInvalid.length,
    },
    setReports,
    invalidCasesAllSets: allInvalid,
    blindV4HumanAdjudication: {
      status: "HUMAN_ADJUDICATED / SPENT / FAIL",
      semanticFailures: Object.entries(HUMAN_BLIND_V4_ADJUDICATION)
        .filter(([, v]) => v === "INCORRECT_ABSTENTION")
        .map(([caseId]) => caseId),
      invalidBenchmarkConfiguration: Object.entries(HUMAN_BLIND_V4_ADJUDICATION)
        .filter(([, v]) => v === "INVALID_BENCHMARK_CONFIGURATION")
        .map(([caseId]) => caseId),
      note: "Blind-v4 remains SPENT/FAIL even after removing invalid benchmark configuration.",
    },
    blindV4MetricsAfterInvalidExclusion: blindV4MetricsCorrected,
    blindV4MetricsAfterHumanMacieExclusionOnly: blindV4MetricsHumanInvalidOnly,
    historicalDenominatorSummary,
    authorization: {
      phase56Forensic: "WAIT until eligibility audit accepted",
      phase56SemanticRepair: "WAIT",
      phase6: "WAIT",
      professor: "WAIT",
    },
  };

  const outPath = resolve(outDir, "benchmark-commander-eligibility-audit-v1.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  const hash = createHash("sha256").update(JSON.stringify(report)).digest("hex");

  console.log(
    JSON.stringify(
      {
        outPath,
        hash,
        totals: report.totals,
        invalidCasesAllSets: allInvalid.map((c) => ({
          caseId: c.caseId,
          set: c.set,
          commandZoneIdentity: c.commandZoneIdentity,
          reasonIfInvalid: c.reasonIfInvalid,
        })),
        blindV4MetricsAfterInvalidExclusion: blindV4MetricsCorrected,
        blindV4MetricsAfterHumanMacieExclusionOnly: blindV4MetricsHumanInvalidOnly,
        historicalDenominatorSummary,
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
