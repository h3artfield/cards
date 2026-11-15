#!/usr/bin/env npx tsx
/**
 * Phase 6A.1 — Semantic catalog audit v3.
 * Separates CommanderMechanismFacts from StrategyHypotheses.
 * Does NOT generate BuildPath v3 or retrieval candidates.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadProjectEnvLocal } from "./lib/script-env";
import { loadDeckResolutionCatalog } from "./lib/load-deck-resolution-catalog";
import { loadShadowSemanticIndex } from "../src/lib/commander-strategy/shadow-semantic-index";
import { BUILD_PATH_SEMANTIC_TYPES_V3_VERSION } from "../src/lib/deck-synthesis/build-path-semantic-types-v3";
import {
  COMMANDER_CASE_CONTEXT_V1_VERSION,
  loadCommanderCaseContexts,
} from "./lib/phase6a1-commander-case-context-v1";
import {
  buildMechanismFactsCatalog,
  ORACLE_MECHANISM_FACT_EXTRACTOR_V3_VERSION,
} from "./lib/phase6a1-oracle-mechanism-fact-extractor-v3";
import {
  buildStrategyHypothesisCatalog,
  linkBridgeFactsToMechanisms,
  STRATEGY_HYPOTHESIS_V1_VERSION,
} from "./lib/phase6a1-strategy-hypothesis-v1";
import {
  auditCaseSemanticCatalog,
  SEMANTIC_CATALOG_AUDIT_V3_VERSION,
  summarizeByCase,
  summarizeFailures,
} from "./lib/phase6a1-semantic-catalog-audit-v3";
import { BUILD_PATH_AUDIT_V2_VERSION } from "./lib/phase6a1-build-path-audit-v2";

loadProjectEnvLocal();

const OUT_DIR = resolve("data/milestones/deck-synthesis");
const FACTS_PATH = resolve(OUT_DIR, "phase6a1-commander-mechanism-facts-v3.json");
const STRATEGY_PATH = resolve(OUT_DIR, "phase6a1-strategy-hypotheses-v1.json");
const AUDIT_PATH = resolve(OUT_DIR, "phase6a1-semantic-catalog-audit-v3.json");

async function main() {
  const catalog = await loadDeckResolutionCatalog();
  const shadowIndex = await loadShadowSemanticIndex();
  const contexts = loadCommanderCaseContexts(catalog, shadowIndex);

  const factsCatalog = buildMechanismFactsCatalog(contexts);
  let strategyCatalog = buildStrategyHypothesisCatalog(contexts);

  strategyCatalog = strategyCatalog.map((entry) => {
    const facts = factsCatalog.find((f) => f.caseId === entry.caseId);
    if (!facts) return entry;
    return {
      ...entry,
      bridgeHypotheses: linkBridgeFactsToMechanisms(facts, entry.bridgeHypotheses),
    };
  });

  const caseAudits = contexts.map((ctx) => {
    const facts = factsCatalog.find((f) => f.caseId === ctx.caseId)!;
    const strategy = strategyCatalog.find((s) => s.caseId === ctx.caseId) ?? null;
    return auditCaseSemanticCatalog(ctx, facts, strategy);
  });

  const allFailures = caseAudits.flatMap((c) => c.failures);
  const generatedAt = new Date().toISOString();

  const factsArtifact = {
    version: ORACLE_MECHANISM_FACT_EXTRACTOR_V3_VERSION,
    typesVersion: BUILD_PATH_SEMANTIC_TYPES_V3_VERSION,
    generatedAt,
    caseContextVersion: COMMANDER_CASE_CONTEXT_V1_VERSION,
    population: { expectedCases: contexts.length, entriesGenerated: factsCatalog.length },
    adjudicationStatus: "PENDING_INDEPENDENT_SEMANTIC_ADJUDICATION",
    note: "Facts extracted from golden catalog Oracle only. No deck-strategy inference.",
    entries: factsCatalog,
  };

  const strategyArtifact = {
    version: STRATEGY_HYPOTHESIS_V1_VERSION,
    typesVersion: BUILD_PATH_SEMANTIC_TYPES_V3_VERSION,
    generatedAt,
    sourceCatalog: "phase6a1-commander-mechanism-catalog-v2 (DEVELOPMENTAL — converted with provenance)",
    population: { expectedCases: contexts.length, entriesGenerated: strategyCatalog.length },
    adjudicationStatus: "PENDING_INDEPENDENT_SEMANTIC_ADJUDICATION",
    note: "Derived deck-strategy hypotheses. Must not certify semantic truth without independent review.",
    entries: strategyCatalog,
  };

  const factualOracleFailures = allFailures.filter((f) => f.category === "FACTUAL_ORACLE_FAILURE");
  const zellixFailure = factualOracleFailures.find((f) => f.caseId === "blindv5-16-commander-background");

  const auditArtifact = {
    version: SEMANTIC_CATALOG_AUDIT_V3_VERSION,
    generatedAt,
    authorization: {
      threePathArchitecture: "ACCEPTED",
      buildPathV2DerivationOrdering: "ACCEPTED",
      mechanismCatalogV2: "FAIL / DEVELOPMENTAL",
      buildPathCatalogV2: "DEVELOPMENTAL / DO NOT ROUTE",
      v2LowPathSeparationClaim: "NOT ACCEPTED — withdrawn",
      buildPathV3: "NOT AUTHORIZED",
      pathConditionedGateB: "WAIT",
      liveRetrieval: "WAIT",
      newBlindedCorpus: "WAIT",
      deckbuildFixtureUI: "CONTINUE",
    },
    supersededClaims: {
      buildPathAuditV2: {
        version: BUILD_PATH_AUDIT_V2_VERSION,
        withdrawnClaims: [
          "28/28 materially distinct paths — NOT ACCEPTED (semantic catalog not oracle-grounded)",
          "0/28 LOW_PATH_SEPARATION — NOT ACCEPTED (partial overlap audit blind; facts hallucinated in at least one case)",
        ],
      },
    },
    population: {
      casesAudited: caseAudits.length,
      totalMechanismFacts: factsCatalog.reduce(
        (n, e) => n + e.memberFacts.reduce((m, f) => m + f.mechanisms.length, 0),
        0,
      ),
      totalIndependentEngineHypotheses: strategyCatalog.reduce((n, e) => n + e.independentEngines.length, 0),
      totalBridgeHypotheses: strategyCatalog.reduce((n, e) => n + e.bridgeHypotheses.length, 0),
    },
    failureSummary: {
      totalFailures: allFailures.length,
      byCategory: summarizeFailures(allFailures),
      casesWithFailures: caseAudits.filter((c) => c.failures.length > 0).length,
      failuresPerCase: summarizeByCase(allFailures),
    },
    reportSections: {
      FACTUAL_ORACLE_FAILURES: allFailures.filter((f) => f.category === "FACTUAL_ORACLE_FAILURE"),
      unsupportedStrategyHypotheses: allFailures.filter((f) => f.category === "UNSUPPORTED_STRATEGY_HYPOTHESIS"),
      nonCausalIndependentEnginePairs: allFailures.filter((f) => f.category === "NON_CAUSAL_INDEPENDENT_ENGINE"),
      illegalOrColorInvalidHypotheses: allFailures.filter((f) => f.category === "ILLEGAL_OR_COLOR_INVALID_HYPOTHESIS"),
      bridgeJobsMissingOneCausalSide: allFailures.filter((f) => f.category === "BRIDGE_MISSING_CAUSAL_SIDE"),
      multiMemberFlatteningErrors: allFailures.filter((f) => f.category === "MULTI_MEMBER_FLATTENING_ERROR"),
      semanticSlotRetrievalTokenMismatches: allFailures.filter(
        (f) => f.category === "SEMANTIC_SLOT_RETRIEVAL_TOKEN_MISMATCH",
      ),
      strategyPresentedAsOracleEvidence: allFailures.filter(
        (f) => f.category === "STRATEGY_PRESENTED_AS_ORACLE_EVIDENCE",
      ),
      harmonyZeroMeaningfulOverlap: allFailures.filter((f) => f.category === "HARMONY_ZERO_MEANINGFUL_OVERLAP"),
    },
    highlightedFindings: {
      blindv5_16_commander_background: {
        caseId: "blindv5-16-commander-background",
        v2HallucinatedSummary: "Zellix mills on attack; Acolyte creates Dragon on Dragon death.",
        canonicalOracle: factsCatalog.find((f) => f.caseId === "blindv5-16-commander-background")?.commanderOracleTexts,
        extractedFacts: factsCatalog
          .find((f) => f.caseId === "blindv5-16-commander-background")
          ?.memberFacts.flatMap((m) => m.mechanisms.map((mech) => mech.evidenceSpan)),
        auditFailures: caseAudits.find((c) => c.caseId === "blindv5-16-commander-background")?.failures ?? [],
      },
      partnerThrasiosTymna: {
        caseId: "partner-thrasios-tymna",
        failures: caseAudits.find((c) => c.caseId === "partner-thrasios-tymna")?.failures ?? [],
      },
      kenrithIndependentEngine: {
        caseId: "multi-kenrith",
        failures: caseAudits
          .find((c) => c.caseId === "multi-kenrith")
          ?.failures.filter((f) => f.category === "NON_CAUSAL_INDEPENDENT_ENGINE") ?? [],
      },
      bruvecIndependentEngine: {
        caseId: "single-mill-bruvac",
        failures: caseAudits
          .find((c) => c.caseId === "single-mill-bruvac")
          ?.failures.filter((f) => f.category === "NON_CAUSAL_INDEPENDENT_ENGINE") ?? [],
      },
      zellixConfirmed: zellixFailure ?? null,
    },
    pathReadinessSummary: {
      dependentCommanderDependentIdentity: caseAudits.filter((c) => c.pathReadiness.dependentHasCommanderDependentIdentity).length,
      independentCommanderFreeIdentity: caseAudits.filter((c) => c.pathReadiness.independentHasCommanderFreeIdentity).length,
      harmonyVerifiedDualRoleBridges: caseAudits.filter((c) => c.pathReadiness.harmonyHasVerifiedDualRoleBridges).length,
    },
    cases: caseAudits,
  };

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(FACTS_PATH, JSON.stringify(factsArtifact, null, 2));
  writeFileSync(STRATEGY_PATH, JSON.stringify(strategyArtifact, null, 2));
  writeFileSync(AUDIT_PATH, JSON.stringify(auditArtifact, null, 2));

  console.log(JSON.stringify(auditArtifact.failureSummary, null, 2));
  console.log(`\nWrote ${FACTS_PATH}`);
  console.log(`Wrote ${STRATEGY_PATH}`);
  console.log(`Wrote ${AUDIT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
