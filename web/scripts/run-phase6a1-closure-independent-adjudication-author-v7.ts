#!/usr/bin/env npx tsx
/** Independent DEV adjudication author v7 — dev-template inference with repaired status precedence. */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { LENSES } from "./lib/phase6a1-closure-design-v3-matrix";
import {
  adjudicateLens,
  validateRepairTargets,
  validateSnapshotGraph,
  type SemanticSnapshot,
} from "./lib/phase6a1-closure-semantic-inference-dev-template-v6";

const OUT = resolve("data/milestones/deck-synthesis");

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export async function authorIndependentAdjudicationV7(
  snapshotDir: string,
  outputPath: string,
  snapshotManifestSha256: string,
  versionLabel: string,
): Promise<string> {
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
        authoringPolicy: "DEV_TEMPLATE_STRUCTURAL_INFERENCE_V7_NOT_PRODUCTION_CLOSURE",
        statusPrecedenceSidecar: "phase6a1-professor-plan-functional-role-closure-design-v3-status-precedence-v1.json",
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
