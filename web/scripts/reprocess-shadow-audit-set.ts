/**
 * V2-only shadow reprocess — never mutates production offer fields.
 * Run: npm run card-flow-v2:reprocess-shadow-audit-set
 */
import { loadEnvLocal, LOCAL_FIRESTORE_FAIL_FAST_HINT } from "./lib/script-env";
import { requireLocalFirestore } from "./lib/firestore-fail-fast";
import { dataStore } from "../src/lib/storage/data-store";
import { DEFAULT_STORE_ID } from "../src/lib/firebase/collections";
import { LIVE_REGRESSION_CARD_IDS } from "../src/lib/card-flow-v2/regression/live-audit-fixtures";
import {
  ProductionFieldMutationError,
  reprocessCardV2ShadowOnly,
} from "../src/lib/card-flow-v2/shadow-v2-reprocess";
import { mergeV2ShadowBundlesOnly } from "../src/lib/card-flow-v2/v2-reprocess-summary";

const EXTRA_CARD_IDS = [
  "579ba1f4-6106-4716-9c94-a0130be39ea3", // Ravenous Tyrannosaurus MAR #93
  "a9913433-d799-4bd8-867d-a7866e080668", // Grusha
  "eaa2dce3-07dd-45e1-9457-eb0511827322", // She-Hulk
  ...LIVE_REGRESSION_CARD_IDS,
];

function loadEnvAndFlags() {
  loadEnvLocal();
  console.warn(LOCAL_FIRESTORE_FAIL_FAST_HINT);
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
  process.env.CARD_FLOW_V2_OFFER_INFLUENCE = "true";
}

async function main() {
  loadEnvAndFlags();

  const orders = await requireLocalFirestore("getOrders", () => dataStore.getOrders());
  const bbOrder = orders.find((o) => o.orderNumber === "BB-000005");
  const cardIds = new Set<string>(EXTRA_CARD_IDS);

  if (bbOrder) {
    for (const c of await requireLocalFirestore("getCardsByOrder", () =>
      dataStore.getCardsByOrder(bbOrder.id),
    )) {
      cardIds.add(c.id);
    }
    console.log(
      `BB-000005: ${(await requireLocalFirestore("getCardsByOrder", () => dataStore.getCardsByOrder(bbOrder.id))).length} cards`,
    );
  }

  const allCards = await Promise.all(
    [...cardIds].map((id) =>
      requireLocalFirestore(`getCard ${id}`, () => dataStore.getCard(id)),
    ),
  );
  const slab = allCards.find((c) => c?.itemType === "graded");
  if (slab) cardIds.add(slab.id);

  const storeId = bbOrder?.storeId?.trim() || DEFAULT_STORE_ID;
  const [settings, rules] = await requireLocalFirestore("getSettings/getRules", () =>
    Promise.all([
      dataStore.getSettings(storeId),
      dataStore.getActiveRules(storeId),
    ]),
  );

  console.log(`V2-only shadow reprocess: ${cardIds.size} cards\n`);
  const results = [];
  let failures = 0;

  for (const id of cardIds) {
    console.log(`→ ${id}`);
    const card = await requireLocalFirestore(`getCard ${id}`, () =>
      dataStore.getCard(id),
    );
    if (!card) {
      console.log("  skip — not found");
      continue;
    }
    try {
      const { card: updated, productionBefore, productionAfter, mutation } =
        await reprocessCardV2ShadowOnly({
          card,
          settings,
          rules,
          skipOfferInfluence: true,
        });
      const toSave = mergeV2ShadowBundlesOnly(card, updated);
      await requireLocalFirestore(`saveCard ${id}`, () => dataStore.saveCard(toSave));
      results.push({
        id,
        name: toSave.detectedName,
        staffConfirmed: Boolean(toSave.cardFlowV2Identity?.staffSelection?.suspectId),
        preservation: toSave.cardFlowV2Identity?.staffConfirmationPreservation?.status,
        variantStatus: toSave.cardFlowV2Identity?.variantUncertaintyStatus,
        previewEligible: toSave.cardFlowV2OfferPreview?.eligible,
        previewAction: toSave.cardFlowV2OfferPreview?.recommendedAction,
        productionUnchanged: !mutation.changed,
        productionBefore,
        productionAfter,
      });
    } catch (err) {
      failures++;
      if (err instanceof ProductionFieldMutationError) {
        console.error(`  MUTATION GUARD FAILED: ${err.message}`);
      } else {
        console.error(`  ERROR:`, err);
      }
    }
  }

  console.log("\n=== V2 shadow reprocess summary ===");
  console.log(JSON.stringify(results, null, 2));
  if (failures) {
    console.error(`\n${failures} card(s) failed mutation guard or reprocess.`);
    process.exit(1);
  }
  console.log("\nAll cards passed production field mutation guard.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
