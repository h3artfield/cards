#!/usr/bin/env npx tsx
/**
 * Phase 6A.1 — Independent truth implementation parity report.
 * Compares implemented catalogs (exact truth pass-through) and parser v4 DEV target.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadProjectEnvLocal } from "./lib/script-env";
import { loadDeckResolutionCatalog } from "./lib/load-deck-resolution-catalog";
import { loadShadowSemanticIndex } from "../src/lib/commander-strategy/shadow-semantic-index";
import { loadCommanderCaseContexts } from "./lib/phase6a1-commander-case-context-v1";
import {
  FROZEN_TRUTH_PATHS,
  FROZEN_TRUTH_SHA256,
  loadIndependentMechanismTruth,
  loadIndependentStrategyAdjudication,
} from "./lib/phase6a1-independent-truth-loader-v1";
import { getImplementedMechanismCatalog } from "./lib/phase6a1-implemented-mechanism-catalog-v1";
import { getImplementedStrategyCatalog } from "./lib/phase6a1-implemented-strategy-catalog-v1";
import {
  compareMechanismFacts,
  compareStrategyPlans,
  INDEPENDENT_TRUTH_PARITY_V1_VERSION,
  summarizeParity,
  type ParityRecord,
} from "./lib/phase6a1-independent-truth-parity-v1";
import {
  extractParserMechanismsForCase,
  ORACLE_MECHANISM_EXTRACTOR_V4_VERSION,
} from "./lib/phase6a1-oracle-mechanism-extractor-v4";

loadProjectEnvLocal();

const OUT_DIR = resolve("data/milestones/deck-synthesis");
const PARITY_PATH = resolve(OUT_DIR, "phase6a1-independent-truth-implementation-parity-v1.json");
const IMPLEMENTED_MECHANISM_PATH = resolve(OUT_DIR, "phase6a1-commander-mechanism-facts-v4-implemented.json");
const IMPLEMENTED_STRATEGY_PATH = resolve(OUT_DIR, "phase6a1-strategy-adjudication-v1-implemented.json");

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

async function main() {
  const catalog = await loadDeckResolutionCatalog();
  const shadowIndex = await loadShadowSemanticIndex();
  const contexts = loadCommanderCaseContexts(catalog, shadowIndex);
  const ctxByCase = new Map(contexts.map((c) => [c.caseId, c]));

  const truthMechanism = loadIndependentMechanismTruth();
  const truthStrategy = loadIndependentStrategyAdjudication();
  const implementedMechanism = getImplementedMechanismCatalog();
  const implementedStrategy = getImplementedStrategyCatalog();

  const mechanismParityByCase: Array<{
    caseId: string;
    records: ParityRecord[];
    missingTruthMechanisms: ParityRecord[];
    extraUnsupportedMechanisms: ParityRecord[];
  }> = [];

  const strategyParityByCase: Array<{ caseId: string; records: ParityRecord[] }> = [];

  let allMechanismRecords: ParityRecord[] = [];
  let allMissing: ParityRecord[] = [];
  let allExtra: ParityRecord[] = [];
  let allStrategyRecords: ParityRecord[] = [];

  for (const truthCase of truthMechanism.cases) {
    const implCase = implementedMechanism.find((c) => c.caseId === truthCase.caseId)!;
    const mechParity = compareMechanismFacts(
      truthCase.independentMechanismFacts,
      implCase.independentMechanismFacts,
    );
    mechanismParityByCase.push({ caseId: truthCase.caseId, ...mechParity });
    allMechanismRecords = allMechanismRecords.concat(mechParity.records);
    allMissing = allMissing.concat(mechParity.missingTruthMechanisms);
    allExtra = allExtra.concat(mechParity.extraUnsupportedMechanisms);
  }

  for (const truthCase of truthStrategy.cases) {
    const implCase = implementedStrategy.find((c) => c.caseId === truthCase.caseId)!;
    const records = compareStrategyPlans(
      truthCase.correctedThreePathStrategy,
      implCase.correctedThreePathStrategy,
      truthCase.caseId,
    );
    strategyParityByCase.push({ caseId: truthCase.caseId, records });
    allStrategyRecords = allStrategyRecords.concat(records);
  }

  const implementationSummary = summarizeParity(allMechanismRecords, allStrategyRecords, allExtra, allMissing);

  const parserParityByCase = truthMechanism.cases.map((truthCase) => {
    const ctx = ctxByCase.get(truthCase.caseId);
    const parserFacts = ctx ? extractParserMechanismsForCase(ctx) : [];
    const parity = compareMechanismFacts(truthCase.independentMechanismFacts, parserFacts);
    return {
      caseId: truthCase.caseId,
      truthMechanismCount: truthCase.independentMechanismFacts.length,
      parserMechanismCount: parserFacts.length,
      exactMatches: parity.records.filter((r) => r.exactSemanticMatch).length,
      missingFromParser: parity.missingTruthMechanisms.length,
      extraInParser: parity.extraUnsupportedMechanisms.length,
      records: parity.records,
    };
  });

  const parserSummary = {
    truthMechanisms: truthMechanism.population.correctedTypedMechanisms,
    parserExtractedTotal: parserParityByCase.reduce((n, c) => n + c.parserMechanismCount, 0),
    exactSemanticMatches: parserParityByCase.reduce((n, c) => n + c.exactMatches, 0),
    missingFromParser: parserParityByCase.reduce((n, c) => n + c.missingFromParser, 0),
    extraInParser: parserParityByCase.reduce((n, c) => n + c.extraInParser, 0),
    note: "Parser v4 is DEV target only — implementation parity uses frozen truth pass-through.",
  };

  const shaChecks = {
    mechanismTruth: {
      expected: FROZEN_TRUTH_SHA256.mechanismTruth,
      actual: sha256File(FROZEN_TRUTH_PATHS.mechanismTruth),
      match: sha256File(FROZEN_TRUTH_PATHS.mechanismTruth) === FROZEN_TRUTH_SHA256.mechanismTruth,
    },
    strategyAdjudication: {
      expected: FROZEN_TRUTH_SHA256.strategyAdjudication,
      actual: sha256File(FROZEN_TRUTH_PATHS.strategyAdjudication),
      match: sha256File(FROZEN_TRUTH_PATHS.strategyAdjudication) === FROZEN_TRUTH_SHA256.strategyAdjudication,
    },
    correctionLedger: {
      expected: FROZEN_TRUTH_SHA256.correctionLedger,
      actual: sha256File(FROZEN_TRUTH_PATHS.correctionLedger),
      match: sha256File(FROZEN_TRUTH_PATHS.correctionLedger) === FROZEN_TRUTH_SHA256.correctionLedger,
    },
  };

  const generatedAt = new Date().toISOString();

  const implementedMechanismArtifact = {
    version: "phase6a1-commander-mechanism-facts-v4-implemented",
    generatedAt,
    sourceTruth: "phase6a1-independent-commander-mechanism-truth-v1",
    sourceTruthSha256: FROZEN_TRUTH_SHA256.mechanismTruth,
    adjudicationStatus: "FROZEN_DEV_TRUTH",
    note: "Exact pass-through of independent mechanism truth — no semantic reinterpretation.",
    entries: implementedMechanism,
  };

  const implementedStrategyArtifact = {
    version: "phase6a1-strategy-adjudication-v1-implemented",
    generatedAt,
    sourceTruth: "phase6a1-independent-strategy-adjudication-v1",
    sourceTruthSha256: FROZEN_TRUTH_SHA256.strategyAdjudication,
    adjudicationStatus: "FROZEN_DEV_TRUTH",
    note: "Exact pass-through of independent three-path strategy adjudication.",
    entries: implementedStrategy,
  };

  const parityArtifact = {
    version: INDEPENDENT_TRUTH_PARITY_V1_VERSION,
    generatedAt,
    authorization: {
      independentMechanismTruth: "FROZEN_DEV_TRUTH",
      independentStrategyAdjudication: "FROZEN_DEV_TRUTH",
      implementationOfExactCorrections: "COMPLETE",
      buildPathV3: "WAIT",
      gateB: "WAIT",
      liveRetrieval: "WAIT",
      cardSpecificParserPatches: "PROHIBITED",
      semanticReinterpretationByCodingTeam: "PROHIBITED",
    },
    frozenTruthSha256Verification: shaChecks,
    implementationParity: {
      summary: implementationSummary,
      required: {
        missingTruthMechanisms: 0,
        extraUnsupportedMechanisms: 0,
        strategySubstitutions: 0,
        factualProvenanceViolations: 0,
      },
      pass:
        implementationSummary.missingTruthMechanisms === 0 &&
        implementationSummary.extraUnsupportedMechanisms === 0 &&
        implementationSummary.strategySubstitutions === 0 &&
        implementationSummary.factualProvenanceViolations === 0 &&
        implementationSummary.mechanismExactMatches === implementationSummary.mechanismTotal,
      mechanismParityByCase,
      strategyParityByCase,
    },
    parserDevTarget: {
      extractorVersion: ORACLE_MECHANISM_EXTRACTOR_V4_VERSION,
      summary: parserSummary,
      byCase: parserParityByCase.map(({ caseId, truthMechanismCount, parserMechanismCount, exactMatches, missingFromParser, extraInParser }) => ({
        caseId,
        truthMechanismCount,
        parserMechanismCount,
        exactMatches,
        missingFromParser,
        extraInParser,
      })),
    },
    highlightedReplacements: {
      "blindv5-16-commander-background": mechanismParityByCase.find((c) => c.caseId === "blindv5-16-commander-background"),
      "blindv5-19-narrow-single-engine": mechanismParityByCase.find((c) => c.caseId === "blindv5-19-narrow-single-engine"),
      "blindv5-26-activated-engine": {
        mechanism: mechanismParityByCase.find((c) => c.caseId === "blindv5-26-activated-engine"),
        strategy: strategyParityByCase.find((c) => c.caseId === "blindv5-26-activated-engine"),
      },
      "hybrid-kinnan": mechanismParityByCase.find((c) => c.caseId === "hybrid-kinnan"),
      "partner-thrasios-tymna": mechanismParityByCase.find((c) => c.caseId === "partner-thrasios-tymna"),
    },
  };

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(IMPLEMENTED_MECHANISM_PATH, JSON.stringify(implementedMechanismArtifact, null, 2));
  writeFileSync(IMPLEMENTED_STRATEGY_PATH, JSON.stringify(implementedStrategyArtifact, null, 2));
  writeFileSync(PARITY_PATH, JSON.stringify(parityArtifact, null, 2));

  console.log(JSON.stringify({ shaChecks, implementationSummary, parserSummary: parserSummary }, null, 2));
  console.log(`\nWrote ${IMPLEMENTED_MECHANISM_PATH}`);
  console.log(`Wrote ${IMPLEMENTED_STRATEGY_PATH}`);
  console.log(`Wrote ${PARITY_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
