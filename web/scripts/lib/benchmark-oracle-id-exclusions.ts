/**
 * OracleIds reserved by existing benchmarks — expansion and fresh validation must exclude these.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const DATASET_PATHS = [
  "data/oracle-action-eval-development-v25.json",
  "data/oracle-action-eval-development-v26.json",
  "data/oracle-action-eval-validation-v8.json",
  "data/oracle-action-eval-validation-v9.json",
  "data/oracle-action-eval-validation-v10.json",
  "data/oracle-action-eval-validation-v11.json",
  "data/oracle-action-eval-final-blind-v2.json",
  "data/oracle-action-eval-development-generalization-expansion-v1.json",
  "data/oracle-action-eval-development-generalization-expansion-v2.json",
  "data/oracle-action-eval-development-generalization-expansion-v3.json",
  "data/oracle-action-eval-development-generalization-expansion-check-v2.json",
  "data/oracle-action-eval-development-generalization-expansion-v4.json",
  "data/oracle-action-eval-development-generalization-expansion-check-v3.json",
  "data/milestones/rc2-development-planning/development-probe-reserved-oracle-ids.json",
  "data/oracle-action-eval-validation-v12-fresh.json",
];

const PROBE_RESERVED_REL = "data/milestones/rc2-development-planning/development-probe-reserved-oracle-ids.json";

export function loadExcludedOracleIds(cwd = process.cwd(), skipPaths: string[] = []): Set<string> {
  const ids = new Set<string>();
  for (const rel of DATASET_PATHS) {
    if (skipPaths.includes(rel)) continue;
    const path = resolve(cwd, rel);
    if (!existsSync(path)) continue;
    const envelope = JSON.parse(readFileSync(path, "utf8")) as {
      cases?: Array<{ oracleId: string }>;
      oracleIds?: string[];
    };
    for (const c of envelope.cases ?? []) {
      if (c.oracleId) ids.add(c.oracleId);
    }
    for (const id of envelope.oracleIds ?? []) {
      if (id) ids.add(id);
    }
  }
  return ids;
}

export function assertNoOracleIdOverlap(
  cases: Array<{ id: string; oracleId: string; cardName?: string }>,
  excluded: Set<string>,
  label: string,
): void {
  const dupes = cases.filter((c) => excluded.has(c.oracleId));
  if (dupes.length > 0) {
    throw new Error(
      `${label}: ${dupes.length} oracleId overlap(s) with prior benchmarks: ${dupes.slice(0, 5).map((d) => `${d.id}/${d.cardName}`).join(", ")}`,
    );
  }
}
