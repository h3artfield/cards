/**
 * Card Flow V2 regression suite — Directive 005B.
 * Run: npm run card-flow-v2:regression
 */
import { spawnSync } from "child_process";
import { resolve } from "path";

const webRoot = resolve(__dirname, "..");

const suites = [
  { name: "evidence", cmd: "npm run test:card-flow-v2" },
  { name: "identity", cmd: "npm run test:card-flow-v2-identity" },
  { name: "market", cmd: "npm run test:card-flow-v2-market" },
  { name: "audit", cmd: "npm run test:card-flow-v2-audit" },
  { name: "offer-preview", cmd: "npm run test:card-flow-v2-offer-preview" },
  { name: "staff-preservation", cmd: "npm run test:staff-confirmation-preservation" },
  { name: "shadow-reprocess", cmd: "npm run test:shadow-v2-reprocess" },
  { name: "riftbound-knowledge", cmd: "npm run test:riftbound-knowledge" },
  { name: "staff-promotion", cmd: "npx tsx scripts/test-staff-market-promotion.ts" },
  { name: "006j-pricing-readiness", cmd: "npm run test:directive-006j-pricing-readiness" },
  { name: "006k-mtg-pricecharting", cmd: "npm run test:directive-006k-mtg-pricecharting" },
  { name: "006l-pricing-safety", cmd: "npm run test:directive-006l-pricing-safety" },
  { name: "006l-mtg-cross-print", cmd: "npm run test:directive-006l-mtg-cross-print" },
  { name: "006m-staff-workflow", cmd: "npm run test:directive-006m-staff-workflow" },
  { name: "006n-mobile-ui", cmd: "npm run test:directive-006n-mobile-ui" },
  { name: "006o-clerk-workflow", cmd: "npm run test:directive-006o-clerk-workflow" },
  { name: "006p-v2-reprocess", cmd: "npm run test:directive-006p-v2-reprocess" },
  { name: "006q-market-research", cmd: "npm run test:directive-006q-market-research" },
  { name: "006r-pricecharting-warehouse", cmd: "npm run test:directive-006r-pricecharting-warehouse" },
  { name: "006s-pricecharting-coverage", cmd: "npm run test:directive-006s-pricecharting-coverage" },
  { name: "006t-daily-pricecharting", cmd: "npm run test:directive-006t-daily-pricecharting" },
  { name: "006u-price-identity-aliases", cmd: "npm run test:directive-006u-price-identity-aliases" },
  { name: "006v-pricecharting-monitoring", cmd: "npm run test:directive-006v-pricecharting-monitoring" },
  { name: "v2-offer-reason", cmd: "npm run test:v2-offer-reason" },
  { name: "007-offer-influence", cmd: "npm run test:directive-007-offer-influence" },
];

const scenarios = [
  "Grusha reverse holo / normal confusion (market tests #16-17)",
  "She-Hulk MTG foil/nonfoil (identity + scryfall)",
  "Morgan Pokémon exact query (market test #1 + spot-check)",
  "CJ Stroud sports parallel (market test #18)",
  "Slab mismatch critical audit (audit test #8)",
  "V2 offer preview — Grusha blend, Morgan disagreement, CJ Stroud blocked (offer-preview tests)",
  "Staff confirmation preservation across reprocess (006C)",
  "Directive 006J — confirmation-time offer preview refresh",
  "Directive 006K — MTG PriceCharting cross-printing fix (MAR #93)",
  "Directive 006L — pricing safety sweep + MTG cross-print regression",
  "Directive 006M — V2 primary staff workflow (review status, version metadata, review queue)",
  "Directive 006Q — Market Research Assist (manual comps, search links)",
  "Directive 006R — PriceCharting CSV warehouse + price history (MAR #93 vs REX #18)",
  "Morgan/CJ Stroud live regression fixtures",
];

console.log("Card Flow V2 Regression Suite\n");
console.log("Scenarios covered:");
for (const s of scenarios) console.log(`  - ${s}`);
console.log("");

let failed = 0;
for (const suite of suites) {
  process.stdout.write(`Running ${suite.name}… `);
  const result = spawnSync(suite.cmd, {
    cwd: webRoot,
    shell: true,
    stdio: "pipe",
    encoding: "utf8",
  });
  if (result.status === 0) {
    console.log("PASS");
  } else {
    failed++;
    console.log("FAIL");
    if (result.stdout) console.log(result.stdout.slice(-800));
    if (result.stderr) console.error(result.stderr.slice(-400));
  }
}

console.log(`\nRegression: ${failed === 0 ? "ALL PASS" : `${failed} suite(s) FAILED`}`);
process.exit(failed > 0 ? 1 : 0);
