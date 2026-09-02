/**
 * P0 + Architect ingestion regression on persisted Call-1 fixture (no OpenAI).
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  EXPECTED_REQUIREMENT_IDS_V11,
  regressionArchitectIngestionV11,
} from "./professor-sol-directed-architect-ingestion-v1-1";

function fixturePath(): string {
  const candidates = [
    resolve(process.cwd(), "data/milestones/deck-synthesis/sol-directed-chatterfang-v1/call-1-architect-response.json"),
    resolve(process.cwd(), "web/data/milestones/deck-synthesis/sol-directed-chatterfang-v1/call-1-architect-response.json"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return candidates[0]!;
}

function main() {
  const raw = JSON.parse(readFileSync(fixturePath(), "utf8"));
  const regression = regressionArchitectIngestionV11(raw);
  if (!regression.pass) {
    console.error("FAIL ingestion regression:", regression.failures);
    process.exit(1);
  }

  assert.deepEqual(regression.requirementIds, [...EXPECTED_REQUIREMENT_IDS_V11]);
  assert.equal(regression.nonlandSum, 63);
  assert.equal(regression.landTarget, 36);

  console.log("PASS architect ingestion regression — 10 real requirements, 63/36 budget preserved");
  console.log("ALL PASS — professor-sol-directed-architect-ingestion-v1-1");
}

main();
