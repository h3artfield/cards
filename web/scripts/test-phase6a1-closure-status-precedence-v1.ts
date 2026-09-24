#!/usr/bin/env npx tsx
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CLOSURE_STATUS_PRECEDENCE,
  resolveClosureStatus,
  type ClosureStatus,
} from "./lib/phase6a1-closure-design-v3-matrix";

const SIDEcar = resolve(
  "data/milestones/deck-synthesis/phase6a1-professor-plan-functional-role-closure-design-v3-status-precedence-v1.json",
);
const sidecar = JSON.parse(readFileSync(SIDEcar, "utf8")) as {
  closureStatusPrecedence: ClosureStatus[];
  pairwiseExpectations: Array<{ candidates: ClosureStatus[]; result: ClosureStatus }>;
};

assert.deepEqual(CLOSURE_STATUS_PRECEDENCE, sidecar.closureStatusPrecedence, "TS matrix must match sealed sidecar");

for (const { candidates, result } of sidecar.pairwiseExpectations) {
  assert.equal(resolveClosureStatus(candidates), result, `precedence failed for ${candidates.join(",")}`);
}

assert.equal(resolveClosureStatus(["CLOSED"]), "CLOSED");
assert.equal(resolveClosureStatus(["CLOSED", "GAP_DETECTED"]), "GAP_DETECTED");
assert.equal(resolveClosureStatus(["CLOSED", "HARMONY_UNDERDETERMINED"]), "HARMONY_UNDERDETERMINED");
assert.equal(resolveClosureStatus(["GAP_DETECTED", "HARMONY_UNDERDETERMINED"]), "HARMONY_UNDERDETERMINED");
assert.equal(resolveClosureStatus(["CLOSED", "GAP_DETECTED", "HARMONY_UNDERDETERMINED"]), "HARMONY_UNDERDETERMINED");
assert.equal(
  resolveClosureStatus(["CLOSED", "GAP_DETECTED", "HARMONY_UNDERDETERMINED", "EVIDENCE_INSUFFICIENT"]),
  "EVIDENCE_INSUFFICIENT",
);

for (let i = 0; i < CLOSURE_STATUS_PRECEDENCE.length; i++) {
  for (let j = 0; j < CLOSURE_STATUS_PRECEDENCE.length; j++) {
    const a = CLOSURE_STATUS_PRECEDENCE[i];
    const b = CLOSURE_STATUS_PRECEDENCE[j];
    const resolved = resolveClosureStatus([a, b]);
    assert.equal(resolved, i > j ? a : j > i ? b : a, `pair ${a}+${b}`);
  }
}

console.log(JSON.stringify({ pass: true, testedPairs: sidecar.pairwiseExpectations.length + 28 }, null, 2));
