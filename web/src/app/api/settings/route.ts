import { dataStore } from "@/lib/storage/data-store";
import { jsonOk } from "@/lib/api-utils";

export async function GET() {
  const settings = await dataStore.getSettings();
  return jsonOk({
    settings: {
      storeName: settings.storeName,
      storeSlug: settings.storeSlug,
      storeLogoUrl: settings.storeLogoUrl ?? null,
    },
  });
}
