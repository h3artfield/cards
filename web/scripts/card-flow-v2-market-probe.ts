/**
 * Directive 005C — known-card market source health probe.
 * Run: npm run card-flow-v2:market-probe
 * Optional: --card-id <uuid> loads suspects from stored card identity.
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import type { CardSuspect } from "../src/lib/card-flow-v2/types";
import { buildSuspectSearchPlan } from "../src/lib/card-flow-v2/market/search-plan-builder";
import { buildCandidateMarketSnapshot } from "../src/lib/card-flow-v2/market/value-calculator";
import { runEbayApiDiagnostic } from "../src/lib/processing/pricing/ebay-comps";
import { dataStore } from "../src/lib/storage/data-store";
import type { CandidateMarketSnapshot } from "../src/lib/card-flow-v2/market/types";

function loadEnvLocal() {
  try {
    const p = resolve(__dirname, "../.env.local");
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      if (process.env[key] == null) {
        process.env[key] = trimmed.slice(eq + 1).trim();
      }
    }
  } catch {
    /* optional */
  }
}

const PROBE_SUSPECTS: Array<{ label: string; suspect: CardSuspect }> = [
  {
    label: "Grusha 184/193 reverse holo",
    suspect: {
      suspectId: "pokemon_tcg:sv2-184:reverse_holo",
      category: "pokemon",
      label: "Grusha 184 reverse holo",
      catalogSource: "pokemon_tcg",
      canonicalName: "Grusha",
      setName: "Paldea Evolved",
      setCode: "sv2",
      collectorNumber: "184",
      finish: "reverse_holo",
      variantTags: ["reverse_holo"],
      expectedEvidence: [],
    },
  },
  {
    label: "Grusha 184/193 normal",
    suspect: {
      suspectId: "pokemon_tcg:sv2-184:normal",
      category: "pokemon",
      label: "Grusha 184 normal",
      catalogSource: "pokemon_tcg",
      canonicalName: "Grusha",
      setName: "Paldea Evolved",
      setCode: "sv2",
      collectorNumber: "184",
      finish: "normal",
      variantTags: [],
      expectedEvidence: [],
    },
  },
  {
    label: "She-Hulk MSH #188 foil",
    suspect: {
      suspectId: "mtg:msh-188:foil",
      category: "mtg",
      label: "She-Hulk MSH 188 foil",
      catalogSource: "scryfall",
      canonicalName: "She-Hulk",
      setName: "Marvel Super Heroes",
      setCode: "msh",
      collectorNumber: "188",
      finish: "foil",
      variantTags: ["foil"],
      expectedEvidence: [],
    },
  },
  {
    label: "She-Hulk MSH #188 nonfoil",
    suspect: {
      suspectId: "mtg:msh-188:normal",
      category: "mtg",
      label: "She-Hulk MSH 188 nonfoil",
      catalogSource: "scryfall",
      canonicalName: "She-Hulk",
      setName: "Marvel Super Heroes",
      setCode: "msh",
      collectorNumber: "188",
      finish: "normal",
      variantTags: [],
      expectedEvidence: [],
    },
  },
  {
    label: "Morgan Team Up 178/181",
    suspect: {
      suspectId: "pokemon_tcg:sv3pt5-178:normal",
      category: "pokemon",
      label: "Morgan 178",
      catalogSource: "pokemon_tcg",
      canonicalName: "Morgan",
      setName: "151",
      setCode: "sv3pt5",
      collectorNumber: "178",
      finish: "normal",
      variantTags: [],
      expectedEvidence: [],
    },
  },
  {
    label: "CJ Stroud Silver Prizm #339",
    suspect: {
      suspectId: "sports:2023-prizm-339:silver",
      category: "sports",
      label: "CJ Stroud Silver Prizm 339",
      catalogSource: "pricecharting",
      canonicalName: "CJ Stroud",
      setName: "2023 Panini Prizm",
      collectorNumber: "339",
      finish: "silver",
      variantTags: ["prizm", "silver"],
      expectedEvidence: [],
    },
  },
];

function printSourceHealth(h: CandidateMarketSnapshot["sourceHealth"][number]) {
  console.log(`  ${h.source}:`);
  console.log(`    attempted: ${h.attempted}`);
  if (h.apiPath) console.log(`    apiPath: ${h.apiPath}`);
  if (h.httpStatus != null) console.log(`    httpStatus: ${h.httpStatus}`);
  if (h.query) console.log(`    query: ${h.query}`);
  if (h.productId) console.log(`    productId: ${h.productId}`);
  if (h.catalogId) console.log(`    catalogId: ${h.catalogId}`);
  console.log(
    `    raw: ${h.rawResultCount} · norm: ${h.normalizedResultCount} · accepted: ${h.acceptedCount} · maybe: ${h.maybeCount} · rejected: ${h.rejectedCount} · signals: ${h.priceSignalsFound}`,
  );
  if (h.fatalError) console.log(`    fatalError: ${h.fatalError}`);
  if (h.reasonIfSkipped) console.log(`    reasonIfSkipped: ${h.reasonIfSkipped}`);
  for (const w of h.warnings.slice(0, 3)) console.log(`    warning: ${w}`);
}

