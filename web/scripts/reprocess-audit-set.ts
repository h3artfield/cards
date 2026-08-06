/**
 * Reprocess BB-000005 audit set so Firestore snapshots include source health.
 * Run: npm run card-flow-v2:reprocess-audit-set
 * V2-only (no production mutation): npm run card-flow-v2:reprocess-shadow-audit-set
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { dataStore } from "../src/lib/storage/data-store";
import { processCard } from "../src/lib/processing/process-order";
import { runFullCardAnalysis } from "../src/lib/processing/full-analysis";
import { DEFAULT_STORE_ID } from "../src/lib/firebase/collections";
import { LIVE_REGRESSION_CARD_IDS } from "../src/lib/card-flow-v2/regression/live-audit-fixtures";

const EXTRA_CARD_IDS = [
  "a9913433-d799-4bd8-867d-a7866e080668", // Grusha
  "eaa2dce3-07dd-45e1-9457-eb0511827322", // She-Hulk
  ...LIVE_REGRESSION_CARD_IDS,
];

function loadEnvLocal() {
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
  process.env.CARD_FLOW_V2_EVIDENCE_ENABLED = "true";
  process.env.CARD_FLOW_V2_IDENTITY_ENABLED = "true";
  process.env.CARD_FLOW_V2_MARKET_ENABLED = "true";
  process.env.CARD_FLOW_V2_AUDIT_ENABLED = "true";
  process.env.CARD_FLOW_V2_STAFF_CONFIRMATION_ENABLED = "true";
  process.env.CARD_FLOW_V2_OFFER_PREVIEW_ENABLED = "true";
}

async function reprocessCard(
  cardId: string,
  settings: Awaited<ReturnType<typeof dataStore.getSettings>>,
  rules: Awaited<ReturnType<typeof dataStore.getActiveRules>>,
) {
  const card = await dataStore.getCard(cardId);
  if (!card) {
    console.log(`  skip ${cardId} — not found`);
    return null;
  }

  const base = await processCard(
    { ...card, staffDecision: undefined, status: "processing" },
    settings,
    rules,
  );
  const { card: analyzed } = await runFullCardAnalysis(base, { rules, settings });
  const toSave = {
    ...analyzed,
    id: card.id,
    orderId: card.orderId,
    createdAt: card.createdAt,
    frontImageUrl: analyzed.frontImageUrl ?? card.frontImageUrl,
    backImageUrl: analyzed.backImageUrl ?? card.backImageUrl ?? "",
  };
  await dataStore.saveCard(toSave);

  const primary = toSave.cardFlowV2Market?.snapshots[0];
  const preview = toSave.cardFlowV2OfferPreview;
  return {
    id: cardId,
    name: toSave.detectedName,
    staffConfirmed: Boolean(toSave.cardFlowV2Identity?.staffSelection?.suspectId),
    preservation: toSave.cardFlowV2Identity?.staffConfirmationPreservation?.status,
    hasSourceHealth: Boolean(primary?.sourceHealth?.length),
    pricingMethod: primary?.pricingMethod,
    shadowMedian: primary?.valueMedian,
    pricingSignals: primary?.marketOutcome?.pricingSignals ?? 0,
    soldComps: primary?.marketOutcome?.acceptedSoldComps ?? 0,
    offerPreviewEligible: preview?.eligible,
    offerPreviewBasis: preview?.marketDecision.basis,
    offerPreviewBlockers: preview?.marketDecision.blockers,
    previewMarket: preview?.previewMarketValue,
    previewCash: preview?.previewCashOffer,
    productionMarket: toSave.marketPrice,
    productionCash: toSave.cashOffer,
    productionTrade: toSave.tradeOffer,
    productionStatus: toSave.status,
  };
}

async function main() {
  loadEnvLocal();

  const orders = await dataStore.getOrders();
  const bbOrder = orders.find((o) => o.orderNumber === "BB-000005");
  const cardIds = new Set<string>(EXTRA_CARD_IDS);

  if (bbOrder) {
    const orderCards = await dataStore.getCardsByOrder(bbOrder.id);
    for (const c of orderCards) cardIds.add(c.id);
    console.log(`BB-000005: ${orderCards.length} cards`);
  } else {
    console.log("BB-000005 not found — reprocessing extra card IDs only");
  }

  const allCards = await Promise.all(
    [...cardIds].map((id) => dataStore.getCard(id)),
  );
  const slab = allCards.find((c) => c?.itemType === "graded");
  if (slab) cardIds.add(slab.id);

  const storeId = bbOrder?.storeId?.trim() || DEFAULT_STORE_ID;
  const [settings, rules] = await Promise.all([
    dataStore.getSettings(storeId),
    dataStore.getActiveRules(storeId),
  ]);

  console.log(`Reprocessing ${cardIds.size} cards…\n`);
  const results = [];
  for (const id of cardIds) {
    console.log(`→ ${id}`);
    const r = await reprocessCard(id, settings, rules);
    if (r) results.push(r);
  }

  console.log("\n=== Reprocess summary ===");
  console.log(JSON.stringify(results, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
