#!/usr/bin/env npx tsx
/**
 * Benchmark Eligibility Audit v1.1 — structural/format legality split with provenance.
 * Re-adjudicates all v1 diagnostic invalid cases. No semantic discovery changes.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadProjectEnvLocal } from "./lib/script-env";
import { loadDeckResolutionCatalog } from "./lib/load-deck-resolution-catalog";
import { ARCHETYPE_DISCOVERY_BENCHMARK_V1 } from "../src/lib/deck-synthesis/archetype-discovery-benchmark-v1";
import { ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V1 } from "../src/lib/deck-synthesis/archetype-discovery-blind-holdout-v1";
import { ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V2 } from "../src/lib/deck-synthesis/archetype-discovery-blind-holdout-v2";
import { ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V3 } from "../src/lib/deck-synthesis/archetype-discovery-blind-holdout-v3";
import { ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V4 } from "../src/lib/deck-synthesis/archetype-discovery-blind-holdout-v4";
import {
  auditBenchmarkCaseLegalityV11,
  BENCHMARK_COMMANDER_LEGALITY_VERSION,
  scanStalePrereleaseLegalityCohort,
  SET_PRERELEASE_CALENDAR,
  type BenchmarkCaseLegalityAuditV11,
  type BenchmarkEligibilityRootCause,
} from "../src/lib/deck-synthesis/benchmark-commander-legality-v1.1";

loadProjectEnvLocal();

type BenchmarkSetSpec = {
  setId: string;
  status: string;
  sealedAt?: string;
  cases: Array<{ id: string; commanders: string[]; commandZoneConfiguration?: string }>;
};

const SEAL_MANIFESTS: Record<string, string> = {
  blind_holdout_v2: "archetype-discovery-blind-v2-seal-manifest.json",
  blind_holdout_v3: "archetype-discovery-blind-v3-seal-manifest.json",
  blind_holdout_v4: "archetype-discovery-blind-v4-seal-manifest.json",
};

const BENCHMARK_SETS: BenchmarkSetSpec[] = [
  { setId: "dev_benchmark_v1", status: "DEVELOPMENT_SPENT", cases: ARCHETYPE_DISCOVERY_BENCHMARK_V1 },
  { setId: "blind_holdout_v1", status: "DEVELOPMENT_DIAGNOSTIC_SPENT", cases: ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V1 },
  { setId: "blind_holdout_v2", status: "DEVELOPMENT_DIAGNOSTIC_SPENT", cases: ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V2 },
  { setId: "blind_holdout_v3", status: "DEVELOPMENT_DIAGNOSTIC_SPENT", cases: ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V3 },
  { setId: "blind_holdout_v4", status: "SPENT_FAIL", cases: ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V4 },
];

const V1_DIAGNOSTIC_PATH = resolve(
  process.cwd(),
  "data/milestones/deck-synthesis/benchmark-commander-eligibility-audit-v1.json",
);

const HUMAN_BLIND_V4_SEMANTIC_FAILURES = [
  "blindv4-01-partner-pair",
  "blindv4-05-partner-pair",
  "blindv4-06-partner-pair",
  "blindv4-17-triggered-engine",
  "blindv4-18-triggered-engine",
  "blindv4-20-activated-engine",
  "blindv4-21-activated-engine",
  "blindv4-22-static-state-engine",
];

function loadSealTimestamp(setId: string): string | null {
  const manifestName = SEAL_MANIFESTS[setId];
  if (!manifestName) return null;
  const path = resolve(process.cwd(), "data/milestones/deck-synthesis", manifestName);
  if (!existsSync(path)) return null;
  const manifest = JSON.parse(readFileSync(path, "utf8")) as { sealedAt?: string };
  return manifest.sealedAt ?? null;
}

function summarizeCase(audit: BenchmarkCaseLegalityAuditV11) {
  return {
    caseId: audit.caseId,
    set: audit.set,
    commandZoneIdentity: audit.commandZoneIdentity,
    commandZoneConfiguration: audit.commandZoneConfiguration,
    paperEligible: audit.paperEligible,
    structuralCommandZoneEligibility: audit.structuralCommandZoneEligibility,
    currentCommanderFormatLegality: audit.currentCommanderFormatLegality,
    legalityAsOf: audit.legalityAsOf,
    legalityReason: audit.legalityReason,
    canBeSoleCommander: audit.canBeSoleCommander,
    canBePartOfCommandZone: audit.canBePartOfCommandZone,
    configurationLegal: audit.configurationLegal,
    configurationFailureReason: audit.configurationFailureReason,
    rootCause: audit.rootCause,
    v1DiagnosticInvalid: audit.v1DiagnosticInvalid,
    v11LiveCommanderValid: audit.v11LiveCommanderValid,
    v11PreviewTheorycraftValid: audit.v11PreviewTheorycraftValid,
    discoveryDenominatorEligibleLive: audit.discoveryDenominatorEligibleLive,
    provenance: audit.provenance,
    members: audit.members.map((m) => ({
      name: m.benchmarkInputName,
      role: m.role,
      oracleId: m.oracleId,
      paperEligible: m.paperEligible,
      structuralCommandZoneEligibility: m.legality?.structuralCommandZoneEligibility,
      structurallyCanBeCommander: m.legality?.structurallyCanBeCommander,
      currentCommanderFormatLegality: m.legality?.currentCommanderFormatLegality,
      staleLegalityMetadata: m.legality?.staleLegalityMetadata,
      liveCommanderLegal: m.legality?.liveCommanderLegal,
      legalityReason: m.legality?.legalityReason,
      legalitySource: m.legality?.legalitySource,
      legalityEffectiveDate: m.legality?.legalityEffectiveDate,
    })),
  };
}

function countRootCauses(cases: BenchmarkCaseLegalityAuditV11[]): Record<BenchmarkEligibilityRootCause, number> {
  const counts = {} as Record<BenchmarkEligibilityRootCause, number>;
  for (const c of cases) {
    counts[c.rootCause] = (counts[c.rootCause] ?? 0) + 1;
  }
  return counts;
}

async function main() {
  const catalog = await loadDeckResolutionCatalog();
  const outDir = resolve(process.cwd(), "data/milestones/deck-synthesis");
  mkdirSync(outDir, { recursive: true });

  const v1Diagnostic = existsSync(V1_DIAGNOSTIC_PATH)
    ? (JSON.parse(readFileSync(V1_DIAGNOSTIC_PATH, "utf8")) as {
        version: string;
        totals: { totalCases: number; validCases: number; invalidCases: number };
      })
    : null;

  const evaluationAt = new Date().toISOString();

  const setReports = BENCHMARK_SETS.map((spec) => {
    const sealedAt = loadSealTimestamp(spec.setId);
    const legalityAsOf = sealedAt ?? evaluationAt;
    const caseAudits = spec.cases.map((c) =>
      auditBenchmarkCaseLegalityV11({
        catalog,
        caseId: c.id,
        set: spec.setId,
        commanders: c.commanders,
        commandZoneConfiguration: c.commandZoneConfiguration,
        benchmarkMode: "LIVE_COMMANDER",
        legalityAsOf,
        benchmarkSelectionAt: sealedAt,
        benchmarkEvaluationAt: evaluationAt,
      }),
    );

    const v1Invalid = caseAudits.filter((a) => a.v1DiagnosticInvalid);
    const v11LiveValid = caseAudits.filter((a) => a.v11LiveCommanderValid);

    return {
      setId: spec.setId,
      status: spec.status,
      sealedAt,
      legalityAsOf,
      caseCount: spec.cases.length,
      v1Diagnostic: {
        validCases: caseAudits.length - v1Invalid.length,
        invalidCases: v1Invalid.length,
      },
      v11LiveCommander: {
        validCases: v11LiveValid.length,
        invalidCases: caseAudits.length - v11LiveValid.length,
      },
      rootCauseCountsInvalidV1: countRootCauses(v1Invalid),
      cases: caseAudits.map(summarizeCase),
    };
  });

  const allCases = setReports.flatMap((s) => s.cases);
  const v1InvalidAll = allCases.filter((c) => c.v1DiagnosticInvalid);
  const v11ReclassifiedToValid = v1InvalidAll.filter((c) => c.v11LiveCommanderValid);
  const v11StillInvalid = v1InvalidAll.filter((c) => !c.v11LiveCommanderValid);

  const rootCauseReconciliation = countRootCauses(
    v1InvalidAll.map((c) => ({
      ...c,
      rootCause: c.rootCause,
    })) as BenchmarkCaseLegalityAuditV11[],
  );

  const filiAudit = allCases.find((c) => c.caseId === "blindv4-22-static-state-engine");
  const hobStaleCohort = scanStalePrereleaseLegalityCohort({
    catalog,
    setCode: "hob",
    legalityAsOf: evaluationAt,
  });
  const hobCommanderEligibleStale = hobStaleCohort.filter(
    (c) => c.structuralCommandZoneEligibility === "ELIGIBLE" && c.staleLegalityMetadata,
  );

  const report = {
    version: "BENCHMARK_ELIGIBILITY_AUDIT_V1_1",
    module: BENCHMARK_COMMANDER_LEGALITY_VERSION,
    generatedAt: evaluationAt,
    supersedes: "BENCHMARK_ELIGIBILITY_AUDIT_V1_DIAGNOSTIC",
    purpose:
      "Re-adjudicate benchmark command-zone eligibility with structural/format legality split, time-aware provenance, and mutually exclusive root-cause taxonomy.",
    v1DiagnosticReference: v1Diagnostic
      ? {
          label: "BENCHMARK_ELIGIBILITY_AUDIT_V1_DIAGNOSTIC",
          totals: v1Diagnostic.totals,
          note: "v1 totals are diagnostic only — not frozen as final denominators.",
        }
      : null,
    legalityPolicy: {
      structuralVsFormatSplit: true,
      benchmarkModes: ["LIVE_COMMANDER", "PREVIEW_THEORYCRAFT", "SEMANTIC_ONLY_QA"],
      defaultBenchmarkMode: "LIVE_COMMANDER",
      legalityAsOfPolicy:
        "Use benchmark seal timestamp when available; otherwise evaluation timestamp. legalityAsOf must be explicit for reproducibility.",
      sourcePrecedence: [
        "wizards_banned_policy",
        "wizards_prerelease_policy",
        "set_release_timing",
        "non_competitive_frame_supplement",
        "paper_population_frame",
        "scryfall_golden_catalog_legalities",
        "structural_oracle_classification",
      ],
      setPrereleaseCalendar: SET_PRERELEASE_CALENDAR,
    },
    totals: {
      setsAudited: setReports.length,
      totalCases: allCases.length,
      v1Diagnostic: {
        validCases: allCases.length - v1InvalidAll.length,
        invalidCases: v1InvalidAll.length,
      },
      v11LiveCommander: {
        validCases: allCases.filter((c) => c.v11LiveCommanderValid).length,
        invalidCases: allCases.filter((c) => !c.v11LiveCommanderValid).length,
      },
      v1InvalidReclassifiedValidLive: v11ReclassifiedToValid.length,
      v1InvalidStillInvalidLive: v11StillInvalid.length,
    },
    rootCauseReconciliationV1Invalid: rootCauseReconciliation,
    setReports,
    v1InvalidCasesAdjudicated: v1InvalidAll,
    v11ReclassifiedFromV1Invalid: v11ReclassifiedToValid,
    v11StillInvalidFromV1Invalid: v11StillInvalid,
    filiInvestigation: {
      caseId: "blindv4-22-static-state-engine",
      card: "Fíli the Pathfinder",
      v1RootCause: "COMMANDER_FORMAT_NOT_LEGAL (not_legal bucket)",
      v11RootCause: filiAudit?.rootCause ?? null,
      v11LiveCommanderValid: filiAudit?.v11LiveCommanderValid ?? null,
      diagnosis:
        "Golden Catalog Scryfall legalities report commander=not_legal while Wizards prerelease policy makes HOB paper cards legal since 2026-08-07. Main set release in catalog is 2026-08-14. This is stale Scryfall/Golden Catalog format metadata, not a structural or non-Constructed exclusion.",
      legalitySourceIssue: "stale_scryfall_legalities_vs_prerelease_policy",
      catalogFields: filiAudit?.members[0] ?? null,
      hobStaleCohortCount: hobCommanderEligibleStale.length,
      hobStaleCohortSample: hobCommanderEligibleStale.slice(0, 20),
    },
    blindV4SemanticFailuresPreserved: {
      note: "Legality reclassification does not repair blind-v4 semantic failures. Fíli remains a semantic failure pending final eligibility adjudication.",
      semanticFailures: HUMAN_BLIND_V4_SEMANTIC_FAILURES,
      filiStatus: "PENDING_ELIGIBILITY_ADJUDICATION — v1.1 reclassifies as STALE_LEGALITY_METADATA / live-valid",
    },
    historicalDenominatorSummary: {
      v1Diagnostic: v1Diagnostic?.totals ?? null,
      v11LiveCommander: {
        totalCases: allCases.length,
        validCases: allCases.filter((c) => c.v11LiveCommanderValid).length,
        invalidCases: allCases.filter((c) => !c.v11LiveCommanderValid).length,
        bySet: setReports.map((s) => ({
          setId: s.setId,
          caseCount: s.caseCount,
          validCases: s.v11LiveCommander.validCases,
          invalidCases: s.v11LiveCommander.invalidCases,
        })),
      },
      note: "Denominator recalculation authorized only after v1.1 acceptance. Phase 5.6 remains WAIT.",
    },
    authorization: {
      v1Diagnostic: "ACCEPTED AS DIAGNOSTIC — NOT FINAL",
      v11Audit: "ACCEPTED_FINAL",
      historicalDenominatorRecalculation: "AUTHORIZED / FROZEN",
      catalogLegalitySnapshotPipeline: "AUTHORIZED / IMPLEMENTED",
      phase56ForensicDesign: "AUTHORIZED / DESIGN_ONLY",
      phase56SemanticRepair: "WAIT",
      phase6: "WAIT",
      professor: "WAIT",
    },
  };

  const outPath = resolve(outDir, "benchmark-commander-eligibility-audit-v1.1.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  const hash = createHash("sha256").update(JSON.stringify(report)).digest("hex");

  console.log(
    JSON.stringify(
      {
        outPath,
        hash,
        totals: report.totals,
        rootCauseReconciliationV1Invalid: report.rootCauseReconciliationV1Invalid,
        v11ReclassifiedFromV1Invalid: v11ReclassifiedToValid.map((c) => ({
          caseId: c.caseId,
          rootCause: c.rootCause,
        })),
        filiInvestigation: report.filiInvestigation,
        authorization: report.authorization,
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
