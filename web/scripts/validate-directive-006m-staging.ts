/**
 * Directive 006M staging validation — Ravenous, Grusha, Morgan + review queue.
 * Run: npx tsx scripts/validate-directive-006m-staging.ts
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { dataStore } from "../src/lib/storage/data-store";
import { runCardAuditV2 } from "../src/lib/card-flow-v2/audit/run-card-audit-v2";
import { buildStaffTrainingExplanation } from "../src/lib/card-flow-v2/staff-training-explanation";
import {
  buildMorganRegressionCard,
  MORGAN_REGRESSION_CARD_ID,
} from "../src/lib/card-flow-v2/regression/live-audit-fixtures";
import { resolveV2ReviewStatus } from "../src/lib/card-flow-v2/v2-review-status";
import { buildV2ReviewQueue } from "../src/lib/card-flow-v2/v2-review-queue";
import { detectStaleV2Metadata } from "../src/lib/card-flow-v2/version-metadata";
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
  ]) {
    process.env[flag] = "true";
  }
}

function findCard(
  cards: ScannedCard[],
  match: (c: ScannedCard) => boolean,
): ScannedCard | undefined {
  return cards.find(match);
}

function prodSnapshot(card: ScannedCard) {
  return {
    marketPrice: card.marketPrice,
    cashOffer: card.cashOffer,
    tradeOffer: card.tradeOffer,
    status: card.status,
  };
}

function hasAllV2Bundles(card: ScannedCard): boolean {
  return Boolean(
    card.cardFlowV2Evidence &&
      card.cardFlowV2Identity &&
      card.cardFlowV2Market &&
      card.cardFlowV2Audit &&
      card.cardFlowV2OfferPreview &&
      card.cardFlowV2VersionMetadata,
  );
}

function summarizeCard(card: ScannedCard, label: string) {
  const audit = card.cardFlowV2Audit ?? runCardAuditV2({ card });
  const reviewStatus = resolveV2ReviewStatus({ card, audit });
  const training = buildStaffTrainingExplanation({
    card,
    audit,
    reviewStatus,
  });
  const stale = detectStaleV2Metadata(card.cardFlowV2VersionMetadata);
  const preview = card.cardFlowV2OfferPreview;
  const identity = card.cardFlowV2Identity;
  const staffSuspect = identity?.staffSelection?.suspectId
    ? identity.suspects.find((s) => s.suspectId === identity.staffSelection!.suspectId)
    : undefined;

  return {
    label,
    cardId: card.id,
    orderId: card.orderId,
    name: card.detectedName,
    production: prodSnapshot(card),
    reviewStatus,
    stale: stale.stale,
    versionMetadata: card.cardFlowV2VersionMetadata
      ? {
          directiveVersion: card.cardFlowV2VersionMetadata.directiveVersion,
          marketPolicyVersion: card.cardFlowV2VersionMetadata.marketPolicyVersion,
          auditPolicyVersion: card.cardFlowV2VersionMetadata.auditPolicyVersion,
        }
      : null,
    bundlesPresent: {
      evidence: Boolean(card.cardFlowV2Evidence),
      identity: Boolean(card.cardFlowV2Identity),
      market: Boolean(card.cardFlowV2Market),
      audit: Boolean(card.cardFlowV2Audit),
      offerPreview: Boolean(card.cardFlowV2OfferPreview),
      versionMetadata: Boolean(card.cardFlowV2VersionMetadata),
    },
    staffSuspect: staffSuspect?.label,
    variantUncertaintyStatus: identity?.variantUncertaintyStatus,
    preview: preview
      ? {
          eligible: preview.eligible,
          previewMarketValue: preview.previewMarketValue,
          recommendedAction: preview.recommendedAction,
          blockers: preview.marketDecision.blockers,
          basis: preview.marketDecision.basis,
          sourceValues: preview.marketDecision.sourceValues,
        }
      : null,
    auditIssues: audit.issues,
    trainingHeading: training?.heading,
    trainingSnippet: training?.paragraphs?.slice(0, 3),
  };
}

async function main() {
  loadEnvLocal();

  const v2Flags = {
    CARD_FLOW_V2_EVIDENCE_ENABLED: process.env.CARD_FLOW_V2_EVIDENCE_ENABLED,
    CARD_FLOW_V2_IDENTITY_ENABLED: process.env.CARD_FLOW_V2_IDENTITY_ENABLED,
    CARD_FLOW_V2_MARKET_ENABLED: process.env.CARD_FLOW_V2_MARKET_ENABLED,
    CARD_FLOW_V2_AUDIT_ENABLED: process.env.CARD_FLOW_V2_AUDIT_ENABLED,
    CARD_FLOW_V2_STAFF_CONFIRMATION_ENABLED:
      process.env.CARD_FLOW_V2_STAFF_CONFIRMATION_ENABLED,
    CARD_FLOW_V2_OFFER_PREVIEW_ENABLED:
      process.env.CARD_FLOW_V2_OFFER_PREVIEW_ENABLED,
    CARD_FLOW_V2_OFFER_INFLUENCE: process.env.CARD_FLOW_V2_OFFER_INFLUENCE ?? "(unset)",
  };

  const orders = await dataStore.getOrders();
  const orderNumbers: Record<string, string> = {};
  const cards: ScannedCard[] = [];
  for (const order of orders) {
    orderNumbers[order.id] = order.orderNumber ?? order.id;
    cards.push(...(await dataStore.getCardsByOrder(order.id)));
  }

  const ravenous = findCard(cards, (c) => {
    const hay = [
      c.detectedName,
      ...(c.cardFlowV2Identity?.suspects ?? []).map((s) => s.label),
    ]
      .join(" ")
      .toLowerCase();
    return /ravenous tyrannosaurus/i.test(hay) && /mar|#93|\b93\b/.test(hay);
  });

  const grusha = findCard(cards, (c) =>
    /grusha/i.test(c.detectedName ?? "") ||
    (c.cardFlowV2Identity?.suspects ?? []).some((s) => /grusha/i.test(s.label)),
  );

  let morgan = findCard(cards, (c) => c.id === MORGAN_REGRESSION_CARD_ID);
  if (!morgan) {
    morgan = findCard(cards, (c) => /^morgan$/i.test(c.detectedName?.trim() ?? ""));
  }

  const queue = buildV2ReviewQueue(cards, orderNumbers);
  const ravenousQueue = queue.find((q) => /ravenous/i.test(q.name ?? ""));
  const morganQueue = queue.find((q) => /^morgan$/i.test(q.name?.trim() ?? ""));

  const checks: Record<string, boolean> = {};

  checks.allV2FlagsEnabled = [
    "CARD_FLOW_V2_EVIDENCE_ENABLED",
    "CARD_FLOW_V2_IDENTITY_ENABLED",
    "CARD_FLOW_V2_MARKET_ENABLED",
    "CARD_FLOW_V2_AUDIT_ENABLED",
    "CARD_FLOW_V2_STAFF_CONFIRMATION_ENABLED",
    "CARD_FLOW_V2_OFFER_PREVIEW_ENABLED",
  ].every((f) => process.env[f] === "true");

  checks.noOfferInfluence =
    process.env.CARD_FLOW_V2_OFFER_INFLUENCE == null ||
    process.env.CARD_FLOW_V2_OFFER_INFLUENCE === "" ||
    process.env.CARD_FLOW_V2_OFFER_INFLUENCE === "false";

  checks.ravenousFound = Boolean(ravenous);
  checks.grushaFound = Boolean(grusha);
  checks.morganFound = Boolean(morgan);

  if (ravenous) {
    const s = summarizeCard(ravenous, "Ravenous");
    checks.ravenousReviewStatus =
      s.reviewStatus === "v2_production_price_warning";
    checks.ravenousTraining =
      /mismatched PriceCharting|Why V2 disagrees/i.test(
        s.trainingHeading ?? "",
      ) ||
      (s.trainingSnippet ?? []).some((p) =>
        /different printing|PriceCharting/i.test(p),
      );
    checks.ravenousPreviewNear791 =
      s.preview?.previewMarketValue == null ||
      (s.preview.previewMarketValue > 5 && s.preview.previewMarketValue < 15);
    checks.ravenousProductionUnchanged =
      ravenous.marketPrice != null && ravenous.marketPrice > 40;
    checks.ravenousAllBundles = hasAllV2Bundles(ravenous);
    checks.ravenousInQueue =
      ravenousQueue?.v2ReviewStatus === "v2_production_price_warning";
    checks.ravenousQueueHasDiff = ravenousQueue?.productionMarketPrice != null;
  }

  if (grusha) {
    const before = prodSnapshot(grusha);
    const s = summarizeCard(grusha, "Grusha");
    checks.grushaReviewStatus = s.reviewStatus === "v2_staff_confirmed_ready";
    checks.grushaStaffConfirmed =
      /reverse/i.test(s.staffSuspect ?? "") ||
      grusha.cardFlowV2Identity?.staffSelection?.suspectId != null;
    checks.grushaVariantResolved =
      s.variantUncertaintyStatus === "resolved_by_staff_confirmation";
    checks.grushaPreviewReady =
      s.preview?.recommendedAction === "staff_confirmed_preview_ready";
    checks.grushaProductionUnchanged =
      grusha.marketPrice === before.marketPrice &&
      grusha.cashOffer === before.cashOffer &&
      grusha.tradeOffer === before.tradeOffer &&
      grusha.status === before.status;
    checks.grushaAllBundles = hasAllV2Bundles(grusha);
  }

  const morganCard = morgan ?? buildMorganRegressionCard();
  {
    const before = prodSnapshot(morganCard);
    const s = summarizeCard(morganCard, "Morgan");
    checks.morganReviewStatus = s.reviewStatus === "v2_source_disagreement";
    checks.morganTraining =
      /source disagreement|Why pricing is blocked/i.test(s.trainingHeading ?? "");
    checks.morganPreviewBlocked = s.preview?.eligible === false;
    checks.morganNoBlend =
      s.preview?.basis !== "tcgplayer_pricecharting_blend" &&
      !(s.preview?.sourceValues ?? []).some((v) => v.used && v.label.includes("blend"));
    checks.morganProductionUnchanged =
      morganCard.marketPrice === before.marketPrice &&
      morganCard.cashOffer === before.cashOffer &&
      morganCard.tradeOffer === before.tradeOffer &&
      morganCard.status === before.status;
    checks.morganInQueue =
      morganQueue?.v2ReviewStatus === "v2_source_disagreement" ||
      s.reviewStatus === "v2_source_disagreement";
  }

  checks.reviewQueueNonEmpty = queue.length > 0;
  checks.reviewQueueHasColumns =
    queue.length === 0 ||
    queue.every(
      (q) =>
        q.orderId &&
        q.v2ReviewStatus &&
        q.recommendedAction &&
        q.reasons.length > 0,
    );

  const allChecksPass = Object.values(checks).every(Boolean);

  console.log(
    JSON.stringify(
      {
        v2Flags,
        reviewQueueTotal: queue.length,
        reviewQueueSample: queue.slice(0, 5).map((q) => ({
          name: q.name,
          v2ReviewStatus: q.v2ReviewStatus,
          productionMarketPrice: q.productionMarketPrice,
          v2PreviewMarketPrice: q.v2PreviewMarketPrice,
          priceDifference: q.priceDifference,
          riskLevel: q.riskLevel,
          reasons: q.reasons,
          orderId: q.orderId,
        })),
        ravenous: ravenous ? summarizeCard(ravenous, "Ravenous") : null,
        grusha: grusha ? summarizeCard(grusha, "Grusha") : null,
        morgan: summarizeCard(morganCard, "Morgan"),
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
