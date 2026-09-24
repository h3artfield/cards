#!/usr/bin/env npx tsx
/**
 * Freeze P11 independent adjudication artifact (verbatim).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const OUT_FROZEN_ADJ = resolve("data/milestones/deck-synthesis/phase6a1-p11-spec-correction-adjudication-frozen-v1.json");
const OUT_OVERLAY_APPLIED = resolve("data/milestones/deck-synthesis/phase6a1-p11-spec-correction-overlay-applied-v1.2.json");

function main() {
  const srcPath = resolve(process.argv[2] ?? "c:/Users/h3art/Downloads/phase6a1-p11-spec-correction-independent-adjudication-gpt56sol-v1.json");
  const source = JSON.parse(readFileSync(srcPath, "utf8")) as Record<string, unknown>;

  writeFileSync(
    OUT_FROZEN_ADJ,
    JSON.stringify(
      {
        version: "phase6a1-p11-spec-correction-adjudication-frozen-v1",
        frozenAt: new Date().toISOString(),
        sourceArtifact: srcPath,
        ...source,
        reviewStatus: "FROZEN_INDEPENDENT_ADJUDICATION",
      },
      null,
      2,
    ),
  );

  const summary = source.independentAdjudicationSummary as Record<string, number> | undefined;
  console.log(`Wrote ${OUT_FROZEN_ADJ}`);
  if (summary) console.log("Adjudication summary:", summary);
}

main();
