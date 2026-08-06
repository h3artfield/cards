/**
 * Restore Morgan regression fixture V2 bundles on staging Firestore.
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { dataStore } from "../src/lib/storage/data-store";
import { buildMorganRegressionCard, MORGAN_REGRESSION_CARD_ID } from "../src/lib/card-flow-v2/regression/live-audit-fixtures";
import { stampCardFlowV2Bundles } from "../src/lib/card-flow-v2/version-metadata";
import { runCardAuditV2 } from "../src/lib/card-flow-v2/audit/run-card-audit-v2";
import { resolveV2ReviewStatus } from "../src/lib/card-flow-v2/v2-review-status";

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

async function main() {
  loadEnvLocal();
  const stored = await dataStore.getCard(MORGAN_REGRESSION_CARD_ID);
  if (!stored) throw new Error("Morgan not found");

  const fixture = buildMorganRegressionCard();
  const production = {
    marketPrice: stored.marketPrice,
    cashOffer: stored.cashOffer,
    tradeOffer: stored.tradeOffer,
    status: stored.status,
  };

  const interim = {
    ...stored,
    ...fixture,
    id: stored.id,
    orderId: stored.orderId,
    frontImageUrl: stored.frontImageUrl,
    backImageUrl: stored.backImageUrl ?? "",
    ...production,
  };

  const audit = runCardAuditV2({ card: interim });
  const stamped = stampCardFlowV2Bundles(
    {
      identity: interim.cardFlowV2Identity,
      market: interim.cardFlowV2Market,
      audit,
      offerPreview: interim.cardFlowV2OfferPreview,
    },
    "pokemon",
  );

  const updated = {
    ...interim,
    cardFlowV2VersionMetadata: stamped.cardFlowV2VersionMetadata,
    cardFlowV2Identity: stamped.identity,
    cardFlowV2Market: stamped.market,
    cardFlowV2Audit: stamped.audit,
    cardFlowV2OfferPreview: stamped.offerPreview,
    ...production,
  };

  await dataStore.saveCard(updated);

  console.log(
    JSON.stringify(
      {
        reviewStatus: resolveV2ReviewStatus({ card: updated }),
        blockers: updated.cardFlowV2OfferPreview?.marketDecision.blockers,
        eligible: updated.cardFlowV2OfferPreview?.eligible,
        production,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
