import { dataStore } from "@/lib/storage/data-store";
import { jsonOk, handleRouteError } from "@/lib/api-utils";

/** Public store directory — name, slug, logo only (no admin data). */
export async function GET() {
  try {
    const stores = await dataStore.listStores();
    return jsonOk({
      stores: stores.map((s) => ({
        name: s.storeName,
        slug: s.storeSlug,
        logoUrl: s.storeLogoUrl ?? null,
      })),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
