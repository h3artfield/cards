#!/usr/bin/env npx tsx
/** Independent closure adjudication author v4 — reads semantic snapshots ONLY + design matrix v3. */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { LENSES } from "./lib/phase6a1-closure-design-v3-matrix";
import {
  adjudicateLens,
  validateRepairTargets,
  validateSnapshotGraph,
  type SemanticSnapshot,
} from "./lib/phase6a1-closure-semantic-inference-v3";

const OUT = resolve("data/milestones/deck-synthesis");

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function authorIndependentAdjudicationV4(
  snapshotDir: string,
  outputPath: string,
  snapshotManifestSha256: string,
  versionLabel: string,
): string {
  const manifest = JSON.parse(readFileSync(join(snapshotDir, "manifest.json"), "utf8")) as {
    cases: Array<{ caseId: string; artifact: string }>;
  };

  const cases = manifest.cases.map((entry) => {
    const snapshot = JSON.parse(readFileSync(join(snapshotDir, entry.artifact), "utf8")) as SemanticSnapshot;
    const graphErrors = validateSnapshotGraph(snapshot);
    if (graphErrors.length > 0) throw new Error(`Graph validation failed for ${entry.caseId}: ${graphErrors.join("; ")}`);

    const lenses = Object.fromEntries(
      LENSES.map((lens) => {
        const result = adjudicateLens(snapshot, lens);
        const rtErrors = validateRepairTargets(snapshot, lens, result.repairTargets);
        if (rtErrors.length > 0) throw new Error(`Repair target validation failed for ${entry.caseId}/${lens}: ${rtErrors.join("; ")}`);
        return [lens, result];
      }),
    );

    return { caseId: entry.caseId, snapshotArtifact: entry.artifact, lenses };
  });

  writeFileSync(
    outputPath,
    JSON.stringify(
      {
        version: versionLabel,
        generatedAt: new Date().toISOString(),
        authoringPolicy: "INDEPENDENT_OF_SNAPSHOT_AUTHOR",
        inputSnapshotManifestSha256: snapshotManifestSha256,
        designArtifact: "phase6a1-professor-plan-functional-role-closure-design-v3.json",
        cases,
      },
      null,
      2,
    ),
  );
  return sha256File(outputPath);
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}` || process.argv[1]?.endsWith("run-phase6a1-closure-independent-adjudication-author-v4.ts")) {
  const devDir = resolve(OUT, "phase6a1-professor-plan-dev36-semantic-closure-input-v4");
  const devManifestSha = sha256File(join(devDir, "manifest.json"));
  authorIndependentAdjudicationV4(
    devDir,
    resolve(OUT, "phase6a1-professor-plan-dev36-semantic-closure-adjudication-v4.json"),
    devManifestSha,
    "phase6a1-professor-plan-dev36-semantic-closure-adjudication-v4",
  );
  console.log("dev36-v4 adjudication written");
}
