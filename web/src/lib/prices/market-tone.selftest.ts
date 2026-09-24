import assert from "node:assert/strict";
import {
  marketToneFromPoints,
  monthlySalesFromPoints,
  type MarketTonePoint,
} from "./market-tone";

function series(start: string, values: number[], volumes?: number[]): MarketTonePoint[] {
  const [year, month, day] = start.split("-").map(Number);
  const origin = new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1));
  return values.map((value, index) => {
    const date = new Date(origin);
    date.setUTCDate(origin.getUTCDate() + index);
    return {
      date: date.toISOString().slice(0, 10),
      value,
      volume: volumes?.[index],
    };
  });
}

assert.equal(marketToneFromPoints(series("2026-07-01", [10, 10.1])), null);

const climb = Array.from({ length: 40 }, (_, i) => 8 + i * 0.15);
assert.equal(marketToneFromPoints(series("2026-07-01", climb)), "highly_up");

const dip = Array.from({ length: 40 }, (_, i) => 12 - i * 0.12);
assert.equal(marketToneFromPoints(series("2026-07-01", dip)), "highly_down");

const latePop = [
  ...Array.from({ length: 32 }, () => 10.05),
  10.1, 10.15, 10.2, 10.4, 10.5, 10.6, 10.8, 11,
];
assert.equal(marketToneFromPoints(series("2026-07-01", latePop)), "up");

const lateDrop = [
  ...Array.from({ length: 32 }, () => 9.95),
  9.9, 9.8, 9.7, 9.5, 9.4, 9.3, 9.2, 9,
];
assert.equal(marketToneFromPoints(series("2026-07-01", lateDrop)), "down");

const flat = Array.from({ length: 40 }, () => 10);
assert.equal(marketToneFromPoints(series("2026-07-01", flat)), null);

const rebound = [
  ...Array.from({ length: 20 }, (_, i) => 12 - i * 0.15),
  ...Array.from({ length: 20 }, (_, i) => 9 + i * 0.12),
];
assert.equal(marketToneFromPoints(series("2026-07-01", rebound)), "up");

const spikeThenDip = [
  ...Array.from({ length: 32 }, (_, i) => 4.3 + (i * 1.2) / 31),
  6.0, 6.2, 6.3, 6.2, 6.1, 6.0, 5.95, 5.87,
];
assert.equal(
  marketToneFromPoints(series("2026-07-01", spikeThenDip)),
  "up",
  "a 2% weekly pullback must not beat a strong 30-day rise",
);

const risingVolume = series(
  "2026-07-01",
  Array.from({ length: 40 }, () => 5),
  Array.from({ length: 40 }, (_, i) => 100 + i * 3),
);
const risingMonths = monthlySalesFromPoints(risingVolume);
assert.equal(risingMonths?.kind, "estimated_sales");
assert.ok((risingMonths?.buckets.length ?? 0) >= 2);
assert.equal(
  risingMonths?.buckets.reduce((sum, bucket) => sum + bucket.sales, 0),
  39 * 3,
);

const flatVolume = series(
  "2026-07-01",
  Array.from({ length: 40 }, () => 5),
  Array.from({ length: 40 }, () => 235),
);
const flatMonths = monthlySalesFromPoints(flatVolume);
assert.equal(flatMonths?.kind, "reported_volume");
assert.ok(flatMonths?.buckets.every((bucket) => bucket.sales === 235));

console.log("PASS  market tone two-look 4-point scale");
