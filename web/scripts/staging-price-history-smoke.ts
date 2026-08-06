/**
 * Staging smoke — PriceCharting v2-price-history warehouse checks + card alias lookup.
 * Run: npx tsx scripts/staging-price-history-smoke.ts [--staging-url URL]
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { buildCardPriceHistoryResponse } from "../src/lib/prices/price-history";
import { priceWarehouseStore } from "../src/lib/prices/price-warehouse-store";
import { resolveCardPriceHistoryLookup } from "../src/lib/prices/resolve-price-history-lookup";
import { dataStore } from "../src/lib/storage/data-store";

function loadEnvLocal() {
  for (const line of readFileSync(resolve(__dirname, "../.env.local"), "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const k = t.slice(0, eq).trim();
    if (!process.env[k]) process.env[k] = t.slice(eq + 1).trim();
  }
}

const CARD_IDS = {
  grusha: "a9913433-d799-4bd8-867d-a7866e080668",
  ravenousMar: "579ba1f4-6106-4716-9c94-a0130be39ea3",
};

const WAREHOUSE_SAMPLES = [
  { label: "Grusha reverse holo", key: "pokemon|paldea-evolved|184|reverse_holo|en", min: 1 },
  { label: "Argentum PLST", key: "mtg|PLST|198|nonfoil|normal|en", min: 1 },
  { label: "REX #18", key: "mtg|REX|18|nonfoil|normal|en", min: 1 },
  { label: "MAR #93", key: "mtg|MAR|93|nonfoil|normal|en", min: 0 },
  { label: "One Piece OP07-002", key: "onepiece|500-years-in-the-future|OP07-002|en", min: 1 },
  { label: "Yu-Gi-Oh STAS-EN008", key: "yugioh|2-player-starter-set|STAS-EN008|en", min: 1 },
];

async function main() {
  loadEnvLocal();
  console.log("=== Price History Smoke Tests ===\n");

  let failed = 0;

  for (const s of WAREHOUSE_SAMPLES) {
    const snaps = await priceWarehouseStore.listSnapshotsByIdentityKey(s.key);
    const history = buildCardPriceHistoryResponse({ identityKey: s.key, snapshots: snaps });
    const point = history.series[0]?.points[0];
    let pass = snaps.length >= s.min;

    if (s.label === "MAR #93") {
      const rex = await priceWarehouseStore.listSnapshotsByIdentityKey(
        "mtg|REX|18|nonfoil|normal|en",
      );
      pass = snaps.length === 0 && rex.length >= 1;
    }

    console.log(
      `${pass ? "PASS" : "FAIL"} ${s.label}: ${snaps.length} snapshot(s)` +
        (point ? ` — $${point.value} on ${point.date}` : "") +
        (history.trend.sampleCount === 1 ? " (trend: 1 snapshot, multi-day unavailable)" : ""),
    );
    if (!pass) failed++;
  }

  console.log("\n--- Card identity → warehouse (Grusha + Ravenous) ---");
  for (const [name, cardId] of Object.entries(CARD_IDS)) {
    const card = await dataStore.getCard(cardId);
    if (!card) {
      console.log(`SKIP ${name}: card ${cardId} not found`);
      continue;
    }
    const lookup = resolveCardPriceHistoryLookup({
      card,
      identity: card.cardFlowV2Identity,
    });
    const snaps = await priceWarehouseStore.listSnapshotsByIdentityKeys(lookup.lookupKeys);
    const matchedKeys = [...new Set(snaps.map((s) => s.identityKey))];
    const history = buildCardPriceHistoryResponse({
      identityKey: lookup.requestedIdentityKey ?? lookup.lookupKeys[0] ?? "",
      requestedIdentityKey: lookup.requestedIdentityKey ?? undefined,
      lookupKeys: lookup.lookupKeys,
      matchedKeys,
      snapshots: snaps,
    });
    const point = history.series[0]?.points[0];

    console.log(
      `${name}: requested=${lookup.requestedIdentityKey ?? "null"} lookupKeys=${lookup.lookupKeys.length} matched=${matchedKeys.join(",") || "none"} → ${snaps.length} PC snapshot(s)` +
        (point ? ` $${point.value}` : ""),
    );

    if (name === "grusha") {
      const pass =
        snaps.length >= 1 &&
        matchedKeys.includes("pokemon|paldea-evolved|184|reverse_holo|en") &&
        point?.value === 0.12;
      console.log(
        pass
          ? "  PASS: sv2 card identity resolves paldea-evolved warehouse key ($0.12)"
          : "  FAIL: Grusha alias lookup did not find $0.12 via paldea-evolved",
      );
      if (!pass) failed++;
    }
    if (name === "ravenousMar" && snaps.length !== 0) failed++;
  }

  const ravenous = await dataStore.getCard(CARD_IDS.ravenousMar);
  if (ravenous) {
    console.log(
      `\nRavenous production unchanged: market=${ravenous.marketPrice} cash=${ravenous.cashOffer}`,
    );
  }

  console.log(`\n${failed === 0 ? "ALL PASS" : `${failed} FAILED`}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
