/**
 * Directive 006F-Revised — deploy validation report.
 * Run after: npm run card-flow-v2:reprocess-shadow-audit-set
 *   npx tsx scripts/validate-directive-006f-revised.ts
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { dataStore } from "../src/lib/storage/data-store";
import { mergeLiveRegressionFixtures } from "../src/lib/card-flow-v2/regression/live-audit-fixtures";
import {
  printAuditSummary,
  summarizeV2Audits,
} from "../src/lib/card-flow-v2/audit/audit-summary";
import { buildStaffConfirmationQueue } from "../src/lib/card-flow-v2/staff-confirmation-queue";
import { getDetectiveGuide } from "../src/lib/card-flow-v2/detective-guides";
import { RIFTBOUND_DETECTIVE_GUIDE } from "../src/lib/card-flow-v2/knowledge/riftbound";
import { generateRiftboundCandidates } from "../src/lib/card-flow-v2/riftbound-candidate-generator";
import { RIFTBOUND_DETECTIVE_GUIDE as RB_GUIDE } from "../src/lib/card-flow-v2/knowledge/riftbound";
import type { ScannedCard } from "../src/lib/types";
import type { ImageEvidenceReport } from "../src/lib/card-flow-v2/types";

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

function safety(card: ScannedCard) {
  const root = card as unknown as Record<string, unknown>;
  return {
    id: card.id,
    name: card.detectedName,
    production: {
      marketPrice: card.marketPrice,
      cashOffer: card.cashOffer,
      tradeOffer: card.tradeOffer,
      status: card.status,
    },
    previewNested: card.cardFlowV2OfferPreview != null,
    previewOnRoot: "previewCashOffer" in root || "previewMarketValue" in root,
  };
}

function grushaReport(card: ScannedCard | null | undefined) {
  if (!card) return { error: "Grusha not found" };
  const identity = card.cardFlowV2Identity;
  const market = card.cardFlowV2Market;
  const preview = card.cardFlowV2OfferPreview;
  const snap = market?.snapshots.find(
    (s) =>
      s.suspectId === market.selectedSuspectId ||
      s.suspectId === REVERSE_SUSPECT_ID,
  );
  return {
    staffSelection: identity?.staffSelection?.suspectId,
    preservation: identity?.staffConfirmationPreservation?.status,
    variantUncertaintyStatus: identity?.variantUncertaintyStatus,
    marketMode: market?.mode,
    selectedSuspectId: market?.selectedSuspectId,
    shadowMedian: snap?.valueMedian,
    previewEligible: preview?.eligible,
    previewBasis: preview?.marketDecision.basis,
    recommendedAction: preview?.recommendedAction,
    previewBlockers: preview?.marketDecision.blockers,
    production: {
      marketPrice: card.marketPrice,
      cashOffer: card.cashOffer,
      tradeOffer: card.tradeOffer,
      status: card.status,
    },
    pass:
      identity?.staffSelection?.suspectId === REVERSE_SUSPECT_ID &&
      (identity?.staffConfirmationPreservation?.status === "preserved" ||
        identity?.staffConfirmationPreservation?.status === "rematched") &&
      market?.mode === "staff_confirmed_identity_market" &&
      identity?.variantUncertaintyStatus === "resolved_by_staff_confirmation" &&
      preview?.eligible === true,
  };
}

async function main() {
  loadEnv();

  console.log("=== Directive 006F-Revised Validation ===\n");

  const orders = await dataStore.getOrders();
  const bbOrder = orders.find((o) => o.orderNumber === "BB-000005");
  let cards: ScannedCard[] = [];
  if (bbOrder) {
    cards = await dataStore.getCardsByOrder(bbOrder.id);
  }
  cards = mergeLiveRegressionFixtures(cards);

  const extraIds = [GRUSHA_ID, SHEHULK_ID];
  for (const id of extraIds) {
    const c = await dataStore.getCard(id);
    if (c && !cards.some((x) => x.id === id)) cards.push(c);
  }

  const slab = cards.find((c) => c.itemType === "graded");
  const wadeBoggs = cards.find((c) =>
    (c.detectedName ?? "").toLowerCase().includes("wade boggs"),
  );
  const safetyCards = [
    await dataStore.getCard(GRUSHA_ID),
    await dataStore.getCard(SHEHULK_ID),
    slab ?? wadeBoggs ?? cards.find((c) => c.itemType === "graded"),
  ].filter(Boolean) as ScannedCard[];

  console.log("--- Grusha preservation ---");
  const grusha = await dataStore.getCard(GRUSHA_ID);
  console.log(JSON.stringify(grushaReport(grusha), null, 2));

  console.log("\n--- Safety verification (production fields + preview nesting) ---");
  console.log(JSON.stringify(safetyCards.map(safety), null, 2));

  const orderNumbers: Record<string, string> = {};
  for (const o of orders) orderNumbers[o.id] = o.orderNumber ?? o.id;
  const queue = buildStaffConfirmationQueue(cards, orderNumbers);
  const reasonCounts = new Map<string, number>();
  const categoryCounts = new Map<string, number>();
  for (const item of queue) {
    for (const r of item.reasons) reasonCounts.set(r, (reasonCounts.get(r) ?? 0) + 1);
    categoryCounts.set(item.category ?? "unknown", (categoryCounts.get(item.category ?? "unknown") ?? 0) + 1);
  }
  const grushaInQueue = queue.some((q) => q.cardId === GRUSHA_ID);

  console.log("\n--- Staff confirmation queue ---");
  console.log(
    JSON.stringify(
      {
        total: queue.length,
        grushaInQueue,
        categoryBreakdown: Object.fromEntries(categoryCounts),
        topBlockers: [...reasonCounts.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)
          .map(([reason, count]) => ({ reason, count })),
        examples: queue.slice(0, 3).map((q) => ({
          cardId: q.cardId,
          name: q.name,
          category: q.category,
          reasons: q.reasons,
          suspectCount: q.suspectCount,
          pricingSignalCount: q.pricingSignalCount,
          topSuspects: q.topSuspects,
          missingEvidence: q.missingEvidence,
          orderNumber: q.orderNumber,
        })),
      },
      null,
      2,
    ),
  );

  console.log("\n--- Riftbound guide wiring ---");
  const rbGuide = getDetectiveGuide("riftbound");
  console.log(
    JSON.stringify(
      {
        usesDedicatedGuide: rbGuide.variantTraps.length === RIFTBOUND_DETECTIVE_GUIDE.variantTraps.length,
        trapCount: rbGuide.variantTraps.length,
        hasIdentificationFormula: Boolean(rbGuide.identificationFormula),
      },
      null,
      2,
    ),
  );

  const stubEvidence: ImageEvidenceReport = {
    imageUsability: "good",
    canAttemptIdentification: true,
    canAutoLockIdentity: false,
    detectedCardCount: 1,
    detectedSides: ["front"],
    visualProblems: [],
    extractedText: [],
    evidenceSlots: [
      { field: "card_name", value: "Ahri", status: "observed", confidence: 0.9, source: "front_image" },
      { field: "set_code", value: "OGN", status: "observed", confidence: 0.9, source: "front_image" },
      { field: "collector_number", value: "303*", status: "observed", confidence: 0.9, source: "front_image" },
    ],
    missingCriticalEvidence: [],
    identificationMode: "continue_with_variant_uncertainty",
    staffMessage: "test",
  };
  const sigGen = await generateRiftboundCandidates({
    imageEvidence: stubEvidence,
    categoryClassification: {
      category: "riftbound",
      confidence: 0.95,
      evidence: [],
      detectedSides: ["front"],
      needsHigherVision: false,
    },
    detectiveGuide: RB_GUIDE,
  });
  const altGen = await generateRiftboundCandidates({
    imageEvidence: {
      ...stubEvidence,
      evidenceSlots: [
        { field: "card_name", value: "Ahri", status: "observed", confidence: 0.9, source: "front_image" },
        { field: "set_code", value: "OGN", status: "observed", confidence: 0.9, source: "front_image" },
        { field: "collector_number", value: "30a", status: "observed", confidence: 0.9, source: "front_image" },
      ],
    },
    categoryClassification: {
      category: "riftbound",
      confidence: 0.95,
      evidence: [],
      detectedSides: ["front"],
      needsHigherVision: false,
    },
    detectiveGuide: RB_GUIDE,
  });
  const ogsGen = await generateRiftboundCandidates({
    imageEvidence: {
      ...stubEvidence,
      evidenceSlots: [
        { field: "card_name", value: "Jinx", status: "observed", confidence: 0.9, source: "front_image" },
        { field: "set_code", value: "OGS", status: "observed", confidence: 0.9, source: "front_image" },
        { field: "collector_number", value: "012", status: "observed", confidence: 0.9, source: "front_image" },
      ],
    },
    categoryClassification: {
      category: "riftbound",
      confidence: 0.95,
      evidence: [],
      detectedSides: ["front"],
      needsHigherVision: false,
    },
    detectiveGuide: RB_GUIDE,
  });

  console.log("\n--- Riftbound suspect variants (fixture smoke) ---");
  console.log(
    JSON.stringify(
      {
        signature: sigGen.suspects.map((s) => ({ id: s.suspectId, label: s.label, finish: s.finish, tags: s.variantTags })),
        altArt: altGen.suspects.map((s) => ({ id: s.suspectId, label: s.label, tags: s.variantTags })),
        ogsNoFoil: {
          suspects: ogsGen.suspects.map((s) => ({ finish: s.finish })),
          hasFoilSuspect: ogsGen.suspects.some((s) => s.finish === "foil"),
        },
      },
      null,
      2,
    ),
  );

  const records = cards
    .filter((c) => c.cardFlowV2Audit)
    .map((c) => c.cardFlowV2Audit!);
  const snapshots = cards.flatMap((c) => c.cardFlowV2Market?.snapshots ?? []);
  const previews = cards
    .map((c) => c.cardFlowV2OfferPreview)
    .filter((p): p is NonNullable<typeof p> => p != null);

  const summary = summarizeV2Audits(records, snapshots, previews, cards.slice(0, 50));

  console.log("\n--- Audit summary (limit 50) ---");
  console.log(
    JSON.stringify(
      {
        totalCards: summary.totalCards,
        staffConfirmed: summary.identityBasisCounts.staff_confirmed ?? 0,
        visionLocked: summary.identityBasisCounts.vision_locked ?? 0,
        unlocked: summary.identityBasisCounts.unlocked_candidates ?? 0,
        offerPreviewEligible: summary.offerPreviewSummary?.eligibleCount,
        offerPreviewBlocked: summary.offerPreviewSummary?.blockedCount,
        topBlockers: summary.offerPreviewSummary?.topBlockers,
        staffConfirmationMetrics: summary.staffConfirmationMetrics,
        sourceDisagreement: previews.filter((p) =>
          p.marketDecision.blockers.includes("source_disagreement"),
        ).length,
        noMarketData: previews.filter((p) =>
          p.marketDecision.blockers.includes("no_market_data"),
        ).length,
        ebaySold403: summary.sourceHealthStats?.ebaySold403,
        pricingSignals: summary.marketDataCoverage?.pricingSignalsCount,
        coverageTargets: summary.staffConfirmationMetrics?.coverageTargets,
      },
      null,
      2,
    ),
  );

  console.log("\n--- Offer influence flag check ---");
  console.log(
    JSON.stringify(
      {
        CARD_FLOW_V2_OFFER_INFLUENCE: process.env.CARD_FLOW_V2_OFFER_INFLUENCE ?? "(unset)",
        offerInfluenceInCodebase: "grep found no OFFER_INFLUENCE references",
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
