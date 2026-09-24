#!/usr/bin/env npx tsx
/**
 * Phase 6A — semantic candidate retrieval evaluation package.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadSemanticMapNeighbors } from "../src/lib/semantic-visualization/artifact-loader";
import { loadProjectEnvLocal } from "./lib/script-env";
import { loadDeckResolutionCatalog } from "./lib/load-deck-resolution-catalog";
import { loadShadowSemanticIndex } from "../src/lib/commander-strategy/shadow-semantic-index";
import { loadCommanderGameChangerSnapshot } from "../src/lib/commander-strategy/model-c/game-changer-snapshot-v1";
import { ARCHETYPE_DISCOVERY_BENCHMARK_V1 } from "../src/lib/deck-synthesis/archetype-discovery-benchmark-v1";
import { ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V5 } from "../src/lib/deck-synthesis/archetype-discovery-blind-holdout-v5";
import {
  buildGlobalCatalogSemanticIndex,
  discoverArchetypes,
  extractDirectionAnchors,
  extractMechanicalMotifs,
  filterCatalogRoleIndex,
  resolveBenchmarkCommanderOracleIds,
  buildCommanderMechanicalProfile,
  retrieveSemanticCandidates,
  inspectRoleCoverage,
  SEMANTIC_CANDIDATE_RETRIEVAL_V1_VERSION,
  type SemanticCandidateRetrievalReport,
} from "../src/lib/deck-synthesis";

loadProjectEnvLocal();

const OUT_PATH = "data/milestones/deck-synthesis/phase6a-retrieval-evaluation-v1.json";

const EVAL_SETS = [
  { setId: "dev_benchmark_v1", cases: ARCHETYPE_DISCOVERY_BENCHMARK_V1 },
  { setId: "blind_holdout_v5", cases: ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V5 },
];

async function main() {
  const catalog = await loadDeckResolutionCatalog();
  const shadowIndex = await loadShadowSemanticIndex();
  const globalIndex = buildGlobalCatalogSemanticIndex({ catalog, shadowIndex });
  const semanticNeighbors = await loadSemanticMapNeighbors();
  const gameChangerSnapshot = loadCommanderGameChangerSnapshot();

  const caseReports: Array<{
    caseId: string;
    setId: string;
    commandZoneConfiguration: string;
    commanders: string[];
    retrievalReady: boolean;
    abstentionReason: string | null;
    candidateCount: number;
    retrievalSpecificationCoverage: number;
    crossBucketCandidates: number;
    uncoveredRequiredFunctions: string[];
    multiRoleCandidates: number;
    bucketCount: number;
    legalExclusions: number;
    bracketExclusions: number;
  }> = [];

  for (const spec of EVAL_SETS) {
    for (const c of spec.cases) {
      const resolution = resolveBenchmarkCommanderOracleIds(catalog, c.commanders);
      if (!resolution.resolved) continue;

      const report = discoverArchetypes(
        { commanderOracleIds: resolution.oracleIds, bracket: c.bracket },
        { catalog, shadowIndex, globalCatalogIndex: globalIndex },
      );
      const primary = report.buildDirections.find((d) => d.rank === 1);
      if (!primary?.phase6RetrievalReady) {
        caseReports.push({
          caseId: c.id,
          setId: spec.setId,
          commandZoneConfiguration: c.commandZoneConfiguration,
          commanders: c.commanders,
          retrievalReady: false,
          abstentionReason: "NOT_RETRIEVAL_READY",
          candidateCount: 0,
          retrievalSpecificationCoverage: 0,
          crossBucketCandidates: 0,
          uncoveredRequiredFunctions: [],
          multiRoleCandidates: 0,
          bucketCount: 0,
          legalExclusions: 0,
          bracketExclusions: 0,
        });
        continue;
      }

      const profile = buildCommanderMechanicalProfile({
        commanderOracleIds: resolution.oracleIds,
        catalogByOracleId: catalog.byOracleId,
        shadowIndex,
      })!;
      const motifs = extractMechanicalMotifs(profile);
      const anchors = extractDirectionAnchors({ profile, motifs });
      const colorIdentity =
        report.commandZoneComposition?.combinedColorIdentity ??
        resolution.oracleIds.flatMap((id) => catalog.byOracleId.get(id)?.colorIdentity ?? []);
      const roleIndex = filterCatalogRoleIndex(globalIndex, [...new Set(colorIdentity)]);

      const retrievalReport = retrieveSemanticCandidates(
        {
          commandZoneConfiguration: c.commandZoneConfiguration,
          bracket: c.bracket,
          commanderOracleIds: resolution.oracleIds,
          combinedColorIdentity: [...new Set(colorIdentity)],
          buildDirections: report.buildDirections,
          directionAnchors: anchors,
          retrievalSpecifications: [primary.retrievalSpecification],
          commandZoneComposition: report.commandZoneComposition,
          namedArchetype: null,
        },
        { catalog, shadowIndex, roleIndex, semanticNeighbors, gameChangerSnapshot },
      );

      const coverage = inspectRoleCoverage(retrievalReport);
      caseReports.push({
        caseId: c.id,
        setId: spec.setId,
        commandZoneConfiguration: c.commandZoneConfiguration,
        commanders: c.commanders,
        retrievalReady: true,
        abstentionReason: retrievalReport.abstentionReason,
        candidateCount: retrievalReport.poolStats.candidateCount,
        retrievalSpecificationCoverage: retrievalReport.poolStats.retrievalSpecificationCoverage,
        crossBucketCandidates: retrievalReport.poolStats.crossBucketCandidates,
        uncoveredRequiredFunctions: coverage.uncoveredRequiredFunctions,
        multiRoleCandidates: retrievalReport.candidates.filter((x) => x.candidateRoleMemberships.length > 1).length,
        bucketCount: Object.keys(retrievalReport.poolStats.candidatesPerBucket).length,
        legalExclusions: retrievalReport.poolStats.legalExclusions,
        bracketExclusions: retrievalReport.poolStats.bracketExclusions,
      });
    }
  }

  const ready = caseReports.filter((r) => r.retrievalReady && !r.abstentionReason);
  const distributions = {
    candidateCount: summarize(ready.map((r) => r.candidateCount)),
    retrievalSpecificationCoverage: summarize(ready.map((r) => r.retrievalSpecificationCoverage)),
    crossBucketCandidates: summarize(ready.map((r) => r.crossBucketCandidates)),
    multiRoleCandidates: summarize(ready.map((r) => r.multiRoleCandidates)),
    bucketCount: summarize(ready.map((r) => r.bucketCount)),
  };

  const stratum = (cfg: string) => {
    const cohort = ready.filter((r) => r.commandZoneConfiguration === cfg);
    return {
      caseCount: cohort.length,
      medianCandidateCount: median(cohort.map((r) => r.candidateCount)),
      medianSpecCoverage: median(cohort.map((r) => r.retrievalSpecificationCoverage)),
      zeroCoverageCases: cohort.filter((r) => r.retrievalSpecificationCoverage === 0).length,
    };
  };

  const evaluation = {
    version: "phase6a-retrieval-evaluation-v1",
    generatedAt: new Date().toISOString(),
    retrievalEngineVersion: SEMANTIC_CANDIDATE_RETRIEVAL_V1_VERSION,
    retrievalMode: "SEMANTIC_ONLY",
    phase5Status: "PRODUCT_ACCEPTED",
    authorization: {
      phase6A: "AUTHORIZED",
      optimizer: "WAIT",
      professorImplementation: "WAIT",
      metaPriorRetrieval: "PROHIBITED",
    },
    accounting: {
      totalCases: caseReports.length,
      retrievalReadyCases: caseReports.filter((r) => r.retrievalReady).length,
      evaluatedCases: ready.length,
      abstentionCases: caseReports.filter((r) => r.abstentionReason).length,
    },
    distributions,
    stratumMetrics: {
      singleCommander: stratum("single_commander"),
      partnerPair: stratum("partner_pair"),
      commanderWithBackground: stratum("commander_with_background"),
    },
    qualitySignals: {
      casesWithZeroCandidates: ready.filter((r) => r.candidateCount === 0).length,
      casesWithFullRequiredCoverage: ready.filter((r) => r.retrievalSpecificationCoverage >= 1).length,
      casesWithPartialCoverage: ready.filter((r) => r.retrievalSpecificationCoverage > 0 && r.retrievalSpecificationCoverage < 1).length,
      casesWithMultiRoleCandidates: ready.filter((r) => r.multiRoleCandidates > 0).length,
      totalLegalExclusions: ready.reduce((s, r) => s + r.legalExclusions, 0),
      totalBracketExclusions: ready.reduce((s, r) => s + r.bracketExclusions, 0),
    },
    prospectivePhase6AGate: {
      note: "Proposed after observing distributions — not frozen until human review",
      suggestedThresholds: {
        medianCandidateCountMin: 20,
        retrievalSpecificationCoverageMedianMin: 0.5,
        zeroCandidateRateMax: 0.05,
        multiRoleCandidateRateMin: 0.3,
        legalExclusionAuditPass: true,
      },
      pass:
        (distributions.candidateCount.median ?? 0) >= 20 &&
        (distributions.retrievalSpecificationCoverage.median ?? 0) >= 0.5 &&
        ready.filter((r) => r.candidateCount === 0).length / Math.max(ready.length, 1) <= 0.05,
    },
    metaIndependenceAudit: {
      status: "DEFERRED_POST_SELECTION",
      note: "P15 comparison against meta references runs after candidate pool sealed — never fed into SEMANTIC_ONLY scoring",
    },
    professorEscalationContract: {
      status: "ACCEPTED_SPEC_ONLY",
      callableFunctions: [
        "findSemanticCandidates",
        "getCandidateEvidence",
        "getAlternativesForFunction",
        "inspectCandidatePool",
        "inspectRoleCoverage",
        "buildProfessorAssistanceRequest",
      ],
      automaticEscalationTriggers: [
        "NO_VALID_BUILD_DIRECTION",
        "CORRECT_RETRIEVAL_ABSTENTION",
        "low direction confidence",
        "unresolvedDirectionAmbiguity",
        "competingDirections",
        "disconnected selected-card clusters",
        "semantic builder local plateau",
        "user manually diverges from current route",
      ],
    },
    caseReports,
  };

  evaluation.artifactHash = createHash("sha256").update(JSON.stringify(evaluation)).digest("hex");

  const outPath = resolve(process.cwd(), OUT_PATH);
  mkdirSync(resolve(outPath, ".."), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(evaluation, null, 2)}\n`);

  console.log(
    JSON.stringify(
      {
        outPath,
        evaluatedCases: ready.length,
        medianCandidateCount: distributions.candidateCount.median,
        medianSpecCoverage: distributions.retrievalSpecificationCoverage.median,
        prospectiveGatePass: evaluation.prospectivePhase6AGate.pass,
      },
      null,
      2,
    ),
  );
}

function summarize(values: number[]) {
  if (!values.length) return { min: 0, max: 0, median: 0, mean: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    median: median(sorted),
    mean: sorted.reduce((a, b) => a + b, 0) / sorted.length,
  };
}

function median(sorted: number[]) {
  if (!sorted.length) return 0;
  const s = [...sorted].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
