#!/usr/bin/env npx tsx
/** Offline adjudication of spent Yuriko attempt-003 grounding failures — 0 OpenAI calls. */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { adjudicateProfessorV3YurikoSpentGroundingFailuresV1 } from "./lib/phase6a1-professor-v3-yuriko-grounding-adjudication-v1";
import { MILESTONES } from "./lib/phase6a1-pinned-implementation-container-v1";

async function main() {
  const result = await adjudicateProfessorV3YurikoSpentGroundingFailuresV1({ attemptId: "003" });
  const outPath = resolve(
    MILESTONES,
    "phase6a1-professor-v3-yuriko-spent-grounding-adjudication-v1.json",
  );
  writeFileSync(outPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ outPath, ...result.interpretation, bucketCounts: result.bucketCounts }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
