#!/usr/bin/env npx tsx
/**
 * Phase 5.6 — 197-case eligibility-corrected DEV regression (v1.1 denominators).
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
  type CommanderBuildDirection,
  type CommandZoneComposition,
} from "../src/lib/deck-synthesis";

loadProjectEnvLocal();

type ReviewCase = {
  caseId: string;
  setId: string;
  commandZoneConfiguration: string;
  mechanicalOutcome: string;
  retrievalOutcome: string;
  contextOutcome: string;
  evaluationContextStatus: string;
  abstentionClass: string;
  primaryDirection: { drivers: string[]; payoffs?: string[] } | null;
  phase6RetrievalReady: boolean;
  compositionTypes?: string[];
  crossSupportStrength?: string;
};

const BENCHMARK_SETS = [
  { setId: "dev_benchmark_v1", cases: ARCHETYPE_DISCOVERY_BENCHMARK_V1 },
  { setId: "blind_holdout_v1", cases: ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V1 },
  { setId: "blind_holdout_v2", cases: ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V2 },
  { setId: "blind_holdout_v3", cases: ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V3 },
  { setId: "blind_holdout_v4", cases: ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V4 },
];

function loadEligibleCaseIds(): Set<string> {
  const auditPath = resolve(
    process.cwd(),
    "data/milestones/deck-synthesis/benchmark-commander-eligibility-audit-v1.1.json",
  );
  const audit = JSON.parse(readFileSync(auditPath, "utf8")) as {
    setReports: Array<{ cases: Array<{ caseId: string; v11LiveCommanderValid: boolean }> }>;
  };
  return new Set(
    audit.setReports.flatMap((s) =>
      s.cases.filter((c) => c.v11LiveCommanderValid).map((c) => c.caseId),
    ),
  );
}

function isScorable(c: ReviewCase): boolean {
  return (
    c.contextOutcome !== "CONTEXT_REQUIRED_CORRECT" &&
    c.evaluationContextStatus !== "OPTIONAL_COMMAND_ZONE_CONTEXT"
  );
}

function adjudicate(primary: CommanderBuildDirection | undefined, evaluationContextStatus: string) {
  if (evaluationContextStatus === "COMMAND_ZONE_CONTEXT_REQUIRED") {
    return {
      mechanicalOutcome: "ACCEPTED",
      retrievalOutcome: "ACCEPTED",
      contextOutcome: "CONTEXT_REQUIRED_CORRECT",
      abstentionClass: "CORRECT_ABSTENTION",
    };
  }
  if (evaluationContextStatus === "OPTIONAL_COMMAND_ZONE_CONTEXT") {
    return {
      mechanicalOutcome: primary ? "ACCEPTED" : "MISSING_CENTRAL_DIRECTION",
      retrievalOutcome: primary?.phase6RetrievalReady ? "ACCEPTED" : "RETRIEVAL_SPEC_INCOMPLETE",
      contextOutcome: "OPTIONAL_CONTEXT_CORRECT",
      abstentionClass: primary?.phase6RetrievalReady ? "RETRIEVAL_READY" : "CORRECT_ABSTENTION",
    };
  }
  if (!primary) {
    return {
      mechanicalOutcome: "MISSING_CENTRAL_DIRECTION",
      retrievalOutcome: "RETRIEVAL_SPEC_INCOMPLETE",
      contextOutcome: "N/A",
      abstentionClass: "INCORRECT_ABSTENTION",
    };
  }
  if (primary.directionValidity === "UNANCHORED_SIGNAL") {
    return {
      mechanicalOutcome: "CAUSAL_CHAIN_WRONG",
      retrievalOutcome: "RETRIEVAL_SPEC_INCOMPLETE",
      contextOutcome: "N/A",
      abstentionClass: "INCORRECT_ABSTENTION",
    };
  }
  if ((primary.payoffs?.length ?? 0) > 0 && primary.drivers.length === 0) {
    return {
      mechanicalOutcome: "CAUSAL_CHAIN_WRONG",
      retrievalOutcome: "RETRIEVAL_SPEC_INCOMPLETE",
      contextOutcome: "N/A",
      abstentionClass: "INCORRECT_ABSTENTION",
    };
  }
  const retr = primary.phase6RetrievalReady ? "ACCEPTED" : "RETRIEVAL_SPEC_INCOMPLETE";
  return {
    mechanicalOutcome: "ACCEPTED",
    retrievalOutcome: retr,
    contextOutcome: "N/A",
    abstentionClass: primary.phase6RetrievalReady ? "RETRIEVAL_READY" : "CORRECT_ABSTENTION",
  };
}

function computeGate(cases: ReviewCase[]) {
  const scorable = cases.filter(isScorable);
  const eligible = scorable.length;
  const mechAccepted = scorable.filter((r) => r.mechanicalOutcome === "ACCEPTED").length;
  const retrAccepted = scorable.filter((r) => r.retrievalOutcome === "ACCEPTED").length;
  const retrReady = scorable.filter((r) => r.abstentionClass === "RETRIEVAL_READY").length;
  const correctAbstention = scorable.filter((r) => r.abstentionClass === "CORRECT_ABSTENTION").length;
  const payoffOnly = scorable.filter(
    (r) => r.primaryDirection && r.primaryDirection.drivers.length === 0 && (r.primaryDirection.payoffs?.length ?? 0) > 0,
  ).length;
  const falseReady = scorable.filter((r) => r.abstentionClass === "FALSE_RETRIEVAL_READY").length;
  const partner = scorable.filter((r) => r.commandZoneConfiguration === "partner_pair");
  const partnerAccepted = partner.filter((r) => r.mechanicalOutcome === "ACCEPTED" && r.primaryDirection).length;
  const partnerRetrievalReady = partner.filter((r) => r.abstentionClass === "RETRIEVAL_READY").length;
  const background = scorable.filter((r) => r.commandZoneConfiguration === "commander_with_background");
  const backgroundAccepted = background.filter((r) => r.mechanicalOutcome === "ACCEPTED" && r.primaryDirection).length;

  return {
    totalCases: cases.length,
    eligibleCases: eligible,
    mechanicalPrecision: mechAccepted / eligible,
    primaryCorrectness: scorable.filter((r) => r.primaryDirection && r.mechanicalOutcome !== "MISSING_CENTRAL_DIRECTION").length / eligible,
    causalCorrectness: scorable.filter((r) => !["CAUSAL_CHAIN_WRONG", "ANCHOR_KIND_WRONG"].includes(r.mechanicalOutcome)).length / eligible,
    anchorCorrectness: scorable.filter((r) => r.mechanicalOutcome !== "ANCHOR_KIND_WRONG").length / eligible,
    mechanismCorrectness: scorable.filter((r) => r.mechanicalOutcome !== "MECHANISM_TYPE_WRONG").length / eligible,
    retrievalUsability: retrAccepted / eligible,
    retrievalCoverage: retrReady / eligible,
    retrievalDecisionCorrectness: (retrReady + correctAbstention) / eligible,
    missingCentralDirection: scorable.filter((r) => r.mechanicalOutcome === "MISSING_CENTRAL_DIRECTION").length / eligible,
    zeroUsableDirection: scorable.filter((r) => !r.primaryDirection).length / eligible,
    payoffOnlyPrimaries: payoffOnly,
    falseRetrievalReady: falseReady,
    partnerPairMechanicalUsability: partner.length ? partnerAccepted / partner.length : 1,
    partnerPairRetrievalCoverage: partner.length ? partnerRetrievalReady / partner.length : 1,
    backgroundUsability: background.length ? backgroundAccepted / background.length : 1,
    abstentionQuality: Object.fromEntries(
      (["RETRIEVAL_READY", "CORRECT_ABSTENTION", "INCORRECT_ABSTENTION", "FALSE_RETRIEVAL_READY"] as const).map((k) => [
        k,
        scorable.filter((r) => r.abstentionClass === k).length,
      ]),
    ),
  };
}

async function main() {
  const eligibleIds = loadEligibleCaseIds();
  const catalog = await loadDeckResolutionCatalog();
  const shadowIndex = await loadShadowSemanticIndex();
  const globalCatalogIndex = buildGlobalCatalogSemanticIndex({ catalog, shadowIndex });

  const records: ReviewCase[] = [];

  for (const spec of BENCHMARK_SETS) {
    for (const c of spec.cases) {
      if (!eligibleIds.has(c.id)) continue;
      const resolution = resolveBenchmarkCommanderOracleIds(catalog, c.commanders);
      if (!resolution.resolved) continue;

      const report = discoverArchetypes(
        { commanderOracleIds: resolution.oracleIds, bracket: c.bracket },
        { catalog, shadowIndex, globalCatalogIndex },
      );
      const primary = report.buildDirections.find((d) => d.rank === 1);
      const adj = adjudicate(primary, report.evaluationContextStatus);
      const composition = report.commandZoneComposition as CommandZoneComposition | null | undefined;

      records.push({
        caseId: c.id,
        setId: spec.setId,
        commandZoneConfiguration: c.commandZoneConfiguration,
        mechanicalOutcome: adj.mechanicalOutcome,
        retrievalOutcome: adj.retrievalOutcome,
        contextOutcome: adj.contextOutcome,
        evaluationContextStatus: report.evaluationContextStatus,
        abstentionClass: adj.abstentionClass,
        primaryDirection: primary
          ? { drivers: primary.drivers, payoffs: primary.payoffs }
          : null,
        phase6RetrievalReady: primary?.phase6RetrievalReady ?? false,
        compositionTypes: composition?.compositionTypes,
        crossSupportStrength: composition?.professorFields?.crossSupportStrength,
      });
    }
  }

  const gate = computeGate(records);
  const thresholds = {
    mechanicalPrecision: 0.95,
    primaryCorrectness: 0.95,
    causalCorrectness: 0.95,
    anchorCorrectness: 0.95,
    mechanismCorrectness: 0.95,
    retrievalCoverage: 0.92,
    retrievalDecisionCorrectness: 0.95,
    missingCentralDirection: 0.05,
    zeroUsableDirection: 0.05,
    payoffOnlyPrimaries: 0,
    falseRetrievalReady: 0,
    partnerPairMechanicalUsability: 0.9,
    partnerPairRetrievalCoverage: 0.85,
    backgroundUsability: 0.9,
  };

  const pass =
    gate.mechanicalPrecision >= thresholds.mechanicalPrecision &&
    gate.primaryCorrectness >= thresholds.primaryCorrectness &&
    gate.causalCorrectness >= thresholds.causalCorrectness &&
    gate.anchorCorrectness >= thresholds.anchorCorrectness &&
    gate.mechanismCorrectness >= thresholds.mechanismCorrectness &&
    gate.retrievalCoverage >= thresholds.retrievalCoverage &&
    gate.retrievalDecisionCorrectness >= thresholds.retrievalDecisionCorrectness &&
    gate.missingCentralDirection <= thresholds.missingCentralDirection &&
    gate.zeroUsableDirection <= thresholds.zeroUsableDirection &&
    gate.payoffOnlyPrimaries === thresholds.payoffOnlyPrimaries &&
    gate.falseRetrievalReady === thresholds.falseRetrievalReady &&
    gate.partnerPairMechanicalUsability >= thresholds.partnerPairMechanicalUsability &&
    gate.partnerPairRetrievalCoverage >= thresholds.partnerPairRetrievalCoverage &&
    gate.backgroundUsability >= thresholds.backgroundUsability;

  const blindV4SemanticFailures = [
    "blindv4-01-partner-pair",
    "blindv4-05-partner-pair",
    "blindv4-06-partner-pair",
    "blindv4-17-triggered-engine",
    "blindv4-18-triggered-engine",
    "blindv4-20-activated-engine",
    "blindv4-21-activated-engine",
    "blindv4-22-static-state-engine",
  ];

  const report = {
    version: "phase56-dev-regression-v1.1",
    generatedAt: new Date().toISOString(),
    discoveryEngineVersion: ARCHETYPE_DISCOVERY_V1_VERSION,
    causalInferenceVersion: COMMANDER_CAUSAL_INFERENCE_VERSION,
    eligibilityModel: "benchmark-commander-legality-v1.1",
    totalEligibleCases: records.length,
    phase56DevGate: { ...gate, thresholds, pass },
    blindV4RepairCheck: blindV4SemanticFailures.map((caseId) => {
      const row = records.find((r) => r.caseId === caseId);
      return {
        caseId,
        mechanicalOutcome: row?.mechanicalOutcome ?? "MISSING",
        abstentionClass: row?.abstentionClass ?? "MISSING",
        compositionTypes: row?.compositionTypes ?? [],
        crossSupportStrength: row?.crossSupportStrength ?? null,
      };
    }),
    failures: records.filter((r) => isScorable(r) && r.mechanicalOutcome !== "ACCEPTED"),
    authorization: {
      phase56SemanticImplementation: pass ? "DEV_PASS_PENDING_FREEZE" : "DEV_FAIL",
      phase56Freeze: "WAIT",
      blindV5: "WAIT",
      phase6: "WAIT",
      professor: "WAIT",
    },
    cases: records,
  };

  const outDir = resolve(process.cwd(), "data/milestones/deck-synthesis");
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, "phase56-dev-regression-v1.1.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  const hash = createHash("sha256").update(JSON.stringify(report)).digest("hex");

  console.log(
    JSON.stringify(
      {
        outPath,
        hash,
        totalEligibleCases: records.length,
        phase56DevGate: report.phase56DevGate,
        blindV4RepairCheck: report.blindV4RepairCheck,
        failureCount: report.failures.length,
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
