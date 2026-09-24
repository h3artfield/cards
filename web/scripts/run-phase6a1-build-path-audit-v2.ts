#!/usr/bin/env npx tsx
/**
 * Phase 6A.1 — BuildPath audit v2 (semantic derivation + overlap matrix).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { getCalibrationCaseIds } from "./lib/phase6a-calibration-v2-gold";
import {
  auditCasePathsV2,
  BUILD_PATH_AUDIT_V2_VERSION,
} from "./lib/phase6a1-build-path-audit-v2";
import { BUILD_PATH_DERIVATION_V2_VERSION, deriveBuildPathBundleV2 } from "./lib/phase6a1-build-path-derivation-v2";
import {
  COMMANDER_MECHANISM_CATALOG_V2_VERSION,
  getCommanderMechanism,
} from "./lib/phase6a1-commander-mechanism-catalog-v2";
import { BUILD_PATH_TYPES_V2_VERSION } from "../src/lib/deck-synthesis/build-path-types-v2";

const OUT_DIR = resolve("data/milestones/deck-synthesis");
const CATALOG_PATH = resolve(OUT_DIR, "phase6a1-build-path-catalog-v2.json");
const AUDIT_PATH = resolve(OUT_DIR, "phase6a1-build-path-audit-v2.json");

const FORMER_NO_CORE = [
  "multi-kenrith",
  "stax-augustin",
  "blindv5-26-activated-engine",
  "blindv5-42-resource-conversion",
];

function main() {
  const caseIds = getCalibrationCaseIds();
  const bundles = caseIds
    .map((id) => {
      const mech = getCommanderMechanism(id);
      if (!mech) return null;
      return deriveBuildPathBundleV2(mech);
    })
    .filter((b): b is NonNullable<typeof b> => b !== null);

  const caseAudits = bundles.map(auditCasePathsV2);
  const generatedAt = new Date().toISOString();

  const threeDistinct = caseAudits.filter((c) => c.materiallyDistinctPathCount === 3).length;
  const twoDistinct = caseAudits.filter((c) => c.materiallyDistinctPathCount === 2).length;
  const oneDistinct = caseAudits.filter((c) => c.materiallyDistinctPathCount === 1).length;
  const lowSep = caseAudits.filter((c) => c.separation.lowPathSeparation);

  const totalCore = bundles.reduce(
    (n, b) => n + b.buildPaths.reduce((m, p) => m + p.requiredCandidateIntents.length, 0),
    0,
  );

  const catalog = {
    version: BUILD_PATH_TYPES_V2_VERSION,
    derivationVersion: BUILD_PATH_DERIVATION_V2_VERSION,
    mechanismCatalogVersion: COMMANDER_MECHANISM_CATALOG_V2_VERSION,
    generatedAt,
    pipeline: "CommanderMechanism → pathThesis → PathCandidateIntent (NOT foundation clone)",
    bundles,
  };

  const audit = {
    version: BUILD_PATH_AUDIT_V2_VERSION,
    generatedAt,
    comparisonToV1: {
      v1PathCoreIntents: 121,
      v2PathCoreIntents: totalCore,
      v1LowSeparationCases: 24,
      v2LowSeparationCases: lowSep.length,
      v1CloneSignal: "121 ≈ 41×3 — metadata conditioning of same intents",
    },
    population: {
      expectedCases: caseIds.length,
      bundlesGenerated: bundles.length,
      totalBuildPathProposals: bundles.length * 3,
      totalCorePathCandidateIntents: totalCore,
    },
    separationSummary: {
      casesWith3MateriallyDistinctPaths: threeDistinct,
      casesWith2MateriallyDistinctPaths: twoDistinct,
      casesWithStrongOverlap: oneDistinct,
      lowPathSeparationCaseCount: lowSep.length,
      lowPathSeparationCaseIds: lowSep.map((c) => c.caseId),
    },
    formerNoCoreVerification: FORMER_NO_CORE.map((caseId) => {
      const c = caseAudits.find((a) => a.caseId === caseId);
      return {
        caseId,
        oracleMechanism: c?.oracleMechanism,
        dependentThesis: c?.paths.find((p) => p.pathClass === "DEPENDENT_SYNERGY")?.pathThesis,
        independentEngine: c?.paths.find((p) => p.pathClass === "INDEPENDENT_SYNERGY")?.pathThesis.independentEngine,
        bridgeMechanisms: c?.paths.find((p) => p.pathClass === "HARMONY")?.pathThesis.bridgeMechanisms,
        coreIntentsPerPath: c?.paths.map((p) => ({
          path: p.pathClass,
          count: p.coreIntentCount,
          signatures: p.normalizedCoreSignatures.map((s) => s.targetMechanic),
        })),
        materiallyDistinct: c?.materiallyDistinctPathCount,
        separationReasons: c?.separation.reasons ?? [],
      };
    }),
    commonOverlapCauses: summarizeOverlapCauses(caseAudits),
    cases: caseAudits,
    authorization: {
      buildPathCatalogV1: "DEVELOPMENTAL — clone artifact",
      buildPathDerivationV2: "GENERATED — PENDING REVIEW",
      pathConditionedGateB: "WAIT",
      liveRetrieval: "WAIT",
      newBlindCorpus: "WAIT",
      deckbuildFixtureUI: "AUTHORIZED",
    },
  };

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2));
  writeFileSync(AUDIT_PATH, JSON.stringify(audit, null, 2));

  console.log(JSON.stringify(audit.separationSummary, null, 2));
  console.log(`\nWrote ${CATALOG_PATH}`);
  console.log(`Wrote ${AUDIT_PATH}`);
}

function summarizeOverlapCauses(
  audits: ReturnType<typeof auditCasePathsV2>[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const a of audits) {
    for (const r of a.separation.reasons) {
      const key = r.split(":")[0] ?? r;
      counts[key] = (counts[key] ?? 0) + 1;
    }
  }
  return counts;
}

main();
