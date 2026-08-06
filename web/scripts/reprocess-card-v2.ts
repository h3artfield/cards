/**
 * @deprecated Full V1 reprocess — mutates production fields. For staging V2 shadow
 * reprocess use admin "Re-run V2 shadow analysis" or POST /api/admin/cards/[id]/v2-reprocess.
 */
import { loadEnvLocal, LOCAL_FIRESTORE_FAIL_FAST_HINT } from "./lib/script-env";
import { requireLocalFirestore } from "./lib/firestore-fail-fast";
import { dataStore } from "../src/lib/storage/data-store";
import { processCard } from "../src/lib/processing/process-order";
import { runFullCardAnalysis } from "../src/lib/processing/full-analysis";
import { DEFAULT_STORE_ID } from "../src/lib/firebase/collections";

async function main() {
  loadEnvLocal();
  console.warn(
    "WARNING: This script runs full V1 reprocess and mutates production fields.",
  );
  console.warn(LOCAL_FIRESTORE_FAIL_FAST_HINT);
  console.warn(
    "For V2 shadow-only reprocess on staging, use admin Re-run V2 shadow analysis.\n",
  );

  process.env.CARD_FLOW_V2_EVIDENCE_ENABLED = "true";
  process.env.CARD_FLOW_V2_IDENTITY_ENABLED = "true";
  process.env.CARD_FLOW_V2_MARKET_ENABLED = "true";
  process.env.CARD_FLOW_V2_AUDIT_ENABLED = "true";

  const cardId = process.argv[2];
  if (!cardId) {
    console.error("Usage: npx tsx scripts/reprocess-card-v2.ts <cardId>");
    process.exit(1);
  }

  const card = await requireLocalFirestore("getCard", () => dataStore.getCard(cardId));
  if (!card) throw new Error(`Card not found: ${cardId}`);

  const order = await requireLocalFirestore("getOrder", () =>
    dataStore.getOrder(card.orderId),
  );
  if (!order) throw new Error(`Order not found: ${card.orderId}`);

  const storeId = order.storeId?.trim() || DEFAULT_STORE_ID;
  const [settings, rules] = await requireLocalFirestore("getSettings/getRules", () =>
    Promise.all([
      dataStore.getSettings(storeId),
      dataStore.getActiveRules(storeId),
    ]),
  );

  console.log(`Reprocessing ${card.detectedName ?? cardId}…`);

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
  await requireLocalFirestore("saveCard", () => dataStore.saveCard(toSave));

  const foil = toSave.cardFlowV2Evidence?.imageEvidence.evidenceSlots.find(
    (s) => s.field === "foil_pattern",
  );
  const locked = toSave.cardFlowV2Identity?.lockedIdentity;
  const audit = toSave.cardFlowV2Audit;

  console.log(
    JSON.stringify(
      {
        name: toSave.detectedName,
        marketPrice: toSave.marketPrice,
        foilPattern: foil?.value ?? foil?.status,
        foilNote: foil?.note,
        v2Locked: locked?.locked,
        lockStatus: locked?.lockStatus,
        topSuspect: toSave.cardFlowV2Identity?.suspects[0]?.label,
        marketMode: toSave.cardFlowV2Market?.mode,
        shadowMedian: toSave.cardFlowV2Market?.snapshots[0]?.valueMedian,
        acceptedComps:
          toSave.cardFlowV2Market?.snapshots[0]?.acceptedComps.length ?? 0,
        auditRisk: audit?.riskLevel,
        auditAgreement: audit?.priceComparison.agreement,
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
