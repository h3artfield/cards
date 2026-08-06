import { readFileSync } from "fs";
import { resolve } from "path";
import { COLLECTIONS } from "../src/lib/firebase/collections";
import { requireFirestore } from "../src/lib/firebase/admin";

function loadEnvLocal() {
  const p = resolve(__dirname, "../.env.local");
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if (process.env[k] == null) process.env[k] = v;
  }
}

async function main() {
  loadEnvLocal();
  const db = requireFirestore();
  const orderId = process.argv[2] ?? "db687efc-1956-419b-bd3f-e998c5871e26";

  const rules = await db.collection(COLLECTIONS.storeRules).get();
  console.log("Store rules:", rules.size);
  for (const d of rules.docs) {
    const r = d.data();
    console.log(JSON.stringify({
      title: r.title,
      type: r.ruleType,
      active: r.active,
      categories: r.appliesToCategories,
      filters: r.structuredFilters,
      text: r.ruleText?.slice(0, 80),
    }));
  }

  const cards = await db
    .collection(COLLECTIONS.cards)
    .where("orderId", "==", orderId)
    .get();
  console.log("\nOrder cards:", cards.size);
  for (const d of cards.docs) {
    const c = d.data();
    const p = c.cardFlowV2OfferPreview;
    console.log({
      name: c.detectedName,
      set: c.setName,
      market: c.marketPrice,
      cash: c.cashOffer,
      status: c.status,
      ruleMatches: c.ruleMatches,
      v2Cash: p?.previewCashOffer,
      v2Rule: p?.pricingRuleApplied,
      v2Action: p?.recommendedAction,
    });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
