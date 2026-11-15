#!/usr/bin/env npx tsx
/** Seal reviewed Professor v3 smoke execution pins v2 — run once after stack review, then commit artifact. */
import { writeFileSync } from "node:fs";
import {
  PROFESSOR_V3_SMOKE_EXECUTION_PINS_V2_PATH,
  sealProfessorV3SmokeExecutionPinsV2,
} from "./lib/phase6a1-professor-v3-smoke-material-pins-v2";
import { MILESTONES, sha256File } from "./lib/phase6a1-pinned-implementation-container-v1";

function main() {
  const sealed = sealProfessorV3SmokeExecutionPinsV2();
  writeFileSync(PROFESSOR_V3_SMOKE_EXECUTION_PINS_V2_PATH, JSON.stringify(sealed, null, 2));
  console.log(
    JSON.stringify(
      {
        artifact: PROFESSOR_V3_SMOKE_EXECUTION_PINS_V2_PATH,
        sha256: sha256File(PROFESSOR_V3_SMOKE_EXECUTION_PINS_V2_PATH),
        fileCount: sealed.fileCount,
        stackIdentity: sealed.stackIdentity,
      },
      null,
      2,
    ),
  );
}

main();
