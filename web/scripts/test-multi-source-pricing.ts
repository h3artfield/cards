#!/usr/bin/env node
/** Smoke test: multi-source comp merge (mock candidates, no API keys). */
import { aggregateComps } from "../src/lib/processing/pricing/comp-stats";

const merged = [
  { price: 32, source: "tcgplayer_market", condition: "holofoil", title: "Morgan" },
  { price: 39.91, source: "pricecharting", condition: "loose", title: "Morgan #178" },
  { price: 35, source: "ebay_listed", title: "Morgan 178 Team Up" },
  { price: 48, source: "ebay_sold", title: "Morgan 178 holo" },
  { price: 52, source: "ebay_sold", title: "Morgan Team Up" },
];

const agg = aggregateComps(merged);
const sources = [...new Set(merged.map((c) => c.source))];

console.log({
  sources,
  primarySource: sources.length > 1 ? "multi_source" : sources[0],
  marketPrice: agg.marketPrice,
  compCount: agg.compCount,
  confidence: agg.confidence,
  method: agg.compMethod,
});

if (sources.length < 3 || agg.marketPrice <= 0 || agg.compCount < 4) {
  console.error("multi-source merge test failed");
  process.exit(1);
}
console.log("multi-source merge OK");