function printSnapshot(label: string, snap: CandidateMarketSnapshot) {
  console.log(`\n--- ${label} ---`);
  console.log(`Outcome: ${snap.marketOutcome.summaryLabel}`);
  console.log(
    `Sold comps: ${snap.marketOutcome.acceptedSoldComps} · Maybe: ${snap.marketOutcome.maybeListings} · Rejected: ${snap.marketOutcome.rejectedListings} · Pricing signals: ${snap.marketOutcome.pricingSignals}`,
  );
  if (snap.valueMedian != null) {
    console.log(
      `Shadow value: $${snap.valueLow?.toFixed(2)} – $${snap.valueHigh?.toFixed(2)} (${snap.confidence})`,
    );
  }
  console.log("Source health:");
  for (const h of snap.sourceHealth) printSourceHealth(h);

  if (snap.tcgplayerMapping) {
    const t = snap.tcgplayerMapping;
    console.log("TCGplayer:");
    console.log(`  productId: ${t.productId ?? "—"}`);
    console.log(`  subtype: ${t.subtype ?? "—"}`);
    if (t.marketPrice != null) console.log(`  marketPrice: $${t.marketPrice}`);
    if (t.reasonIfSkipped) console.log(`  skipped: ${t.reasonIfSkipped}`);
    if (t.error) console.log(`  error: ${t.error}`);
  }

  if (snap.priceChartingMapping) {
    const p = snap.priceChartingMapping;
    console.log("PriceCharting:");
    console.log(`  productId: ${p.productId ?? "—"}`);
    console.log(`  query: ${p.queryUsed ?? "—"}`);
    console.log(`  tierSelected: ${p.tierSelected ?? "—"}`);
    if (p.loosePrice != null) console.log(`  loosePrice: $${p.loosePrice}`);
    if (p.tiersExcluded.length) {
      console.log(`  tiersExcluded: ${p.tiersExcluded.join(", ")}`);
    }
    if (p.reasonIfSkipped) console.log(`  skipped: ${p.reasonIfSkipped}`);
  }

  if (snap.queryAudits.length) {
    console.log("Query audits:");
    for (const q of snap.queryAudits.slice(0, 6)) {
      console.log(
        `  [${q.source}] ${q.purpose}: "${q.query}" raw=${q.rawResults} ✓${q.accepted} ?${q.maybe} ✗${q.rejected}${q.fatalError ? ` err=${q.fatalError}` : ""}`,
      );
    }
  }

  const ebaySold = snap.sourceHealth.find((h) => h.source === "ebay_sold");
  const ebayActive = snap.sourceHealth.find((h) => h.source === "ebay_active");
  const tcg = snap.sourceHealth.find((h) => h.source === "tcgplayer");
  const pc = snap.sourceHealth.find((h) => h.source === "pricecharting");

  console.log("\nProbe answers:");
  console.log(
    `  eBay sold reachable: ${ebaySold?.attempted && !ebaySold.fatalError ? "yes" : ebaySold?.fatalError === "authorization_or_scope_failure" ? "no (403 auth)" : ebaySold?.attempted ? "attempted with error" : "no"}`,
  );
  console.log(
    `  eBay active reachable: ${ebayActive?.attempted && !ebayActive.fatalError ? "yes" : "no"}`,
  );
  console.log(
    `  TCGplayer mapped: ${tcg?.productId ? "yes" : tcg?.reasonIfSkipped ?? tcg?.fatalError ?? "no"}`,
  );
  console.log(
    `  PriceCharting mapped: ${pc?.catalogId || pc?.priceSignalsFound ? "yes" : pc?.reasonIfSkipped ?? "no"}`,
  );
}

async function main() {
  loadEnvLocal();
  process.env.CARD_FLOW_V2_MARKET_ENABLED = "true";

  const cardIdArg = process.argv.indexOf("--card-id");
  const cardId =
    cardIdArg >= 0 ? process.argv[cardIdArg + 1] : undefined;

  console.log("=== eBay API diagnostic ===");
  const ebayDiag = await runEbayApiDiagnostic();
  console.log(`Configured: ${ebayDiag.configured}`);
  console.log(`EBAY_CLIENT_ID set: ${ebayDiag.hasClientId}`);
  console.log(`EBAY_CLIENT_SECRET set: ${ebayDiag.hasClientSecret}`);
  console.log(`Token mint OK: ${ebayDiag.tokenMintOk}`);
  console.log(`Sold API path: ${ebayDiag.soldApiPath}`);
  console.log(`Active API path: ${ebayDiag.activeApiPath}`);
  console.log(
    `Browse API: ${ebayDiag.browseWorks ? "OK" : "fail"}${ebayDiag.browseStatus != null ? ` (${ebayDiag.browseStatus})` : ""}`,
  );
  console.log(
    `Marketplace Insights: ${ebayDiag.insightsWorks ? "OK" : "fail"}${ebayDiag.insightsStatus != null ? ` (${ebayDiag.insightsStatus})` : ""}`,
  );
  console.log(`Token scopes granted: ${ebayDiag.tokenScopesGranted ?? "unknown"}`);
  console.log(`Insights conclusion: ${ebayDiag.insightsConclusion ?? "?"}`);
  if (ebayDiag.insightsErrorBody) {
    console.log(`Insights 403 body: ${ebayDiag.insightsErrorBody.slice(0, 300)}`);
  }
  for (const n of ebayDiag.notes) console.log(`Note: ${n}`);

  let probes = PROBE_SUSPECTS;

  if (cardId) {
    const card = await dataStore.getCard(cardId);
    if (!card?.cardFlowV2Identity?.suspects.length) {
      throw new Error(`Card ${cardId} has no V2 suspects`);
    }
    probes = card.cardFlowV2Identity.suspects.map((s) => ({
      label: s.label,
      suspect: s,
    }));
    console.log(`\nLoaded ${probes.length} suspect(s) from card ${cardId}`);
  }

  console.log("\n=== Market source health probe ===");
  for (const { label, suspect } of probes) {
    const plan = buildSuspectSearchPlan(suspect);
    const snap = await buildCandidateMarketSnapshot(plan);
    printSnapshot(label, snap);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
