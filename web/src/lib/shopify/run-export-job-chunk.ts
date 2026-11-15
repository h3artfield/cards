/** Processes one chunk of a bulk Shopify export job. */
import { invalidateStoreInventoryCache } from "../deck-builder/store-inventory-cache";
import { dataStore } from "../storage/data-store";
import {
  appendExportJobFailures,
  nextFailureStreak,
  resolveStatusAfterChunk,
} from "./export-job-math";
import {
  acquireExportJobLease,
  getExportJob,
  saveExportJob,
} from "./export-job-store";
import { exportInventoryItemToShopify } from "./export-inventory-item";
import { catalogExportEligibility } from "./inventory-listing";
import { resolveShopifyAccessTokenForStore } from "./resolve-access-token";
import type {
  ShopifyExportJob,
  ShopifyExportJobFailure,
  ShopifyExportJobStatus,
} from "./export-job-types";

export type ExportJobTickResult =
  | { state: "missing" }
  | { state: "busy"; job: ShopifyExportJob }
  | { state: "finished"; job: ShopifyExportJob }
  | {
      state: "advanced";
      job: ShopifyExportJob;
      chunkExported: number;
      chunkFailed: number;
    };

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Firestore merge writes ignore undefined, so the lease is cleared by dating it
 * in the past rather than by removing the field.
 */
function releasedLease(): string {
  return new Date(0).toISOString();
}

async function finishJob(
  job: ShopifyExportJob,
  status: ShopifyExportJobStatus,
  stopReason?: string,
): Promise<ShopifyExportJob> {
  const updated: ShopifyExportJob = {
    ...job,
    status,
    ...(stopReason ? { stopReason } : {}),
    finishedAt: nowIso(),
    updatedAt: nowIso(),
    leaseUntil: releasedLease(),
  };
  await saveExportJob(updated);
  return updated;
}

export async function runExportJobChunk(
  jobId: string,
): Promise<ExportJobTickResult> {
  const existing = await getExportJob(jobId);
  if (!existing) return { state: "missing" };
  if (existing.status !== "running") {
    return { state: "finished", job: existing };
  }

  const leased = await acquireExportJobLease(jobId);
  if (!leased) return { state: "busy", job: existing };

  if (leased.cancelRequested) {
    return {
      state: "finished",
      job: await finishJob(leased, "cancelled", "Cancelled by staff."),
    };
  }

  try {
    const settings = await dataStore.getSettings(leased.storeId);
    const integration = settings.shopifyIntegration;
    if (!integration?.enabled) {
      return {
        state: "finished",
        job: await finishJob(
          leased,
          "failed",
          "Shopify integration is not enabled.",
        ),
      };
    }

    const inventory = await dataStore.getInventory(leased.storeId);
    const eligible = inventory.filter(
      (item) => catalogExportEligibility(item, integration).eligible,
    );
    const targets = eligible.slice(0, leased.batchSize);

    if (!targets.length) {
      return { state: "finished", job: await finishJob(leased, "completed") };
    }

    const { accessToken, settings: settingsWithToken } =
      await resolveShopifyAccessTokenForStore(leased.storeId, settings);
    const activeIntegration =
      settingsWithToken.shopifyIntegration ?? integration;

    let chunkExported = 0;
    const chunkFailures: ShopifyExportJobFailure[] = [];

    for (const item of targets) {
      const out = await exportInventoryItemToShopify({
        item,
        settings: settingsWithToken,
        integration: activeIntegration,
        accessToken,
        exportedBy: leased.startedBy,
      });

      if (out.item) {
        await dataStore.saveInventoryItem(out.item);
        chunkExported += 1;
        continue;
      }

      chunkFailures.push({
        inventoryItemId: item.id,
        displayName: item.displayName,
        error:
          out.result.error ?? out.result.skippedReason ?? "Export failed",
        at: nowIso(),
      });
    }

    if (chunkExported) invalidateStoreInventoryCache(leased.storeId);

    const failureStreak = nextFailureStreak(
      leased.failureStreak,
      chunkExported,
      chunkFailures.length,
    );
    const remainingEligible = Math.max(0, eligible.length - targets.length);
    const { status, stopReason } = resolveStatusAfterChunk({
      cancelRequested: leased.cancelRequested,
      failureStreak,
      remainingEligible,
    });

    const updated: ShopifyExportJob = {
      ...leased,
      exported: leased.exported + chunkExported,
      failed: leased.failed + chunkFailures.length,
      failureStreak,
      failures: appendExportJobFailures(leased.failures, chunkFailures),
      status,
      ...(stopReason ? { stopReason } : {}),
      ...(status === "running" ? {} : { finishedAt: nowIso() }),
      updatedAt: nowIso(),
      leaseUntil: releasedLease(),
    };
    await saveExportJob(updated);

    if (status !== "running") {
      await dataStore.logAdminAction({
        action: "shopify_export",
        metadata: {
          source: "bulk_export_job",
          jobId: updated.id,
          status,
          exported: updated.exported,
          failed: updated.failed,
        },
      });
    }

    return status === "running"
      ? {
          state: "advanced",
          job: updated,
          chunkExported,
          chunkFailed: chunkFailures.length,
        }
      : { state: "finished", job: updated };
  } catch (err) {
    // A token or settings failure breaks every remaining row, so stop instead
    // of holding the lease until it expires and retrying the same error.
    const message = err instanceof Error ? err.message : "Export chunk failed";
    return {
      state: "finished",
      job: await finishJob(leased, "failed", message),
    };
  }
}
