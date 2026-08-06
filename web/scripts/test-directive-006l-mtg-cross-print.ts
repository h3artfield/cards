/**
 * Directive 006L — MTG cross-print pricing regression expansion.
 * Run: npm run test:directive-006l-mtg-cross-print
 */
import { assessMtgPriceChartingProductIdentity } from "../src/lib/card-flow-v2/market/mtg-pricecharting-match";
import { buildSuspectSearchPlan } from "../src/lib/card-flow-v2/market/search-plan-builder";
import { assessMarketComp } from "../src/lib/card-flow-v2/market/comp-matcher";
import type { CardSuspect } from "../src/lib/card-flow-v2/types";
import type { RawMarketComp } from "../src/lib/card-flow-v2/market/types";

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

function mtgSuspect(overrides: Partial<CardSuspect>): CardSuspect {
  return {
    suspectId: "test:mtg",
    category: "mtg",
    label: "Test",
    catalogSource: "scryfall",
    variantTags: [],
    expectedEvidence: [],
    ...overrides,
  };
}

function pcComp(title: string, price = 49.99): RawMarketComp {
  return {
    source: "pricecharting",
    title: `${title} (Ungraded)`,
    price,
    conditionText: "Ungraded",
    rawData: {
      pricingSignal: true,
      product: { "product-name": title },
    },
  };
}

function rejectCrossPrint(label: string, suspect: CardSuspect, wrongTitle: string) {
  const plan = buildSuspectSearchPlan(suspect);
  const identity = assessMtgPriceChartingProductIdentity(plan, wrongTitle);
  assert(!identity.accepted, `${label}: identity rejects wrong printing`);
  const assessment = assessMarketComp(pcComp(wrongTitle), plan);
  assert(
    assessment.status === "rejected",
    `${label}: comp matcher rejects wrong printing`,
  );
}

console.log("Directive 006L — MTG cross-print regression\n");

console.log("1. Ravenous Tyrannosaurus MAR #93 vs REX #18");
rejectCrossPrint(
  "MAR #93 vs #18",
  mtgSuspect({
    suspectId: "scryfall:mar-93:nonfoil",
    label: "Ravenous Tyrannosaurus · Marvel Universe (mar) · #93 · nonfoil",
    canonicalName: "Ravenous Tyrannosaurus",
    setCode: "MAR",
    setName: "Marvel Universe",
    collectorNumber: "93",
    finish: "nonfoil",
  }),
  "Ravenous Tyrannosaurus [Borderless] #18",
);

console.log("\n2. Ravenous Tyrannosaurus MAR #93 vs REX #43");
rejectCrossPrint(
  "MAR #93 vs #43",
  mtgSuspect({
    suspectId: "scryfall:mar-93:nonfoil",
    label: "Ravenous Tyrannosaurus · Marvel Universe (mar) · #93 · nonfoil",
    canonicalName: "Ravenous Tyrannosaurus",
    setCode: "MAR",
    setName: "Marvel Universe",
    collectorNumber: "93",
    finish: "nonfoil",
  }),
  "Ravenous Tyrannosaurus #43",
);

console.log("\n3. The List printing vs origin printing");
rejectCrossPrint(
  "The List vs THB origin",
  mtgSuspect({
    suspectId: "scryfall:plst-thb-113:nonfoil",
    label: "Nyx Lotus · The List (plst) · THB-113 · nonfoil",
    canonicalName: "Nyx Lotus",
    setCode: "PLST",
    setName: "The List",
    collectorNumber: "THB-113",
    finish: "nonfoil",
    variantTags: ["the_list"],
  }),
  "Nyx Lotus THB #113",
);

console.log("\n4. foil vs nonfoil");
{
  const suspect = mtgSuspect({
    suspectId: "scryfall:dom-1:nonfoil",
    label: "Example · Dominaria (dom) · #1 · nonfoil",
    canonicalName: "Example Card",
    setCode: "DOM",
    setName: "Dominaria",
    collectorNumber: "1",
    finish: "nonfoil",
  });
  const plan = buildSuspectSearchPlan(suspect);
  const identity = assessMtgPriceChartingProductIdentity(
    plan,
    "Example Card #1 Foil",
  );
  assert(!identity.accepted, "nonfoil requested rejects foil PC product");
  if (!identity.accepted) {
    assert(
      identity.details.reason === "finish_mismatch",
      "finish mismatch reason",
    );
  }
}

console.log("\n5. borderless vs normal frame (collector mismatch)");
rejectCrossPrint(
  "borderless wrong number",
  mtgSuspect({
    suspectId: "scryfall:neo-123:nonfoil",
    label: "Kaito Shizuki · Kamigawa: Neon Dynasty (neo) · #123 · nonfoil",
    canonicalName: "Kaito Shizuki",
    setCode: "NEO",
    setName: "Kamigawa: Neon Dynasty",
    collectorNumber: "123",
    finish: "nonfoil",
  }),
  "Kaito Shizuki [Borderless] #456",
);

console.log("\n6. Secret Lair vs main set");
rejectCrossPrint(
  "Secret Lair vs main set",
  mtgSuspect({
    suspectId: "scryfall:mkm-50:nonfoil",
    label: "Lightning Bolt · Murders at Karlov Manor (mkm) · #50 · nonfoil",
    canonicalName: "Lightning Bolt",
    setCode: "MKM",
    setName: "Murders at Karlov Manor",
    collectorNumber: "50",
    finish: "nonfoil",
  }),
  "Lightning Bolt Secret Lair #1",
);

console.log("\n7. same name alone is not enough (no collector in PC title)");
{
  const suspect = mtgSuspect({
    suspectId: "scryfall:mar-93:nonfoil",
    label: "Ravenous Tyrannosaurus · MAR · #93",
    canonicalName: "Ravenous Tyrannosaurus",
    setCode: "MAR",
    collectorNumber: "93",
    finish: "nonfoil",
  });
  const plan = buildSuspectSearchPlan(suspect);
  const identity = assessMtgPriceChartingProductIdentity(
    plan,
    "Ravenous Tyrannosaurus",
  );
  assert(!identity.accepted, "name-only PC product rejected for MTG");
  if (!identity.accepted) {
    assert(
      identity.details.reason === "name_only_no_identity",
      "name_only_no_identity reason",
    );
  }
}

console.log(`\n006L cross-print: ${failed === 0 ? "ALL PASS" : `${failed} FAILED`} (${passed} checks)`);
process.exit(failed > 0 ? 1 : 0);
