/**
 * Directive 006B staging validation — offer preview results + safety checks.
 * Run: npx tsx scripts/validate-directive-006b.ts
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { dataStore } from "../src/lib/storage/data-store";
import {
  printAuditSummary,
  summarizeV2Audits,
} from "../src/lib/card-flow-v2/audit/audit-summary";
import { runCardAuditV2 } from "../src/lib/card-flow-v2/audit/run-card-audit-v2";
import { computeCardOfferPreviewV2 } from "../src/lib/card-flow-v2/offer/run-card-offer-preview-v2";
import { DEFAULT_STORE_SETTINGS } from "../src/lib/constants";
import type { ScannedCard } from "../src/lib/types";
import type { V2OfferPreview } from "../src/lib/card-flow-v2/offer/types";

const GRUSHA_ID = "a9913433-d799-4bd8-867d-a7866e080668";
const SHEHULK_ID = "eaa2dce3-07dd-45e1-9457-eb0511827322";

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

function findCard(
  cards: ScannedCard[],
  hints: RegExp[],
): ScannedCard | undefined {
  return cards.find((c) => {
    const hay = [
      c.detectedName,
      c.cardFlowV2Identity?.lockedIdentity.canonicalName,
      c.cardFlowV2Identity?.suspects.map((s) => s.label).join(" "),
    ]
      .filter(Boolean)
      .join(" ");
    return hints.every((h) => h.test(hay));
  });
}

function formatPreview(card: ScannedCard, preview?: V2OfferPreview) {
  const p = preview ?? card.cardFlowV2OfferPreview;
  if (!p) return { cardId: card.id, name: card.detectedName, error: "no preview" };
  const md = p.marketDecision;
  const tcg = md.sourceValues.find((s) => s.source === "tcgplayer");
  const pc = md.sourceValues.find((s) => s.source === "pricecharting");
  return {
    cardId: card.id,
    name: card.detectedName,
    identityBasis: p.identityBasis,
    eligible: p.eligible,
    basis: md.basis,
    marketValue: md.marketValue,
    confidence: md.confidence,
    blockers: md.blockers,
    warnings: md.warnings.slice(0, 3),
    recommendedAction: p.recommendedAction,
    tcgplayer: tcg?.value,
    pricecharting: pc?.value,
    currentMarket: p.currentMarketPrice,
    currentCash: p.currentCashOffer,
    currentTrade: p.currentTradeOffer,
    previewMarket: p.previewMarketValue,
    previewCash: p.previewCashOffer,
    previewTrade: p.previewTradeOffer,
    cashDiff: p.cashDifference,
    tradeDiff: p.tradeDifference,
    productionMarket: card.marketPrice,
    productionCash: card.cashOffer,
    productionTrade: card.tradeOffer,
    productionStatus: card.status,
    previewStoredSeparately: Boolean(card.cardFlowV2OfferPreview),
  };
}

function safetyCheck(
  before: Pick<
    ScannedCard,
    "marketPrice" | "cashOffer" | "tradeOffer" | "status"
  >,
  after: ScannedCard,
): {
  ok: boolean;
  notes: string[];
} {
  const notes: string[] = [];
  const preview = after.cardFlowV2OfferPreview;
  if (!preview) {
    notes.push("no cardFlowV2OfferPreview on card");
    return { ok: false, notes };
  }
  if (preview.previewMarketValue === after.marketPrice && preview.eligible) {
    notes.push(
      "preview market equals production market (may be V1 agreement, not V2 write)",
    );
  }
  notes.push(
    `production: market=${after.marketPrice} cash=${after.cashOffer} trade=${after.tradeOffer} status=${after.status}`,
  );
  notes.push(
    `preview: market=${preview.previewMarketValue} cash=${preview.previewCashOffer} trade=${preview.previewTradeOffer}`,
  );
  notes.push(
    `before reprocess: market=${before.marketPrice} cash=${before.cashOffer} trade=${before.tradeOffer} status=${before.status}`,
  );
  const v2OnlyNested =
    after.cardFlowV2OfferPreview != null &&
    !("previewCashOffer" in (after as unknown as Record<string, unknown>));
  notes.push(`preview nested only: ${v2OnlyNested}`);
  return { ok: v2OnlyNested, notes };
}

async function main() {
  loadEnvLocal();

  const orders = await dataStore.getOrders();
  const bbOrder = orders.find((o) => o.orderNumber === "BB-000005");
  const allCards: ScannedCard[] = [];
  for (const order of orders) {
    const orderCards = await dataStore.getCardsByOrder(order.id);
    allCards.push(...orderCards);
  }

  const v2Cards = allCards.filter(
    (c) =>
      c.cardFlowV2Evidence ||
      c.cardFlowV2Identity ||
      c.cardFlowV2Market ||
      c.cardFlowV2OfferPreview,
  );

  const records = v2Cards.slice(0, 50).map((c) => runCardAuditV2({ card: c }));
  const snapshots = v2Cards
    .slice(0, 50)
    .flatMap((c) => c.cardFlowV2Market?.snapshots ?? []);
  const previews = v2Cards.slice(0, 50).map(
    (c) =>
      c.cardFlowV2OfferPreview ??
      computeCardOfferPreviewV2({
        card: c,
        settings: { id: "audit", ...DEFAULT_STORE_SETTINGS },
        rules: [],
      }),
  );
  const summary = summarizeV2Audits(records, snapshots, previews);

  console.log("=== Directive 006B Validation ===\n");
  printAuditSummary(summary);

  const grusha = (await dataStore.getCard(GRUSHA_ID)) ?? findCard(v2Cards, [/grusha/i]);
  const shehulk = (await dataStore.getCard(SHEHULK_ID)) ?? findCard(v2Cards, [/she-hulk/i]);
  const morgan = findCard(v2Cards, [/morgan/i]);
  const cjStroud = findCard(v2Cards, [/cj stroud/i, /stroud/i]);
  const slab = v2Cards.find((c) => c.itemType === "graded");

  const report = {
    bbOrder: bbOrder?.orderNumber,
    bbCardCount: bbOrder
      ? (await dataStore.getCardsByOrder(bbOrder.id)).length
      : 0,
    cardsWithOfferPreview: v2Cards.filter((c) => c.cardFlowV2OfferPreview).length,
    grusha: grusha ? formatPreview(grusha) : null,
    morgan: morgan ? formatPreview(morgan) : null,
    cjStroud: cjStroud ? formatPreview(cjStroud) : null,
    sheHulk: shehulk ? formatPreview(shehulk) : null,
    slab: slab ? formatPreview(slab) : null,
  };

  console.log("\n=== Card offer preview results ===");
  console.log(JSON.stringify(report, null, 2));

  console.log("\n=== Safety verification (preview nested, not on production root) ===");
  const safetyCards = [grusha, morgan, cjStroud].filter(Boolean) as ScannedCard[];
  for (const card of safetyCards) {
    const before = {
      marketPrice: card.marketPrice,
      cashOffer: card.cashOffer,
      tradeOffer: card.tradeOffer,
      status: card.status,
    };
    const check = safetyCheck(before, card);
    console.log(`\n${card.detectedName ?? card.id}:`);
    for (const n of check.notes) console.log(`  ${n}`);
    console.log(`  safety ok: ${check.ok}`);
  }

  console.log("\n=== Flag check ===");
  console.log("CARD_FLOW_V2_OFFER_PREVIEW_ENABLED:", process.env.CARD_FLOW_V2_OFFER_PREVIEW_ENABLED);
  console.log("Offer influence flag exists: false (not implemented)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
