/**
 * Semantic structure fingerprint for DEV↔HOLDOUT duplicate detection (v6).
 * Strips case identity, commander pins/facts, opaque IDs — compares strategy topology only.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return Object.keys(obj)
      .sort()
      .reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = sortKeys(obj[k]);
        return acc;
      }, {});
  }
  return value;
}

function stripIdentity(snapshot: Record<string, unknown>): Record<string, unknown> {
  const clone = JSON.parse(JSON.stringify(snapshot)) as Record<string, unknown>;
  delete clone.caseId;
  delete clone.commanders;

  const frozenFacts = clone.frozenFacts as Record<string, unknown> | undefined;
  if (frozenFacts) {
    delete frozenFacts.commanderOracleText;
    delete frozenFacts.oracleId;
    delete frozenFacts.scryfallId;
    delete frozenFacts.catalogVersion;
    delete frozenFacts.oracleTextSha256;
    delete frozenFacts.commanderName;
  }

  const lenses = clone.lenses as Record<string, Record<string, unknown>> | undefined;
  if (lenses) {
    for (const lens of Object.values(lenses)) {
      for (const hyp of (lens.hypotheses as Array<Record<string, unknown>>) ?? []) {
        delete hyp.hypothesisId;
        delete hyp.commanderEvidenceRefs;
      }
      for (const pkg of [
        ...((lens.validatedPackages as Array<Record<string, unknown>>) ?? []),
        ...((lens.rejectedPackages as Array<Record<string, unknown>>) ?? []),
      ]) {
        delete pkg.packageRefId;
        delete pkg.hypothesisRef;
      }
      const graph = lens.resourceGraph as { nodes?: Array<Record<string, unknown>>; edges?: Array<Record<string, unknown>> } | undefined;
      for (const node of graph?.nodes ?? []) delete node.nodeId;
      for (const edge of graph?.edges ?? []) {
        delete edge.edgeId;
        delete edge.fromNodeId;
        delete edge.toNodeId;
      }
    }
  }
  return clone;
}

export function normalizeSnapshotForDuplicateCheck(snapshot: Record<string, unknown>): string {
  return JSON.stringify(sortKeys(stripIdentity(snapshot)));
}

export function normalizeSnapshotSemanticTemplate(snapshot: Record<string, unknown>): string {
  return normalizeSnapshotForDuplicateCheck(snapshot);
}

export function loadSnapshotFingerprints(snapshotDir: string, normalizer = normalizeSnapshotSemanticTemplate): Map<string, string> {
  const files = readdirSync(snapshotDir).filter((f) => f.endsWith(".json") && f !== "manifest.json");
  const map = new Map<string, string>();
  for (const file of files) {
    const parsed = JSON.parse(readFileSync(join(snapshotDir, file), "utf8")) as Record<string, unknown>;
    map.set(file, normalizer(parsed));
  }
  return map;
}

export function findNormalizedDuplicates(
  leftDir: string,
  rightDir: string,
  normalizer = normalizeSnapshotSemanticTemplate,
): Array<{ left: string; right: string }> {
  const left = loadSnapshotFingerprints(leftDir, normalizer);
  const right = loadSnapshotFingerprints(rightDir, normalizer);
  const hits: Array<{ left: string; right: string }> = [];
  for (const [lFile, lFp] of left) {
    for (const [rFile, rFp] of right) {
      if (lFp === rFp) hits.push({ left: lFile, right: rFile });
    }
  }
  return hits;
}

/** Legacy v4 normalizer — retained for regression comparison only. */
export function normalizeSnapshotForDuplicateCheckV4(snapshot: Record<string, unknown>): string {
  const clone = JSON.parse(JSON.stringify(snapshot)) as Record<string, unknown>;
  delete clone.caseId;
  delete clone.commanders;
  return JSON.stringify(sortKeys(clone));
}
