/**
 * Directive 006K staging validation — Ravenous Tyrannosaurus MAR #93.
 * Run: npx tsx scripts/validate-directive-006k-staging.ts
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { dataStore } from "../src/lib/storage/data-store";
import { runCardAuditV2 } from "../src/lib/card-flow-v2/audit/run-card-audit-v2";
import { computeCardOfferPreviewV2 } from "../src/lib/card-flow-v2/offer/run-card-offer-preview-v2";
import { applyStaffConfirmPricingRefresh } from "../src/lib/card-flow-v2/staff-confirm-pricing";
import { getPrimaryMarketSnapshot } from "../src/lib/card-flow-v2/market/promote-staff-confirmed-market";
import { DEFAULT_STORE_SETTINGS } from "../src/lib/constants";
import type { ScannedCard } from "../src/lib/types";

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
  for (const flag of [
    "CARD_FLOW_V2_EVIDENCE_ENABLED",
    "CARD_FLOW_V2_IDENTITY_ENABLED",
    "CARD_FLOW_V2_MARKET_ENABLED",
    "CARD_FLOW_V2_AUDIT_ENABLED",
    "CARD_FLOW_V2_STAFF_CONFIRMATION_ENABLED",
    "CARD_FLOW_V2_OFFER_PREVIEW_ENABLED",
    "CARD_FLOW_V2_MARKET_ENABLE_EBAY",
    "CARD_FLOW_V2_MARKET_ENABLE_PRICECHARTING",
    "CARD_FLOW_V2_MARKET_ENABLE_TCGPLAYER",
  ]) {
    process.env[flag] = "true";
  }
}

function findTyrannosaurus(cards: ScannedCard[]): ScannedCard | undefined {
  return cards.find((c) => {
    const hay = [
      c.detectedName,
      c.cardFlowV2Identity?.lockedIdentity.canonicalName,
      c.cardFlowV2Identity?.staffSelection?.suspectId,
      ...(c.cardFlowV2Identity?.suspects ?? []).map((s) => s.label),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return (
      /ravenous tyrannosaurus/i.test(hay) &&
      (/mar\b|marvel universe/i.test(hay) || /#93|\b93\b/.test(hay))
    );
  });
}

async function main() {
  loadEnvLocal();
  const settings = { ...DEFAULT_STORE_SETTINGS, id: "staging" };
  const orders = await dataStore.getOrders();
  const cards: ScannedCard[] = [];
  for (const order of orders) {
    cards.push(...(await dataStore.getCardsByOrder(order.id)));
  }

  let card = findTyrannosaurus(cards);
  if (!card) {
    console.error("Ravenous Tyrannosaurus MAR #93 card not found in Firestore.");
    console.log(
      "Candidates with 'tyrannosaurus':",
      cards
        .filter((c) => /tyrannosaurus/i.test(c.detectedName ?? ""))
        .map((c) => ({ id: c.id, name: c.detectedName, market: c.marketPrice })),
    );
    process.exit(1);
  }

  const beforeProd = {
    marketPrice: card.marketPrice,
    cashOffer: card.cashOffer,
    tradeOffer: card.tradeOffer,
    status: card.status,
  };

  const suspectId =
    card.cardFlowV2Identity?.staffSelection?.suspectId ??
    card.cardFlowV2Identity?.suspects.find((s) =>
      /mar.*93|#93/i.test(s.label),
    )?.suspectId;

  if (card.cardFlowV2Identity) {
    const refreshed = await applyStaffConfirmPricingRefresh({
      card,
      identity: card.cardFlowV2Identity,
      market: card.cardFlowV2Market,
      evidence: card.cardFlowV2Evidence,
      settings,
      rules: [],
      manualRefresh: true,
    });
    card = {
      ...card,
      cardFlowV2Identity: refreshed.cardFlowV2Identity,
      cardFlowV2Market: refreshed.cardFlowV2Market,
      cardFlowV2OfferPreview: refreshed.cardFlowV2OfferPreview,
      cardFlowV2Audit: refreshed.cardFlowV2Audit,
    };
  }

  const preview =
    card.cardFlowV2OfferPreview ??
    computeCardOfferPreviewV2({ card, settings, rules: [] });
  const audit = runCardAuditV2({ card });
  const snap = getPrimaryMarketSnapshot(card.cardFlowV2Market);

  const pcRejected = snap?.rejectedComps.filter(
    (a) =>
      a.comp.source === "pricecharting" &&
      a.rejectionReasons.includes("pricecharting_product_identity_mismatch"),
  );
  const scryfallAccepted = snap?.acceptedComps.filter(
    (a) => a.comp.source === "scryfall_print_price",
  );
  const pcMapping = snap?.priceChartingMapping;

  const checks = {
    pcIdentityRejected:
      pcMapping?.reasonIfSkipped === "pricecharting_product_identity_mismatch" ||
      (pcRejected?.length ?? 0) > 0,
    noAcceptedPcHigh:
      !(snap?.acceptedComps ?? []).some(
        (a) => a.comp.source === "pricecharting" && a.comp.price > 40,
      ),
    scryfallSignal: (scryfallAccepted?.length ?? 0) > 0,
    shadowNear790:
      snap?.valueMedian != null &&
      snap.valueMedian > 5 &&
      snap.valueMedian < 15,
    previewNot4999:
      preview.previewMarketValue == null || preview.previewMarketValue < 40,
    activeSanityOnly: !(snap?.acceptedComps ?? []).some(
      (a) => a.comp.source === "ebay_active",
    ),
    ebaySold403:
      snap?.sourceHealth?.find((h) => h.source === "ebay_sold")?.httpStatus ===
        403 ||
      snap?.sourceHealth?.find((h) => h.source === "ebay_sold")?.fatalError ===
        "authorization_or_scope_failure",
    productionUnchanged:
      card.marketPrice === beforeProd.marketPrice &&
      card.cashOffer === beforeProd.cashOffer &&
      card.tradeOffer === beforeProd.tradeOffer &&
      card.status === beforeProd.status,
    auditFlagsV1:
      audit.issues.includes("v1_possible_wrong_pricecharting_mapping") ||
      (beforeProd.marketPrice != null &&
        beforeProd.marketPrice > 40 &&
        audit.recommendedStaffAction.includes("mismatched PriceCharting")),
  };

  const allChecksPass = Object.values(checks).every(Boolean);

  console.log(
    JSON.stringify(
      {
        cardId: card.id,
        orderId: card.orderId,
        name: card.detectedName,
        confirmedSuspect: card.cardFlowV2Identity?.suspects.find(
          (s) => s.suspectId === suspectId,
        )?.label,
        production: beforeProd,
        shadow: {
          valueMedian: snap?.valueMedian,
          valueLow: snap?.valueLow,
          valueHigh: snap?.valueHigh,
          pricingMethod: snap?.pricingMethod,
          confidence: snap?.confidence,
        },
        priceChartingMapping: {
          reasonIfSkipped: pcMapping?.reasonIfSkipped,
          identityMismatch: pcMapping?.identityMismatch,
          loosePrice: pcMapping?.loosePrice,
        },
        rejectedPriceCharting: pcRejected?.map((a) => ({
          title: a.comp.title,
          price: a.comp.price,
          reasons: a.rejectionReasons,
          notes: a.notes.slice(0, 2),
        })),
        acceptedScryfall: scryfallAccepted?.map((a) => ({
          title: a.comp.title,
          price: a.comp.price,
          label: a.comp.conditionText,
        })),
        preview: {
          eligible: preview.eligible,
          previewMarketValue: preview.previewMarketValue,
          basis: preview.marketDecision.basis,
          blockers: preview.marketDecision.blockers,
          warnings: preview.marketDecision.warnings,
          sourceValues: preview.marketDecision.sourceValues,
        },
        audit: {
          riskLevel: audit.riskLevel,
          issues: audit.issues,
          staffActionSnippet: audit.recommendedStaffAction.split("\n").slice(0, 12),
        },
        marketOutcomePlainEnglish: snap?.marketOutcome?.plainEnglishSummary,
        checks,
        allChecksPass,
      },
      null,
      2,
    ),
  );

  process.exit(allChecksPass ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
