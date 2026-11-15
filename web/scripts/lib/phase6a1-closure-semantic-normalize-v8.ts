/**
 * Structural topology fingerprint for duplicate detection (v8).
 * Strips ALL commander identity/facts and opaque IDs before comparing strategy shape.
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

function stripForTopologyFingerprint(snapshot: Record<string, unknown>): Record<string, unknown> {
  const clone = JSON.parse(JSON.stringify(snapshot)) as Record<string, unknown>;
  delete clone.caseId;
  delete clone.commanders;
  delete clone.runtimeSchemaVersion;
  delete clone.frozenFacts;
  delete clone.frozenOpportunities;

  const lenses = clone.lenses as Record<string, Record<string, unknown>> | undefined;
  if (lenses) {
    for (const lens of Object.values(lenses)) {
      for (const hyp of (lens.hypotheses as Array<Record<string, unknown>>) ?? []) {
        delete hyp.hypothesisId;
        delete hyp.commanderEvidenceRefs;
        delete hyp.commanderDependencies;
      }
      for (const pkg of [
        ...((lens.validatedPackages as Array<Record<string, unknown>>) ?? []),
        ...((lens.rejectedPackages as Array<Record<string, unknown>>) ?? []),
      ]) {
        delete pkg.packageRefId;
        delete pkg.hypothesisRef;
        delete pkg.commanderDependencies;
      }
      const graph = lens.resourceGraph as { nodes?: Array<Record<string, unknown>>; edges?: Array<Record<string, unknown>> } | undefined;
      for (const node of graph?.nodes ?? []) {
        delete node.nodeId;
      }
      for (const edge of graph?.edges ?? []) {
        delete edge.edgeId;
        delete edge.fromNodeId;
        delete edge.toNodeId;
      }
    }
  }
  return clone;
}

export function normalizeSnapshotStructuralTopology(snapshot: Record<string, unknown>): string {
  return JSON.stringify(sortKeys(stripForTopologyFingerprint(snapshot)));
}

export function loadSnapshotFingerprints(
  snapshotDir: string,
  normalizer = normalizeSnapshotStructuralTopology,
): Map<string, string> {
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
  normalizer = normalizeSnapshotStructuralTopology,
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

export function findIntraDirectoryDuplicates(
  snapshotDir: string,
  normalizer = normalizeSnapshotStructuralTopology,
): Array<{ a: string; b: string }> {
  const fps = loadSnapshotFingerprints(snapshotDir, normalizer);
  const hits: Array<{ a: string; b: string }> = [];
  const entries = [...fps.entries()];
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      if (entries[i][1] === entries[j][1]) hits.push({ a: entries[i][0], b: entries[j][0] });
    }
  }
  return hits;
}

/** v6 normalizer retained for regression comparison only. */
export { normalizeSnapshotForDuplicateCheckV4 } from "./phase6a1-closure-semantic-normalize-v6";
