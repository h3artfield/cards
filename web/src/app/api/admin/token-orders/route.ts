import { NextRequest } from "next/server";
import { requireAdminSession, requireStoreScope } from "@/lib/admin-auth";
import { handleRouteError, jsonOk } from "@/lib/api-utils";
import { dataStore } from "@/lib/storage/data-store";
import { adminTokenAssetUrlV1 } from "@/lib/token-creator/assets-v1";
import { refreshPaidTokenOrdersV1, syncTokenOrdersV1 } from "@/lib/token-creator/orders-v1";
import { tokenArtAreaV1 } from "@/lib/token-creator/render-v1";
import { getTokenSnapshotsV1, listTokenOrdersForStoreV1 } from "@/lib/token-creator/store-v1";

/** Token print orders for the store; `?sync=1` checks unpaid ones against Shopify first. */
export async function GET(req: NextRequest) {
  try {
    const auth = requireAdminSession(req);
    if (auth instanceof Response) return auth;
    const scope = requireStoreScope(auth, req);
    if (scope instanceof Response) return scope;

    const settings = await dataStore.getSettings(scope.storeId);
    let sync = null;
    if (req.nextUrl.searchParams.get("sync") === "1") {
      sync = await syncTokenOrdersV1(settings);
      await refreshPaidTokenOrdersV1(settings).catch(() => {});
    }
    const orders = await listTokenOrdersForStoreV1(scope.storeId);
    const snapshots = await getTokenSnapshotsV1(orders.flatMap((o) => o.lines.map((l) => l.snapshotId)));
    const snapshotById = new Map(snapshots.map((s) => [s.snapshotId, s]));
    return jsonOk({
      sync,
      shopDomain: settings.shopifyIntegration?.shopDomain ?? null,
      orders: orders.map((o) => ({
        ...o,
        processedEvents: undefined,
        lines: o.lines.map((l) => {
          const card = snapshotById.get(l.snapshotId)?.card;
          return {
          ...l,
          finish: card?.finish ?? "none",
          artArea: card ? tokenArtAreaV1(card) : null,
          frontUrl: adminTokenAssetUrlV1(l.frontPath),
          backUrl: adminTokenAssetUrlV1(l.backPath),
          frontDownloadUrl: adminTokenAssetUrlV1(l.frontPath, true),
          backDownloadUrl: adminTokenAssetUrlV1(l.backPath, true),
          };
        }),
      })),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
