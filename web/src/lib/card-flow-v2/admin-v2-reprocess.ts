import type { ScannedCard, StoreRule, StoreSettings } from "../types";
import { DEFAULT_STORE_ID } from "../firebase/collections";
import { reprocessCardV2ShadowOnly } from "./shadow-v2-reprocess";
import {
  buildV2ReprocessSummary,
  mergeV2ShadowBundlesOnly,
} from "./v2-reprocess-summary";

export async function runAdminV2ShadowReprocess(input: {
  card: ScannedCard;
  settings: StoreSettings;
  rules: StoreRule[];
}): Promise<{
  card: ScannedCard;
  summary: ReturnType<typeof buildV2ReprocessSummary>;
}> {
  const { card, settings, rules } = input;

  const { card: refreshed, productionBefore } = await reprocessCardV2ShadowOnly({
    card,
    settings,
    rules,
    skipOfferInfluence: true,
    enforceMutationGuard: true,
  });

  const merged = mergeV2ShadowBundlesOnly(card, refreshed);
  const summary = buildV2ReprocessSummary(merged, productionBefore);

  if (!summary.productionUnchanged) {
    throw new Error(
      "V2 shadow reprocess attempted to change production fields — save aborted.",
    );
  }

  return { card: merged, summary };
}

export function resolveCardStoreId(
  card: ScannedCard,
  orderStoreId?: string,
): string {
  return orderStoreId?.trim() || DEFAULT_STORE_ID;
}
