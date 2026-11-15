import assert from "node:assert/strict";
import { onTimeRate, rmst15 } from "./goldfish-metrics-v1.1";

assert.equal(rmst15([3, 5, 15, 20]), (3 + 5 + 15 + 15) / 4);
assert.ok(Math.abs(onTimeRate([6, 7, 8, 8], 7.5) - (2 + 0.5 * 2) / 4) < 1e-9);
console.log("goldfish-metrics-v1.1.selftest ok");
