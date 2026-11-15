/**
 * Parity comparison — implemented catalogs vs frozen independent truth.
 * Does not self-certify semantic correctness beyond parity to frozen artifacts.
 */
import type {
  CorrectedThreePathStrategy,
  IndependentMechanismFact,
} from "../../src/lib/deck-synthesis/independent-truth-types-v1";
import { normalizeForSpanMatch } from "./phase6a1-semantic-evidence-v3";

export const INDEPENDENT_TRUTH_PARITY_V1_VERSION = "phase6a1-independent-truth-parity-v1";

export type ParityDifference = {
  path: string;
  truthValue: unknown;
  implementedValue: unknown;
};

export type ParityRecord = {
  truthRecordId: string;
  implementedRecordId: string;
  exactSemanticMatch: boolean;
  differences: ParityDifference[];
};

function deepDiff(truth: unknown, implemented: unknown, path = ""): ParityDifference[] {
  if (truth === implemented) return [];
  if (truth == null || implemented == null) {
    return [{ path: path || "root", truthValue: truth, implementedValue: implemented }];
  }
  if (typeof truth !== typeof implemented) {
    return [{ path: path || "root", truthValue: truth, implementedValue: implemented }];
  }
  if (typeof truth !== "object") {
    if (String(truth) === String(implemented)) return [];
    return [{ path: path || "root", truthValue: truth, implementedValue: implemented }];
  }
  if (Array.isArray(truth) && Array.isArray(implemented)) {
    const diffs: ParityDifference[] = [];
    const maxLen = Math.max(truth.length, implemented.length);
    for (let i = 0; i < maxLen; i++) {
      diffs.push(...deepDiff(truth[i], implemented[i], `${path}[${i}]`));
    }
    return diffs;
  }
  if (Array.isArray(truth) !== Array.isArray(implemented)) {
    return [{ path: path || "root", truthValue: truth, implementedValue: implemented }];
  }
  const tObj = truth as Record<string, unknown>;
  const iObj = implemented as Record<string, unknown>;
  const keys = new Set([...Object.keys(tObj), ...Object.keys(iObj)]);
  const diffs: ParityDifference[] = [];
  for (const key of keys) {
    diffs.push(...deepDiff(tObj[key], iObj[key], path ? `${path}.${key}` : key));
  }
  return diffs;
}

export function normalizeEvidenceSpan(span: string): string {
  return normalizeForSpanMatch(span);
}

export function compareMechanismFacts(
  truthFacts: IndependentMechanismFact[],
  implementedFacts: IndependentMechanismFact[],
): {
  records: ParityRecord[];
  missingTruthMechanisms: ParityRecord[];
  extraUnsupportedMechanisms: ParityRecord[];
} {
  const records: ParityRecord[] = [];
  const implementedById = new Map(implementedFacts.map((f) => [f.mechanismId, f]));
  const implementedBySpan = new Map<string, IndependentMechanismFact[]>();
  for (const f of implementedFacts) {
    const key = normalizeEvidenceSpan(f.evidenceSpan);
    const arr = implementedBySpan.get(key) ?? [];
    arr.push(f);
    implementedBySpan.set(key, arr);
  }

  const matchedImplementedIds = new Set<string>();

  for (const truth of truthFacts) {
    let implemented = implementedById.get(truth.mechanismId);
    if (!implemented) {
      const spanMatches = implementedBySpan.get(normalizeEvidenceSpan(truth.evidenceSpan)) ?? [];
      implemented = spanMatches.find((c) => !matchedImplementedIds.has(c.mechanismId));
    }
    if (!implemented) {
      records.push({
        truthRecordId: truth.mechanismId,
        implementedRecordId: "",
        exactSemanticMatch: false,
        differences: [{ path: "mechanismId", truthValue: truth.mechanismId, implementedValue: null }],
      });
      continue;
    }
    matchedImplementedIds.add(implemented.mechanismId);
    const { mechanismId: _tId, ...truthBody } = truth;
    const { mechanismId: _iId, ...implBody } = implemented;
    const differences = deepDiff(truthBody, implBody);
    records.push({
      truthRecordId: truth.mechanismId,
      implementedRecordId: implemented.mechanismId,
      exactSemanticMatch: differences.length === 0,
      differences,
    });
  }

  const missingTruthMechanisms = records.filter((r) => !r.implementedRecordId);
  const extraUnsupportedMechanisms: ParityRecord[] = [];
  for (const impl of implementedFacts) {
    if (matchedImplementedIds.has(impl.mechanismId)) continue;
    extraUnsupportedMechanisms.push({
      truthRecordId: "",
      implementedRecordId: impl.mechanismId,
      exactSemanticMatch: false,
      differences: [{ path: "mechanismId", truthValue: null, implementedValue: impl.mechanismId }],
    });
  }

  return { records, missingTruthMechanisms, extraUnsupportedMechanisms };
}

export function compareStrategyPlans(
  truth: CorrectedThreePathStrategy,
  implemented: CorrectedThreePathStrategy,
  caseId: string,
): ParityRecord[] {
  const paths: Array<keyof CorrectedThreePathStrategy> = ["DEPENDENT_SYNERGY", "INDEPENDENT_SYNERGY", "HARMONY"];
  return paths.map((pathClass) => {
    const differences = deepDiff(truth[pathClass], implemented[pathClass]);
    return {
      truthRecordId: `${caseId}--${pathClass}`,
      implementedRecordId: `${caseId}--${pathClass}`,
      exactSemanticMatch: differences.length === 0,
      differences,
    };
  });
}

export type ParitySummary = {
  missingTruthMechanisms: number;
  extraUnsupportedMechanisms: number;
  strategySubstitutions: number;
  factualProvenanceViolations: number;
  mechanismExactMatches: number;
  mechanismTotal: number;
  strategyExactMatches: number;
  strategyTotal: number;
};

export function summarizeParity(
  mechanismRecords: ParityRecord[],
  strategyRecords: ParityRecord[],
  extraMechanisms: ParityRecord[],
  missingMechanisms: ParityRecord[],
): ParitySummary {
  return {
    missingTruthMechanisms: missingMechanisms.length,
    extraUnsupportedMechanisms: extraMechanisms.length,
    strategySubstitutions: strategyRecords.filter((r) => !r.exactSemanticMatch).length,
    factualProvenanceViolations: 0,
    mechanismExactMatches: mechanismRecords.filter((r) => r.exactSemanticMatch && r.implementedRecordId).length,
    mechanismTotal: mechanismRecords.filter((r) => r.truthRecordId).length,
    strategyExactMatches: strategyRecords.filter((r) => r.exactSemanticMatch).length,
    strategyTotal: strategyRecords.length,
  };
}
