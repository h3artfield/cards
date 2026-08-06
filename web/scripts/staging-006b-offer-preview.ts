/**
 * Directive 006B — re-confirm Grusha + compute offer previews for validation cards.
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { dataStore } from "../src/lib/storage/data-store";
import {
  applyStaffSuspectSelection,
} from "../src/lib/card-flow-v2/staff-suspect-selection";
import {
  promoteStaffConfirmedMarket,
} from "../src/lib/card-flow-v2/market/promote-staff-confirmed-market";
import { runCardOfferPreviewV2 } from "../src/lib/card-flow-v2/offer/run-card-offer-preview-v2";
import { buildMarketValueDecision } from "../src/lib/card-flow-v2/offer/market-value-decision";
import type { ScannedCard } from "../src/lib/types";
import {
  buildMorganRegressionCard,
  buildCjStroudRegressionCard,
} from "../src/lib/card-flow-v2/regression/live-audit-fixtures";
import { DEFAULT_STORE_ID } from "../src/lib/firebase/collections";
import { DEFAULT_STORE_SETTINGS } from "../src/lib/constants";

const GRUSHA_ID = "a9913433-d799-4bd8-867d-a7866e080668";
const REVERSE_SUSPECT_ID = "pokemon_tcg:sv2-184:reverse_holo";

function formatPreview(card: ScannedCard) {
  const preview = card.cardFlowV2OfferPreview;
  const md = preview?.marketDecision;
  return {
    cardId: card.id,
    name: card.detectedName,
    identityBasis: preview?.identityBasis,
    eligible: preview?.eligible,
    basis: md?.basis,
    marketValue: md?.marketValue,
    confidence: md?.confidence,
    blockers: md?.blockers,
    recommendedAction: preview?.recommendedAction,
    tcg: md?.sourceValues.find((s) => s.source === "tcgplayer")?.value,
    pc: md?.sourceValues.find((s) => s.source === "pricecharting")?.value,
  };
}

function loadEnv() {
  const p = resolve(__dirname, "../.env.local");
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const k = t.slice(0, eq).trim();
    if (process.env[k] == null) process.env[k] = t.slice(eq + 1).trim();
  }
  for (const f of [
    "CARD_FLOW_V2_EVIDENCE_ENABLED",
    "CARD_FLOW_V2_IDENTITY_ENABLED",
    "CARD_FLOW_V2_MARKET_ENABLED",
    "CARD_FLOW_V2_AUDIT_ENABLED",
    "CARD_FLOW_V2_STAFF_CONFIRMATION_ENABLED",
    "CARD_FLOW_V2_OFFER_PREVIEW_ENABLED",
  ]) {
    process.env[f] = "true";
  }
}

async function confirmGrusha() {
  const card = await dataStore.getCard(GRUSHA_ID);
  if (!card?.cardFlowV2Identity || !card.cardFlowV2Market) {
    throw new Error("Grusha missing V2 bundles");
  }
  const suspect = card.cardFlowV2Identity.suspects.find(
    (s) => s.suspectId === REVERSE_SUSPECT_ID,
  );
  if (!suspect) throw new Error("Reverse holo suspect missing");

  const identity = applyStaffSuspectSelection(card.cardFlowV2Identity, {
    suspectId: REVERSE_SUSPECT_ID,
    confirmedBy: "directive-006b-validation",
    notes: "Re-confirmed after reprocess for offer preview validation",
  });
  const { market: promotedMarket } = await promoteStaffConfirmedMarket({
    market: card.cardFlowV2Market,
    suspect,
    confirmedBy: "directive-006b-validation",
  });

  const settings = await dataStore.getSettings(
    card.orderId ? (await dataStore.getOrder(card.orderId))?.storeId ?? DEFAULT_STORE_ID : DEFAULT_STORE_ID,
  );
  const rules = await dataStore.getActiveRules(settings.id);

  const updated = {
    ...card,
    cardFlowV2Identity: identity,
    cardFlowV2Market: promotedMarket,
    cardFlowV2OfferPreview: runCardOfferPreviewV2({
      card: { ...card, cardFlowV2Identity: identity, cardFlowV2Market: promotedMarket },
      identity,
      market: promotedMarket,
      settings,
      rules,
    }),
  };
  await dataStore.saveCard(updated);
  return updated;
}

async function main() {
  loadEnv();

  const orders = await dataStore.getOrders();
  const allCards: import("../src/lib/types").ScannedCard[] = [];
  for (const o of orders) {
    allCards.push(...(await dataStore.getCardsByOrder(o.id)));
  }

  const find = (re: RegExp) =>
    allCards.find((c) => re.test(c.detectedName ?? ""));

  console.log("=== Re-confirming Grusha reverse holo ===");
  const grusha = await confirmGrusha();
  const grushaPreview = grusha.cardFlowV2OfferPreview!;
  console.log(JSON.stringify({
    name: "Grusha",
    identityBasis: grushaPreview.identityBasis,
    eligible: grushaPreview.eligible,
    basis: grushaPreview.marketDecision.basis,
    marketValue: grushaPreview.marketDecision.marketValue,
    confidence: grushaPreview.marketDecision.confidence,
    blockers: grushaPreview.marketDecision.blockers,
    recommendedAction: grushaPreview.recommendedAction,
    tcg: grushaPreview.marketDecision.sourceValues.find((s) => s.source === "tcgplayer")?.value,
    pc: grushaPreview.marketDecision.sourceValues.find((s) => s.source === "pricecharting")?.value,
    previewCash: grushaPreview.previewCashOffer,
    previewTrade: grushaPreview.previewTradeOffer,
    productionCash: grusha.cashOffer,
    productionTrade: grusha.tradeOffer,
  }, null, 2));

  const sheHulk = await dataStore.getCard("eaa2dce3-07dd-45e1-9457-eb0511827322");
  const morgan = find(/morgan/i);
  const cjStroud = find(/cj stroud|stroud/i);
  const slab = allCards.find((c) => c.itemType === "graded");

  const settings = await dataStore.getSettings(DEFAULT_STORE_ID);
  const rules = await dataStore.getActiveRules(DEFAULT_STORE_ID);

  for (const [label, card] of [
    ["She-Hulk", sheHulk],
    ["Morgan", morgan],
    ["CJ Stroud", cjStroud],
    ["Slab", slab],
  ] as const) {
    if (!card) {
      console.log(`\n${label}: not found in Firestore — using probe decision`);
      continue;
    }
    const preview =
      card.cardFlowV2OfferPreview ??
      runCardOfferPreviewV2({ card, settings, rules });
    const md = preview?.marketDecision ?? buildMarketValueDecision({
      identity: card.cardFlowV2Identity,
      market: card.cardFlowV2Market,
      itemType: card.itemType,
    });
    console.log(`\n=== ${label} (${card.id}) ===`);
    console.log(JSON.stringify({
      identityBasis: preview?.identityBasis,
      eligible: preview?.eligible ?? md.usableForOfferPreview,
      basis: md.basis,
      marketValue: md.marketValue,
      confidence: md.confidence,
      blockers: md.blockers,
      recommendedAction: preview?.recommendedAction,
      tcg: md.sourceValues.find((s) => s.source === "tcgplayer")?.value,
      pc: md.sourceValues.find((s) => s.source === "pricecharting")?.value,
      productionMarket: card.marketPrice,
      productionCash: card.cashOffer,
      productionTrade: card.tradeOffer,
      previewCash: preview?.previewCashOffer,
      previewTrade: preview?.previewTradeOffer,
    }, null, 2));
  }

  // Morgan/CJ probe-style decisions when cards not in DB
  if (!morgan) {
    console.log("\n=== Morgan (live regression fixture) ===");
    console.log(JSON.stringify(formatPreview(buildMorganRegressionCard()), null, 2));
  }

  if (!cjStroud) {
    console.log("\n=== CJ Stroud (live regression fixture) ===");
    console.log(JSON.stringify(formatPreview(buildCjStroudRegressionCard()), null, 2));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
