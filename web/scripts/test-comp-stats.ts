import { aggregateComps, filterOutlierPrices } from "../src/lib/processing/pricing/comp-stats";

const candidates = [
  { price: 48, source: "ebay_sold", title: "Morgan 178" },
  { price: 52, source: "ebay_sold", title: "Morgan 178 holo" },
  { price: 49, source: "ebay_sold", title: "Morgan Team Up" },
  { price: 51, source: "ebay_sold", title: "Morgan holofoil" },
  { price: 100, source: "ebay_sold", title: "Morgan typo listing" },
  { price: 47, source: "ebay_sold", title: "Morgan NM" },
];

const { excluded } = filterOutlierPrices(candidates);
const agg = aggregateComps(candidates);

console.log("Excluded prices:", excluded.map((c) => c.price));
console.log("Market:", agg.marketPrice, agg.compMethod, agg.confidence);

if (agg.compsExcluded.length < 1 || agg.marketPrice < 45 || agg.marketPrice > 55) {
  process.exit(1);
}
console.log("comp-stats OK");
