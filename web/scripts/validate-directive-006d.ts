/**
 * Directive 006D staging validation — staff confirmation survives reprocess.
 * Run: npx tsx scripts/validate-directive-006d.ts
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { dataStore } from "../src/lib/storage/data-store";
import { processCard } from "../src/lib/processing/process-order";
import { runFullCardAnalysis } from "../src/lib/processing/full-analysis";
import { applyStaffSuspectSelection } from "../src/lib/card-flow-v2/staff-suspect-selection";
import { promoteStaffConfirmedMarket } from "../src/lib/card-flow-v2/market/promote-staff-confirmed-market";
import { runCardOfferPreviewV2 } from "../src/lib/card-flow-v2/offer/run-card-offer-preview-v2";
import { runCardAuditV2 } from "../src/lib/card-flow-v2/audit/run-card-audit-v2";
import {
  printAuditSummary,
  summarizeV2Audits,
} from "../src/lib/card-flow-v2/audit/audit-summary";
import { computeCardOfferPreviewV2 } from "../src/lib/card-flow-v2/offer/run-card-offer-preview-v2";
import { mergeLiveRegressionFixtures } from "../src/lib/card-flow-v2/regression/live-audit-fixtures";
import {
  LIVE_REGRESSION_ORDER_NUMBER,
  MORGAN_REGRESSION_CARD_ID,
  CJ_STROUD_REGRESSION_CARD_ID,
  buildMorganRegressionCard,
  buildCjStroudRegressionCard,
} from "../src/lib/card-flow-v2/regression/live-audit-fixtures";
import { DEFAULT_STORE_ID } from "../src/lib/firebase/collections";
import { DEFAULT_STORE_SETTINGS } from "../src/lib/constants";
import type { ScannedCard } from "../src/lib/types";

const GRUSHA_ID = "a9913433-d799-4bd8-867d-a7866e080668";
const SHEHULK_ID = "eaa2dce3-07dd-45e1-9457-eb0511827322";
const REVERSE_SUSPECT_ID = "pokemon_tcg:sv2-184:reverse_holo";

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

function summarizeGrusha(card: ScannedCard | null | undefined, label: string) {
  if (!card) return { label, error: "card not found" };
  const identity = card.cardFlowV2Identity;
  const market = card.cardFlowV2Market;
  const preview = card.cardFlowV2OfferPreview;
  const snap = market?.snapshots.find(
    (s) => s.suspectId === market.selectedSuspectId || s.suspectId === REVERSE_SUSPECT_ID,
  );
  return {
    label,
    name: card.detectedName,
    staffSelection: identity?.staffSelection?.suspectId,
    fingerprintFinish: identity?.staffSelection?.fingerprint?.finish,
    preservation: identity?.staffConfirmationPreservation,
    marketMode: market?.mode,
    selectedSuspectId: market?.selectedSuspectId,
    promotedFromSnapshot: market?.staffConfirmedPromotion?.promotedFromSnapshot,
    shadowMedian: snap?.valueMedian,
    pricingMethod: snap?.pricingMethod,
    previewEligible: preview?.eligible,
    previewBasis: preview?.marketDecision.basis,
    previewMarketValue: preview?.marketDecision.marketValue,
    previewBlockers: preview?.marketDecision.blockers,
    auditBasis: card.cardFlowV2Audit?.v2IdentityBasis,
    production: {
      marketPrice: card.marketPrice,
      cashOffer: card.cashOffer,
      tradeOffer: card.tradeOffer,
      status: card.status,
    },
  };
}

function safety(card: ScannedCard) {
  const preview = card.cardFlowV2OfferPreview;
  return {
    name: card.detectedName ?? card.id,
    production: {
      marketPrice: card.marketPrice,
      cashOffer: card.cashOffer,
      tradeOffer: card.tradeOffer,
      status: card.status,
    },
    previewNested: preview != null,
    previewOnRoot: "previewCashOffer" in (card as unknown as Record<string, unknown>),
  };
}

async function confirmGrusha(
  card: ScannedCard,
  settings: Awaited<ReturnType<typeof dataStore.getSettings>>,
  rules: Awaited<ReturnType<typeof dataStore.getActiveRules>>,
) {
  const identity = card.cardFlowV2Identity!;
  const market = card.cardFlowV2Market!;
  const suspect = identity.suspects.find((s) => s.suspectId === REVERSE_SUSPECT_ID);
  if (!suspect) throw new Error("Reverse holo suspect missing on Grusha");

  const updatedIdentity = applyStaffSuspectSelection(identity, {
    suspectId: REVERSE_SUSPECT_ID,
    confirmedBy: "directive-006d-validation",
    notes: "Staff confirm for 006D validation",
    imageRefs: {
      frontImageUrl: card.frontImageUrl,
      backImageUrl: card.backImageUrl,
    },
  });
  const { market: promotedMarket } = await promoteStaffConfirmedMarket({
    market,
    suspect,
    confirmedBy: "directive-006d-validation",
  });
  const audit = runCardAuditV2({
    card: { ...card, cardFlowV2Identity: updatedIdentity, cardFlowV2Market: promotedMarket },
  });
  const offerPreview = runCardOfferPreviewV2({
    card: {
      ...card,
      cardFlowV2Identity: updatedIdentity,
      cardFlowV2Market: promotedMarket,
      cardFlowV2Audit: audit,
    },
    identity: updatedIdentity,
    market: promotedMarket,
    settings,
    rules,
  });
  const updated = {
    ...card,
    cardFlowV2Identity: updatedIdentity,
    cardFlowV2Market: promotedMarket,
    cardFlowV2Audit: audit,
    cardFlowV2OfferPreview: offerPreview,
  };
  await dataStore.saveCard(updated);
  return updated;
}

async function reprocessOne(
  cardId: string,
  settings: Awaited<ReturnType<typeof dataStore.getSettings>>,
  rules: Awaited<ReturnType<typeof dataStore.getActiveRules>>,
) {
  const card = await dataStore.getCard(cardId);
  if (!card) return null;
  const prodBefore = {
    marketPrice: card.marketPrice,
    cashOffer: card.cashOffer,
    tradeOffer: card.tradeOffer,
    status: card.status,
  };
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
  return { card: toSave, prodBefore };
}

async function main() {
  loadEnv();

  const orders = await dataStore.getOrders();
  const regressionOrder = orders.find((o) => o.orderNumber === LIVE_REGRESSION_ORDER_NUMBER);
  console.log("=== Directive 006D Validation ===\n");
  console.log("Regression order:", regressionOrder?.orderNumber ?? "NOT FOUND (run seed)");

  const morganStored = await dataStore.getCard(MORGAN_REGRESSION_CARD_ID);
  const cjStored = await dataStore.getCard(CJ_STROUD_REGRESSION_CARD_ID);
  console.log("Morgan fixture in Firestore:", Boolean(morganStored));
  console.log("CJ Stroud fixture in Firestore:", Boolean(cjStored));

  const storeId = DEFAULT_STORE_ID;
  const [settings, rules] = await Promise.all([
    dataStore.getSettings(storeId),
    dataStore.getActiveRules(storeId),
  ]);

  let grusha = await dataStore.getCard(GRUSHA_ID);
  if (!grusha?.cardFlowV2Identity || !grusha.cardFlowV2Market) {
    throw new Error("Grusha missing V2 bundles — run reprocess first");
  }

  console.log("\n--- Step 2: Staff confirm Grusha reverse holo ---");
  grusha = await confirmGrusha(grusha, settings, rules);
  const beforeReprocess = summarizeGrusha(grusha, "after staff confirm, before reprocess");
  console.log(JSON.stringify(beforeReprocess, null, 2));

  console.log("\n--- Step 3: Full reprocess (Grusha only first) ---");
  const grushaReprocess = await reprocessOne(GRUSHA_ID, settings, rules);
  if (!grushaReprocess) throw new Error("Grusha reprocess failed");
  const afterReprocess = summarizeGrusha(grushaReprocess.card, "after reprocess");
  console.log(JSON.stringify(afterReprocess, null, 2));

  const preservationOk =
    Boolean(grushaReprocess.card.cardFlowV2Identity?.staffSelection?.suspectId === REVERSE_SUSPECT_ID) &&
    (grushaReprocess.card.cardFlowV2Identity?.staffConfirmationPreservation?.status === "preserved" ||
      grushaReprocess.card.cardFlowV2Identity?.staffConfirmationPreservation?.status === "rematched");
  console.log("\nPreservation check:", preservationOk ? "PASS" : "FAIL");

  console.log("\n--- Step 5: Audit summary ---");
  let allCards: ScannedCard[] = [];
  for (const o of orders) {
    allCards.push(...(await dataStore.getCardsByOrder(o.id)));
  }
  allCards = mergeLiveRegressionFixtures(allCards.filter(hasV2));
  const records = allCards.slice(0, 50).map((c) => runCardAuditV2({ card: c }));
  const snapshots = allCards.slice(0, 50).flatMap((c) => c.cardFlowV2Market?.snapshots ?? []);
  const previews = allCards.slice(0, 50).map(
    (c) => c.cardFlowV2OfferPreview ?? computeCardOfferPreviewV2({ card: c, settings, rules: [] }),
  );
  const summary = summarizeV2Audits(records, snapshots, previews);
  printAuditSummary(summary);

  const staffConfirmed = records.filter((r) => r.v2IdentityBasis === "staff_confirmed").length;
  const sourceDisagreement = previews.filter((p) =>
    p.marketDecision.blockers.includes("source_disagreement"),
  ).length;

  console.log("\n--- Audit rollup ---");
  console.log(JSON.stringify({
    totalAudited: summary.totalCards,
    staffConfirmed,
    visionLocked: summary.identityBasisCounts.vision_locked ?? 0,
    unlocked: summary.identityBasisCounts.unlocked_candidates ?? 0,
    offerPreviewEligible: summary.offerPreviewSummary?.eligibleCount,
    offerPreviewBlocked: summary.offerPreviewSummary?.blockedCount,
    topBlockers: summary.offerPreviewSummary?.topBlockers,
    sourceDisagreementCount: sourceDisagreement,
    ebaySold403: summary.sourceHealthStats?.ebaySold403,
    pricingSignals: summary.marketDataCoverage?.pricingSignalsCount,
  }, null, 2));

  const morgan = morganStored ?? buildMorganRegressionCard();
  const cj = cjStored ?? buildCjStroudRegressionCard();
  console.log("\n--- Morgan live audit ---");
  console.log(JSON.stringify({
    cardId: morgan.id,
    previewEligible: morgan.cardFlowV2OfferPreview?.eligible,
    blockers: morgan.cardFlowV2OfferPreview?.marketDecision.blockers,
    tcg: morgan.cardFlowV2OfferPreview?.marketDecision.sourceValues.find((s) => s.source === "tcgplayer")?.value,
    pc: morgan.cardFlowV2OfferPreview?.marketDecision.sourceValues.find((s) => s.source === "pricecharting")?.value,
  }, null, 2));

  console.log("\n--- CJ Stroud live audit ---");
  console.log(JSON.stringify({
    cardId: cj.id,
    previewEligible: cj.cardFlowV2OfferPreview?.eligible,
    blockers: cj.cardFlowV2OfferPreview?.marketDecision.blockers,
    pricingMethod: cj.cardFlowV2Market?.snapshots[0]?.pricingMethod,
  }, null, 2));

  console.log("\n--- Safety verification ---");
  const sheHulk = await dataStore.getCard(SHEHULK_ID);
  const wade = allCards.find((c) => /wade boggs/i.test(c.detectedName ?? ""));
  for (const c of [grushaReprocess.card, sheHulk, wade].filter(Boolean) as ScannedCard[]) {
    console.log(JSON.stringify(safety(c), null, 2));
  }
}

function hasV2(c: ScannedCard) {
  return Boolean(c.cardFlowV2Evidence || c.cardFlowV2Identity || c.cardFlowV2Market);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
