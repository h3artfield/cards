/**
 * Load frozen independent semantic truth artifacts — authoritative DEV truth set.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type {
  IndependentCommanderMechanismTruth,
  IndependentCommanderMechanismTruthCase,
  IndependentSemanticCorrectionLedger,
  IndependentStrategyAdjudicationCase,
  IndependentStrategyAdjudicationTruth,
} from "../../src/lib/deck-synthesis/independent-truth-types-v1";

export const INDEPENDENT_TRUTH_LOADER_V1_VERSION = "phase6a1-independent-truth-loader-v1";

function resolveMilestoneSynthesisPath(filename: string): string {
  const candidates = [
    resolve(process.cwd(), "data/milestones/deck-synthesis", filename),
    resolve(process.cwd(), "web/data/milestones/deck-synthesis", filename),
    resolve(__dirname, "../../data/milestones/deck-synthesis", filename),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return candidates[0]!;
}

export const FROZEN_TRUTH_PATHS = {
  mechanismTruth: resolveMilestoneSynthesisPath("phase6a1-independent-commander-mechanism-truth-v1.json"),
  strategyAdjudication: resolveMilestoneSynthesisPath("phase6a1-independent-strategy-adjudication-v1.json"),
  correctionLedger: resolveMilestoneSynthesisPath("phase6a1-independent-semantic-correction-ledger-v1.json"),
} as const;

export const FROZEN_TRUTH_SHA256 = {
  mechanismTruth: "0cbbcd0bc5dcd8e67b7984e63346648963c9decf3e6ab3395236de98c5ca1b67",
  strategyAdjudication: "82a977d687cf2832fb91333224a7558df6a610a7a2498724c57a7cf36377e909",
  correctionLedger: "64bc0d18e263b314d60da8f2792859064fd0758dacb284eb8f3bbde1152bc66f",
} as const;

let mechanismTruthCache: IndependentCommanderMechanismTruth | null = null;
let strategyTruthCache: IndependentStrategyAdjudicationTruth | null = null;
let ledgerCache: IndependentSemanticCorrectionLedger | null = null;

function loadJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

export function loadIndependentMechanismTruth(): IndependentCommanderMechanismTruth {
  if (!mechanismTruthCache) {
    mechanismTruthCache = loadJson<IndependentCommanderMechanismTruth>(FROZEN_TRUTH_PATHS.mechanismTruth);
  }
  return mechanismTruthCache;
}

export function loadIndependentStrategyAdjudication(): IndependentStrategyAdjudicationTruth {
  if (!strategyTruthCache) {
    strategyTruthCache = loadJson<IndependentStrategyAdjudicationTruth>(FROZEN_TRUTH_PATHS.strategyAdjudication);
  }
  return strategyTruthCache;
}

export function loadIndependentCorrectionLedger(): IndependentSemanticCorrectionLedger {
  if (!ledgerCache) {
    ledgerCache = loadJson<IndependentSemanticCorrectionLedger>(FROZEN_TRUTH_PATHS.correctionLedger);
  }
  return ledgerCache;
}

export function getMechanismTruthCase(caseId: string): IndependentCommanderMechanismTruthCase | undefined {
  return loadIndependentMechanismTruth().cases.find((c) => c.caseId === caseId);
}

export function getStrategyAdjudicationCase(caseId: string): IndependentStrategyAdjudicationCase | undefined {
  return loadIndependentStrategyAdjudication().cases.find((c) => c.caseId === caseId);
}

export function getAllTruthCaseIds(): string[] {
  return loadIndependentMechanismTruth().cases.map((c) => c.caseId);
}
