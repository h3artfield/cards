import assert from "node:assert/strict";
import { sumCollectionHistory } from "./collection-value";

const summed = sumCollectionHistory([
  {
    qty: 2,
    points: [
      { date: "2026-07-01", value: 4 },
      { date: "2026-08-01", value: 5 },
    ],
  },
  {
    qty: 1,
    points: [{ date: "2026-07-15", value: 10 }],
  },
]);

assert.deepEqual(summed, [
  { date: "2026-07-01", value: 8 },
  { date: "2026-07-15", value: 18 },
  { date: "2026-08-01", value: 20 },
]);

assert.deepEqual(sumCollectionHistory([]), []);

console.log("PASS  collection value history sum");
