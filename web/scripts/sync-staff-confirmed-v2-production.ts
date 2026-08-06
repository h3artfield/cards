/**
 * Backfill production offer fields from V2 preview for staff-confirmed cards.
 * Run: npx tsx scripts/sync-staff-confirmed-v2-production.ts [--dry-run] [--card-id=ID]
 */
import { readFileSync } from "fs";
import { resolve } from "path";

function loadEnvLocal() {
  try {
    const p = resolve(__dirname, "../.env.local");
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[key] == null) process.env[key] = val;
    }
  } catch {
    /* optional */
  }
}

function offerMismatch(card: {
  marketPrice?: number;
  cardFlowV2OfferPreview?: {
    previewMarketValue?: number;
    marketDecision?: { marketValue?: number };
  };
}): boolean {
  const preview = card.cardFlowV2OfferPreview;
  const market =
    preview?.previewMarketValue ?? preview?.marketDecision?.marketValue;
  if (market == null) return false;
  if (card.marketPrice == null) return true;
  return Math.abs(card.marketPrice - market) > 0.05;
}

async function main() {
  loadEnvLocal();
  process.env.CARD_FLOW_V2_EVIDENCE_ENABLED = "true";
  process.env.CARD_FLOW_V2_IDENTITY_ENABLED = "true";
  process.env.CARD_FLOW_V2_MARKET_ENABLED = "true";
  process.env.CARD_FLOW_V2_AUDIT_ENABLED = "true";
  process.env.CARD_FLOW_V2_OFFER_PREVIEW_ENABLED = "true";
  process.env.CARD_FLOW_V2_OFFER_INFLUENCE = "true";

  const { COLLECTIONS } = await import("../src/lib/firebase/collections");
  const { requireFirestore } = await import("../src/lib/firebase/admin");
  const { applyV2OfferInfluenceToCard } = await import(
    "../src/lib/card-flow-v2/offer/apply-v2-offer-influence"
  );
  type ScannedCard = import("../src/lib/types").ScannedCard;

  const dryRun = process.argv.includes("--dry-run");
  const cardIdArg = process.argv.find((a) => a.startsWith("--card-id="));
  const onlyCardId = cardIdArg?.slice("--card-id=".length);

  const db = requireFirestore();
  const snap = onlyCardId
    ? await db.collection(COLLECTIONS.cards).doc(onlyCardId).get()
    : null;
  const docs = snap?.exists
    ? [snap]
    : (await db.collection(COLLECTIONS.cards).get()).docs;

  let scanned = 0;
  let updated = 0;
  let skipped = 0;

  for (const doc of docs) {
    const card = { id: doc.id, ...doc.data() } as ScannedCard;
    scanned++;

    const confirmed = Boolean(card.cardFlowV2Identity?.staffSelection?.suspectId);
    if (!confirmed || !card.cardFlowV2OfferPreview) {
      skipped++;
      continue;
    }

    const needsSync =
      offerMismatch(card) ||
      card.status === "do_not_buy" ||
      (card.pricingJson as { source?: string } | undefined)?.source !==
        "v2_offer_influence";

    if (!needsSync) {
      skipped++;
      continue;
    }

    const result = applyV2OfferInfluenceToCard(card);
    if (!result.applied) {
      console.log("SKIP", card.id, result.reason);
      skipped++;
      continue;
    }

    console.log(
      dryRun ? "WOULD UPDATE" : "UPDATE",
      card.id,
      card.detectedName ?? card.id,
      `${card.marketPrice}/${card.cashOffer}/${card.status}`,
      "→",
      `${result.card.marketPrice}/${result.card.cashOffer}/${result.card.status}`,
    );

    if (!dryRun) {
      await db.collection(COLLECTIONS.cards).doc(card.id).set(result.card, {
        merge: true,
      });
    }
    updated++;
  }

  console.log(
    `\nDone. scanned=${scanned} updated=${updated} skipped=${skipped}${dryRun ? " (dry-run)" : ""}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
